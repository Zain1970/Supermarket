import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";
import request from "supertest";
import { app } from "../app.js";
import { hashSessionToken, SESSION_COOKIE_NAME } from "../auth/auth.js";
import { prisma } from "../lib/prisma.js";

const databaseAvailable = Boolean(process.env.DATABASE_URL);

type Fixture = {
  storeId: string;
  userId: string;
  saleId: string;
  saleItemId: string;
  productId: string;
  customerId: string;
  token: string;
};

async function createFixture(options: { role?: "STORE_OWNER" | "STORE_MANAGER" | "CASHIER"; quantity?: string } = {}): Promise<Fixture> {
  const suffix = randomBytes(8).toString("hex");
  const store = await prisma.store.create({
    data: { name: `Returns test ${suffix}`, slug: `returns-${suffix}`, status: "ACTIVE" }
  });
  const user = await prisma.user.create({
    data: {
      email: `returns-${suffix}@example.test`,
      passwordHash: "integration-test-only",
      displayName: "Returns integration test"
    }
  });
  const role = options.role ?? "STORE_OWNER";
  await prisma.storeMembership.create({ data: { storeId: store.id, userId: user.id, role } });
  const token = randomBytes(32).toString("hex");
  await prisma.session.create({
    data: {
      userId: user.id,
      tokenHash: hashSessionToken(token),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000)
    }
  });
  const product = await prisma.product.create({
    data: {
      storeId: store.id,
      sku: `SKU-${suffix}`,
      name: "Return test product",
      salePrice: "10.00",
      costPrice: "5.00",
      stockQuantity: "5.000"
    }
  });
  const customer = await prisma.customer.create({
    data: {
      storeId: store.id,
      name: `Returns customer ${suffix}`,
      creditLimit: "100.00",
      creditBalance: "25.00"
    }
  });
  const sale = await prisma.sale.create({
    data: {
      storeId: store.id,
      customerId: customer.id,
      invoiceNumber: `INV-${suffix}`,
      subtotal: "20.00",
      totalAmount: "20.00",
      paymentMethod: "CASH",
      idempotencyKey: `sale-${suffix}`,
      requestHash: "integration-test",
      actorUserId: user.id
    }
  });
  const saleItem = await prisma.saleItem.create({
    data: {
      storeId: store.id,
      saleId: sale.id,
      productId: product.id,
      productName: product.name,
      sku: product.sku,
      quantity: options.quantity ?? "2.000",
      unitPrice: "10.00",
      lineTotal: "20.00"
    }
  });
  return {
    storeId: store.id,
    userId: user.id,
    saleId: sale.id,
    saleItemId: saleItem.id,
    productId: product.id,
    customerId: customer.id,
    token
  };
}

async function cleanupFixture(fixture: Fixture): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.saleReturnItem.deleteMany({ where: { storeId: fixture.storeId } });
    await tx.saleReturn.deleteMany({ where: { storeId: fixture.storeId } });
    await tx.stockMovement.deleteMany({ where: { storeId: fixture.storeId } });
    await tx.auditLog.deleteMany({ where: { storeId: fixture.storeId } });
    await tx.salePayment.deleteMany({ where: { storeId: fixture.storeId } });
    await tx.saleItem.deleteMany({ where: { storeId: fixture.storeId } });
    await tx.sale.deleteMany({ where: { storeId: fixture.storeId } });
    await tx.customer.deleteMany({ where: { storeId: fixture.storeId } });
    await tx.product.deleteMany({ where: { storeId: fixture.storeId } });
    await tx.session.deleteMany({ where: { userId: fixture.userId } });
    await tx.storeMembership.deleteMany({ where: { userId: fixture.userId, storeId: fixture.storeId } });
    await tx.user.delete({ where: { id: fixture.userId } });
    await tx.store.delete({ where: { id: fixture.storeId } });
  });
}

