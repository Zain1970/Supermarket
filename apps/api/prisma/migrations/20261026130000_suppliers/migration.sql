CREATE TABLE "Supplier" (
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "phone" TEXT,
  "email" TEXT,
  "address" TEXT,
  "taxNumber" TEXT,
  "notes" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Supplier_storeId_id_key" ON "Supplier"("storeId", "id");
CREATE INDEX "Supplier_storeId_name_idx" ON "Supplier"("storeId", "name");
CREATE INDEX "Supplier_storeId_phone_idx" ON "Supplier"("storeId", "phone");
CREATE INDEX "Supplier_storeId_isActive_createdAt_idx" ON "Supplier"("storeId", "isActive", "createdAt");

ALTER TABLE "Supplier" ADD CONSTRAINT "Supplier_storeId_fkey"
  FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Supplier" ADD CONSTRAINT "Supplier_name_nonempty_check" CHECK (length(trim("name")) > 0);
