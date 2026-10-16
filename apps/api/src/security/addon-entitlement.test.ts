import assert from "node:assert/strict";
import test from "node:test";
import { decideAddonEntitlement, type StoreAddonGrant } from "./addon-entitlement.js";

const now = new Date("2026-10-16T12:00:00.000Z");
const active: StoreAddonGrant = {
  code: "POS",
  status: "ACTIVE",
  startsAt: new Date("2026-10-01T00:00:00.000Z"),
  endsAt: new Date("2026-11-01T00:00:00.000Z")
};

test("enables a paid add-on only within its active period", () => {
  assert.deepEqual(decideAddonEntitlement([active], "POS", now), { enabled: true });
});

test("denies add-ons that were not purchased", () => {
  assert.deepEqual(decideAddonEntitlement([], "POS", now), {
    enabled: false,
    reason: "NOT_PURCHASED"
  });
});

test("denies pending or suspended add-ons", () => {
  assert.deepEqual(decideAddonEntitlement([{ ...active, status: "PENDING_PAYMENT" }], "POS", now), {
    enabled: false,
    reason: "NOT_ACTIVE"
  });
});

test("denies expired add-ons", () => {
  assert.deepEqual(decideAddonEntitlement([{ ...active, endsAt: new Date("2026-10-16T11:59:59.000Z") }], "POS", now), {
    enabled: false,
    reason: "EXPIRED"
  });
});

test("denies add-ons whose activation date is in the future", () => {
  assert.deepEqual(decideAddonEntitlement([{ ...active, startsAt: new Date("2026-10-17T00:00:00.000Z") }], "POS", now), {
    enabled: false,
    reason: "NOT_STARTED"
  });
});
