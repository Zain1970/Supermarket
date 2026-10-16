import { createHash, randomBytes } from "node:crypto";
import { Router } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { authenticate } from "../auth/auth.js";
import { prisma } from "../lib/prisma.js";
import { requireStoreAccess } from "../security/store-access-middleware.js";

export const salesRouter = Router();
const readRoles = ["STORE_OWNER", "STORE_MANAGER", "CASHIER"] as const;
const writeRoles = ["STORE_OWNER", "STORE_MANAGER", "CASHIER"] as const;
const amount = z.string().regex(/^\d{1,12}(\.\d{1,2})?$/);
const quantity = z.string().regex(/^\d{1,10}(\.\d{1,3})?$/).refine((v) => Number(v) > 0);

const createSaleSchema = z.object({
  customerId: z.string().trim().min(1).optional(),
  discountAmount: amount.default("0"),
  paymentMethod: z.enum(["CASH", "CARD", "TRANSFER", "CREDIT"]),
  paidAmount: amount.optional(),
  note: z.string().trim().max(1000).optional(),
  items: z.array(z.object({
    productId: z.string().trim().min(1),
    quantity
  })).min(1).max(100)
});

const listSchema = z.object({
  page: z.coerce.number().int().min(1).max(100000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  paymentStatus: z.enum(["PAID", "PARTIAL", "UNPAID"]).optional()
});

salesRouter.get("/:storeId/sales", authenticate, requireStoreAccess(undefined, readRoles), async (req, res, next) => {
  try {
    const parsed = listSchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: { code: "INVALID_QUERY", message: "تحقق من مرشحات المبيعات." } });
      return;
    }
    const storeId = req.params.storeId;
    if (!storeId) {
      res.status(400).json({ error: { code: "STORE_ID_REQUIRED", message: "معرّف المتجر مطلوب." } });
      return;
    }
    const { page, pageSize, paymentStatus } = parsed.data;
    const where = { storeId, ...(paymentStatus ? { paymentStatus } : {}) };
    const [total, sales] = await prisma.$transaction([
      prisma.sale.count({ where }),
      prisma.sale.findMany({
        where, orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize,
        select: {
          id: true, invoiceNumber: true, status: true, paymentStatus: true,
          subtotal: true, discountAmount: true, totalAmount: true, paidAmount: true,
          balanceDue: true, paymentMethod: true, createdAt: true,
          customer: { select: { id: true, name: true, phone: true } },
          _count: { select: { items: true } }
        }
      })
    ]);
    res.status(200).json({ sales, pagination: { page, pageSize, total } });
  } catch (error) { next(error); }
});

