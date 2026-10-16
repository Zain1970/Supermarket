import { Router } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { periodEnd } from "../billing/period.js";
import { prisma } from "../lib/prisma.js";
import { authenticate } from "../auth/auth.js";
import { requirePlatformAdmin } from "../security/platform-admin.js";

export const adminRouter = Router();

const paymentListSchema = z.object({
  status: z.enum(["PENDING", "CONFIRMED", "REJECTED", "REFUNDED"]).default("PENDING"),
  page: z.coerce.number().int().min(1).max(100000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25)
});

function periodEnd(start: Date, cycle: "MONTHLY" | "QUARTERLY" | "YEARLY"): Date {
  const months = cycle === "MONTHLY" ? 1 : cycle === "QUARTERLY" ? 3 : 12;
  const end = new Date(start);
  const day = end.getUTCDate();
  end.setUTCDate(1);
  end.setUTCMonth(end.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + 1, 0)).getUTCDate();
  end.setUTCDate(Math.min(day, lastDay));
  return end;
}

adminRouter.use(authenticate, requirePlatformAdmin);

adminRouter.get("/payments", async (request, response, next) => {
  try {
    const parsed = paymentListSchema.safeParse(request.query);
    if (!parsed.success) {
      response.status(400).json({ error: { code: "INVALID_QUERY", message: "تحقق من عوامل تصفية المدفوعات." } });
      return;
    }

    const { status, page, pageSize } = parsed.data;
    const [total, payments] = await prisma.$transaction([
      prisma.payment.count({ where: { status } }),
      prisma.payment.findMany({
        where: { status },
        include: { store: { select: { id: true, name: true, slug: true } } },
        orderBy: { createdAt: "asc" },
        skip: (page - 1) * pageSize,
        take: pageSize
      })
    ]);
    response.status(200).json({ payments, pagination: { page, pageSize, total } });
  } catch (error) {
    next(error);
  }
});

