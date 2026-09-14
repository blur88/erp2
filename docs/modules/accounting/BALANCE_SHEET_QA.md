# Balance Sheet — Manual Verification

Tracked, reviewable verification procedures for the LHDN Borang B Part N Balance
Sheet report (`/accounting/balance-sheet`).

`docs/test/` is gitignored by repo convention ("Local-only test docs"), so
execution logs and run-by-run results live there. **The instructions themselves
live here, in version control**, so they are reviewable in a PR and survive the
local working copy.

## What the Vitest suite cannot cover

jsdom has no layout engine and does not evaluate `@media print`, so the frontend
suite cannot prove anything about printed output.

**That no longer constrains this report.** The print/PDF path for the accounting
reports — the layout wrapper, the print stylesheet, the row print axes and the
browser-based CI gate — was removed in #1223. Profit & Loss, Balance Sheet and
Form B have **no print or export route**; a replacement is deferred to a future
redesign.

There is consequently no Playwright infrastructure in this repo, and no
`Accounting Reports - Print/PDF Gate` check. If print returns, both the gate and
its local-run procedure have to be stood back up from scratch.

## BS-P1 — Derived equity subtotals (#1212)

**Precondition:** A Balance Sheet with non-zero liabilities and owner's equity is
displayed. Record the visible N45, N46 and N50 amounts.

**Expected:**

- `TOTAL OWNER'S EQUITY` is visible immediately after N50.
- `TOTAL LIABILITIES AND OWNER'S EQUITY` is visible immediately after it, before
  the Balance Check panel.
- Neither derived row shows an LHDN N-code, an expand control, or a General
  Ledger drill-down link.
- Both are styled consistently with the `TOTAL ASSETS` and `TOTAL LIABILITIES`
  rows.
- `TOTAL OWNER'S EQUITY` = N46 + N50.
- `TOTAL LIABILITIES AND OWNER'S EQUITY` = N45 + `TOTAL OWNER'S EQUITY`.
- The summary-card Owner's Equity amount equals `TOTAL OWNER'S EQUITY`.
- The Assets section does **not** contain the combined liabilities-and-equity
  total.
- On a balanced report, `Total Assets` equals
  `TOTAL LIABILITIES AND OWNER'S EQUITY`.
- The official N28–N50 rows, their formulas, warnings and drill-downs are
  unchanged.

## BS-P2 — Unknown values are never rendered as zero (#1212)

**Precondition:** A report whose N47 or N48 is unavailable, so N50 is unknown. If
this state cannot be produced from current business data, mark N/A and record the
prerequisite.

**Expected:**

- Both derived subtotals display an em dash, never RM0.00.
- The summary-card Owner's Equity likewise shows an em dash.
- The Balance Check panel still shows all three lines: a known `Total Assets`
  renders its real amount, while an unknown `Total Liabilities and Owner's
  Equity` and `Difference` render as em dashes.
- The Balance Check status remains `Unavailable` and its reason text is listed.

## BS-P4 — Statement amount announcement (screen reader)

DOM assertions verify that each amount exposes one accessible value and that it
sits in a cell in the figure column, but they cannot prove announcement. Confirm
by ear, once per release that touches the statement:

1. Open Profit & Loss with a screen reader active (NVDA, VoiceOver or Orca).
2. Navigate the statement by table cell.
3. Each amount must be announced as ONE value **with its column header** — e.g.
   "RM, negative 840.00" — not as "840" and ".00" in separate cells, and not
   with the sign dropped.
4. A row with no computed figure must announce "not available", never "dash"
   or "zero".

Record pass/fail and the reader used. A failure here is a defect even when the
Vitest suite is green.

## BS-P5 — Balance Sheet account grouping (#1239)

Covers the explicit N38/N39 grouping configured in **Accounting Settings →
Balance Sheet Grouping**. The Vitest suite proves the draft logic and the
backend suites prove the resolution and conflict rules; what remains manual is
the end-to-end operator experience across two pages.

**Precondition:** Administrator login. At least two Asset accounts that receive
payments (e.g. `1200 CIMB`, `1210 Maybank`) and one provider account
(e.g. `1240 Atome`) with a non-zero balance.

### BS-P5a — Grouping drives the report

1. With both groups empty, open the Balance Sheet and record N38's contributing
   accounts (expand the row).
2. **Expected:** exactly the single Bank Account from Default Accounts — the
   legacy fallback.
3. In Accounting Settings, add CIMB **and** Maybank to *N38 Bank Balance*, and
   Atome to *N39 Other Current Assets*. Save.
4. Reopen the Balance Sheet.
5. **Expected:** N38 expands to show BOTH CIMB and Maybank, each with its own
   figure, and N38's total is their sum. N39 shows Atome. N40/N41 and the
   Balance Check include the new amounts.

### BS-P5b — The displaced Supplier Deposit account

The consequence the N39 help text warns about, and the one most likely to
surprise an operator.

1. Ensure the Supplier Deposit account holds a NON-ZERO balance.
2. Configure *N39 Other Current Assets* with the provider accounts only,
   deliberately omitting the Supplier Deposit account. Save.
3. Open the Balance Sheet.
4. **Expected:** the Supplier Deposit account is reported as an **unmapped
   balance** finding, and the Balance Check reads `Unavailable` — it is no
   longer inside N39.
5. Add the Supplier Deposit account to N39 as the help text instructs. Save.
6. **Expected:** the finding clears, N39 includes it alongside the providers,
   and the Balance Check returns to a settled status.

### BS-P5c — Conflict rejection is legible

1. Leave *N38 Bank Balance* EMPTY and try to add the configured Bank Account to
   *N39*. Save.
2. **Expected:** the save is rejected with a message naming the account and
   both lines (`… would contribute to N38 and N39`), and the staged edit
   SURVIVES so it can be corrected rather than being silently discarded.
3. Now add any other account to *N38* (making it non-empty) and retry.
4. **Expected:** the save succeeds — a non-empty N38 group displaces the bank
   fallback, so the account belongs to N39 only. Confirm the Balance Sheet
   agrees.

Record pass/fail per step. BS-P5b and BS-P5c are the cases where a regression
would be silent on the report rather than visibly broken.
