import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { authenticate } from "../auth/auth.js";
import { requireStoreAccess } from "../security/store-access-middleware.js";

export const inventoryRouter = Router();

const readRoles = ["STORE_OWNER", "STORE_MANAGER", "CASHIER", "INVENTORY_STAFF", "PURCHASING_STAFF"] as const;
const writeRoles = ["STORE_OWNER", "STORE_MANAGER", "INVENTORY_STAFF"] as const;

const adjustmentSchema = z.object({
  productId: z.string().trim().min(1).max(100),
  direction: z.enum(["IN", "OUT"]),
  quantity: z.string().regex(/^\d{1,12}(\.\d{1,3})?$/).refine((value) => Number(value) > 0),
  reason: z.string().trim().min(3).max(500)
});

const querySchema = z.object({
  productId: z.string().trim().min(1).max(100).optional(),
  page: z.coerce.number().int().min(1).max(100000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25)
});

inventoryRouter.get(
  "/:storeId/stock-movements",
  authenticate,
  requireStoreAccess(undefined, readRoles),
  async (request, response, next) => {
    try {
      const parsed = querySchema.safeParse(request.query);
      const storeId = request.params.storeId;
      if (!storeId) {
        response.status(400).json({ error: { code: "STORE_ID_REQUIRED", message: "معرّف المتجر مطلوب." } });
        return;
      }
      if (!parsed.success) {
        response.status(400).json({ error: { code: "INVALID_QUERY", message: "تحقق من عوامل تصفية حركات المخزون." } });
        return;
      }

      const { productId, page, pageSize } = parsed.data;
      const where = { storeId, ...(productId ? { productId } : {}) };
      const [total, movements] = await prisma.$transaction([
        prisma.stockMovement.count({ where }),
        prisma.stockMovement.findMany({
          where,
          orderBy: { createdAt: "desc" },
          skip: (page - 1) * pageSize,
          take: pageSize
        })
      ]);
      response.status(200).json({ movements, pagination: { page, pageSize, total } });
    } catch (error) {
      next(error);
    }
  }
);

inventoryRouter.post(
  "/:storeId/stock-movements",
  authenticate,
  requireStoreAccess(undefined, writeRoles),
  async (request, response, next) => {
    const parsed = adjustmentSchema.safeParse(request.body);
    const storeId = request.params.storeId;
    const idempotencyKey = request.get("Idempotency-Key");

    if (!storeId) {
      response.status(400).json({ error: { code: "STORE_ID_REQUIRED", message: "معرّف المتجر مطلوب." } });
      return;
    }
    if (!parsed.success) {
      response.status(400).json({ error: { code: "INVALID_ADJUSTMENT", message: "تحقق من المنتج والكمية وسبب التعديل." } });
      return;
    }
    if (!idempotencyKey || idempotencyKey.length < 8 || idempotencyKey.length > 100) {
      response.status(400).json({
        error: { code: "IDEMPOTENCY_KEY_REQUIRED", message: "أرسل مفتاحًا فريدًا للعملية لتجنب تكرار حركة المخزون." }
      });
      return;
    }

    const data = parsed.data;
    const requestHash = createHash("sha256")
      .update(JSON.stringify({ productId: data.productId, direction: data.direction, quantity: data.quantity, reason: data.reason }))
      .digest("hex");

    try {
      const result = await prisma.$transaction(async (tx) => {
        const previous = await tx.stockMovement.findUnique({
          where: { storeId_idempotencyKey: { storeId, idempotencyKey } }
        });
        if (previous) {
          return { kind: previous.requestHash === requestHash ? "replay" as const : "key_conflict" as const, movement: previous };
        }

        const product = await tx.product.findFirst({
          where: { id: data.productId, storeId, status: "ACTIVE" },
          select: { id: true, stockQuantity: true, allowNegativeStock: true }
        });
        if (!product) return { kind: "product_missing" as const };

        const quantity = new Prisma.Decimal(data.quantity);
        if (data.direction === "OUT" && !product.allowNegativeStock && product.stockQuantity.lessThan(quantity)) {
          return { kind: "insufficient_stock" as const };
        }

        await tx.product.update({
          where: { id: product.id },
          data: {
            stockQuantity: data.direction === "IN"
              ? { increment: quantity }
              : { decrement: quantity }
          }
        });

        const movement = await tx.stockMovement.create({
          data: {
            storeId,
            productId: product.id,
            type: data.direction === "IN" ? "ADJUSTMENT_IN" : "ADJUSTMENT_OUT",
            quantity,
            reason: data.reason,
            idempotencyKey,
            requestHash,
            actorUserId: request.principal!.userId
          }
        });

        await tx.auditLog.create({
          data: {
            storeId,
            actorUserId: request.principal!.userId,
            action: "STOCK_ADJUSTED",
            entityType: "StockMovement",
            entityId: movement.id,
            reason: data.reason,
            metadata: { productId: product.id, direction: data.direction, quantity: data.quantity }
          }
        });

        return { kind: "created" as const, movement };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

      if (result.kind === "product_missing") {
        response.status(404).json({ error: { code: "PRODUCT_NOT_FOUND", message: "المنتج غير موجود أو غير نشط في هذا المتجر." } });
        return;
      }
      if (result.kind === "insufficient_stock") {
        response.status(409).json({ error: { code: "INSUFFICIENT_STOCK", message: "الكمية المتاحة لا تكفي لهذا التعديل." } });
        return;
      }
      if (result.kind === "key_conflict") {
        response.status(409).json({ error: { code: "IDEMPOTENCY_KEY_REUSED", message: "استُخدم مفتاح العملية سابقًا لطلب مختلف." } });
        return;
      }

      response.status(result.kind === "replay" ? 200 : 201).json({ movement: result.movement, replayed: result.kind === "replay" });
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        (error as { code?: string }).code === "P2002"
      ) {
        response.status(409).json({ error: { code: "DUPLICATE_MOVEMENT", message: "تم تسجيل هذه العملية بالفعل؛ حدّث قائمة الحركات قبل إعادة المحاولة." } });
        return;
      }
      next(error);
    }
  }
);