adminRouter.post("/payments/:paymentId/confirm", async (request, response, next) => {
  try {
    const paymentId = request.params.paymentId;
    if (!paymentId) {
      response.status(400).json({ error: { code: "PAYMENT_ID_REQUIRED", message: "معرّف الدفعة مطلوب." } });
      return;
    }

    const result = await prisma.$transaction(async (tx) => {
      const payment = await tx.payment.findUnique({ where: { id: paymentId } });
      if (!payment) return { kind: "missing" as const };
      if (payment.status !== "PENDING") return { kind: "not_pending" as const };

      const now = new Date();
      if (payment.purpose === "ADDON") {
        const grant = await tx.storeAddon.findFirst({
          where: { id: payment.purposeReference, storeId: payment.storeId },
          include: { addon: true }
        });
        if (!grant || grant.status !== "PENDING_PAYMENT") return { kind: "grant_invalid" as const };
        if (grant.addon.status !== "AVAILABLE") return { kind: "addon_unavailable" as const };
        if (grant.addon.billingCycle === "CUSTOM") return { kind: "billing_unsupported" as const };

        const claimed = await tx.payment.updateMany({
          where: { id: payment.id, status: "PENDING" },
          data: { status: "CONFIRMED", confirmedById: request.principal!.userId, confirmedAt: now }
        });
        if (claimed.count !== 1) return { kind: "not_pending" as const };

        const activated = await tx.storeAddon.update({
          where: { id: grant.id },
          data: {
            status: "ACTIVE",
            startsAt: now,
            endsAt: periodEnd(now, grant.addon.billingCycle),
            activatedBy: request.principal!.userId,
            disabledReason: null
          }
        });

        await tx.auditLog.create({
          data: {
            storeId: payment.storeId,
            actorUserId: request.principal!.userId,
            action: "ADDON_PAYMENT_CONFIRMED",
            entityType: "Payment",
            entityId: payment.id,
            reason: "Manual payment approved by platform administrator",
            metadata: { storeAddonId: grant.id, addonCode: grant.addon.code, amount: payment.amount.toString(), currency: payment.currency }
          }
        });
        return { kind: "confirmed_addon" as const, paymentId: payment.id, storeAddon: activated };
      }

      const subscription = await tx.subscription.findFirst({
        where: { id: payment.purposeReference, storeId: payment.storeId },
        include: { plan: true }
      });
      if (!subscription || subscription.status !== "PENDING_PAYMENT") {
        return { kind: "subscription_invalid" as const };
      }
      if (!subscription.plan.isActive) return { kind: "plan_unavailable" as const };
      if (subscription.plan.billingCycle === "CUSTOM") return { kind: "billing_unsupported" as const };

      const claimed = await tx.payment.updateMany({
        where: { id: payment.id, status: "PENDING" },
        data: { status: "CONFIRMED", confirmedById: request.principal!.userId, confirmedAt: now }
      });
      if (claimed.count !== 1) return { kind: "not_pending" as const };

      await tx.subscription.updateMany({
        where: { storeId: payment.storeId, status: "ACTIVE", currentPeriodEnd: { lte: now } },
        data: { status: "EXPIRED" }
      });

      const activated = await tx.subscription.update({
        where: { id: subscription.id },
        data: {
          status: "ACTIVE",
          startsAt: now,
          currentPeriodEnd: periodEnd(now, subscription.plan.billingCycle),
          endedAt: null
        }
      });

      await tx.auditLog.create({
        data: {
          storeId: payment.storeId,
          actorUserId: request.principal!.userId,
          action: "SUBSCRIPTION_PAYMENT_CONFIRMED",
          entityType: "Payment",
          entityId: payment.id,
          reason: "Manual subscription payment approved by platform administrator",
          metadata: { subscriptionId: subscription.id, planCode: subscription.plan.code, amount: payment.amount.toString(), currency: payment.currency }
        }
      });
      return { kind: "confirmed_subscription" as const, paymentId: payment.id, subscription: activated };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    if (result.kind === "missing") {
      response.status(404).json({ error: { code: "PAYMENT_NOT_FOUND", message: "لم يتم العثور على الدفعة." } });
      return;
    }
    if (result.kind === "not_pending") {
      response.status(409).json({ error: { code: "PAYMENT_ALREADY_PROCESSED", message: "تمت معالجة هذه الدفعة أو لم تعد معلقة." } });
      return;
    }
    if (result.kind === "grant_invalid") {
      response.status(409).json({ error: { code: "ADDON_REQUEST_INVALID", message: "طلب تفعيل الإضافة لم يعد صالحًا." } });
      return;
    }
    if (result.kind === "addon_unavailable") {
      response.status(409).json({ error: { code: "ADDON_UNAVAILABLE", message: "الإضافة لم تعد متاحة." } });
      return;
    }
    if (result.kind === "subscription_invalid") {
      response.status(409).json({ error: { code: "SUBSCRIPTION_REQUEST_INVALID", message: "طلب الاشتراك لم يعد صالحًا." } });
      return;
    }
    if (result.kind === "plan_unavailable") {
      response.status(409).json({ error: { code: "PLAN_UNAVAILABLE", message: "الباقة لم تعد متاحة." } });
      return;
    }
    if (result.kind === "billing_unsupported") {
      response.status(400).json({ error: { code: "BILLING_CYCLE_UNSUPPORTED", message: "دورة الفوترة المخصصة غير مهيأة." } });
      return;
    }

    if (result.kind === "confirmed_addon") {
      response.status(200).json({
        message: "تم تأكيد الدفعة وتفعيل الإضافة.",
        paymentId: result.paymentId,
        storeAddon: result.storeAddon
      });
      return;
    }

    response.status(200).json({
      message: "تم تأكيد الدفعة وتفعيل الاشتراك.",
      paymentId: result.paymentId,
      subscription: result.subscription
    });
  } catch (error) {
    next(error);
  }
});
