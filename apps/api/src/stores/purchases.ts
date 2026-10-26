import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { authenticate } from "../auth/auth.js";
import { prisma } from "../lib/prisma.js";
import { requireStoreAccess } from "../security/store-access-middleware.js";

export const purchaseRouter = Router();

const readRoles = ["STORE_OWNER", "STORE_MANAGER", "PURCHASING_STAFF"] as const;
const writeRoles = ["STORE_OWNER", "STORE_MANAGER", "PURCHASING_STAFF"] as const;
const quantitySchema = z.string().regex(/^\d{1,12}(\.\d{1,3})?$/).refine((value) => Number(value) > 0);
const moneySchema = z.string().regex(/^\d{1,12}(\.\d{1,2})?$/);

const createPurchaseSchema = z.object({
  supplierId: z.string().trim().min(1).max(100),
  purchaseNumber: z.string().trim().min(1).max(80),
  notes: z.string().trim().max(2000).optional(),
  items: z.array(z.object({
    productId: z.string().trim().min(1).max(100),
    quantity: quantitySchema,
    unitCost: moneySchema
  })).min(1).max(100).refine(
    (items) => new Set(items.map((item) => item.productId)).size === items.length,
    "لا تكرر المنتج نفسه في الفاتورة."
  )
});

const querySchema = z.object({
  q: z.string().trim().max(100).optional(),
  supplierId: z.string().trim().min(1).max(100).optional(),
  page: z.coerce.number().int().min(1).max(100000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25)
});

purchaseRouter.get("/:storeId/purchases", authenticate, requireStoreAccess(undefined, readRoles), async (request, response, next) => {
  try {
    const parsed = querySchema.safeParse(request.query);
    const storeId = request.params.storeId;
    if (!storeId) {
      response.status(400).json({ error: { code: "STORE_ID_REQUIRED", message: "معرّف المتجر مطلوب." } });
      return;
    }
    if (!parsed.success) {
      response.status(400).json({ error: { code: "INVALID_QUERY", message: "تحقق من عوامل تصفية المشتريات." } });
      return;
    }
    const { q, supplierId, page, pageSize } = parsed.data;
    const where = {
      storeId,
      ...(supplierId ? { supplierId } : {}),
      ...(q ? { OR: [
        { purchaseNumber: { contains: q, mode: "insensitive" as const } },
        { supplier: { name: { contains: q, mode: "insensitive" as const } } }
      ] } : {})
    };
    const [total, purchases] = await prisma.$transaction([
      prisma.purchase.count({ where }),
      prisma.purchase.findMany({
        where, orderBy: { receivedAt: "desc" },
        skip: (page - 1) * pageSize, take: pageSize,
        include: {
          supplier: { select: { id: true, name: true, phone: true } },
          items: { include: { product: { select: { id: true, name: true, sku: true, unit: true } } } }
        }
      })
    ]);
    response.status(200).json({ purchases, pagination: { page, pageSize, total } });
  } catch (error) {
    next(error);
  }
});

