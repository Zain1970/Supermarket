import { Router } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { authenticate } from "../auth/auth.js";
import { prisma } from "../lib/prisma.js";
import { requireStoreAccess } from "../security/store-access-middleware.js";

export const reportsRouter = Router();

const reportQuery = z.object({
  date: z.string().regex(/^\\d{4}-\\d{2}-\\d{2}$/).optional()
});

reportsRouter.get("/:storeId/reports/daily", authenticate, requireStoreAccess(undefined, ["STORE_OWNER", "STORE_MANAGER"]), async (req, res, next) => {
  try {
    const parsed = reportQuery.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: { code: "INVALID_REPORT_DATE", message: "أدخل التاريخ بصيغة YYYY-MM-DD." } });
      return;
    }
    const storeId = req.params.storeId;
    if (!storeId) {
      res.status(400).json({ error: { code: "STORE_ID_REQUIRED", message: "معرّف المتجر مطلوب." } });
      return;
    }

    // Dates are interpreted as UTC boundaries; clients should send the store-local date.
    const date = parsed.data.date ?? new Date().toISOString().slice(0, 10);
    const start = new Date(`${date}T00:00:00.000Z`);
    if (Number.isNaN(start.getTime()) || start.toISOString().slice(0, 10) !== date) {
      res.status(400).json({ error: { code: "INVALID_REPORT_DATE", message: "التاريخ المدخل غير صالح." } });
      return;
    }
    const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);

    const sales = await prisma.sale.findMany({
      where: { storeId, createdAt: { gte: start, lt: end } },
      select: {
        id: true, status: true, subtotal: true, discountAmount: true, totalAmount: true,
        paidAmount: true, balanceDue: true,
        items: { select: { quantity: true, unitCost: true, lineTotal: true } }
      }
    });

    const zero = () => new Prisma.Decimal(0);
    let completedCount = 0;
    let voidedCount = 0;
    let grossSales = zero();
    let discounts = zero();
    let netSales = zero();
    let collected = zero();
    let receivables = zero();
    let costOfGoods = zero();
    let knownCostSales = 0;
    for (const sale of sales) {
      if (sale.status === "VOIDED") {
        voidedCount += 1;
        continue;
      }
      completedCount += 1;
      grossSales = grossSales.plus(sale.subtotal);
      discounts = discounts.plus(sale.discountAmount);
      netSales = netSales.plus(sale.totalAmount);
      collected = collected.plus(sale.paidAmount);
      receivables = receivables.plus(sale.balanceDue);
      if (sale.items.every((item) => item.unitCost !== null)) {
        knownCostSales += 1;
        for (const item of sale.items) {
          costOfGoods = costOfGoods.plus(item.unitCost!.mul(item.quantity));
        }
      }
    }
    const allCostsKnown = knownCostSales === completedCount;
    const grossProfit = allCostsKnown ? netSales.minus(costOfGoods) : null;

    res.status(200).json({
      date,
      currency: (await prisma.store.findUnique({ where: { id: storeId }, select: { currency: true } }))?.currency ?? "YER",
      summary: {
        completedInvoices: completedCount,
        voidedInvoices: voidedCount,
        grossSales: grossSales.toFixed(2),
        discounts: discounts.toFixed(2),
        netSales: netSales.toFixed(2),
        collected: collected.toFixed(2),
        receivables: receivables.toFixed(2),
        costOfGoods: allCostsKnown ? costOfGoods.toFixed(2) : null,
        grossProfit: grossProfit?.toFixed(2) ?? null,
        profitAvailable: allCostsKnown
      },
      notes: [
        "التقرير يعتمد حدود يوم UTC؛ اضبط تحويل التاريخ حسب المنطقة الزمنية للمتجر في واجهة الاستخدام.",
        ...(allCostsKnown ? [] : ["الربح وتكلفة البضاعة غير مكتملين لأن تكلفة بعض المنتجات غير مسجلة وقت البيع."]),
        "الأرقام لا تشمل الضرائب أو المصروفات التشغيلية ما لم تُسجل ضمن بيانات البيع."
      ]
    });
  } catch (error) {
    next(error);
  }
});
