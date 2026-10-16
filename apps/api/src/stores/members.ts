import { Router } from "express";
import { z } from "zod";
import { authenticate } from "../auth/auth.js";
import { prisma } from "../lib/prisma.js";
import { requireStoreAccess } from "../security/store-access-middleware.js";

export const memberRouter = Router();

const managerRoles = ["STORE_OWNER", "STORE_MANAGER"] as const;
const ownerRoles = ["STORE_OWNER"] as const;
const assignableRoles = ["STORE_MANAGER", "CASHIER", "INVENTORY_STAFF", "PURCHASING_STAFF"] as const;

const createMemberSchema = z.object({
  email: z.string().trim().email().max(254),
  role: z.enum(assignableRoles)
});

const updateMemberSchema = z.object({
  role: z.enum(assignableRoles)
});

memberRouter.get(
  "/:storeId/members",
  authenticate,
  requireStoreAccess(undefined, managerRoles),
  async (request, response, next) => {
    try {
      const storeId = request.params.storeId;
      if (!storeId) {
        response.status(400).json({ error: { code: "STORE_ID_REQUIRED", message: "معرّف المتجر مطلوب." } });
        return;
      }

      const memberships = await prisma.storeMembership.findMany({
        where: { storeId },
        select: {
          id: true,
          role: true,
          createdAt: true,
          user: {
            select: { id: true, email: true, displayName: true, isActive: true }
          }
        },
        orderBy: [{ role: "asc" }, { createdAt: "asc" }]
      });

      response.status(200).json({ members: memberships });
    } catch (error) {
      next(error);
    }
  }
);

memberRouter.post(
  "/:storeId/members",
  authenticate,
  requireStoreAccess(undefined, ownerRoles),
  async (request, response, next) => {
    try {
      const parsed = createMemberSchema.safeParse(request.body);
      if (!parsed.success) {
        response.status(400).json({
          error: { code: "INVALID_MEMBER", message: "أدخل بريدًا إلكترونيًا صحيحًا ودورًا مسموحًا." }
        });
        return;
      }

      const storeId = request.params.storeId;
      if (!storeId) {
        response.status(400).json({ error: { code: "STORE_ID_REQUIRED", message: "معرّف المتجر مطلوب." } });
        return;
      }

      const email = parsed.data.email.toLowerCase();
      const user = await prisma.user.findUnique({
        where: { email },
        select: { id: true, email: true, displayName: true, isActive: true }
      });

      if (!user || !user.isActive) {
        response.status(404).json({
          error: { code: "ACTIVE_USER_NOT_FOUND", message: "لا يوجد حساب نشط بهذا البريد. يجب إنشاء الحساب أولًا." }
        });
        return;
      }

      const membership = await prisma.$transaction(async (tx) => {
        const created = await tx.storeMembership.create({
          data: { storeId, userId: user.id, role: parsed.data.role },
          select: {
            id: true,
            role: true,
            createdAt: true,
            user: { select: { id: true, email: true, displayName: true, isActive: true } }
          }
        });

        await tx.auditLog.create({
          data: {
            storeId,
            actorUserId: request.principal!.userId,
            action: "STORE_MEMBER_ADDED",
            entityType: "StoreMembership",
            entityId: created.id,
            metadata: { memberUserId: user.id, role: created.role }
          }
        });
        return created;
      });

      response.status(201).json({ member: membership });
    } catch (error) {
      if (typeof error === "object" && error !== null && "code" in error &&
          (error as { code?: string }).code === "P2002") {
        response.status(409).json({
          error: { code: "MEMBERSHIP_EXISTS", message: "هذا المستخدم عضو بالفعل في المتجر." }
        });
        return;
      }
      next(error);
    }
  }
);

memberRouter.patch(
  "/:storeId/members/:membershipId",
  authenticate,
  requireStoreAccess(undefined, ownerRoles),
  async (request, response, next) => {
    try {
      const parsed = updateMemberSchema.safeParse(request.body);
      if (!parsed.success) {
        response.status(400).json({
          error: { code: "INVALID_ROLE", message: "الدور المطلوب غير مسموح به." }
        });
        return;
      }

      const { storeId, membershipId } = request.params;
      if (!storeId || !membershipId) {
        response.status(400).json({ error: { code: "MEMBERSHIP_ID_REQUIRED", message: "معرّف العضوية مطلوب." } });
        return;
      }

      const existing = await prisma.storeMembership.findFirst({
        where: { id: membershipId, storeId },
        select: { id: true, role: true, userId: true }
      });
      if (!existing) {
        response.status(404).json({ error: { code: "MEMBERSHIP_NOT_FOUND", message: "العضوية غير موجودة في هذا المتجر." } });
        return;
      }
      if (existing.role === "STORE_OWNER") {
        response.status(409).json({
          error: { code: "OWNER_ROLE_PROTECTED", message: "لا يمكن تغيير دور مالك المتجر من هذا المسار." }
        });
        return;
      }

      const member = await prisma.$transaction(async (tx) => {
        const updated = await tx.storeMembership.update({
          where: { id: existing.id },
          data: { role: parsed.data.role },
          select: {
            id: true,
            role: true,
            createdAt: true,
            user: { select: { id: true, email: true, displayName: true, isActive: true } }
          }
        });
        await tx.auditLog.create({
          data: {
            storeId,
            actorUserId: request.principal!.userId,
            action: "STORE_MEMBER_ROLE_CHANGED",
            entityType: "StoreMembership",
            entityId: updated.id,
            metadata: { memberUserId: existing.userId, previousRole: existing.role, role: updated.role }
          }
        });
        return updated;
      });

      response.status(200).json({ member });
    } catch (error) {
      next(error);
    }
  }
);

memberRouter.delete(
  "/:storeId/members/:membershipId",
  authenticate,
  requireStoreAccess(undefined, ownerRoles),
  async (request, response, next) => {
    try {
      const { storeId, membershipId } = request.params;
      if (!storeId || !membershipId) {
        response.status(400).json({ error: { code: "MEMBERSHIP_ID_REQUIRED", message: "معرّف العضوية مطلوب." } });
        return;
      }

      const existing = await prisma.storeMembership.findFirst({
        where: { id: membershipId, storeId },
        select: { id: true, role: true, userId: true }
      });
      if (!existing) {
        response.status(404).json({ error: { code: "MEMBERSHIP_NOT_FOUND", message: "العضوية غير موجودة في هذا المتجر." } });
        return;
      }
      if (existing.role === "STORE_OWNER") {
        response.status(409).json({
          error: { code: "OWNER_ROLE_PROTECTED", message: "لا يمكن حذف عضوية مالك المتجر من هذا المسار." }
        });
        return;
      }

      await prisma.$transaction(async (tx) => {
        await tx.storeMembership.delete({ where: { id: existing.id } });
        await tx.auditLog.create({
          data: {
            storeId,
            actorUserId: request.principal!.userId,
            action: "STORE_MEMBER_REMOVED",
            entityType: "StoreMembership",
            entityId: existing.id,
            metadata: { memberUserId: existing.userId, previousRole: existing.role }
          }
        });
      });

      response.status(204).end();
    } catch (error) {
      next(error);
    }
  }
);
