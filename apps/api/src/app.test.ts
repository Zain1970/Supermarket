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

test("store product API requires authentication", async () => {
  const response = await request(app).get("/stores/store-a/products");

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
