# Sales returns: verification checklist

This checklist is required before merging the sales-return changes or deploying them. Checks marked complete are supported by the successful CI run on commit `4aa9e101230fb9284303046388cee2a671aa8c3a`.

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
- [ ] Add deterministic test coverage for a serializable `P2034` conflict with no committed idempotency winner, asserting HTTP 409 and `RETURN_CONCURRENT_MODIFICATION`. Existing concurrent integration tests pass, but they do not prove this exact error branch deterministically.

## Financial boundary

- [x] PostgreSQL integration test confirms returns do not change sale total, paid amount, balance due, payment status, or sale-payment row count.
- [x] Customer-linked PostgreSQL integration fixture confirms `creditBalance` and `creditLimit` remain unchanged by inventory-only returns.
- [ ] Do not enable financial settlement until refund ledger entries, discount allocation, customer receivables, and idempotent settlement behavior have been implemented and tested. No refund/payment-refund ledger is created by this endpoint; it remains inventory-only.

## CI and release gate

- [x] TypeScript typecheck passes.
- [x] API test suite passes.
- [x] Production build passes.
- [x] PostgreSQL integration tests pass.
- [ ] Human review of the pull request and migration plan before merging.
- [ ] Inspect the actual target database migration history and schema, and rehearse the approved migration plan on a verified backup/restore or equivalent isolated copy before any production migration.
- [ ] Resolve outstanding high-severity dependency audit findings and commit a reproducible root `package-lock.json`.

## Latest CI evidence

- [API CI run #38951836578](https://github.com/Zain1970/Supermarket/actions/runs/38951836578) — successful on commit `4aa9e101230fb9284303046388cee2a671aa8c3a`.
- The successful job completed PostgreSQL fresh-install and upgrade migration checks, Prisma validation and generation, TypeScript typecheck, tests, and build.

No item should be marked complete without an actual command or CI result.
