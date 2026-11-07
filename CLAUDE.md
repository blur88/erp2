# CLAUDE.md

Guidance for working in this repository. Read [AGENTS.md](AGENTS.md) for repository conventions and the authoritative Change-Scoped Verification gates before preparing a PR. Record the exact verification commands and results in the PR.

## Rules

**NestJS route order**: Specific routes (`/products/deleted`) MUST be declared before parameterized routes (`/products/:id`) in controllers, or NestJS will try to treat `"deleted"` as a UUID and fail.

**Soft delete**: Always use TypeORM's `softDelete(id)` method — it sets the `deletedAt` timestamp. Setting `isActive = false` manually does NOT set `deletedAt`, breaking `withDeleted` queries and the restore flow.

**API response structure**: `ApiService` strips the Axios wrapper and returns the backend body directly. For paginated list endpoints the body is `{ data: T[], meta: {...} }` — access items as `response.data` and pagination as `response.meta`. The categories tree also returns `{ data, meta }` — access nodes as `response.data` and tree metadata as `response.meta` (see `CategoryTreeResponseDto` in `backend/src/modules/inventory/dto/category.dto.ts`). The chart-of-accounts tree returns a plain array — access as `response` directly (no `.data`; see `ChartOfAccountService.findTree` in `backend/src/modules/accounting/services/chart-of-account.service.ts`). Getting this wrong causes empty lists with no errors.

**Path aliases**: Frontend uses `@/` as alias for `src/`. Backend uses `@/*` → `src/*`, `@modules/*` → `src/modules/*`, `@common/*` → `src/common/*`, `@config/*` → `src/config/*`, and `@database/*` → `src/database/*`.

TypeScript CLI scripts that directly or transitively import configured path aliases such as `@database/*` must preload `tsconfig-paths/register` in their npm script (for example, `ts-node -r tsconfig-paths/register ...`). TypeScript type-checking resolves these aliases, but Node runtime loading does not.

Files reachable from `tsconfig.cli.json` must use relative imports: its plain TypeScript compile overwrites Nest's alias-rewritten output in `dist/`.

Backend Jest requires `NODE_OPTIONS=--experimental-vm-modules`; use the npm test scripts, or set that flag when running `npx jest` directly. Zero discovered tests must fail.

## Read when relevant

- Reviewing a diff → read [coding standards](CODING_STANDARDS.md).
- Opening, stacking or merging a PR, starting development, changing architecture or deployment configuration, running migrations, sweeping dead code, or updating main → read [development reference](docs/agents/development-reference.md).
- Working with GitHub issues or PR issue-closing semantics → read [issue tracker guidance](docs/agents/issue-tracker.md).
- Defining domain terminology or recording architectural decisions → read [domain documentation guidance](docs/agents/domain.md).
- Changing authentication or diagnosing lockout expiry → read [account lockout clock](docs/backend/auth-lockout.md).
- Changing printing or adding browser print coverage → read [printing constraints](docs/frontend/printing.md).
- Changing accounting statement styles or statement theme QA guidance, or assessing jsdom visual assertions → read [statement theme QA and measurement evidence](docs/modules/accounting/STATEMENT_THEME_QA.md).
- Changing CLI imports, build configuration, or diagnosing built-artifact module loading → read [CLI build alias constraints](docs/backend/cli-build.md).
- Changing Redis policy, sizing, monitoring, or rolling out Redis configuration → read [Redis memory pressure runbook](docs/deployment/REDIS_MEMORY_PRESSURE_RUNBOOK.md).
- Changing backend test configuration, TypeScript checks, Jest hooks, or ESM dependencies → read [backend testing rationale](docs/backend/testing.md).
- Adding e2e fixtures, audited requests, cron tests, or investigating retained database drift → read [e2e leak checks](docs/backend/e2e-leak-check.md).
- Changing Redis clients, BullMQ, backup schedulers, or running real-Redis tests or scheduler reconciliation → read [Redis and BullMQ operations](docs/backend/redis-bullmq.md).
- Changing bank reconciliation schemas, locking, conflicts, fixtures, or form drafts → read [bank reconciliation engineering constraints](docs/modules/accounting/BANK_RECONCILIATION_ENGINEERING.md).
