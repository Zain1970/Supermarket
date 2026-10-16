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

adminRouter.use(authenticate, requirePlatformAdmin);

const planSchema = z.object({
  code: z.string().trim().regex(/^[a-z0-9][a-z0-9_-]*$/).max(80),
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(1000).optional(),
  price: z.string().regex(/^\d{1,12}(\.\d{1,2})?$/),
  currency: z.string().regex(/^[A-Z]{3}$/).default("YER"),
  billingCycle: z.enum(["MONTHLY", "QUARTERLY", "YEARLY", "CUSTOM"]).default("MONTHLY"),
  trialDays: z.number().int().min(0).max(365).default(0),
  limits: z.record(z.string(), z.number().int().nonnegative()).optional(),
  features: z.array(z.string().trim().min(1).max(100)).optional(),
  isActive: z.boolean().default(true)
});

const planUpdateSchema = planSchema.partial().refine((value) => Object.keys(value).length > 0);
const addonSchema = z.object({
  code: z.string().trim().regex(/^[A-Z0-9][A-Z0-9_-]*$/).max(80),
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(1000).optional(),
  version: z.string().trim().min(1).max(32).default("1.0.0"),
  status: z.enum(["DRAFT", "AVAILABLE", "RETIRED"]).default("DRAFT"),
  price: z.string().regex(/^\d{1,12}(\.\d{1,2})?$/),
  currency: z.string().regex(/^[A-Z]{3}$/).default("YER"),
  billingCycle: z.enum(["MONTHLY", "QUARTERLY", "YEARLY", "CUSTOM"]).default("MONTHLY"),
  minimumPlanCode: z.string().trim().max(80).optional()
});
const addonUpdateSchema = addonSchema.partial().refine((value) => Object.keys(value).length > 0);

adminRouter.get("/plans", async (_request, response, next) => {
  try {
    const plans = await prisma.plan.findMany({ orderBy: [{ isActive: "desc" }, { price: "asc" }] });
    response.status(200).json({ plans });
  } catch (error) { next(error); }
});

adminRouter.post("/plans", async (request, response, next) => {
  try {
    const parsed = planSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ error: { code: "INVALID_PLAN", message: "تحقق من اسم الباقة وسعرها وحدودها." } });
      return;
    }
    const plan = await prisma.plan.create({ data: parsed.data });
    await prisma.auditLog.create({
      data: {
        actorUserId: request.principal!.userId,
        action: "PLAN_CREATED",
        entityType: "Plan",
        entityId: plan.id,
        metadata: { code: plan.code, price: plan.price.toString(), currency: plan.currency }
      }
    });
    response.status(201).json({ plan });
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && (error as { code?: string }).code === "P2002") {
      response.status(409).json({ error: { code: "PLAN_CODE_EXISTS", message: "رمز الباقة مستخدم بالفعل." } });
      return;
    }
    next(error);
  }
});

adminRouter.patch("/plans/:planId", async (request, response, next) => {
  try {
    const planId = request.params.planId;
    const parsed = planUpdateSchema.safeParse(request.body);
    if (!planId || !parsed.success) {
      response.status(400).json({ error: { code: "INVALID_PLAN_UPDATE", message: "تحقق من بيانات تحديث الباقة." } });
      return;
    }
    const plan = await prisma.plan.update({ where: { id: planId }, data: parsed.data });
    await prisma.auditLog.create({
      data: {
        actorUserId: request.principal!.userId,
        action: "PLAN_UPDATED",
        entityType: "Plan",
        entityId: plan.id,
        metadata: { changedFields: Object.keys(parsed.data) }
      }
    });
    response.status(200).json({ plan });
  } catch (error) { next(error); }
});

adminRouter.get("/addons", async (_request, response, next) => {
  try {
    const addons = await prisma.addon.findMany({ orderBy: [{ status: "asc" }, { name: "asc" }] });
    response.status(200).json({ addons });
  } catch (error) { next(error); }
});

adminRouter.post("/addons", async (request, response, next) => {
  try {
    const parsed = addonSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ error: { code: "INVALID_ADDON", message: "تحقق من اسم الإضافة وسعرها ودورة الفوترة." } });
      return;
    }
    const addon = await prisma.addon.create({ data: parsed.data });
    await prisma.auditLog.create({
      data: {
        actorUserId: request.principal!.userId,
        action: "ADDON_CREATED",
        entityType: "Addon",
        entityId: addon.id,
        metadata: { code: addon.code, status: addon.status, price: addon.price.toString(), currency: addon.currency }
      }
    });
    response.status(201).json({ addon });
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && (error as { code?: string }).code === "P2002") {
      response.status(409).json({ error: { code: "ADDON_CODE_EXISTS", message: "رمز الإضافة مستخدم بالفعل." } });
      return;
    }
    next(error);
  }
});

