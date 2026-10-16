# Sales returns: verification checklist

This checklist is required before merging the sales-return changes or deploying them.

## Database and Prisma

- [x] Run `npx prisma validate --schema apps/api/prisma/schema.prisma`.
- [x] Run `npx prisma generate --schema apps/api/prisma/schema.prisma`.
- [x] Apply migrations to a disposable PostgreSQL database with `prisma migrate deploy`.
- [x] Confirm the composite foreign keys on `SaleReturnItem(storeId, saleItemId)` and `SaleReturnItem(storeId, productId)` exist.
- [x] Verify migration behavior against a database where the original sales-return migration has already been applied.

## API and concurrency

- [x] Unauthenticated requests return 401.
- [x] Users without store membership or the owner/manager role are denied.
- [x] A return line from another sale is rejected.
- [x] A return product or sale line from another store is rejected by database constraints.
- [x] Repeated idempotency key and identical payload replay the original result.
- [x] Concurrent requests with the same idempotency key and identical payload replay the winning result rather than returning a generic conflict.
- [x] A return containing multiple sale lines for the same product creates distinct stock-movement idempotency keys and commits atomically.
- [x] Reusing an idempotency key with a different payload returns 409.
- [x] Returning more than the sold quantity, including across concurrent requests, cannot succeed.
- [x] Any failed return rolls back the return rows, stock update, stock movement, and audit log together.
- [ ] Retryable serializable transaction conflicts return HTTP 409 with `RETURN_CONCURRENT_MODIFICATION`; the client can safely reload and retry with the same idempotency key.

## Financial boundary

- [x] PostgreSQL integration test confirms returns do not change sale total, paid amount, balance due, payment status, or sale-payment row count. The current fixture has no customer credit balance; verify customer receivable invariance separately if customer-linked return fixtures are added.
- [ ] Do not enable financial settlement until refund ledger entries, discount allocation, customer receivables, and idempotent settlement behavior have been implemented and tested.

## CI and release gate

- [x] TypeScript typecheck passes.
- [x] API test suite passes.
- [x] Production build passes.
- [x] PostgreSQL integration tests pass.
- [ ] Review the pull request and migration plan before merging.

No item should be marked complete without an actual command or CI result.
