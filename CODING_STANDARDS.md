# Coding Standards

These are reviewer-facing judgement rules. Each rule states its Rule, Why, Diff failure and Trace; `backend/scripts/verify-coding-standards.sh` (run by `npm run test:scripts`) checks that shape. Mechanical rules belong in checks rather than here.

Each rule has [one owner](#one-owner-per-rule): the module or technical doc when that doc explains the mechanism, otherwise this file. A rule here whose owner is another doc names that owner in its Trace. `AGENTS.md` keeps a one-line reminder that points here, and reaches the owner through that Trace.

## Backend

### Route order

- **Rule:** Declare fixed routes before routes with path parameters in Nest controllers. For example, keep `@Get('deleted')` before `@Get(':id')`.
- **Why:** Routes are matched in declaration order. A parameter route can consume a fixed path segment, and an identifier pipe can then reject that segment as an invalid UUID.
- **Diff failure:** Moving `@Get(':id')` above `@Get('deleted')` makes `GET /products/deleted` reach `findOne` instead of the deleted-products handler.
- **Trace:** [ProductController](backend/src/modules/inventory/controllers/product.controller.ts).

### Soft delete

- **Rule:** Use TypeORM `softDelete(id)` for entities with a soft-delete lifecycle; do not substitute `isActive = false`. Keep explicit hard-delete behavior where the domain requires it: `bank_statement_reconciliation_lines` and `bank_statement_reconciliation_setup_marks` rows are hard-deleted, while a `bank_statement_reconciliations` header is deleted only when discarding a never-completed draft.
- **Why:** Default filtering, deleted-list `withDeleted` queries, and restore rely on `deletedAt`; setting only `isActive` breaks `withDeleted` queries and restore.
- **Diff failure:** Replacing `softDelete(id)` with an `isActive` update leaves `deletedAt` null, so the row is absent from deleted-record queries and cannot be restored through the soft-delete path.
- **Trace:** [ProductService](backend/src/modules/inventory/services/product.service.ts), [BaseCrudService](backend/src/common/services/base-crud.service.ts), [BankReconciliationLifecycleService](backend/src/modules/bank-reconciliations/services/bank-reconciliation-lifecycle.service.ts), and [BankReconciliationService](backend/src/modules/bank-reconciliations/services/bank-reconciliation.service.ts) (draft discard).

### API response shape

- **Rule:** Read the body shape returned by the endpoint. `ApiService` returns the backend body directly; paginated lists use `{ data: T[], meta }`, the category tree uses `{ data, meta: { totalCategories, maxDepth, rootCategories } }` (tree metadata, not pagination metadata), and only the chart-of-accounts tree returns a plain array.
- **Why:** The transport does not add a wrapper that makes these response shapes interchangeable.
- **Diff failure:** Treating the category tree object as an array fails; its categories and tree metadata are in `response.data` and `response.meta`. Reading `response.data` from the chart-of-accounts array produces `undefined`; treating a paginated response as an array drops its rows and metadata, often yielding an empty list with no error.
- **Trace:** [ApiService](frontend/src/services/api.ts), [CategoryService.getTree](backend/src/modules/inventory/services/category.service.ts), [CategorySelector](frontend/src/components/inventory/CategorySelector.tsx), [CategoryController](backend/src/modules/inventory/controllers/category.controller.ts), [ChartOfAccountController](backend/src/modules/accounting/controllers/chart-of-account.controller.ts), and [ChartOfAccountService.findTree](backend/src/modules/accounting/services/chart-of-account.service.ts).

### Error details inside message

- **Rule:** Put client-visible structured exception details inside the exception's `message` payload, for example `{ message: { text, staleRows } }`; do not widen the global filter to copy other exception keys. Use the top-level `code` field for machine-readable error codes.
- **Why:** When an exception response has a truthy `message`, the filter emits that value plus explicit `error` and string `code`, dropping arbitrary siblings. With a missing or falsy `message`, it falls back to the full payload as `message`; nesting details keeps the client shape stable.
- **Diff failure:** Throwing `{ message: 'Some rows changed', staleRows }` and then reading `staleRows` from the response body finds it missing, so the UI cannot identify which groups changed.
- **Trace:** [HttpExceptionFilter](backend/src/common/error-management/http-exception.filter.ts), [ProviderSettlementService](backend/src/modules/provider-settlements/services/provider-settlement.service.ts), and [ProviderSettlementFormPage](frontend/src/pages/accounting/provider-settlements/ProviderSettlementFormPage.tsx).

## Authentication

### Lockout clock

- **Rule:** Compare `lockedUntil` with the Node clock (`new Date()`), not SQL `NOW()`.
- **Why:** Login and the user list must evaluate expiry against the same clock. PostgreSQL and the backend container can drift, which previously caused an expired lockout to persist (#710). When a lockout looks wrong, suspect that drift and run `docker compose restart backend`.
- **Diff failure:** Moving one comparison to SQL `NOW()` lets login consider an account unlocked while the user list still reports it locked, or vice versa.
- **Trace:** [AuthService](backend/src/modules/auth/auth.service.ts), [UsersService](backend/src/modules/users/users.service.ts), and [issue #710](https://github.com/blur88/erp2/issues/710).

## Bank reconciliation

### Reconciliation lock order

- **Rule:** Every write path locks the bank account row with `FOR NO KEY UPDATE`, then the header, then working set rows by ascending `journalEntryLineId`; do not lock `accounting_settings` after the account lock. See [Bank Reconciliation](docs/modules/accounting/BANK_RECONCILIATION.md#lock-order).
- **Why:** The order prevents deadlocks with chart-of-account updates, which lock `accounting_settings` before the account; `FOR NO KEY UPDATE` also allows journal-line inserts.
- **Diff failure:** A helper that locks the header before the account or settings after the account reverses the documented order and can deadlock; changing to `FOR UPDATE` can block journal-line inserts.
- **Trace:** [Bank Reconciliation lock-order documentation](docs/modules/accounting/BANK_RECONCILIATION.md#lock-order), [lockBankAccount](backend/src/modules/bank-reconciliations/services/bank-reconciliation.locks.ts), and [ChartOfAccountService](backend/src/modules/accounting/services/chart-of-account.service.ts) (settings-before-account update lock).

## E2E tests

### E2E request-trace cleanup

- **Rule:** Every suite that creates request traces cleans only its owned rows, following [the Backend testing procedure](docs/backend/testing.md#every-suite-cleans-its-own-request-exhaust).
- **Why:** `test:e2e` recreates its database for each run, which hides rows leaked by a suite. The persistent leak check detects those rows on a later pass; broad cleanup by the shared `admin` username can delete another suite's data.
- **Diff failure:** Adding an HTTP write or `/search/global` request while only cleaning business rows/users leaves `audit_logs` or `search_queries` behind and makes the leak check fail.
- **Trace:** [Backend testing: every suite cleans its own request exhaust](docs/backend/testing.md#every-suite-cleans-its-own-request-exhaust) and [removeSuiteTraces](backend/test/utils/shared-e2e-traces-fixture.ts).

## Documentation

### Claims match the code

- **Rule:** Every factual claim in documentation that describes code matches the code it names: response shapes, lock orders, which exception fields survive, what a test covers, and every "Enforced by" note. Check each claim the diff adds or changes against that code, and cite file and line in the review.
- **Why:** Documentation passes lint, links and tests while being wrong, and agents act on it as fact. A wrong claim in always-loaded `AGENTS.md` misleads every later session.
- **Diff failure:** A line saying tree endpoints "(categories, chart of accounts) return a plain array" when `CategoryService.getTree` returns `{ data, meta }`; or "Enforced by the ESLint runtime `bullmq` import ban" on the BullMQ v5 rule, when that ban only rejects imports in `src/**` and cannot stop a separate v5 process.
- **Trace:** [CategoryService.getTree](backend/src/modules/inventory/services/category.service.ts), [ESLint config](backend/eslint.config.mjs), [PR #1456](https://github.com/blur88/erp2/pull/1456) (both claims) and [issue #1457](https://github.com/blur88/erp2/issues/1457).

### One owner per rule

- **Rule:** Each rule has one owning document. Any other copy points to the owner, directly or through the rule here whose Trace names it. A copy may leave detail to the owner, but every condition it states matches the owner, and it adds none. Change the owner first, then bring each copy into line in the same diff.
- **Why:** Copies drift. Shortening one copy by hand is how a rule turns wrong in one place while staying right in another, and a reader cannot tell which copy is authoritative.
- **Diff failure:** The owner says no path may lock `accounting_settings` after the account lock; a shortened `AGENTS.md` copy reading "lock the account first … lock `accounting_settings` before the account" turns that prohibition into an instruction and contradicts itself.
- **Trace:** [Bank Reconciliation: lock order](docs/modules/accounting/BANK_RECONCILIATION.md#lock-order) (the owner), [PR #1456](https://github.com/blur88/erp2/pull/1456) and [issue #1457](https://github.com/blur88/erp2/issues/1457).
