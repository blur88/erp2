# Frontend Testing Limits and Printing

What the Vitest/jsdom suite can and cannot observe, how printing works, and the invariants of the accounting `Statement` component that no automated test protects.

## Printing is portal-only

The transactional document dialogs (Sales/Purchase Orders, invoices) render through MUI portals **outside** `#root`. The unconditional rule `@media print { #root { display: none } }` in `frontend/src/styles/global.css` isolates them: hiding the app shell leaves the portaled document alone on the page. Every print flow in the app depends on that rule, and nothing renders a printable page inside `#root`.

The accounting reports (Profit & Loss, Balance Sheet, Form B) printed from inside `#root` until #1223 removed that path entirely — layout wrapper, print stylesheet, row print axes and its CI gate. Those reports have **no print or export route**; a replacement is deferred to a future redesign. Do not reintroduce an in-`#root` print flow without restoring the ancestor-chain release below and a browser-based gate.

### If you ever add a non-portaled print page

`#root` hiding must become conditional again, and the page must release **every** height/overflow constraint on its ancestor chain (`100vh`, `height: 100%`, `overflow: auto`): `#root`, its children, `main`, `.app-shell-root` (`MainLayout`'s outer 100vh flex Box — it sits one level below `#root > *` and above `main`, so no structural selector reaches it), and `EntityTable`'s `.entity-table-card` / `-frame` / `-scroller`, the real overflow owners. Miss one and the report is pinned to a single viewport and silently truncates. This is what the removed `accountingReportPrint.css` did.

## There is no browser test infrastructure

jsdom has no layout engine and does not evaluate `@media print`, so **the Vitest suite cannot validate any print path** — it can only assert that selectors exist. The Playwright gate that covered the accounting print path (`frontend/e2e/accounting-print.spec.ts`, CI job `Accounting Reports - Print/PDF Gate`, #1214) was removed with that path in #1223 and dropped from ruleset 15609777's required checks. There is no `playwright.config.ts`, no `frontend/e2e/` and no `test:print` script; reintroducing browser coverage means standing all of that back up.

SO/PO print is covered only by the jsdom suite plus a manual browser pass.

## What jsdom can observe

Measured 2026-09-11 against **@mui/material 9.4.0, jsdom 30.0.1, vitest 5.0.0**, each case asserting the correct value *and* a deliberately wrong one:

| Applied via | Observable through `toHaveStyle`? |
|---|---|
| `sx` on the asserted element itself | **yes** (`MainLayout.test.tsx` reads `sx={{ pt: 11 }}` as `paddingTop: 88px`) |
| `sx` descendant selector (`'& .stmt-cell-code'`) | **yes** — on `Statement`: `.stmt-figure-negative` computes `rgb(239, 83, 80)`, `.stmt-cell-code` computes `rgb(189, 189, 189)` |
| theme `styleOverrides` on a themeable slot | **yes** (`MuiButton` root `paddingTop` computes `88px`) |
| an imported stylesheet (e.g. `statement.css`) | **no** — Vitest does not inject it |

Layout-dependent behaviour — decimal alignment, real sticky scrolling, clipping, elevation, font loading — is unassertable.

Two measurement traps, both of which produced false negatives on the first pass:

- **Render through a `ThemeProvider`.** A component rendered bare computes no themed colour, which reads as "Emotion is unobservable" when it only means the theme was absent.
- **A failing wrong-value assertion proves nothing by itself.** An element with no rule computes `rgb(0, 0, 0)`, so a wrong-colour assertion "fails" there too. Read the actual computed value before concluding a rule did not apply.

An older note (#1098, MUI 9.3.1 / vitest 4.1.10) recorded that a pure-`sx` control failed. That does not reproduce on the versions above; treat it as superseded.

## A failing run with every test passing

Vitest exits 1 on an error raised outside any test (a timer that fires after jsdom teardown, #1372) even when the summary reads `Tests N passed (N)`; the only sign at the end of the log is an `Errors N error(s)` line. Read the check-run annotations before the log: in CI, Vitest's GitHub Actions reporter writes each such error as an `Unhandled error` annotation with its stack and the file it originated in.

```bash
gh api repos/blur88/erp2/check-runs/<job-id>/annotations --jq '.[] | "\(.title): \(.message)"'
```

The job id is the last number in the job's URL from `gh pr checks`. A rerun that passes does not resolve the error; the timer is still there.

## Statement (P&L / Balance Sheet / Form B)

`components/accounting/Statement/` was aligned to the app theme in #1224: MUI `Paper` frame, theme palette, sticky header, and one right-aligned figure cell per column. The suite covers structure, not rendering; the sticky, `text-align` and `tabular-nums` rules in `statement.css` are invisible to it. Its themed Emotion colours *are* assertable (table above), though the current suite does not assert them.

`docs/modules/accounting/STATEMENT_THEME_QA.md` is the substitute for a browser gate — a manual procedure, run by hand, with results recorded in the PR.

Two invariants the suite cannot protect; change them only deliberately:

- **The paren spacer stays CSS generated content** (`.stmt-paren-spacer::after { content: ')' }`). It reserves the closing-paren width so positive figures' decimals align with parenthesised negatives. A real `)` text node would look identical in a browser. `toHaveTextContent('56,800.00')` is a substring assertion and would accept `56,800.00)`; the explicit no-stray-parenthesis checks (exact `textContent` equality and `not.toContain(')')`) are what catch a text-node regression.
- **Every figure renders at the same font size.** The bottom line is distinguished by weight and its double rule. A larger bottom-line figure puts its decimal separator at a different x position from every other row — the misalignment the old two-cell split existed to prevent.

## Tests never evaluate the application store

**Invariant:** No test evaluates `frontend/src/store/index.ts`, directly or transitively. There is no opt-out. Use `createTestStore` (`@/test/createTestStore`) or a complete hoisted `vi.mock('@/store', () => ({ … }))` stub. A future store-wiring test must use an isolated store factory with explicit cleanup; any exception needs its own issue against a concrete need.

ApiService's request interceptor lazily imports the application store before sending a request (then caches it), so a test reaching that interceptor can evaluate the singleton without importing it directly. Mock the RTK Query hook or request method before it reaches the Axios transport, or provide the complete hoisted store stub above; an MSW response handler runs too late to prevent this import.

**Coverage:** A Vitest-only Vite plugin replaces the entire resolved store module, including its imports, in both configured projects (`node` and `jsdom`). The original code never runs and the singleton is never constructed. A transform alone is not a violation: the replacement records a violation only when it executes, then throws. This observes actual evaluation attempts during configured Vitest runs, whatever the specifier form (including template and interpolated paths) or import depth. Unexecuted paths are not violations; the guard makes no claim about hypothetical paths.

The registry lives on `globalThis` under a `Symbol.for` key and survives module resets. Setup checks unreported entries after each test and after the suite, marking entries reported rather than clearing them. Catching the replacement's throw does not bypass enforcement. The replacement also emits its diagnostic when it executes, so a collection-time attempt in a file with no runnable tests remains visible independently of Vitest's no-tests failure. Complete hoisted stubs and erased type imports do not evaluate the replacement. A `vi.doMock` registered after a static import cannot intercept that import.

**Limitations:** Runs that bypass these configured projects (another config or a non-Vitest runner), and deliberate registry tampering, are outside guard coverage. The [unconfigured-run fixture](../../frontend/src/test/store-guard-fixtures/unconfigured.bypass.fixture.ts) and [registry-tampering fixture](../../frontend/src/test/store-guard-fixtures/registry-tampering.accept.fixture.ts) pin these accepted verdicts in the integration harness.

**Diagnostics:** Recorded stacks provide context, not a guaranteed importer chain; transformed execution can obscure that chain.

The [integration cases](../../frontend/src/test/__tests__/appStoreRuntimeGuard.test.ts) run the real config and plugin in isolated child processes. Runtime detection replaces the retired source-text matcher: type-erased value-form imports, a stub method sharing the loader parameter's name, and hoist-safe named factories have passing controls. The separate `configureStore(` plus `.middleware` text check remains unchanged. Design decisions are recorded in [issue #1501](https://github.com/blur88/erp2/issues/1501#issuecomment-6463202867).
