import cookieParser from "cookie-parser";
import express from "express";
import { authRouter } from "./auth/routes.js";
import { storeRouter } from "./stores/routes.js";
import { memberRouter } from "./stores/members.js";
import { customerRouter } from "./stores/customers.js";
import { supplierRouter } from "./stores/suppliers.js";
import { purchaseRouter } from "./stores/purchases.js";
import { salesRouter } from "./stores/sales.js";
import { reportsRouter } from "./stores/reports.js";
import { lowStockReportRouter } from "./stores/low-stock-report.js";
import { saleReturnsRouter } from "./stores/sale-returns.js";
import { inventoryRouter } from "./inventory/routes.js";
import { addonRouter } from "./addons/routes.js";
import { adminRouter } from "./admin/routes.js";
import { billingRouter } from "./billing/routes.js";

export const app = express();

app.disable("x-powered-by");

// Baseline headers for the JSON API. Configure HSTS at the HTTPS ingress
// after confirming TLS termination and proxy behavior in each deployment.
app.use((_request, response, next) => {
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("X-Frame-Options", "DENY");
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  response.setHeader("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'; base-uri 'none'");
  response.setHeader("Cache-Control", "no-store");
  next();
});

app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());

app.get("/health", (_request, response) => {
  response.status(200).json({
    status: "ok",
    service: "supermarket-api",
    stage: "foundation"
  });
});

app.use("/auth", authRouter);
app.use("/stores", memberRouter);
app.use("/stores", storeRouter);
app.use("/stores", customerRouter);
app.use("/stores", supplierRouter);
app.use("/stores", purchaseRouter);
app.use("/stores", salesRouter);
app.use("/stores", saleReturnsRouter);
app.use("/stores", reportsRouter);
app.use("/stores", lowStockReportRouter);
app.use("/stores", inventoryRouter);
app.use("/stores", addonRouter);
app.use("/stores", billingRouter);
app.use("/admin", adminRouter);

app.use((_request, response) => {
  response.status(404).json({
    error: {
      code: "NOT_FOUND",
      message: "المسار المطلوب غير موجود."
    }
  });
});

app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
  // Keep internal exception details out of API responses.
  console.error("Unhandled API error", error);
  response.status(500).json({
    error: {
      code: "INTERNAL_ERROR",
      message: "حدث خطأ غير متوقع. حاول مرة أخرى لاحقًا."
    }
  });
});
