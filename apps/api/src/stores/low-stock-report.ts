import { Prisma } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { authenticate } from "../auth/auth.js";
import { prisma } from "../lib/prisma.js";
import { requireStoreAccess } from "../security/store-access-middleware.js";

export const lowStockReportRouter = Router();

const querySchema = z.object({
  q: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).max(100000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25)
});

lowStockReportRouter.get(
  "/:storeId/reports/low-stock",
  authenticate,
  requireStoreAccess(undefined, ["STORE_OWNER", "STORE_MANAGER", "INVENTORY_STAFF"]),
  async (req, res, next) => {
    try {
      const parsed = querySchema.safeParse(req.query);
      if (!parsed.success) {
        res.status(400).json({ error: { code: "INVALID_QUERY", message: "تحقق من البحث ورقم الصفحة وحجمها." } });
        return;
      }
      const storeId = req.params.storeId;
      if (!storeId) {
        res.status(400).json({ error: { code: "STORE_ID_REQUIRED", message: "معرّف المتجر مطلوب." } });
        return;
      }

      const { q, page, pageSize } = parsed.data;
      const search = q ? Prisma.sql`AND ("name" ILIKE ${"%" + q + "%"} OR "sku" ILIKE ${"%" + q + "%"} OR COALESCE("barcode", '') ILIKE ${"%" + q + "%"})` : Prisma.empty;
      const where = Prisma.sql`"storeId" = ${storeId} AND "status"::text = 'ACTIVE' AND "stockQuantity" <= "lowStockAt" ${search}`;

      const [totalRows, products] = await Promise.all([
        prisma.$queryRaw<Array<{ total: bigint }>>(Prisma.sql`SELECT COUNT(*)::bigint AS total FROM "Product" WHERE ${where}`),
        prisma.$queryRaw<Array<{
          id: string; sku: string; barcode: string | null; name: string; unit: string;
          stockQuantity: Prisma.Decimal; lowStockAt: Prisma.Decimal
        }>>(Prisma.sql`
          SELECT "id", "sku", "barcode", "name", "unit", "stockQuantity", "lowStockAt"
          FROM "Product"
          WHERE ${where}
          ORDER BY "stockQuantity" ASC, "name" ASC
          LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}
        `)
      ]);

      res.status(200).json({
        products,
        pagination: { page, pageSize, total: Number(totalRows[0]?.total ?? 0) }
      });
    } catch (error) {
      next(error);
    }
  }
);
