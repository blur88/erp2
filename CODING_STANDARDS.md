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

### Inventory cost-batch lock order

- **Rule:** Sales fulfil, unfulfil and purchase-order return lock the owning document, then all affected product rows in ascending product-ID order using `lockProductForStockUpdate`, before any cost-batch mutation, within the same transaction. Callers of `reduceStock`, `restoreStock` and `removeStock` must hold the product lock; these writers do not check that the caller holds it. Re-locking an already-held product in that transaction is safe. **Known exception:** purchase-order receive already locks each product before writing that product's batch, but inserts earlier items' batches before locking later items' products; taking all product locks up front in ascending ID order is tracked in [#1512](https://github.com/blur88/erp2/issues/1512). Product creation with opening stock and base-cost-only recalculation are outside this rule's scope.
- **Why:** Opposite product/batch lock orders deadlock; an unlocked restore can overwrite a concurrent depletion. Acquiring products in item order can also deadlock multi-product fulfilments.
- **Diff failure:** Calling `restoreStock` or `removeStock` before locking products, or locking the next product only after mutating an earlier product's batches, recreates these cycles or lost updates.
- **Trace:** [Issue #1498](https://github.com/blur88/erp2/issues/1498#issuecomment-6448449040), [SalesOrderFulfillmentService](backend/src/modules/sales/services/sales-order-fulfillment.service.ts), [PurchaseOrderLifecycleService](backend/src/modules/purchasing/services/purchase-order-lifecycle.service.ts), and [PostgreSQL regression tests](backend/test/cost-batch-lock-order.concurrency.e2e-spec.ts). Partly enforced by [the call-site guard](backend/scripts/verify-cost-batch-writer-callers.sh) (run by `npm run test:scripts`): it fails on a call to `reduceStock`, `restoreStock`, `removeStock` or `addStock` from a (file, writer) pair not on its reviewed list. It covers `addStock` too, wider than this rule, so receive and product creation stay listed. It detects unreviewed caller locations only; it does not prove that a caller holds its product locks or takes them in this order.

## E2E tests

### E2E request-trace cleanup

- **Rule:** Every suite that creates request traces cleans only its owned rows, following [the Backend testing procedure](docs/backend/testing.md#every-suite-cleans-its-own-request-exhaust).
- **Why:** `test:e2e` recreates its database for each run, which hides rows leaked by a suite. The persistent leak check detects those rows on a later pass; broad cleanup by the shared `admin` username can delete another suite's data.
- **Diff failure:** Adding an HTTP write or `/search/global` request while only cleaning business rows/users leaves `audit_logs` or `search_queries` behind and makes the leak check fail.
- **Trace:** [Backend testing: every suite cleans its own request exhaust](docs/backend/testing.md#every-suite-cleans-its-own-request-exhaust) and [removeSuiteTraces](backend/test/utils/shared-e2e-traces-fixture.ts).

## Documentation

### Claims match the code

- **Rule:** Every factual claim in documentation or a code comment that describes code matches the code it names: response shapes, lock orders, which exception fields survive, what a test covers, and every "Enforced by" note. Check each claim the diff adds or changes against that code, each claim the diff removes, and each unchanged claim whose subject the diff changes, such as an inventory or count of configs, scripts, jobs or files the diff adds to or removes from. When the diff edits a comment block, check every sentence the block keeps, not only the edited ones. Removing a claim that is still true (dated history, a changelog entry, a past decision) is a finding unless the spec asks for it. Cite file and line in the review.
- **Why:** Documentation passes lint, links and tests while being wrong, and agents act on it as fact. A wrong claim in always-loaded `AGENTS.md` misleads every later session. A deleted true claim passes the same checks and leaves nothing in the doc to say it was ever there.
- **Diff failure:** A line saying tree endpoints "(categories, chart of accounts) return a plain array" when `CategoryService.getTree` returns `{ data, meta }`; or "Enforced by the ESLint runtime `bullmq` import ban" on the BullMQ v5 rule, when that ban only rejects imports in `src/**` and cannot stop a separate v5 process. Or, while correcting the frontend README's current-version claims for #1439, deleting the December 2025 entry "Material-UI v7 Upgrade - Upgraded from v5 to v7.3.6", which was true history. Or, adding `backend/test/jest-db.json` for #1484 while the unchanged Backend testing line still read "All three Jest configs (unit in `package.json`, `test/jest-e2e.json`, `test/jest-redis.json`)". Or, for #1498, half-editing the fulfilment pre-flight comment while keeping its reason "which a per-product check under the lock cannot do" after all product locks moved ahead of the loop; or a new rule saying cost-batch writers "require their callers to hold the product lock" when the writers never check it.
- **Trace:** [CategoryService.getTree](backend/src/modules/inventory/services/category.service.ts), [ESLint config](backend/eslint.config.mjs), [PR #1456](https://github.com/blur88/erp2/pull/1456) (both claims) and [issue #1457](https://github.com/blur88/erp2/issues/1457); removed claim in [issue #1439](https://github.com/blur88/erp2/issues/1439) and [PR #1468](https://github.com/blur88/erp2/pull/1468): its commit `1c21531d3` deleted the entry and `7401c19de` restored it after review found that `a91c48e7e` (2025-12-23, "Upgrade Material-UI from v5 to v7 and React to 18.3.1") records the upgrade as written. Unchanged claim in [issue #1484](https://github.com/blur88/erp2/issues/1484#issuecomment-6436567910), whose follow-up review scope records the stale inventory, and [PR #1504](https://github.com/blur88/erp2/pull/1504): commit `fd77c82f9` corrected it. Comment and overclaim cases in [PR #1513](https://github.com/blur88/erp2/pull/1513): commit `763ce0f55` corrected both after review.

### One owner per rule

- **Rule:** Each rule has one owning document. Any other copy points to the owner, directly or through the rule here whose Trace names it. A copy may leave detail to the owner, but every condition it states matches the owner, and it adds none. Change the owner first, then bring each copy into line in the same diff. When a diff moves a rule to a new owner, the new owner states every condition the old text did; a pointer that names the new owner for something that owner does not say is a wrong claim.
- **Why:** Copies drift. Shortening one copy by hand is how a rule turns wrong in one place while staying right in another, and a reader cannot tell which copy is authoritative. Moving a rule is how one disappears: the old text is deleted, the pointer looks complete, and nothing says the condition is gone.
- **Diff failure:** The owner says no path may lock `accounting_settings` after the account lock; a shortened `AGENTS.md` copy reading "lock the account first … lock `accounting_settings` before the account" turns that prohibition into an instruction and contradicts itself.
- **Trace:** [Bank Reconciliation: lock order](docs/modules/accounting/BANK_RECONCILIATION.md#lock-order) (the owner), [PR #1456](https://github.com/blur88/erp2/pull/1456) and [issue #1457](https://github.com/blur88/erp2/issues/1457); moved-rule loss in [PR #1459](https://github.com/blur88/erp2/pull/1459), where the unflagged-Draft behaviour left `PAYMENT_METHOD_CHANNEL_ACCOUNTS.md` under a pointer claiming `PROVIDER_SETTLEMENTS.md` owned it.

### Recorded intent is reachable

- **Rule:** A doc that gives a reason for behaviour ("because", "the design chooses", "as recorded in") cites where that reason is recorded: a tracked doc, an issue or PR, an ADR, or a code comment, and the cited source says it. Files Git does not track, such as the ignored `docs/superpowers/specs/`, are not sources. Where nothing records the reason, the doc says the behaviour describes current code only. The reviewer opens every source the diff cites for a reason (`gh issue view N --comments`, `gh pr view N`, the file at the cited line) and records, in the review evidence, the source and the quoted sentence that supports the claim, read with the bullet or paragraph it sits in. A claim that drops a condition the source attaches (its scope, its case, its "only when") is a wrong claim, even when the quoted words appear in the source. A source that contradicts the claim or gives it no support is a finding. A source the reviewer cannot open leaves the claim unverified, never satisfied.
- **Why:** Agents act on a doc's rationale as a decision. A reason that rests on a local file cannot be checked by a fresh clone, a cloud agent or the next reviewer, and a reviewer handed that file as evidence will accept it. A reviewer who checks a citation without quoting it can pass a source that says the opposite.
- **Diff failure:** The first reviewed draft of `PROVIDER_SETTLEMENTS.md` said "The design chooses explicit release because silent expiry…" with only an ignored local spec behind it, and credited #1257 with the journal-derived Clearing account, which the issue text never mentions. With this rule in place but no quote required, the first reviewed draft of `OWNER_EQUITY.md` credited #1094 with keeping Complete and Uncomplete for Stock drawings, though #1094's acceptance criteria put Stock Drawing among the documents that complete automatically; the narrowing is recorded in PR #1095. Both reviewers passed it: one never opened a cited issue, and the other opened #1094 and did not flag it. A quote alone does not catch a dropped condition: the merged `PROVIDER_SETTLEMENTS.md` said "PR #1287 also records that a Posted Provider settlement can always be reversed" and called that intent a conflict with Reverse's account checks. #1287 does say "a posted settlement can always be undone", but in its bullet on the provider-clearing eligibility check, which exempts Reverse from that check only; the doc's own sources list already gave that scoped reading. The false conflict became issue #1460.
- **Trace:** [Provider Settlements](docs/modules/accounting/PROVIDER_SETTLEMENTS.md), [issue #1434](https://github.com/blur88/erp2/issues/1434) and [PR #1459](https://github.com/blur88/erp2/pull/1459); [Owner Equity](docs/modules/accounting/OWNER_EQUITY.md), [issue #1435](https://github.com/blur88/erp2/issues/1435) and [PR #1462](https://github.com/blur88/erp2/pull/1462); dropped condition in [PR #1287](https://github.com/blur88/erp2/pull/1287) (the source), [issue #1460](https://github.com/blur88/erp2/issues/1460) and [PR #1482](https://github.com/blur88/erp2/pull/1482).

### Recorded results are preserved

- **Rule:** A doc or PR that records a result of a past run (a measurement, an exit status, a suite or test count, an elapsed time, a fact about the machine it ran on) cites where that result is preserved: a tracked file or the PR body or a PR comment, and the preserved record shows it. Methodology and results are separate claims. A recorded command, script or derivation shows how a result was produced and can be checked by rerunning it, but a rerun produces a new result; it cannot establish what the past run measured or how it exited. Where a result was observed but not preserved, the doc says so. Files Git does not track, such as `/tmp` logs or session transcripts, are not sources. The reviewer checks directly reported values against the preserved record and recomputes derived figures from preserved inputs, rerunning each recorded derivation. A figure the preserved record does not support is a finding; one with no preserved record is unverified, never satisfied.
- **Why:** Agents and owners act on recorded evidence as fact, and an issue's acceptance criteria often ask for it. A result that rests on a local log cannot be checked by a fresh clone, a cloud agent or the next reviewer, and a reviewer handed that log will accept it. A methodology that can be rerun looks like evidence while proving only that the method works today.
- **Diff failure:** The first recorded #1449 measurements described "one-second samples" when the no-limit run's timer fired 270 times in 537 s, committed JSONL that the documented reporter does not emit, and stated elapsed times, package versions and an idle-machine check that no committed file recorded.
- **Trace:** [issue #1449](https://github.com/blur88/erp2/issues/1449) and [PR #1473](https://github.com/blur88/erp2/pull/1473): commit `8832326f4` recorded the results, `1290b163a` preserved the raw telemetry and derivation and marked unpreserved observations, and [Backend testing](docs/backend/testing.md) holds the corrected record.

## Guard scripts

### Skip conditions fail closed

- **Rule:** A guard skips only on a condition it has verified. When computing that condition fails (a command exits non-zero, a path does not resolve), the guard fails.
- **Why:** An error in the skip computation is indistinguishable from "nothing to check", so the guard passes code it never checked.
- **Diff failure:** The #1496 freshness guard as first written (`SRC_DIR="$(cd "$DIST_DIR" && pwd)/../src"` gating `[ -d "$SRC_DIR" ]`) skipped silently when `CDPATH` was exported; found in PR #1509 review round 4.
- **Trace:** `backend/scripts/verify-dist-runtime.sh`, `backend/scripts/__tests__/verify-dist-runtime.bats`, [#1496](https://github.com/blur88/erp2/issues/1496), [#1511](https://github.com/blur88/erp2/issues/1511), [PR #1509](https://github.com/blur88/erp2/pull/1509).

### Complete report assertions

- **Rule:** New or changed guard bats tests assert each complete report line the guard emits (for example the trigger guard's `path:line: kind: match`) and reject unexpected output lines.
- **Why:** A broken report can still contain an expected fragment, as [issue #1452](https://github.com/blur88/erp2/issues/1452) records.
- **Diff failure:** The first trigger guard for [#1431 / PR #1451](https://github.com/blur88/erp2/pull/1451) printed `Can't open backend/src/planted.ts: No such file or directory` instead of a report, yet path-fragment assertions passed; [issue #1452](https://github.com/blur88/erp2/issues/1452) records that failure.
- **Trace:** [Trigger guard tests](backend/scripts/__tests__/no-trigger-bypass.bats) and [issue #1452](https://github.com/blur88/erp2/issues/1452).

### Tracked guard cases

- **Rule:** Every route or shape a guard claims to detect, and every accepted limitation, has a tracked test case pinning its verdict. Do not claim a shape without a case. Runtime rejection cases assert the distinctive diagnostic; acceptance cases assert success. Each enforcement point a guard relies on (a hook, a check, a registration) has a case that fails when only that point is removed.
- **Why:** Untracked verdicts let a guard change drop a supported case unnoticed.
- **Diff failure:** The [#1479 / PR #1500 side-effect import gap](https://github.com/blur88/erp2/pull/1500) survived review without a tracked case. Before [PR #1521 round 3](https://github.com/blur88/erp2/pull/1521), its harness asserted only file-level verdicts and had no case that removing a single setup hook would fail; cases pinning each hook exposed those removals.
- **Trace:** [Issue #1501](https://github.com/blur88/erp2/issues/1501), [application-store integration cases](frontend/src/test/__tests__/appStoreRuntimeGuard.test.ts), and [enforcement boundary](docs/frontend/testing-and-print.md#tests-never-evaluate-the-application-store).
