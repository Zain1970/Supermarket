import assert from "node:assert/strict";
import test from "node:test";
import { decideStoreAccess, type AuthenticatedPrincipal } from "./access-control.js";

const user: AuthenticatedPrincipal = {
  userId: "user-a",
  isPlatformAdmin: false,
  memberships: [{ storeId: "store-a", role: "STORE_OWNER" }]
};

test("rejects an unauthenticated request", () => {
  assert.deepEqual(decideStoreAccess(null, "store-a"), {
    allowed: false,
    reason: "UNAUTHENTICATED"
  });
});

test("allows a member to access their own store", () => {
  assert.deepEqual(decideStoreAccess(user, "store-a"), {
    allowed: true,
    role: "STORE_OWNER"
  });
});

test("rejects access to another store even if its id is supplied by the caller", () => {
  assert.deepEqual(decideStoreAccess(user, "store-b"), {
    allowed: false,
    reason: "STORE_ACCESS_DENIED"
  });
});

test("enforces role restrictions within the user's store", () => {
  assert.deepEqual(decideStoreAccess(user, "store-a", ["CASHIER"]), {
    allowed: false,
    reason: "ROLE_NOT_ALLOWED"
  });
});

test("platform administrators can pass the store membership check", () => {
  assert.deepEqual(decideStoreAccess({
    userId: "platform-admin",
    isPlatformAdmin: true,
    memberships: []
  }, "store-b"), {
    allowed: true,
    role: "PLATFORM_ADMIN"
  });
});
