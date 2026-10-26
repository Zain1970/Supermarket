import { Router } from "express";
import { z } from "zod";
import { authenticate } from "../auth/auth.js";
import { prisma } from "../lib/prisma.js";
import { requireStoreAccess } from "../security/store-access-middleware.js";

export const supplierRouter = Router();

const readRoles = ["STORE_OWNER", "STORE_MANAGER", "PURCHASING_STAFF"] as const;
const writeRoles = ["STORE_OWNER", "STORE_MANAGER", "PURCHASING_STAFF"] as const;

const supplierFields = {
  name: z.string().trim().min(1).max(180),
  phone: z.string().trim().min(3).max(40).nullable().optional(),
  email: z.string().trim().email().max(254).nullable().optional(),
  address: z.string().trim().max(500).nullable().optional(),
  taxNumber: z.string().trim().max(80).nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional()
};

const createSupplierSchema = z.object(supplierFields);
const updateSupplierSchema = z.object({
  ...supplierFields,
  isActive: z.boolean().optional()
}).partial().refine((value) => Object.keys(value).length > 0);

const querySchema = z.object({
  q: z.string().trim().max(100).optional(),
  includeInactive: z.enum(["true", "false"]).default("false"),
  page: z.coerce.number().int().min(1).max(100000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25)
});

supplierRouter.get("/:storeId/suppliers", authenticate, requireStoreAccess(undefined, readRoles), async (request, response, next) => {
  try {
    const parsed = querySchema.safeParse(request.query);
    const storeId = request.params.storeId;
    if (!storeId) {
      response.status(400).json({ error: { code: "STORE_ID_REQUIRED", message: "معرّف المتجر مطلوب." } });
      return;
    }
    if (!parsed.success) {
      response.status(400).json({ error: { code: "INVALID_QUERY", message: "تحقق من البحث ورقم الصفحة." } });
      return;
    }
    const { q, includeInactive, page, pageSize } = parsed.data;
    const where = {
      storeId,
      ...(includeInactive === "true" ? {} : { isActive: true }),
      ...(q ? { OR: [
        { name: { contains: q, mode: "insensitive" as const } },
        { phone: { contains: q, mode: "insensitive" as const } },
        { email: { contains: q, mode: "insensitive" as const } },
        { taxNumber: { contains: q, mode: "insensitive" as const } }
      ] } : {})
    };
    const [total, suppliers] = await prisma.$transaction([
      prisma.supplier.count({ where }),
      prisma.supplier.findMany({
        where, orderBy: [{ isActive: "desc" }, { name: "asc" }],
        skip: (page - 1) * pageSize, take: pageSize
      })
    ]);
    response.status(200).json({ suppliers, pagination: { page, pageSize, total } });
  } catch (error) {
    next(error);
  }
});

supplierRouter.post("/:storeId/suppliers", authenticate, requireStoreAccess(undefined, writeRoles), async (request, response, next) => {
  try {
    const parsed = createSupplierSchema.safeParse(request.body);
    const storeId = request.params.storeId;
    if (!storeId) {
      response.status(400).json({ error: { code: "STORE_ID_REQUIRED", message: "معرّف المتجر مطلوب." } });
      return;
    }
    if (!parsed.success) {
      response.status(400).json({ error: { code: "INVALID_SUPPLIER", message: "تحقق من اسم المورد وبيانات الاتصال." } });
      return;
    }
    const data = parsed.data;
    const supplier = await prisma.$transaction(async (tx) => {
      const created = await tx.supplier.create({
        data: {
          storeId,
          name: data.name,
          phone: data.phone || null,
          email: data.email?.toLowerCase() || null,
          address: data.address || null,
          taxNumber: data.taxNumber || null,
          notes: data.notes || null
        }
      });
      await tx.auditLog.create({
        data: {
          storeId, actorUserId: request.principal!.userId, action: "SUPPLIER_CREATED",
          entityType: "Supplier", entityId: created.id,
          metadata: { name: created.name, hasPhone: Boolean(created.phone) }
        }
      });
      return created;
    });
    response.status(201).json({ supplier });
  } catch (error) {
    next(error);
  }
});

supplierRouter.patch("/:storeId/suppliers/:supplierId", authenticate, requireStoreAccess(undefined, writeRoles), async (request, response, next) => {
  try {
    const parsed = updateSupplierSchema.safeParse(request.body);
    const storeId = request.params.storeId;
    const supplierId = request.params.supplierId;
    if (!storeId || !supplierId) {
      response.status(400).json({ error: { code: "SUPPLIER_ID_REQUIRED", message: "معرّف المتجر والمورد مطلوبان." } });
      return;
    }
    if (!parsed.success) {
      response.status(400).json({ error: { code: "INVALID_SUPPLIER", message: "تحقق من بيانات المورد." } });
      return;
    }
    const data = parsed.data;
    const existing = await prisma.supplier.findFirst({ where: { id: supplierId, storeId }, select: { id: true } });
    if (!existing) {
      response.status(404).json({ error: { code: "SUPPLIER_NOT_FOUND", message: "المورد غير موجود في هذا المتجر." } });
      return;
    }
    const supplier = await prisma.$transaction(async (tx) => {
      const updated = await tx.supplier.update({
        where: { id: supplierId },
        data: {
          ...(data.name !== undefined ? { name: data.name } : {}),
          ...(data.phone !== undefined ? { phone: data.phone || null } : {}),
          ...(data.email !== undefined ? { email: data.email ? data.email.toLowerCase() : null } : {}),
          ...(data.address !== undefined ? { address: data.address || null } : {}),
          ...(data.taxNumber !== undefined ? { taxNumber: data.taxNumber || null } : {}),
          ...(data.notes !== undefined ? { notes: data.notes || null } : {}),
          ...(data.isActive !== undefined ? { isActive: data.isActive } : {})
        }
      });
      await tx.auditLog.create({
        data: {
          storeId, actorUserId: request.principal!.userId, action: "SUPPLIER_UPDATED",
          entityType: "Supplier", entityId: updated.id,
          metadata: { changedFields: Object.keys(data) }
        }
      });
      return updated;
    });
    response.status(200).json({ supplier });
  } catch (error) {
    next(error);
  }
});