adminRouter.patch("/addons/:addonId", async (request, response, next) => {
  try {
    const addonId = request.params.addonId;
    const parsed = addonUpdateSchema.safeParse(request.body);
    if (!addonId || !parsed.success) {
      response.status(400).json({ error: { code: "INVALID_ADDON_UPDATE", message: "تحقق من بيانات تحديث الإضافة." } });
      return;
    }
    const addon = await prisma.addon.update({ where: { id: addonId }, data: parsed.data });
    await prisma.auditLog.create({
      data: {
        actorUserId: request.principal!.userId,
        action: "ADDON_UPDATED",
        entityType: "Addon",
        entityId: addon.id,
        metadata: { changedFields: Object.keys(parsed.data) }
      }
    });
    response.status(200).json({ addon });
  } catch (error) { next(error); }
});

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
          data: { status: "CONFIRMED", confirmedById: request.principal!.userId, confirmedAt: now, reviewedById: request.principal!.userId, reviewedAt: now, reviewNote: "اعتماد يدوي من مسؤول المنصة" }
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

adminRouter.post("/payments/:paymentId/reject", async (request, response, next) => {
  try {
    const paymentId = request.params.paymentId;
    const parsed = z.object({ reason: z.string().trim().min(3).max(1000) }).safeParse(request.body);
    if (!paymentId || !parsed.success) {
      response.status(400).json({ error: { code: "INVALID_REJECTION", message: "أدخل سبب رفض واضحًا." } });
      return;
    }

    const result = await prisma.$transaction(async (tx) => {
      const payment = await tx.payment.findUnique({ where: { id: paymentId } });
      if (!payment) return { kind: "missing" as const };
      if (payment.status !== "PENDING") return { kind: "not_pending" as const };

      if (payment.purpose === "ADDON") {
        const grant = await tx.storeAddon.findFirst({
          where: { id: payment.purposeReference, storeId: payment.storeId }
        });
        if (!grant || grant.status !== "PENDING_PAYMENT") return { kind: "request_invalid" as const };
        await tx.storeAddon.update({
          where: { id: grant.id },
          data: { status: "CANCELLED", disabledReason: parsed.data.reason }
        });
      } else {
        const subscription = await tx.subscription.findFirst({
          where: { id: payment.purposeReference, storeId: payment.storeId }
        });
        if (!subscription || subscription.status !== "PENDING_PAYMENT") return { kind: "request_invalid" as const };
        await tx.subscription.update({
          where: { id: subscription.id },
          data: { status: "CANCELLED", endedAt: new Date() }
        });
      }

      const now = new Date();
      await tx.payment.update({
        where: { id: payment.id },
        data: {
          status: "REJECTED",
          reviewedById: request.principal!.userId,
          reviewedAt: now,
          reviewNote: parsed.data.reason
        }
      });
      await tx.auditLog.create({
        data: {
          storeId: payment.storeId,
          actorUserId: request.principal!.userId,
          action: "PAYMENT_REJECTED",
          entityType: "Payment",
          entityId: payment.id,
          reason: parsed.data.reason,
          metadata: { purpose: payment.purpose, purposeReference: payment.purposeReference }
        }
      });
      return { kind: "rejected" as const, paymentId: payment.id };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    if (result.kind === "missing") {
      response.status(404).json({ error: { code: "PAYMENT_NOT_FOUND", message: "لم يتم العثور على الدفعة." } });
      return;
    }
    if (result.kind === "not_pending") {
      response.status(409).json({ error: { code: "PAYMENT_ALREADY_PROCESSED", message: "تمت معالجة هذه الدفعة بالفعل." } });
      return;
    }
    if (result.kind === "request_invalid") {
      response.status(409).json({ error: { code: "PAYMENT_REQUEST_INVALID", message: "طلب الاشتراك أو الإضافة لم يعد معلقًا." } });
      return;
    }

    response.status(200).json({ message: "تم رفض الدفعة وتسجيل السبب.", paymentId: result.paymentId });
  } catch (error) {
    next(error);
  }
});

