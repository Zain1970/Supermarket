import assert from "node:assert/strict";
import test from "node:test";
import request from "supertest";
import { app } from "./app.js";

test("GET /health returns service health without exposing secrets", async () => {
  const response = await request(app).get("/health");

  assert.equal(response.status, 200);
  assert.equal(response.body.status, "ok");
  assert.equal(response.body.service, "supermarket-api");
  assert.equal("DATABASE_URL" in response.body, false);
});

test("unknown API routes return a safe Arabic error", async () => {
  const response = await request(app).get("/route-does-not-exist");

  assert.equal(response.status, 404);
  assert.equal(response.body.error.code, "NOT_FOUND");
  assert.match(response.body.error.message, /المسار/);
});

test("store listing requires authentication", async () => {
  const response = await request(app).get("/stores");

  assert.equal(response.status, 401);
  assert.equal(response.body.error.code, "UNAUTHENTICATED");
});

test("store creation requires authentication", async () => {
  const response = await request(app).post("/stores").send({
    name: "متجر تجريبي",
    slug: "test-store"
  });

  assert.equal(response.status, 401);
  assert.equal(response.body.error.code, "UNAUTHENTICATED");
});

test("store product API requires authentication", async () => {
  const response = await request(app).get("/stores/store-a/products");

  assert.equal(response.status, 401);
  assert.equal(response.body.error.code, "UNAUTHENTICATED");
});

test("store member list requires authentication", async () => {
  const response = await request(app).get("/stores/store-a/members");

  assert.equal(response.status, 401);
  assert.equal(response.body.error.code, "UNAUTHENTICATED");
});

test("store member creation requires authentication", async () => {
  const response = await request(app).post("/stores/store-a/members").send({
    email: "cashier@example.com",
    role: "CASHIER"
  });

  assert.equal(response.status, 401);
  assert.equal(response.body.error.code, "UNAUTHENTICATED");
});

test("stock movement API requires authentication", async () => {
  const response = await request(app).get("/stores/store-a/stock-movements");

  assert.equal(response.status, 401);
  assert.equal(response.body.error.code, "UNAUTHENTICATED");
});

test("add-on purchase API requires store authentication", async () => {
  const response = await request(app).get("/stores/store-a/addons");

  assert.equal(response.status, 401);
  assert.equal(response.body.error.code, "UNAUTHENTICATED");
});

test("manual payment review API requires authentication", async () => {
  const response = await request(app).get("/admin/payments");

  assert.equal(response.status, 401);
  assert.equal(response.body.error.code, "UNAUTHENTICATED");
});

test("subscription purchase API requires store authentication", async () => {
  const response = await request(app).get("/stores/store-a/plans");

  assert.equal(response.status, 401);
  assert.equal(response.body.error.code, "UNAUTHENTICATED");
});

test("free trial API requires store authentication", async () => {
  const response = await request(app).post("/stores/store-a/subscription/trial").send({ planCode: "starter" });

  assert.equal(response.status, 401);
  assert.equal(response.body.error.code, "UNAUTHENTICATED");
});


test("customer API requires store authentication", async () => {
  const response = await request(app).get("/stores/store-a/customers");

  assert.equal(response.status, 401);
  assert.equal(response.body.error.code, "UNAUTHENTICATED");
});

test("sales and invoice payment APIs require store authentication", async () => {
  const saleResponse = await request(app).get("/stores/store-a/sales");
  const paymentResponse = await request(app).post("/stores/store-a/sales/sale-a/payments").send({
    amount: "10.00",
    method: "CASH"
  });

  assert.equal(saleResponse.status, 401);
  assert.equal(saleResponse.body.error.code, "UNAUTHENTICATED");
  assert.equal(paymentResponse.status, 401);
  assert.equal(paymentResponse.body.error.code, "UNAUTHENTICATED");
});

test("daily report API requires store authentication", async () => {
  const response = await request(app).get("/stores/store-a/reports/daily?date=2026-10-16");

  assert.equal(response.status, 401);
  assert.equal(response.body.error.code, "UNAUTHENTICATED");
});

test("low-stock report API requires store authentication", async () => {
  const response = await request(app).get("/stores/store-a/reports/low-stock");

  assert.equal(response.status, 401);
  assert.equal(response.body.error.code, "UNAUTHENTICATED");
});


test("sales return API requires store authentication", async () => {
  const response = await request(app).post("/stores/store-a/sales/sale-a/returns").set("Idempotency-Key", "return-key-0001").send({
    reason: "منتج تالف",
    items: [{ saleItemId: "item-a", quantity: "1" }]
  });

  assert.equal(response.status, 401);
  assert.equal(response.body.error.code, "UNAUTHENTICATED");
});


test("supplier management API requires store authentication", async () => {
  const listResponse = await request(app).get("/stores/store-a/suppliers");
  const createResponse = await request(app).post("/stores/store-a/suppliers").send({ name: "مورد تجريبي" });

  assert.equal(listResponse.status, 401);
  assert.equal(listResponse.body.error.code, "UNAUTHENTICATED");
  assert.equal(createResponse.status, 401);
  assert.equal(createResponse.body.error.code, "UNAUTHENTICATED");
});

test("purchase receiving API requires store authentication", async () => {
  const listResponse = await request(app).get("/stores/store-a/purchases");
  const createResponse = await request(app).post("/stores/store-a/purchases")
    .set("Idempotency-Key", "purchase-key-0001")
    .send({
      supplierId: "supplier-a",
      purchaseNumber: "PUR-0001",
      items: [{ productId: "product-a", quantity: "2", unitCost: "10.00" }]
    });

  assert.equal(listResponse.status, 401);
  assert.equal(listResponse.body.error.code, "UNAUTHENTICATED");
  assert.equal(createResponse.status, 401);
  assert.equal(createResponse.body.error.code, "UNAUTHENTICATED");
});


test("API responses include baseline security headers and disable caching", async () => {
  const response = await request(app).get("/health");

  assert.equal(response.headers["x-content-type-options"], "nosniff");
  assert.equal(response.headers["x-frame-options"], "DENY");
  assert.equal(response.headers["referrer-policy"], "no-referrer");
  assert.equal(response.headers["permissions-policy"], "camera=(), microphone=(), geolocation=()");
  assert.equal(response.headers["content-security-policy"], "default-src 'none'; frame-ancestors 'none'; base-uri 'none'");
  assert.equal(response.headers["cache-control"], "no-store");
  assert.equal(response.headers["x-powered-by"], undefined);
});
