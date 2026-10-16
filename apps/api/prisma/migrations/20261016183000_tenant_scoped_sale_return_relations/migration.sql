-- Add the composite key required by the tenant-scoped SaleItem relation.
CREATE UNIQUE INDEX "SaleItem_storeId_id_key" ON "SaleItem"("storeId", "id");

-- Enforce that returned items belong to the same store as their sale line and product.
ALTER TABLE "SaleReturnItem"
  ADD CONSTRAINT "SaleReturnItem_storeId_saleItemId_fkey"
  FOREIGN KEY ("storeId", "saleItemId") REFERENCES "SaleItem"("storeId", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "SaleReturnItem"
  ADD CONSTRAINT "SaleReturnItem_storeId_productId_fkey"
  FOREIGN KEY ("storeId", "productId") REFERENCES "Product"("storeId", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
