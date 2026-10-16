import { createHash, randomBytes } from "node:crypto";
import { Router } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { authenticate } from "../auth/auth.js";
import { prisma } from "../lib/prisma.js";
import { requireStoreAccess } from "../security/store-access-middleware.js";

export const saleReturnsRouter = Router();
const roles = ["STORE_OWNER", "STORE_MANAGER"] as const;

const returnSchema = z.object({
  reason: z.string().trim().min(3).max(500),
  note: z.string().trim().max(1000).optional(),
  items: z.array(z.object({
    saleItemId: z.string().trim().min(1),
    quantity: z.string().regex(/^\d{1,10}(\.\d{1,3})?$/).refine((v) => Number(v) > 0)
  })).min(1).max(100)
});

saleReturnsRouter.post("/:storeId/sales/:saleId/returns", authenticate, requireStoreAccess(undefined, roles), async (req, res, next) => {
  try {
    const parsed = returnSchema.safeParse(req.body);
    const storeId = req.params.storeId;
    const saleId = req.params.saleId;
    const idempotencyKey = req.header("Idempotency-Key")?.trim();
    if (!storeId || !saleId) {
      res.status(400).json({ error: { code: "SALE_ID_REQUIRED", message: "معرّف المتجر والفاتورة مطلوبان." } });
      return;
    }
    if (!parsed.success) {
      res.status(400).json({ error: { code: "INVALID_RETURN", message: "تحقق من سبب المرتجع والأصناف والكميات." } });
      return;
    }
    if (!idempotencyKey || idempotencyKey.length < 8 || idempotencyKey.length > 128) {
      res.status(400).json({ error: { code: "IDEMPOTENCY_KEY_REQUIRED", message: "أرسل مفتاح Idempotency-Key صالحًا." } });
      return;
    }
    const data = parsed.data;
    const requestHash = createHash("sha256").update(JSON.stringify({ storeId, saleId, ...data })).digest("hex");
    const prior = await prisma.saleReturn.findUnique({ where: { storeId_idempotencyKey: { storeId, idempotencyKey } }, include: { items: true } });
    if (prior) {
      if (prior.requestHash !== requestHash) {
        res.status(409).json({ error: { code: "IDEMPOTENCY_CONFLICT", message: "استُخدم مفتاح المرتجع نفسه لطلب مختلف." } });
        return;
      }
      res.status(200).json({ saleReturn: prior, replayed: true });
      return;
    }

    const merged = new Map<string, Prisma.Decimal>();
    for (const item of data.items) {
      merged.set(item.saleItemId, (merged.get(item.saleItemId) ?? new Prisma.Decimal(0)).plus(item.quantity));
    }

    const result = await prisma.$transaction(async (tx) => {
      const sale = await tx.sale.findFirst({ where: { id: saleId, storeId, status: "COMPLETED" }, select: { id: true, invoiceNumber: true } });
      if (!sale) return { kind: "sale_missing" as const };
      const saleItems = await tx.saleItem.findMany({
        where: { storeId, saleId, id: { in: [...merged.keys()] } },
        select: { id: true, productId: true, quantity: true, unitPrice: true, productName: true }
      });
      if (saleItems.length !== merged.size) return { kind: "item_missing" as const };

      const itemsToReturn = [];
      let total = new Prisma.Decimal(0);
      for (const item of saleItems) {
        const qty = merged.get(item.id)!;
        const priorRows = await tx.saleReturnItem.aggregate({
          where: { storeId, saleItemId: item.id },
          _sum: { quantity: true }
        });
        const alreadyReturned = priorRows._sum.quantity ?? new Prisma.Decimal(0);
        if (alreadyReturned.plus(qty).greaterThan(item.quantity)) return { kind: "quantity_exceeded" as const };
        const lineTotal = item.unitPrice.mul(qty).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
        total = total.plus(lineTotal);
        itemsToReturn.push({ item, qty, lineTotal });
      }

      const created = await tx.saleReturn.create({
        data: {
          storeId, saleId, returnNumber: `RET-${Date.now()}-${randomBytes(3).toString("hex")}`,
          totalAmount: total, reason: data.reason, note: data.note, idempotencyKey, requestHash,
          actorUserId: req.principal!.userId,
          items: { create: itemsToReturn.map(({ item, qty, lineTotal }) => ({
            saleItemId: item.id, productId: item.productId, quantity: qty,
            unitPrice: item.unitPrice, lineTotal
          })) }
        },
        include: { items: true }
      });

      for (const { item, qty } of itemsToReturn) {
        const productUpdate = await tx.product.updateMany({
          where: { id: item.productId, storeId },
          data: { stockQuantity: { increment: qty } }
        });
        if (productUpdate.count !== 1) {
          throw Object.assign(new Error("RETURN_PRODUCT_INVARIANT"), { publicCode: "RETURN_PRODUCT_INVARIANT" });
        }
        await tx.stockMovement.create({
          data: {
            storeId, productId: item.productId, type: "SALE_RETURN", quantity: qty,
            reason: `Sales return: ${data.reason}`, reference: created.id,
            idempotencyKey: `sale-return:${created.id}:${item.id}`, requestHash,
            actorUserId: req.principal!.userId
          }
        });
      }
      await tx.auditLog.create({
        data: {
          storeId, actorUserId: req.principal!.userId, action: "SALE_RETURN_CREATED",
          entityType: "SaleReturn", entityId: created.id,
          reason: data.reason,
          metadata: { saleId, invoiceNumber: sale.invoiceNumber, totalAmount: total.toFixed(2), itemCount: itemsToReturn.length }
        }
      });
      return { kind: "created" as const, saleReturn: created };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    if (result.kind === "sale_missing") {
      res.status(404).json({ error: { code: "SALE_NOT_FOUND", message: "الفاتورة غير موجودة أو ملغاة في هذا المتجر." } });
      return;
    }
    if (result.kind === "item_missing") {
      res.status(400).json({ error: { code: "RETURN_ITEM_NOT_IN_SALE", message: "أحد الأصناف لا ينتمي إلى الفاتورة المحددة." } });
      return;
    }
    if (result.kind === "quantity_exceeded") {
      res.status(409).json({ error: { code: "RETURN_QUANTITY_EXCEEDED", message: "كمية المرتجع تتجاوز الكمية المتبقية من الصنف في الفاتورة." } });
      return;
    }
    res.status(201).json({ saleReturn: result.saleReturn, replayed: false });
  } catch (error) {
    if (typeof error === "object" && error !== null && "publicCode" in error && (error as { publicCode?: string }).publicCode === "RETURN_PRODUCT_INVARIANT") {
      res.status(409).json({ error: { code: "RETURN_PRODUCT_INVARIANT", message: "تعذر مطابقة المنتج بالمتجر أثناء تسجيل المرتجع؛ لم تُحفظ العملية." } });
      return;
    }
    if (typeof error === "object" && error !== null && "code" in error && (error as { code?: string }).code === "P2002") {
      // A simultaneous request may win the unique idempotency-key race after our
      // preflight lookup. Replay its result when the payload is identical.
      const storeId = req.params.storeId;
      const idempotencyKey = req.header("Idempotency-Key")?.trim();
      const parsed = returnSchema.safeParse(req.body);
      if (storeId && idempotencyKey && parsed.success) {
        const requestHash = createHash("sha256")
          .update(JSON.stringify({ storeId, saleId: req.params.saleId, ...parsed.data }))
          .digest("hex");
        const prior = await prisma.saleReturn.findUnique({
          where: { storeId_idempotencyKey: { storeId, idempotencyKey } },
          include: { items: true }
        });
        if (prior) {
          if (prior.requestHash !== requestHash) {
            res.status(409).json({ error: { code: "IDEMPOTENCY_CONFLICT", message: "استُخدم مفتاح المرتجع نفسه لطلب مختلف." } });
            return;
          }
          res.status(200).json({ saleReturn: prior, replayed: true });
          return;
        }
      }
      res.status(409).json({ error: { code: "RETURN_CONFLICT", message: "تعارض أثناء تسجيل المرتجع؛ أعد قراءة الفاتورة قبل المحاولة." } });
      return;
    }
    if (typeof error === "object" && error !== null && "code" in error && (error as { code?: string }).code === "P2034") {
      // Serializable isolation may surface a duplicate idempotent request as a
      // transaction conflict instead of P2002. Replay the committed winner when
      // it exists and the request hash matches.
      const storeId = req.params.storeId;
      const idempotencyKey = req.header("Idempotency-Key")?.trim();
      const parsed = returnSchema.safeParse(req.body);
      if (storeId && idempotencyKey && parsed.success) {
        const requestHash = createHash("sha256")
          .update(JSON.stringify({ storeId, saleId: req.params.saleId, ...parsed.data }))
          .digest("hex");
        const prior = await prisma.saleReturn.findUnique({
          where: { storeId_idempotencyKey: { storeId, idempotencyKey } },
          include: { items: true }
        });
        if (prior) {
          if (prior.requestHash !== requestHash) {
            res.status(409).json({ error: { code: "IDEMPOTENCY_CONFLICT", message: "استُخدم مفتاح المرتجع نفسه لطلب مختلف." } });
            return;
          }
          res.status(200).json({ saleReturn: prior, replayed: true });
          return;
        }
      }
      res.status(409).json({ error: { code: "RETURN_CONCURRENT_MODIFICATION", message: "تزامنت عملية مرتجع أخرى؛ أعد قراءة الفاتورة ثم حاول مجددًا." } });
      return;
    }
    next(error);
  }
});