purchaseRouter.post("/:storeId/purchases", authenticate, requireStoreAccess(undefined, writeRoles), async (request, response, next) => {
  const parsed = createPurchaseSchema.safeParse(request.body);
  const storeId = request.params.storeId;
  const idempotencyKey = request.get("Idempotency-Key");

  if (!storeId) {
    response.status(400).json({ error: { code: "STORE_ID_REQUIRED", message: "معرّف المتجر مطلوب." } });
    return;
  }
  if (!parsed.success) {
    response.status(400).json({ error: { code: "INVALID_PURCHASE", message: "تحقق من المورد ورقم الفاتورة والمنتجات والكميات والتكاليف." } });
    return;
  }
  if (!idempotencyKey || idempotencyKey.length < 8 || idempotencyKey.length > 100) {
    response.status(400).json({ error: { code: "IDEMPOTENCY_KEY_REQUIRED", message: "أرسل مفتاحًا فريدًا لتجنب تكرار فاتورة المشتريات." } });
    return;
  }

  const data = parsed.data;
  const requestHash = createHash("sha256").update(JSON.stringify({
    supplierId: data.supplierId,
    purchaseNumber: data.purchaseNumber,
    notes: data.notes ?? null,
    items: data.items.map((item) => ({
      productId: item.productId,
      quantity: item.quantity,
      unitCost: item.unitCost
    }))
  })).digest("hex");

  try {
    const result = await prisma.$transaction(async (tx) => {
      const previous = await tx.purchase.findUnique({
        where: { storeId_idempotencyKey: { storeId, idempotencyKey } },
        include: {
          supplier: { select: { id: true, name: true, phone: true } },
          items: { include: { product: { select: { id: true, name: true, sku: true, unit: true } } } }
        }
      });
      if (previous) {
        return { kind: previous.requestHash === requestHash ? "replay" as const : "key_conflict" as const, purchase: previous };
      }

      const supplier = await tx.supplier.findFirst({
        where: { id: data.supplierId, storeId, isActive: true },
        select: { id: true }
      });
      if (!supplier) return { kind: "supplier_missing" as const };

      const productIds = data.items.map((item) => item.productId);
      const products = await tx.product.findMany({
        where: { storeId, id: { in: productIds }, status: "ACTIVE" },
        select: { id: true }
      });
      if (products.length !== productIds.length) return { kind: "product_missing" as const };

      const lines = data.items.map((item) => {
        const quantity = new Prisma.Decimal(item.quantity);
        const unitCost = new Prisma.Decimal(item.unitCost);
        return { ...item, quantity, unitCost, lineTotal: quantity.mul(unitCost) };
      });
      const subtotal = lines.reduce((sum, item) => sum.add(item.lineTotal), new Prisma.Decimal(0));

      const purchase = await tx.purchase.create({
        data: {
          storeId,
          supplierId: supplier.id,
          purchaseNumber: data.purchaseNumber,
          status: "RECEIVED",
          subtotal,
          totalAmount: subtotal,
          notes: data.notes,
          idempotencyKey,
          requestHash,
          actorUserId: request.principal!.userId,
          receivedAt: new Date(),
          items: {
            create: lines.map((item) => ({
              storeId,
              productId: item.productId,
              quantity: item.quantity,
              unitCost: item.unitCost,
              lineTotal: item.lineTotal
            }))
          }
        }
      });

      for (const item of lines) {
        await tx.product.update({
          where: { storeId_id: { storeId, id: item.productId } },
          data: {
            stockQuantity: { increment: item.quantity },
            costPrice: item.unitCost
          }
        });
        await tx.stockMovement.create({
          data: {
            storeId,
            productId: item.productId,
            type: "PURCHASE",
            quantity: item.quantity,
            reason: "استلام فاتورة مشتريات",
            reference: data.purchaseNumber,
            idempotencyKey: `purchase:${idempotencyKey}:${item.productId}`,
            requestHash: createHash("sha256").update(`${requestHash}:${item.productId}`).digest("hex"),
            actorUserId: request.principal!.userId
          }
        });
      }

      await tx.auditLog.create({
        data: {
          storeId,
          actorUserId: request.principal!.userId,
          action: "PURCHASE_RECEIVED",
          entityType: "Purchase",
          entityId: purchase.id,
          reason: data.notes,
          metadata: { purchaseNumber: purchase.purchaseNumber, supplierId: supplier.id, itemCount: lines.length, totalAmount: subtotal.toString() }
        }
      });

      return {
        kind: "created" as const,
        purchase: await tx.purchase.findUniqueOrThrow({
          where: { id: purchase.id },
          include: {
            supplier: { select: { id: true, name: true, phone: true } },
            items: { include: { product: { select: { id: true, name: true, sku: true, unit: true } } } }
          }
        })
      };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    if (result.kind === "supplier_missing") {
      response.status(404).json({ error: { code: "SUPPLIER_NOT_FOUND", message: "المورد غير موجود أو غير نشط في هذا المتجر." } });
      return;
    }
    if (result.kind === "product_missing") {
      response.status(404).json({ error: { code: "PRODUCT_NOT_FOUND", message: "أحد المنتجات غير موجود أو غير نشط في هذا المتجر." } });
      return;
    }
    if (result.kind === "key_conflict") {
      response.status(409).json({ error: { code: "IDEMPOTENCY_KEY_REUSED", message: "استُخدم مفتاح العملية سابقًا لطلب مختلف." } });
      return;
    }

    response.status(result.kind === "replay" ? 200 : 201).json({ purchase: result.purchase, replayed: result.kind === "replay" });
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && (error as { code?: string }).code === "P2002") {
      response.status(409).json({ error: { code: "PURCHASE_NUMBER_OR_KEY_EXISTS", message: "رقم فاتورة المشتريات أو مفتاح العملية مستخدم بالفعل." } });
      return;
    }
    next(error);
  }
});
