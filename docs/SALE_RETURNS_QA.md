# Sales returns: verification checklist

This checklist is required before merging the sales-return changes or deploying them.

## Database and Prisma

- [ ] Run `npx prisma validate --schema apps/api/prisma/schema.prisma`.
- [ ] Run `npx prisma generate --schema apps/api/prisma/schema.prisma`.
- [ ] Apply migrations to a disposable PostgreSQL database with `prisma migrate deploy`.
- [ ] Confirm the composite foreign keys on `SaleReturnItem(storeId, saleItemId)` and `SaleReturnItem(storeId, productId)` exist.
- [ ] Verify migration behavior against a database where the original sales-return migration has already been applied.

## API and concurrency

- [ ] Unauthenticated requests return 401.
- [ ] Users without store membership or the owner/manager role are denied.
- [ ] A return line from another sale is rejected.
- [ ] A return product or sale line from another store is rejected by database constraints.
- [ ] Repeated idempotency key and identical payload replay the original result.
- [ ] Concurrent requests with the same idempotency key and identical payload replay the winning result rather than returning a generic conflict.
- [ ] A return containing multiple sale lines for the same product creates distinct stock-movement idempotency keys and commits atomically.
- [ ] Reusing an idempotency key with a different payload returns 409.
- [ ] Returning more than the sold quantity, including across concurrent requests, cannot succeed.
- [ ] Any failed return rolls back the return rows, stock update, stock movement, and audit log together.
- [ ] Retryable serializable transaction conflicts return HTTP 409 with `RETURN_CONCURRENT_MODIFICATION`; the client can safely reload and retry with the same idempotency key.

## Financial boundary

- [ ] Confirm that current return behavior is inventory-only and does not refund cash, edit sale payments, or change customer credit balances.
- [ ] Do not enable financial settlement until refund ledger entries, discount allocation, customer receivables, and idempotent settlement behavior have been implemented and tested.

## CI and release gate

- [ ] TypeScript typecheck passes.
- [ ] API test suite passes.
- [ ] Production build passes.
- [ ] PostgreSQL integration tests pass.
- [ ] Review the pull request and migration plan before merging.

No item should be marked complete without an actual command or CI result.
