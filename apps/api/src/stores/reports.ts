import { Router } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { authenticate } from "../auth/auth.js";
import { prisma } from "../lib/prisma.js";
import { requireStoreAccess } from "../security/store-access-middleware.js";

export const reportsRouter = Router();

const reportQuery = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
});

function localDateTimeToUtc(date: string, time: string, timeZone: string): Date {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute, second] = time.split(":").map(Number);
  const target = Date.UTC(year!, month! - 1, day!, hour!, minute!, second!);
  let guess = target;
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23"
  });
  for (let i = 0; i < 3; i += 1) {
    const parts = Object.fromEntries(formatter.formatToParts(new Date(guess)).map((part) => [part.type, part.value]));
    const represented = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second));
    guess += target - represented;
  }
  return new Date(guess);
}

function dateInTimeZone(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit"
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

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

    const store = await prisma.store.findUnique({ where: { id: storeId }, select: { currency: true, timezone: true } });
    if (!store) {
      res.status(404).json({ error: { code: "STORE_NOT_FOUND", message: "المتجر غير موجود." } });
      return;
    }
    let date = parsed.data.date;
    try {
      date ??= dateInTimeZone(new Date(), store.timezone);
      const check = new Date(`${date}T00:00:00.000Z`);
      if (Number.isNaN(check.getTime()) || check.toISOString().slice(0, 10) !== date) throw new Error("INVALID_DATE");
      const start = localDateTimeToUtc(date, "00:00:00", store.timezone);
      const end = localDateTimeToUtc(date, "24:00:00", store.timezone);
      if (end <= start) throw new Error("INVALID_TIMEZONE_BOUNDARY");
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
      currency: store.currency,
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
        "التقرير يستخدم حدود اليوم حسب المنطقة الزمنية للمتجر، مع مراعاة الأيام التي قد لا تساوي 24 ساعة بسبب تغيّر التوقيت.",
        ...(allCostsKnown ? [] : ["الربح وتكلفة البضاعة غير مكتملين لأن تكلفة بعض المنتجات غير مسجلة وقت البيع."]),
        "الأرقام لا تشمل الضرائب أو المصروفات التشغيلية ما لم تُسجل ضمن بيانات البيع."
      ]
    });
    } catch (error) {
      if (error instanceof RangeError || (error instanceof Error && error.message.startsWith("INVALID_"))) {
        res.status(400).json({ error: { code: "INVALID_REPORT_DATE_OR_TIMEZONE", message: "التاريخ أو المنطقة الزمنية للمتجر غير صالحين." } });
        return;
      }
      throw error;
    }
  } catch (error) {
    next(error);
  }
});
