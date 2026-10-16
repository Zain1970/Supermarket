# Prisma ORM 6 → 7 Security Upgrade Plan

Status: planning only. No dependency versions or runtime code have been changed by this document.

## Current repository facts

- Root workspace uses npm workspaces (`apps/*`, `packages/*`) and requires Node.js >=20.
- `apps/api/package.json` declares `@prisma/client: ^6.19.0` and dev dependency `prisma: ^6.19.0`.
- API package is ESM (`"type": "module"`).
- `apps/api/prisma/schema.prisma` currently uses `provider = "prisma-client-js"` without an explicit `output`, and declares `url = env("DATABASE_URL")` in the datasource.
- API CI currently runs `npm install`, then Prisma generate, typecheck, tests, and build. There is no root `package-lock.json` on the branch at the time of review.
- Current app/runtime imports and PrismaClient initialization must be inventoried before editing; do not assume every import or constructor has been found.

## Official migration references

- Prisma ORM 7 upgrade guide: https://www.prisma.io/docs/guides/upgrade-prisma-orm/v7
- Prisma Client generation in v7: https://www.prisma.io/docs/orm/v7/prisma-client/setup-and-configuration/generating-prisma-client
- Prisma Client introduction / PostgreSQL adapter setup: https://www.prisma.io/docs/orm/v7/prisma-client/setup-and-configuration/introduction

The official guide documents breaking changes: explicit generated-client output and import paths, Prisma config for CLI datasource settings, required driver adapters for direct database connections, and changed connection-pool defaults. These need an application-specific implementation and test pass, not a blind version bump.

## Planned implementation sequence

1. Inventory every `PrismaClient` constructor, `@prisma/client` import, Prisma CLI invocation, schema path, test fixture, and migration workflow. Record the exact list in the PR description.
2. Select mutually compatible patched Prisma 7 versions for `prisma` and `@prisma/client`; add PostgreSQL adapter dependencies (and `pg` if required by the selected adapter) together. Do not use `npm audit fix --force`.
3. Switch the generator to the supported Prisma 7 generator with an explicit output path. Generate the client and update every import to that generated path. Do not commit generated output unless repository policy requires it.
4. Add `prisma.config.ts` at the appropriate workspace/root location and ensure CLI commands, CI, local development, and migrations load `DATABASE_URL` consistently without printing secrets. Confirm the exact config path with the repository's current command layout.
5. Update the single shared PrismaClient factory to use the PostgreSQL driver adapter. Explicitly configure connection-pool limits/timeouts suitable for the deployed environment; compare behavior with current Prisma 6 defaults.
6. Generate and commit a root npm lockfile from a clean checkout using the intended Node/npm versions. Verify that workspace dependency resolution is complete; do not fabricate lockfile contents.
7. Change CI installation to `npm ci` only after the lockfile is committed. Keep generate, schema validation, typecheck, all tests, build, and audit checks.
8. Run and capture: Prisma validate/generate; fresh PostgreSQL migration path; upgrade path from the supported baseline; all unit and integration tests; TypeScript typecheck; build; `npm audit`; and runtime smoke test that connects and executes a simple query.
9. Review migration SQL and connection-pool behavior. Do not run migrations against production as part of the upgrade PR. Rehearse against a disposable database or verified restored backup.
10. Request human review and merge only after all checks pass. Preserve rollback instructions and the known-good deployment artifact.

## Acceptance criteria

- [ ] Patched Prisma 7 versions selected and installed together; no unreviewed forced upgrade.
- [ ] Generated-client output and all imports updated consistently.
- [ ] PostgreSQL adapter and one shared PrismaClient factory implemented and tested.
- [ ] Prisma CLI config works in CI and local scripts.
- [ ] Root `package-lock.json` committed and clean `npm ci` succeeds.
- [ ] CI uses `npm ci` and all tests, migration paths, typecheck, and build pass.
- [ ] Audit has no high/critical findings, or any residual risk is explicitly documented with owner and expiry.
- [ ] Runtime smoke test and human code review pass.
- [ ] No production migration occurs without target-database history/schema inspection, verified restorable backup, and rehearsal.

## Environment limitation

The GitHub API can update repository files, but the current execution environment could not clone/install this repository because external DNS access was unavailable. Therefore this plan is recorded first; no dependency lockfile, package upgrade, generated client, or test result is claimed until it is actually produced and CI verifies it.
