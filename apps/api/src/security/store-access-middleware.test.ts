import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import request from "supertest";
import { requireStoreAccess } from "./store-access-middleware.js";

function testApp(principal?: express.Request["principal"]) {
  const app = express();
  app.get("/stores/:storeId/private", (req, _res, next) => {
    req.principal = principal;
    next();
  }, requireStoreAccess(), (_req, res) => {
    res.status(200).json({ allowed: true });
  });
  return app;
}

test("middleware rejects requests without a verified principal", async () => {
  const response = await request(testApp()).get("/stores/store-a/private");
  assert.equal(response.status, 401);
  assert.equal(response.body.error.code, "UNAUTHENTICATED");
});

test("middleware denies a user trying to switch to another store id", async () => {
  const response = await request(testApp({
    userId: "user-a",
    isPlatformAdmin: false,
    memberships: [{ storeId: "store-a", role: "STORE_OWNER" }]
  })).get("/stores/store-b/private");

  assert.equal(response.status, 403);
  assert.equal(response.body.error.code, "STORE_ACCESS_DENIED");
});

test("middleware allows a member to access their store", async () => {
  const response = await request(testApp({
    userId: "user-a",
    isPlatformAdmin: false,
    memberships: [{ storeId: "store-a", role: "STORE_OWNER" }]
  })).get("/stores/store-a/private");

  assert.equal(response.status, 200);
  assert.deepEqual(response.body, { allowed: true });
});
