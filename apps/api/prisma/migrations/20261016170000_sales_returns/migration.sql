CREATE TABLE "SaleReturn" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "returnNumber" TEXT NOT NULL,
    "totalAmount" DECIMAL(14,2) NOT NULL,
    "reason" TEXT NOT NULL,
    "note" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SaleReturn_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SaleReturnItem" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "returnId" TEXT NOT NULL,
    "saleItemId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,
    "unitPrice" DECIMAL(14,2) NOT NULL,
    "lineTotal" DECIMAL(14,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SaleReturnItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SaleReturn_storeId_id_key" ON "SaleReturn"("storeId", "id");
CREATE UNIQUE INDEX "SaleReturn_storeId_returnNumber_key" ON "SaleReturn"("storeId", "returnNumber");
CREATE UNIQUE INDEX "SaleReturn_storeId_idempotencyKey_key" ON "SaleReturn"("storeId", "idempotencyKey");
CREATE INDEX "SaleReturn_storeId_saleId_createdAt_idx" ON "SaleReturn"("storeId", "saleId", "createdAt");
CREATE INDEX "SaleReturnItem_storeId_returnId_idx" ON "SaleReturnItem"("storeId", "returnId");
CREATE INDEX "SaleReturnItem_storeId_saleItemId_idx" ON "SaleReturnItem"("storeId", "saleItemId");

ALTER TABLE "SaleReturn" ADD CONSTRAINT "SaleReturn_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SaleReturn" ADD CONSTRAINT "SaleReturn_storeId_saleId_fkey" FOREIGN KEY ("storeId", "saleId") REFERENCES "Sale"("storeId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SaleReturnItem" ADD CONSTRAINT "SaleReturnItem_storeId_returnId_fkey" FOREIGN KEY ("storeId", "returnId") REFERENCES "SaleReturn"("storeId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
