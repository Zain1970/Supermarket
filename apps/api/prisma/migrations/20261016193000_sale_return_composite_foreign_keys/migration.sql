-- Enforce tenant-consistent references for returned sale lines and products.
-- Keep this as a forward migration: the original sales-return migration may already be applied.
ALTER TABLE "SaleReturnItem" DROP CONSTRAINT IF EXISTS "SaleReturnItem_saleItemId_fkey";
ALTER TABLE "SaleReturnItem" DROP CONSTRAINT IF EXISTS "SaleReturnItem_productId_fkey";

ALTER TABLE "SaleReturnItem"
  ADD CONSTRAINT "SaleReturnItem_storeId_saleItemId_fkey"
  FOREIGN KEY ("storeId", "saleItemId")
  REFERENCES "SaleItem" ("storeId", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "SaleReturnItem"
  ADD CONSTRAINT "SaleReturnItem_storeId_productId_fkey"
  FOREIGN KEY ("storeId", "productId")
  REFERENCES "Product" ("storeId", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