function submitReturn(fixture: Fixture, input: {
  saleId?: string;
  saleItemId?: string;
  quantity?: string;
  items?: { saleItemId: string; quantity: string }[];
  reason?: string;
  key?: string;
} = {}) {
  return request(app)
    .post(`/stores/${fixture.storeId}/sales/${input.saleId ?? fixture.saleId}/returns`)
    .set("Cookie", `${SESSION_COOKIE_NAME}=${fixture.token}`)
    .set("Idempotency-Key", input.key ?? `return-key-${randomBytes(8).toString("hex")}`)
    .send({
      reason: input.reason ?? "منتج تالف",
      items: input.items ?? [{ saleItemId: input.saleItemId ?? fixture.saleItemId, quantity: input.quantity ?? "1.000" }]
    });
}

test("sales return integration tests require PostgreSQL", { skip: !databaseAvailable }, async (t) => {
  await t.test("creates return, restocks inventory, records movement and audit atomically", async () => {
    const fixture = await createFixture();
    try {
      const response = await submitReturn(fixture, { key: "return-success-0001", quantity: "1.000" });
      assert.equal(response.status, 201);
      assert.equal(response.body.replayed, false);
      assert.equal(response.body.saleReturn.totalAmount, "10");
      const product = await prisma.product.findUniqueOrThrow({ where: { id: fixture.productId } });
      assert.equal(product.stockQuantity.toString(), "6");
      assert.equal(await prisma.saleReturn.count({ where: { storeId: fixture.storeId } }), 1);
      assert.equal(await prisma.stockMovement.count({
        where: { storeId: fixture.storeId, type: "SALE_RETURN", reference: response.body.saleReturn.id }
      }), 1);
      assert.equal(await prisma.auditLog.count({
        where: { storeId: fixture.storeId, action: "SALE_RETURN_CREATED", entityId: response.body.saleReturn.id }
      }), 1);
    } finally {
      await cleanupFixture(fixture);
    }
  });

  await t.test("replays identical idempotency requests and rejects key reuse with a different payload", async () => {
    const fixture = await createFixture();
    try {
      const input = { key: "return-replay-0001", quantity: "1.000", reason: "عبوة مفتوحة" };
      const first = await submitReturn(fixture, input);
      const replay = await submitReturn(fixture, input);
      const conflict = await submitReturn(fixture, { ...input, reason: "سبب مختلف" });
      assert.equal(first.status, 201);
      assert.equal(replay.status, 200);
      assert.equal(replay.body.replayed, true);
      assert.equal(replay.body.saleReturn.id, first.body.saleReturn.id);
      assert.equal(conflict.status, 409);
      assert.equal(conflict.body.error.code, "IDEMPOTENCY_CONFLICT");
      assert.equal(await prisma.saleReturn.count({ where: { storeId: fixture.storeId } }), 1);
      assert.equal((await prisma.product.findUniqueOrThrow({ where: { id: fixture.productId } })).stockQuantity.toString(), "6");
    } finally {
      await cleanupFixture(fixture);
    }
  });

  await t.test("does not allow a return quantity above the sold quantity", async () => {
    const fixture = await createFixture({ quantity: "2.000" });
    try {
      const response = await submitReturn(fixture, { key: "return-too-many-0001", quantity: "3.000" });
      assert.equal(response.status, 409);
      assert.equal(response.body.error.code, "RETURN_QUANTITY_EXCEEDED");
      assert.equal(await prisma.saleReturn.count({ where: { storeId: fixture.storeId } }), 0);
      assert.equal((await prisma.product.findUniqueOrThrow({ where: { id: fixture.productId } })).stockQuantity.toString(), "5");
    } finally {
      await cleanupFixture(fixture);
    }
  });

  await t.test("rejects a sale line that belongs to another invoice", async () => {
    const fixture = await createFixture();
    try {
      const otherSale = await prisma.sale.create({
        data: {
          storeId: fixture.storeId,
          invoiceNumber: `INV-OTHER-${randomBytes(6).toString("hex")}`,
          subtotal: "10.00",
          totalAmount: "10.00",
          paymentMethod: "CASH",
          idempotencyKey: `sale-other-${randomBytes(6).toString("hex")}`,
          requestHash: "integration-test",
          actorUserId: fixture.userId
        }
      });
      const otherLine = await prisma.saleItem.create({
        data: {
          storeId: fixture.storeId,
          saleId: otherSale.id,
          productId: fixture.productId,
          productName: "Return test product",
          sku: "OTHER-LINE",
          quantity: "1.000",
          unitPrice: "10.00",
          lineTotal: "10.00"
        }
      });
      const response = await submitReturn(fixture, { key: "return-wrong-sale-0001", saleItemId: otherLine.id });
      assert.equal(response.status, 400);
      assert.equal(response.body.error.code, "RETURN_ITEM_NOT_IN_SALE");
    } finally {
      await cleanupFixture(fixture);
    }
  });

  await t.test("denies a cashier from creating a return", async () => {
    const fixture = await createFixture({ role: "CASHIER" });
    try {
      const response = await submitReturn(fixture, { key: "return-cashier-0001" });
      assert.equal(response.status, 403);
      assert.equal(response.body.error.code, "ROLE_NOT_ALLOWED");
    } finally {
      await cleanupFixture(fixture);
    }
  });

  await t.test("database composite foreign key rejects a product from another store", async () => {
    const left = await createFixture();
    const right = await createFixture();
    try {
      const parent = await prisma.saleReturn.create({
        data: {
          storeId: left.storeId,
          saleId: left.saleId,
          returnNumber: `RET-CROSS-${randomBytes(6).toString("hex")}`,
          totalAmount: "10.00",
          reason: "cross-store constraint test",
          idempotencyKey: `cross-store-${randomBytes(6).toString("hex")}`,
          requestHash: "integration-test",
          actorUserId: left.userId
        }
      });
      await assert.rejects(
        prisma.saleReturnItem.create({
          data: {
            storeId: left.storeId,
            returnId: parent.id,
            saleItemId: left.saleItemId,
            productId: right.productId,
            quantity: "1.000",
            unitPrice: "10.00",
            lineTotal: "10.00"
          }
        }),
        (error: unknown) => typeof error === "object" && error !== null && "code" in error &&
          (error as { code?: string }).code === "P2003"
      );
    } finally {
      await cleanupFixture(left);
      await cleanupFixture(right);
    }
  });

  await t.test("creates distinct stock movements for multiple sale lines of the same product", async () => {
    const fixture = await createFixture();
    try {
      const secondLine = await prisma.saleItem.create({
        data: {
          storeId: fixture.storeId,
          saleId: fixture.saleId,
          productId: fixture.productId,
          productName: "Return test product",
          sku: "SAME-PRODUCT-SECOND-LINE",
          quantity: "1.000",
          unitPrice: "10.00",
          lineTotal: "10.00"
        }
      });
      const response = await submitReturn(fixture, {
        key: "return-same-product-lines-0001",
        items: [
          { saleItemId: fixture.saleItemId, quantity: "1.000" },
          { saleItemId: secondLine.id, quantity: "1.000" }
        ]
      });
      assert.equal(response.status, 201);
      assert.equal(response.body.saleReturn.items.length, 2);
      assert.equal(await prisma.stockMovement.count({
        where: { storeId: fixture.storeId, type: "SALE_RETURN", reference: response.body.saleReturn.id }
      }), 2);
      const movements = await prisma.stockMovement.findMany({
        where: { storeId: fixture.storeId, type: "SALE_RETURN", reference: response.body.saleReturn.id },
        select: { idempotencyKey: true }
      });
      assert.equal(new Set(movements.map((movement) => movement.idempotencyKey)).size, 2);
      assert.equal((await prisma.product.findUniqueOrThrow({ where: { id: fixture.productId } })).stockQuantity.toString(), "7");
    } finally {
      await cleanupFixture(fixture);
    }
  });

  await t.test("rolls back return, stock, movement and audit when a later transaction step fails", async () => {
    const fixture = await createFixture();
    let constraintInstalled = false;
    try {
      await prisma.$executeRawUnsafe(
        'ALTER TABLE "AuditLog" ADD CONSTRAINT "fail_sale_return_audit_test" CHECK ("action" <> \'SALE_RETURN_CREATED\')'
      );
      constraintInstalled = true;

      const response = await submitReturn(fixture, { key: "return-rollback-0001", quantity: "1.000" });
      assert.equal(response.status, 500);
      assert.equal(await prisma.saleReturn.count({ where: { storeId: fixture.storeId } }), 0);
      assert.equal(await prisma.stockMovement.count({ where: { storeId: fixture.storeId, type: "SALE_RETURN" } }), 0);
      assert.equal(await prisma.auditLog.count({ where: { storeId: fixture.storeId, action: "SALE_RETURN_CREATED" } }), 0);
      assert.equal((await prisma.product.findUniqueOrThrow({ where: { id: fixture.productId } })).stockQuantity.toString(), "5");
    } finally {
      if (constraintInstalled) {
        await prisma.$executeRawUnsafe('ALTER TABLE "AuditLog" DROP CONSTRAINT IF EXISTS "fail_sale_return_audit_test"');
      }
      await cleanupFixture(fixture);
    }
  });

  await t.test("concurrent requests cannot return more than the sold quantity", async () => {
    const fixture = await createFixture({ quantity: "2.000" });
    try {
      const responses = await Promise.all([
        submitReturn(fixture, { key: "return-concurrent-a-0001", quantity: "2.000" }),
        submitReturn(fixture, { key: "return-concurrent-b-0001", quantity: "2.000" })
      ]);
      assert.equal(responses.filter((response) => response.status === 201).length, 1);
      assert.equal(responses.filter((response) => response.status === 409).length, 1);
      const returned = await prisma.saleReturnItem.aggregate({
        where: { storeId: fixture.storeId, saleItemId: fixture.saleItemId },
        _sum: { quantity: true }
      });
      assert.equal(returned._sum.quantity?.toString(), "2");
      assert.equal((await prisma.product.findUniqueOrThrow({ where: { id: fixture.productId } })).stockQuantity.toString(), "7");
    } finally {
      await cleanupFixture(fixture);
    }
  });

  await t.test("concurrent identical idempotency requests create only one return", async () => {
    const fixture = await createFixture();
    try {
      const input = { key: "return-concurrent-same-0001", quantity: "1.000", reason: "طلب مكرر" };
      const responses = await Promise.all([submitReturn(fixture, input), submitReturn(fixture, input)]);
      assert.equal(responses.filter((response) => response.status === 201).length, 1);
      assert.equal(responses.filter((response) => response.status === 200).length, 1);
      assert.equal(responses[0].body.saleReturn.id, responses[1].body.saleReturn.id);
      assert.equal(await prisma.saleReturn.count({ where: { storeId: fixture.storeId } }), 1);
      assert.equal((await prisma.product.findUniqueOrThrow({ where: { id: fixture.productId } })).stockQuantity.toString(), "6");
    } finally {
      await cleanupFixture(fixture);
    }
  });

  await t.test("keeps returns inventory-only and does not alter sale payments or customer balances", async () => {
    const fixture = await createFixture();
    try {
      const saleBefore = await prisma.sale.findUniqueOrThrow({ where: { id: fixture.saleId } });
      const paymentsBefore = await prisma.salePayment.count({ where: { storeId: fixture.storeId, saleId: fixture.saleId } });
      const customerBefore = await prisma.customer.findUniqueOrThrow({ where: { id: fixture.customerId } });
      const response = await submitReturn(fixture, { key: "return-financial-boundary-0001", quantity: "1.000" });
      assert.equal(response.status, 201);

      const saleAfter = await prisma.sale.findUniqueOrThrow({ where: { id: fixture.saleId } });
      assert.equal(saleAfter.paidAmount.toString(), saleBefore.paidAmount.toString());
      assert.equal(saleAfter.balanceDue.toString(), saleBefore.balanceDue.toString());
      assert.equal(saleAfter.paymentStatus, saleBefore.paymentStatus);
      assert.equal(saleAfter.totalAmount.toString(), saleBefore.totalAmount.toString());
      assert.equal(await prisma.salePayment.count({ where: { storeId: fixture.storeId, saleId: fixture.saleId } }), paymentsBefore);
      const customerAfter = await prisma.customer.findUniqueOrThrow({ where: { id: fixture.customerId } });
      assert.equal(customerAfter.creditBalance.toString(), customerBefore.creditBalance.toString());
      assert.equal(customerAfter.creditLimit.toString(), customerBefore.creditLimit.toString());
      // The schema has no customer-refund ledger model; returns remain inventory-only.
    } finally {
      await cleanupFixture(fixture);
    }
  });

});