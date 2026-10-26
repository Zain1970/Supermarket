CREATE TYPE "PurchaseStatus" AS ENUM ('RECEIVED', 'VOIDED');

CREATE TABLE "Purchase" (
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "supplierId" TEXT NOT NULL,
  "purchaseNumber" TEXT NOT NULL,
  "status" "PurchaseStatus" NOT NULL DEFAULT 'RECEIVED',
  "subtotal" DECIMAL(14,2) NOT NULL,
  "totalAmount" DECIMAL(14,2) NOT NULL,
  "notes" TEXT,
  "idempotencyKey" TEXT NOT NULL,
  "requestHash" TEXT NOT NULL,
  "actorUserId" TEXT NOT NULL,
  "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Purchase_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PurchaseItem" (
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "purchaseId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "quantity" DECIMAL(14,3) NOT NULL,
  "unitCost" DECIMAL(14,2) NOT NULL,
  "lineTotal" DECIMAL(14,2) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PurchaseItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Purchase_storeId_id_key" ON "Purchase"("storeId", "id");
CREATE UNIQUE INDEX "Purchase_storeId_purchaseNumber_key" ON "Purchase"("storeId", "purchaseNumber");
CREATE UNIQUE INDEX "Purchase_storeId_idempotencyKey_key" ON "Purchase"("storeId", "idempotencyKey");
CREATE INDEX "Purchase_storeId_supplierId_receivedAt_idx" ON "Purchase"("storeId", "supplierId", "receivedAt");
CREATE INDEX "Purchase_storeId_receivedAt_idx" ON "Purchase"("storeId", "receivedAt");
CREATE INDEX "PurchaseItem_storeId_purchaseId_idx" ON "PurchaseItem"("storeId", "purchaseId");
CREATE INDEX "PurchaseItem_storeId_productId_createdAt_idx" ON "PurchaseItem"("storeId", "productId", "createdAt");

ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_storeId_fkey"
  FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_storeId_supplierId_fkey"
  FOREIGN KEY ("storeId", "supplierId") REFERENCES "Supplier"("storeId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PurchaseItem" ADD CONSTRAINT "PurchaseItem_storeId_purchaseId_fkey"
  FOREIGN KEY ("storeId", "purchaseId") REFERENCES "Purchase"("storeId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PurchaseItem" ADD CONSTRAINT "PurchaseItem_storeId_productId_fkey"
  FOREIGN KEY ("storeId", "productId") REFERENCES "Product"("storeId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_subtotal_nonnegative_check" CHECK ("subtotal" >= 0);
ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_totalAmount_nonnegative_check" CHECK ("totalAmount" >= 0);
ALTER TABLE "PurchaseItem" ADD CONSTRAINT "PurchaseItem_quantity_positive_check" CHECK ("quantity" > 0);
ALTER TABLE "PurchaseItem" ADD CONSTRAINT "PurchaseItem_unitCost_nonnegative_check" CHECK ("unitCost" >= 0);
ALTER TABLE "PurchaseItem" ADD CONSTRAINT "PurchaseItem_lineTotal_nonnegative_check" CHECK ("lineTotal" >= 0);
