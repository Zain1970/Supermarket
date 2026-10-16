import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { authenticate } from "../auth/auth.js";
import { requireStoreAccess } from "../security/store-access-middleware.js";

export const billingRouter = Router();

const storeRoles = ["STORE_OWNER", "STORE_MANAGER"] as const;
const purchaseSchema = z.object({
  planCode: z.string().trim().min(1).max(80),
  method: z.enum(["CASH", "BANK_TRANSFER", "OTHER"]),
  note: z.string().trim().max(1000).optional()
});

billingRouter.get(
  "/:storeId/plans",
  authenticate,
  requireStoreAccess(undefined, storeRoles),
  async (request, response, next) => {
    try {
      const storeId = request.params.storeId;
      if (!storeId) {
        response.status(400).json({ error: { code: "STORE_ID_REQUIRED", message: "معرّف المتجر مطلوب." } });
        return;
      }
      const plans = await prisma.plan.findMany({
        where: { isActive: true },
        select: { id: true, code: true, name: true, description: true, price: true, currency: true, billingCycle: true, trialDays: true, limits: true, features: true },
        orderBy: { price: "asc" }
      });
      const subscriptions = await prisma.subscription.findMany({
        where: { storeId },
        include: { plan: { select: { code: true, name: true, price: true, currency: true, billingCycle: true } } },
        orderBy: { createdAt: "desc" },
        take: 5
      });
      response.status(200).json({ plans, subscriptions });
    } catch (error) {
      next(error);
    }
  }
);

billingRouter.post(
  "/:storeId/subscription/purchase",
  authenticate,
  requireStoreAccess(undefined, storeRoles),
  async (request, response, next) => {
    try {
      const storeId = request.params.storeId;
      const parsed = purchaseSchema.safeParse(request.body);
      if (!storeId) {
        response.status(400).json({ error: { code: "STORE_ID_REQUIRED", message: "معرّف المتجر مطلوب." } });
        return;
      }
      if (!parsed.success) {
        response.status(400).json({ error: { code: "INVALID_SUBSCRIPTION_REQUEST", message: "تحقق من الباقة ووسيلة الدفع." } });
        return;
      }

      const plan = await prisma.plan.findFirst({
        where: { code: parsed.data.planCode, isActive: true }
      });
      if (!plan) {
        response.status(404).json({ error: { code: "PLAN_UNAVAILABLE", message: "الباقة غير موجودة أو غير متاحة." } });
        return;
      }
      if (plan.billingCycle === "CUSTOM") {
        response.status(400).json({ error: { code: "BILLING_CYCLE_UNSUPPORTED", message: "دورة الفوترة المخصصة غير مهيأة." } });
        return;
      }

      const result = await prisma.$transaction(async (tx) => {
        const active = await tx.subscription.findFirst({
          where: { storeId, status: { in: ["ACTIVE", "TRIALING"] }, OR: [{ currentPeriodEnd: null }, { currentPeriodEnd: { gt: new Date() } }] },
          select: { id: true }
        });
        if (active) return { kind: "active" as const };

        const pending = await tx.subscription.findFirst({
          where: { storeId, status: "PENDING_PAYMENT" },
          orderBy: { createdAt: "desc" }
        });
        if (pending) {
          const pendingPayment = await tx.payment.findFirst({
            where: { storeId, purpose: "SUBSCRIPTION", purposeReference: pending.id, status: "PENDING" },
            orderBy: { createdAt: "desc" }
          });
          if (pendingPayment) return { kind: "pending" as const, subscription: pending, payment: pendingPayment };
          return { kind: "pending_without_payment" as const };
        }

        const subscription = await tx.subscription.create({
          data: { storeId, planId: plan.id, status: "PENDING_PAYMENT" }
        });
        const payment = await tx.payment.create({
          data: {
            storeId,
            purpose: "SUBSCRIPTION",
            purposeReference: subscription.id,
            amount: plan.price,
            currency: plan.currency,
            method: parsed.data.method,
            note: parsed.data.note
          }
        });
        await tx.auditLog.create({
          data: {
            storeId,
            actorUserId: request.principal!.userId,
            action: "SUBSCRIPTION_PURCHASE_REQUESTED",
            entityType: "Payment",
            entityId: payment.id,
            metadata: { planCode: plan.code, amount: plan.price.toString(), currency: plan.currency }
          }
        });
        return { kind: "created" as const, subscription, payment };
      });

      if (result.kind === "active") {
        response.status(409).json({ error: { code: "SUBSCRIPTION_ACTIVE", message: "لدى المتجر اشتراك نشط بالفعل." } });
        return;
      }
      if (result.kind === "pending_without_payment") {
        response.status(409).json({ error: { code: "SUBSCRIPTION_REVIEW_REQUIRED", message: "يوجد طلب اشتراك سابق يحتاج إلى مراجعة مسؤول المنصة." } });
        return;
      }

      response.status(result.kind === "pending" ? 200 : 201).json({
        message: "تم تسجيل طلب الاشتراك للدفع اليدوي، ولن يُفعّل قبل تأكيد مسؤول المنصة.",
        subscriptionId: result.subscription.id,
        payment: {
          id: result.payment.id,
          amount: result.payment.amount,
          currency: result.payment.currency,
          status: result.payment.status,
          method: result.payment.method
        }
      });
    } catch (error) {
      next(error);
    }
  }
);
