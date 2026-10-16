import { Router } from "express";
import { z } from "zod";
import { authenticate } from "../auth/auth.js";
import { prisma } from "../lib/prisma.js";
import { requireStoreAccess } from "../security/store-access-middleware.js";

export const customerRouter = Router();
const readRoles = ["STORE_OWNER", "STORE_MANAGER", "CASHIER", "INVENTORY_STAFF", "PURCHASING_STAFF"] as const;
const writeRoles = ["STORE_OWNER", "STORE_MANAGER", "CASHIER"] as const;
const money = z.string().regex(/^\d{1,12}(\.\d{1,2})?$/);

const createCustomerSchema = z.object({
  name: z.string().trim().min(1).max(180),
  phone: z.string().trim().min(3).max(40).optional(),
  email: z.string().trim().email().max(254).optional(),
  address: z.string().trim().max(500).optional(),
  notes: z.string().trim().max(2000).optional(),
  creditLimit: money.default("0")
});

const querySchema = z.object({
  q: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).max(100000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25)
});

customerRouter.get("/:storeId/customers", authenticate, requireStoreAccess(undefined, readRoles), async (req, res, next) => {
  try {
    const parsed = querySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: { code: "INVALID_QUERY", message: "تحقق من البحث ورقم الصفحة." } });
      return;
    }
    const storeId = req.params.storeId;
    if (!storeId) {
      res.status(400).json({ error: { code: "STORE_ID_REQUIRED", message: "معرّف المتجر مطلوب." } });
      return;
    }
    const { q, page, pageSize } = parsed.data;
    const where = {
      storeId,
      ...(q ? { OR: [
        { name: { contains: q, mode: "insensitive" as const } },
        { phone: { contains: q, mode: "insensitive" as const } },
        { email: { contains: q, mode: "insensitive" as const } }
      ] } : {})
    };
    const [total, customers] = await prisma.$transaction([
      prisma.customer.count({ where }),
      prisma.customer.findMany({
        where, orderBy: { name: "asc" }, skip: (page - 1) * pageSize, take: pageSize,
        select: { id: true, name: true, phone: true, email: true, address: true, creditLimit: true, creditBalance: true, createdAt: true, updatedAt: true }
      })
    ]);
    res.status(200).json({ customers, pagination: { page, pageSize, total } });
  } catch (error) { next(error); }
});

customerRouter.post("/:storeId/customers", authenticate, requireStoreAccess(undefined, writeRoles), async (req, res, next) => {
  try {
    const parsed = createCustomerSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: "INVALID_CUSTOMER", message: "تحقق من اسم العميل وبيانات الاتصال وحد الائتمان." } });
      return;
    }
    const storeId = req.params.storeId;
    if (!storeId) {
      res.status(400).json({ error: { code: "STORE_ID_REQUIRED", message: "معرّف المتجر مطلوب." } });
      return;
    }
    const data = parsed.data;
    const customer = await prisma.$transaction(async (tx) => {
      const created = await tx.customer.create({
        data: {
          storeId, name: data.name, phone: data.phone || null, email: data.email?.toLowerCase() ?? null,
          address: data.address, notes: data.notes, creditLimit: data.creditLimit
        },
        select: { id: true, name: true, phone: true, email: true, address: true, notes: true, creditLimit: true, creditBalance: true, createdAt: true }
      });
      await tx.auditLog.create({
        data: {
          storeId, actorUserId: req.principal!.userId, action: "CUSTOMER_CREATED",
          entityType: "Customer", entityId: created.id,
          metadata: { name: created.name, hasPhone: Boolean(created.phone) }
        }
      });
      return created;
    });
    res.status(201).json({ customer });
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && (error as { code?: string }).code === "P2002") {
      res.status(409).json({ error: { code: "CUSTOMER_PHONE_EXISTS", message: "رقم الهاتف مستخدم بالفعل في هذا المتجر." } });
      return;
    }
    next(error);
  }
});
