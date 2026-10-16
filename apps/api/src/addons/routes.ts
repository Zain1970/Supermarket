import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { authenticate } from "../auth/auth.js";
import { requireStoreAccess } from "../security/store-access-middleware.js";

export const addonRouter = Router();

const storeRoles = ["STORE_OWNER", "STORE_MANAGER"] as const;
const purchaseSchema = z.object({
  method: z.enum(["CASH", "BANK_TRANSFER", "OTHER"]),
  note: z.string().trim().max(1000).optional()
});

addonRouter.get(
  "/:storeId/addons",
  authenticate,
  requireStoreAccess(undefined, storeRoles),
  async (request, response, next) => {
    try {
      const storeId = request.params.storeId;
      if (!storeId) {
        response.status(400).json({ error: { code: "STORE_ID_REQUIRED", message: "معرّف المتجر مطلوب." } });
        return;
      }

      const [catalog, storeGrants] = await prisma.$transaction([
        prisma.addon.findMany({
          where: { status: "AVAILABLE" },
          select: { id: true, code: true, name: true, description: true, version: true, price: true, currency: true, billingCycle: true },
          orderBy: { name: "asc" }
        }),
        prisma.storeAddon.findMany({
          where: { storeId },
          include: { addon: { select: { code: true, name: true } } }
        })
      ]);

      response.status(200).json({
        catalog,
        storeAddons: storeGrants.map((grant) => ({
          id: grant.id,
          code: grant.addon.code,
          name: grant.addon.name,
          status: grant.status,
          startsAt: grant.startsAt,
          endsAt: grant.endsAt
        }))
      });
    } catch (error) {
      next(error);
    }
  }
);

addonRouter.post(
  "/:storeId/addons/:addonCode/purchase",
  authenticate,
  requireStoreAccess(undefined, storeRoles),
  async (request, response, next) => {
    try {
      const storeId = request.params.storeId;
      const addonCode = request.params.addonCode;
      const parsed = purchaseSchema.safeParse(request.body);

      if (!storeId || !addonCode) {
        response.status(400).json({ error: { code: "INVALID_ROUTE", message: "معرّف المتجر والإضافة مطلوبان." } });
        return;
      }
      if (!parsed.success) {
        response.status(400).json({ error: { code: "INVALID_PURCHASE", message: "حدد وسيلة الدفع وأدخل بيانات صحيحة." } });
        return;
      }

      const addon = await prisma.addon.findFirst({
        where: { code: addonCode, status: "AVAILABLE" }
      });
      if (!addon) {
        response.status(404).json({ error: { code: "ADDON_UNAVAILABLE", message: "هذه الإضافة غير متاحة حاليًا." } });
        return;
      }
      if (addon.billingCycle === "CUSTOM") {
        response.status(400).json({ error: { code: "BILLING_CYCLE_UNSUPPORTED", message: "دورة الفوترة المخصصة غير مهيأة لهذه الإضافة." } });
        return;
      }

      const result = await prisma.$transaction(async (tx) => {
        const existing = await tx.storeAddon.findUnique({
          where: { storeId_addonId: { storeId, addonId: addon.id } }
        });

        if (existing?.status === "ACTIVE" && (!existing.endsAt || existing.endsAt.getTime() > Date.now())) {
          return { kind: "already_active" as const };
        }

        if (existing?.status === "PENDING_PAYMENT") {
          const pendingPayment = await tx.payment.findFirst({
            where: { storeId, purpose: "ADDON", purposeReference: existing.id, status: "PENDING" },
            orderBy: { createdAt: "desc" }
          });
          if (pendingPayment) return { kind: "pending" as const, payment: pendingPayment, storeAddon: existing };
        }

        const storeAddon = existing
          ? await tx.storeAddon.update({
              where: { id: existing.id },
              data: { status: "PENDING_PAYMENT", startsAt: null, endsAt: null, activatedBy: null, disabledReason: null }
            })
          : await tx.storeAddon.create({
              data: { storeId, addonId: addon.id, status: "PENDING_PAYMENT" }
            });

        const payment = await tx.payment.create({
          data: {
            storeId,
            purpose: "ADDON",
            purposeReference: storeAddon.id,
            amount: addon.price,
            currency: addon.currency,
            method: parsed.data.method,
            note: parsed.data.note
          }
        });

        await tx.auditLog.create({
          data: {
            storeId,
            actorUserId: request.principal!.userId,
            action: "ADDON_PURCHASE_REQUESTED",
            entityType: "Payment",
            entityId: payment.id,
            metadata: { addonCode: addon.code, amount: addon.price.toString(), currency: addon.currency }
          }
        });

        return { kind: "created" as const, payment, storeAddon };
      });

      if (result.kind === "already_active") {
        response.status(409).json({ error: { code: "ADDON_ALREADY_ACTIVE", message: "هذه الإضافة مفعّلة بالفعل في متجرك." } });
        return;
      }

      response.status(result.kind === "pending" ? 200 : 201).json({
        message: "تم تسجيل طلب الدفع اليدوي، ولم تُفعّل الإضافة بعد. تنتظر مراجعة مسؤول المنصة.",
        payment: {
          id: result.payment.id,
          amount: result.payment.amount,
          currency: result.payment.currency,
          status: result.payment.status,
          method: result.payment.method
        },
        storeAddonId: result.storeAddon.id
      });
    } catch (error) {
      next(error);
    }
  }
);