salesRouter.post("/:storeId/sales", authenticate, requireStoreAccess(undefined, writeRoles), async (req, res, next) => {
  try {
    const parsed = createSaleSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: "INVALID_SALE", message: "تحقق من المنتجات والكميات وبيانات الدفع." } });
      return;
    }
    const storeId = req.params.storeId;
    const idempotencyKey = req.header("Idempotency-Key")?.trim();
    if (!storeId) {
      res.status(400).json({ error: { code: "STORE_ID_REQUIRED", message: "معرّف المتجر مطلوب." } });
      return;
    }
    if (!idempotencyKey || idempotencyKey.length > 128) {
      res.status(400).json({ error: { code: "IDEMPOTENCY_KEY_REQUIRED", message: "أرسل مفتاح Idempotency-Key صالحًا." } });
      return;
    }
    const data = parsed.data;
    const requestHash = createHash("sha256").update(JSON.stringify(data)).digest("hex");
    const prior = await prisma.sale.findUnique({
      where: { storeId_idempotencyKey: { storeId, idempotencyKey } },
      include: { items: true, payments: true }
    });
    if (prior) {
      if (prior.requestHash !== requestHash) {
        res.status(409).json({ error: { code: "IDEMPOTENCY_CONFLICT", message: "استُخدم مفتاح الطلب نفسه لعملية مختلفة." } });
        return;
      }
      res.status(200).json({ sale: prior, replayed: true });
      return;
    }

    const mergedItems = new Map<string, Prisma.Decimal>();
    for (const item of data.items) {
      const q = new Prisma.Decimal(item.quantity);
      mergedItems.set(item.productId, (mergedItems.get(item.productId) ?? new Prisma.Decimal(0)).plus(q));
    }
    const discount = new Prisma.Decimal(data.discountAmount);
    const sale = await prisma.$transaction(async (tx) => {
      const products = await tx.product.findMany({
        where: { storeId, id: { in: [...mergedItems.keys()] }, status: "ACTIVE" },
        select: { id: true, name: true, sku: true, salePrice: true, costPrice: true, stockQuantity: true, allowNegativeStock: true }
      });
      if (products.length !== mergedItems.size) {
        throw Object.assign(new Error("PRODUCT_NOT_FOUND"), { publicCode: "PRODUCT_NOT_FOUND" });
      }
      if (data.customerId) {
        const customer = await tx.customer.findFirst({ where: { id: data.customerId, storeId }, select: { id: true } });
        if (!customer) throw Object.assign(new Error("CUSTOMER_NOT_FOUND"), { publicCode: "CUSTOMER_NOT_FOUND" });
      }

      const lines = products.map((product) => {
        const qty = mergedItems.get(product.id)!;
        const lineTotal = product.salePrice.mul(qty).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
        return { product, qty, lineTotal };
      });
      const subtotal = lines.reduce((sum, line) => sum.plus(line.lineTotal), new Prisma.Decimal(0));
      if (discount.greaterThan(subtotal)) throw Object.assign(new Error("INVALID_DISCOUNT"), { publicCode: "INVALID_DISCOUNT" });
      const total = subtotal.minus(discount).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
      const paid = data.paymentMethod === "CREDIT"
        ? new Prisma.Decimal(0)
        : new Prisma.Decimal(data.paidAmount ?? total.toFixed(2));
      if (paid.greaterThan(total)) throw Object.assign(new Error("OVERPAYMENT"), { publicCode: "OVERPAYMENT" });
      if (paid.lessThan(total) && !data.customerId) {
        throw Object.assign(new Error("CUSTOMER_REQUIRED_FOR_BALANCE"), { publicCode: "CUSTOMER_REQUIRED_FOR_BALANCE" });
      }
      if (data.paymentMethod === "CREDIT" && !data.customerId) {
        throw Object.assign(new Error("CUSTOMER_REQUIRED_FOR_CREDIT"), { publicCode: "CUSTOMER_REQUIRED_FOR_CREDIT" });
      }
      const due = total.minus(paid);
      if (due.greaterThan(0) && data.customerId) {
        const customer = await tx.customer.findFirst({ where: { id: data.customerId, storeId }, select: { creditLimit: true, creditBalance: true } });
        if (!customer || customer.creditBalance.plus(due).greaterThan(customer.creditLimit)) {
          throw Object.assign(new Error("CREDIT_LIMIT_EXCEEDED"), { publicCode: "CREDIT_LIMIT_EXCEEDED" });
        }
      }

      const created = await tx.sale.create({
        data: {
          storeId, customerId: data.customerId, invoiceNumber: `INV-${Date.now()}-${randomBytes(3).toString("hex")}`,
          paymentStatus: due.isZero() ? "PAID" : paid.isZero() ? "UNPAID" : "PARTIAL",
          subtotal, discountAmount: discount, totalAmount: total, paidAmount: paid, balanceDue: due,
          paymentMethod: data.paymentMethod, note: data.note, idempotencyKey, requestHash,
          actorUserId: req.principal!.userId,
          items: { create: lines.map(({ product, qty, lineTotal }) => ({
            storeId, productId: product.id, productName: product.name, sku: product.sku,
            quantity: qty, unitPrice: product.salePrice, unitCost: product.costPrice, lineTotal
          })) },
        },
        include: { items: true, payments: true, customer: { select: { id: true, name: true, phone: true } } }
      });

      if (paid.greaterThan(0)) {
        await tx.salePayment.create({
          data: {
            storeId, saleId: created.id, amount: paid, method: data.paymentMethod,
            actorUserId: req.principal!.userId, idempotencyKey: `sale-initial:${created.id}`, requestHash
          }
        });
      }

      for (const { product, qty } of lines) {
        const updated = await tx.product.updateMany({
          where: { id: product.id, storeId, ...(product.allowNegativeStock ? {} : { stockQuantity: { gte: qty } }) },
          data: { stockQuantity: { decrement: qty } }
        });
        if (updated.count !== 1) throw Object.assign(new Error("INSUFFICIENT_STOCK"), { publicCode: "INSUFFICIENT_STOCK" });
        await tx.stockMovement.create({
          data: {
            storeId, productId: product.id, type: "SALE", quantity: qty.negated(),
            reason: "Sale invoice", reference: created.id,
            idempotencyKey: `sale:${created.id}:${product.id}`, requestHash,
            actorUserId: req.principal!.userId
          }
        });
      }
      if (due.greaterThan(0) && data.customerId) {
        await tx.customer.update({
          where: { id: data.customerId },
          data: { creditBalance: { increment: due } }
        });
      }
      await tx.auditLog.create({
        data: {
          storeId, actorUserId: req.principal!.userId, action: "SALE_CREATED",
          entityType: "Sale", entityId: created.id,
          metadata: { invoiceNumber: created.invoiceNumber, totalAmount: total.toFixed(2), itemCount: lines.length }
        }
      });
      return created;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    res.status(201).json({ sale });
  } catch (error) {
    if (typeof error === "object" && error !== null && "publicCode" in error) {
      const code = (error as { publicCode: string }).publicCode;
      const messages: Record<string, string> = {
        PRODUCT_NOT_FOUND: "أحد المنتجات غير موجود أو غير نشط في هذا المتجر.",
        CUSTOMER_NOT_FOUND: "العميل غير موجود في هذا المتجر.",
        INVALID_DISCOUNT: "الخصم لا يمكن أن يتجاوز قيمة الفاتورة.",
        OVERPAYMENT: "المبلغ المدفوع لا يمكن أن يتجاوز إجمالي الفاتورة.",
        CUSTOMER_REQUIRED_FOR_BALANCE: "اختر عميلًا عند البيع بمبلغ آجل أو بدفع جزئي.",
        CUSTOMER_REQUIRED_FOR_CREDIT: "اختر عميلًا لتسجيل البيع الآجل.",
        CREDIT_LIMIT_EXCEEDED: "سيؤدي البيع إلى تجاوز حد ائتمان العميل.",
        INSUFFICIENT_STOCK: "الكمية المتاحة غير كافية لإتمام البيع."
      };
      const status = code === "INSUFFICIENT_STOCK" || code === "CREDIT_LIMIT_EXCEEDED" ? 409 : 400;
      res.status(status).json({ error: { code, message: messages[code] ?? "تعذر إتمام البيع." } });
      return;
    }
    if (typeof error === "object" && error !== null && "code" in error &&
        (error as { code?: string }).code === "P2002") {
      res.status(409).json({ error: { code: "SALE_CONFLICT", message: "تعذر حفظ الفاتورة بسبب تعارض؛ أعد المحاولة بمفتاح جديد." } });
      return;
    }
    next(error);
  }
});


