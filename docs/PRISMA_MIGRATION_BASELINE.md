# Prisma migration baseline and safe adoption

The repository now contains a committed baseline migration at `apps/api/prisma/migrations/20261016160000_base_schema/migration.sql`. It describes the database schema immediately before the sales-return tables and relations. The subsequent timestamped migrations add sales returns and then tighten tenant-scoped foreign keys.

## New, empty database

Run from the repository root against a newly created PostgreSQL database:

```sh
npx prisma validate --schema apps/api/prisma/schema.prisma
npx prisma migrate deploy --schema apps/api/prisma/schema.prisma
npx prisma generate --schema apps/api/prisma/schema.prisma
```

`migrate deploy` applies the baseline followed by the sales-return migrations in timestamp order. Do not use `prisma db push` as a production migration strategy.

## Existing database

No production database or credentials are configured by this repository, so do not assume that an existing database has a particular migration history. Before changing any existing database:

1. Take and verify a restorable backup.
2. Inspect `_prisma_migrations`, actual tables, indexes, constraints, enum types, and the state of `SaleReturn` and `SaleReturnItem`.
3. Compare the live schema with the committed baseline and each migration that may already have been applied.
4. Only if the database exactly matches the pre-returns baseline and has no migration history for it, mark the baseline as applied and then deploy the remaining migrations:

   ```sh
   npx prisma migrate resolve --applied 20261016160000_base_schema --schema apps/api/prisma/schema.prisma
   npx prisma migrate deploy --schema apps/api/prisma/schema.prisma
   ```

5. If return tables or any return constraints already exist, do not run the commands above blindly. Determine which migrations are fully reflected in the database and use `migrate resolve --applied <migration-name>` only for migrations whose complete effects have been verified. If the schema does not match a known migration state, stop and prepare a reviewed reconciliation plan before applying anything.

Never mark a migration as applied merely to silence Prisma, and never test migration recovery against production data.

## CI coverage

The API workflow checks both paths using disposable PostgreSQL schemas:

- Fresh install: baseline plus all sales-return migrations.
- Upgrade: baseline plus the original sales-return migration first, then the two forward migrations that add tenant-scoped constraints.

The upgrade test uses an isolated `upgrade_test` schema and does not connect to a production database.

## Scope and release gate

The sales-return endpoint is inventory-only. It does not refund payments or adjust customer receivables. Financial settlement requires its own ledger design, idempotency rules, reconciliation, and integration tests before it can be enabled.
