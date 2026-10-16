import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { authenticate } from "../auth/auth.js";
import { requireStoreAccess } from "../security/store-access-middleware.js";

export const storeRouter = Router();

const readRoles = ["STORE_OWNER", "STORE_MANAGER", "CASHIER", "INVENTORY_STAFF", "PURCHASING_STAFF"] as const;
const writeRoles = ["STORE_OWNER", "STORE_MANAGER", "INVENTORY_STAFF"] as const;

const money = z.string().regex(/^\d{1,12}(\.\d{1,2})?$/, "أدخل مبلغًا صحيحًا حتى منزلتين عشريتين.");
const quantity = z.string().regex(/^\d{1,12}(\.\d{1,3})?$/, "أدخل كمية صحيحة حتى ثلاث منازل عشرية.");

const createProductSchema = z.object({
  sku: z.string().trim().min(1).max(80),
  barcode: z.string().trim().min(1).max(100).optional(),
  name: z.string().trim().min(1).max(180),
  description: z.string().trim().max(2000).optional(),
  categoryId: z.string().trim().min(1).optional(),
  unit: z.string().trim().min(1).max(32).default("piece"),
  costPrice: money.optional(),
  salePrice: money.refine((value) => Number(value) > 0, "سعر البيع يجب أن يكون أكبر من صفر."),
  lowStockAt: quantity.default("0"),
  allowNegativeStock: z.boolean().default(false)
});

const listQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).max(100000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25)
});

const createStoreSchema = z.object({
  name: z.string().trim().min(2).max(120),
  slug: z.string().trim().toLowerCase().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).min(3).max(60),
  timezone: z.string().trim().min(1).max(80).default("Asia/Aden"),
  currency: z.string().trim().regex(/^[A-Z]{3}$/).default("YER")
});

storeRouter.get("/", authenticate, async (request, response, next) => {
  try {
    const principal = request.principal!;
    const stores = await prisma.store.findMany({
      where: {
        memberships: { some: { userId: principal.userId } },
        status: { not: "ARCHIVED" }
      },
      select: {
        id: true,
        name: true,
        slug: true,
        status: true,
        timezone: true,
        currency: true,
        createdAt: true,
        memberships: {
          where: { userId: principal.userId },
          select: { role: true }
        }
      },
      orderBy: { createdAt: "desc" }
    });
    response.status(200).json({
      stores: stores.map(({ memberships, ...store }) => ({
        ...store,
        role: memberships[0]?.role ?? null
      }))
    });
  } catch (error) {
    next(error);
  }
});

storeRouter.post("/", authenticate, async (request, response, next) => {
  try {
    const parsed = createStoreSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({
        error: { code: "INVALID_STORE", message: "تحقق من اسم المتجر ورابطه المختصر والعملة والمنطقة الزمنية." }
      });
      return;
    }

    const data = parsed.data;
    const store = await prisma.$transaction(async (tx) => {
      const created = await tx.store.create({
        data: {
          name: data.name,
          slug: data.slug,
          timezone: data.timezone,
          currency: data.currency,
          memberships: {
            create: {
              userId: request.principal!.userId,
              role: "STORE_OWNER"
            }
          }
        },
        select: {
          id: true,
          name: true,
          slug: true,
          status: true,
          timezone: true,
          currency: true,
          createdAt: true
        }
      });

      await tx.auditLog.create({
        data: {
          storeId: created.id,
          actorUserId: request.principal!.userId,
          action: "STORE_CREATED",
          entityType: "Store",
          entityId: created.id,
          metadata: { slug: created.slug, currency: created.currency }
        }
      });
      return created;
    });

    response.status(201).json({ store: { ...store, role: "STORE_OWNER" } });
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error &&
        (error as { code?: string }).code === "P2002") {
      response.status(409).json({
        error: { code: "STORE_SLUG_EXISTS", message: "الرابط المختصر مستخدم بالفعل. اختر رابطًا آخر." }
      });
      return;
    }
    next(error);
  }
});

storeRouter.get(
  "/:storeId/products",
  authenticate,
  requireStoreAccess(undefined, readRoles),
  async (request, response, next) => {
    try {
      const parsedQuery = listQuerySchema.safeParse(request.query);
      if (!parsedQuery.success) {
        response.status(400).json({
          error: { code: "INVALID_QUERY", message: "تحقق من كلمات البحث وأرقام الصفحات." }
        });
        return;
      }

      const { q, page, pageSize } = parsedQuery.data;
      const storeId = request.params.storeId;
      if (!storeId) {
        response.status(400).json({ error: { code: "STORE_ID_REQUIRED", message: "معرّف المتجر مطلوب." } });
        return;
      }
      const where = {
        storeId,
        status: "ACTIVE" as const,
        ...(q ? {
          OR: [
            { name: { contains: q, mode: "insensitive" as const } },
            { sku: { contains: q, mode: "insensitive" as const } },
            { barcode: { contains: q, mode: "insensitive" as const } }
          ]
        } : {})
      };

      const [total, products] = await prisma.$transaction([
        prisma.product.count({ where }),
        prisma.product.findMany({
          where,
          include: { category: { select: { id: true, name: true } } },
          orderBy: { name: "asc" },
          skip: (page - 1) * pageSize,
          take: pageSize
        })
      ]);

      response.status(200).json({ products, pagination: { page, pageSize, total } });
    } catch (error) {
      next(error);
    }
  }
);

storeRouter.post(
  "/:storeId/products",
  authenticate,
  requireStoreAccess(undefined, writeRoles),
  async (request, response, next) => {
    try {
      const parsed = createProductSchema.safeParse(request.body);
      if (!parsed.success) {
        response.status(400).json({
          error: {
            code: "INVALID_PRODUCT",
            message: "تحقق من اسم المنتج ورمزه وأسعاره وبياناته."
          }
        });
        return;
      }

      const storeId = request.params.storeId;
      if (!storeId) {
        response.status(400).json({ error: { code: "STORE_ID_REQUIRED", message: "معرّف المتجر مطلوب." } });
        return;
      }
      const data = parsed.data;

      if (data.categoryId) {
        const category = await prisma.productCategory.findFirst({
          where: { id: data.categoryId, storeId },
          select: { id: true }
        });
        if (!category) {
          response.status(400).json({
            error: { code: "CATEGORY_NOT_IN_STORE", message: "التصنيف غير موجود في هذا المتجر." }
          });
          return;
        }
      }

      const product = await prisma.$transaction(async (tx) => {
        const created = await tx.product.create({
          data: {
            storeId,
            sku: data.sku,
            barcode: data.barcode,
            name: data.name,
            description: data.description,
            categoryId: data.categoryId,
            unit: data.unit,
            costPrice: data.costPrice,
            salePrice: data.salePrice,
            lowStockAt: data.lowStockAt,
            allowNegativeStock: data.allowNegativeStock
          },
          include: { category: { select: { id: true, name: true } } }
        });

        await tx.auditLog.create({
          data: {
            storeId,
            actorUserId: request.principal!.userId,
            action: "PRODUCT_CREATED",
            entityType: "Product",
            entityId: created.id,
            metadata: { sku: created.sku, name: created.name }
          }
        });

        return created;
      });

      response.status(201).json({ product });
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        (error as { code?: string }).code === "P2002"
      ) {
        response.status(409).json({
          error: { code: "PRODUCT_IDENTIFIER_EXISTS", message: "رمز المنتج أو الباركود مستخدم بالفعل في هذا المتجر." }
        });
        return;
      }
      next(error);
    }
  }
);