const paymentSchema = z.object({
  amount: amount.refine((value) => Number(value) > 0, "يجب أن يكون مبلغ السداد أكبر من صفر."),
  method: z.enum(["CASH", "CARD", "TRANSFER"]),
  reference: z.string().trim().max(180).optional()
});

salesRouter.post("/:storeId/sales/:saleId/payments", authenticate, requireStoreAccess(undefined, writeRoles), async (req, res, next) => {
  try {
    const parsed = paymentSchema.safeParse(req.body);
    const storeId = req.params.storeId;
    const saleId = req.params.saleId;
    const idempotencyKey = req.header("Idempotency-Key")?.trim();
    if (!storeId || !saleId) {
      res.status(400).json({ error: { code: "SALE_ID_REQUIRED", message: "معرّف المتجر والفاتورة مطلوبان." } });
      return;
    }
    if (!parsed.success) {
      res.status(400).json({ error: { code: "INVALID_PAYMENT", message: "تحقق من مبلغ السداد وطريقته." } });
      return;
    }
    if (!idempotencyKey || idempotencyKey.length < 8 || idempotencyKey.length > 128) {
      res.status(400).json({ error: { code: "IDEMPOTENCY_KEY_REQUIRED", message: "أرسل مفتاح Idempotency-Key صالحًا." } });
      return;
    }
    const data = parsed.data;
    const requestHash = createHash("sha256").update(JSON.stringify({ storeId, saleId, ...data })).digest("hex");
    const result = await prisma.$transaction(async (tx) => {
      const prior = await tx.salePayment.findUnique({ where: { storeId_idempotencyKey: { storeId, idempotencyKey } } });
      if (prior) {
        if (prior.requestHash !== requestHash) return { kind: "key_conflict" as const };
        return { kind: "replay" as const, payment: prior };
      }
      const sale = await tx.sale.findFirst({
        where: { id: saleId, storeId, status: "COMPLETED" },
        select: { id: true, customerId: true, totalAmount: true, paidAmount: true, balanceDue: true, paymentStatus: true }
      });
      if (!sale) return { kind: "sale_missing" as const };
      const paid = new Prisma.Decimal(data.amount);
      if (paid.greaterThan(sale.balanceDue) || sale.balanceDue.lessThanOrEqualTo(0)) return { kind: "invalid_amount" as const };

      const payment = await tx.salePayment.create({
        data: {
          storeId, saleId, amount: paid, method: data.method, reference: data.reference,
          actorUserId: req.principal!.userId, idempotencyKey, requestHash
        }
      });
      const newPaid = sale.paidAmount.plus(paid);
      const newDue = sale.totalAmount.minus(newPaid);
      const updatedSale = await tx.sale.update({
        where: { id: sale.id },
        data: {
          paidAmount: newPaid,
          balanceDue: newDue,
          paymentStatus: newDue.isZero() ? "PAID" : newPaid.isZero() ? "UNPAID" : "PARTIAL"
        },
        select: { id: true, invoiceNumber: true, totalAmount: true, paidAmount: true, balanceDue: true, paymentStatus: true, customerId: true }
      });
      if (sale.customerId) {
        const customerUpdate = await tx.customer.updateMany({
          where: { id: sale.customerId, storeId, creditBalance: { gte: paid } },
          data: { creditBalance: { decrement: paid } }
        });
        if (customerUpdate.count !== 1) {
          throw Object.assign(new Error("CUSTOMER_BALANCE_INVARIANT"), { publicCode: "CUSTOMER_BALANCE_INVARIANT" });
        }
      }
      await tx.auditLog.create({
        data: {
          storeId, actorUserId: req.principal!.userId, action: "SALE_PAYMENT_RECORDED",
          entityType: "SalePayment", entityId: payment.id,
          metadata: { saleId, amount: paid.toFixed(2), method: data.method }
        }
      });
      return { kind: "created" as const, payment, sale: updatedSale };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    if (result.kind === "key_conflict") {
      res.status(409).json({ error: { code: "IDEMPOTENCY_CONFLICT", message: "استُخدم مفتاح السداد لطلب مختلف." } });
      return;
    }
    if (result.kind === "sale_missing") {
      res.status(404).json({ error: { code: "SALE_NOT_FOUND", message: "الفاتورة غير موجودة أو ملغاة في هذا المتجر." } });
      return;
    }
    if (result.kind === "invalid_amount") {
      res.status(409).json({ error: { code: "INVALID_PAYMENT_AMOUNT", message: "مبلغ السداد يتجاوز المتبقي أو أن الفاتورة مسددة بالكامل." } });
      return;
    }
    res.status(result.kind === "replay" ? 200 : 201).json({ payment: result.payment, ...(result.kind === "created" ? { sale: result.sale } : {}), replayed: result.kind === "replay" });
  } catch (error) {
    if (typeof error === "object" && error !== null && "publicCode" in error) {
      res.status(409).json({ error: { code: "CUSTOMER_BALANCE_INVARIANT", message: "رصيد العميل لا يتطابق مع سجل الفاتورة؛ راجع سجل الحساب." } });
      return;
    }
    if (typeof error === "object" && error !== null && "code" in error && (error as { code?: string }).code === "P2002") {
      res.status(409).json({ error: { code: "PAYMENT_CONFLICT", message: "تعارض في تسجيل السداد؛ تحقق من سجل الفاتورة." } });
      return;
    }
    next(error);
  }
});
