# Balance Sheet — Manual Verification

Tracked, reviewable verification procedures for the LHDN Borang B Part N Balance
Sheet report (`/accounting/balance-sheet`).

`docs/test/` is gitignored by repo convention ("Local-only test docs"), so
execution logs and run-by-run results live there. **The instructions themselves
live here, in version control**, so they are reviewable in a PR and survive the
local working copy.

## What the Vitest suite cannot cover — and what can

jsdom has no layout engine and does not evaluate `@media print`. The frontend
suite can assert that a row exists in the printable subtree and is not marked
`data-print-hide`, but it **cannot** prove the row is visible on paper, lands on
the right page, or is not clipped by an ancestor height/overflow constraint.

This is a real, previously-costly blind spot: during #1172 the report tree was
`display: none` while two rounds of overflow fixes were applied downstream of
it, and every automated gate stayed green throughout.

**A headless browser can cover it.** Playwright's `emulateMedia({ media:
'print' })` plus `page.pdf()` exercises the genuine print stylesheet, and
`getComputedStyle` over the ancestor chain detects exactly the height/overflow
clamp that caused #1172. Playwright is **not** a dependency of this repo, so the
run below is performed ad hoc against a locally rebuilt stack. Promoting it to a
committed, CI-run check is a worthwhile follow-up and is not done here.

Until then BS-P3 is executed per change — by the browser procedure below, or by
a human reviewing a multi-page print preview.

---

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

## BS-P3 — Print / PDF (#1212) — REQUIRED BEFORE MERGE

**This is the gate no automated test can stand in for.** Do not mark a Balance
Sheet change verified on the strength of the frontend suite alone.

**Precondition:** BS-P1 passed. Open the browser print preview (Ctrl/Cmd-P) on a
report long enough to span **more than one page**, and review **every** page.

**Expected:**

- Both derived subtotal rows appear in the printed output.
- Their printed amounts are identical to the on-screen amounts.
- Both appear after N50 and before the Balance Check panel, matching screen order.
- The three-line Balance Check comparison is present on paper.
- The report is not clipped to a single viewport, and no page is blank.
- Expanded ledger detail (`data-print-hide`) is absent from the printed output.

### BS-P3 browser procedure

With the stack rebuilt (`docker compose build frontend backend && docker compose
up -d`), drive a real browser: log in, open
`/accounting/balance-sheet?year=<year>`, then

1. `page.emulateMedia({ media: 'print' })` and assert each derived row reports
   `isVisible() === true` with a non-zero bounding box;
2. re-read the row text under print media and assert it is **identical** to the
   screen text;
3. `page.pdf({ format: 'A4' })` on a report spanning more than one page;
4. walk the ancestor chain of `[data-testid="bs-print-block"]` with
   `getComputedStyle`, asserting no ancestor imposes `overflow != visible`, a
   `vh` height, or a `max-height` — the #1172 clamp;
5. assert the bottom of the last element is within `document.scrollHeight`.

**Result:** ✅ PASS — executed 2026-09-09 against a locally rebuilt stack
(frontend + backend images rebuilt from this branch).

Evidence:

- Print media: both derived rows `visible=true`, boxes `1232x29` at y1232 and
  y1261; Balance Check `1232x139` at y1306.
- Screen/print equality: `TOTAL OWNER'S EQUITY MYR 1,580.00` and
  `TOTAL LIABILITIES AND OWNER'S EQUITY MYR 1,580.00` identical in both media.
- Order: `bs-row-N50 > bs-derived-owners-equity >
  bs-derived-liabilities-and-equity > bs-balance-check`.
- N-codes on derived rows: 0.
- PDF: 2 pages rendered.
- Clipping: printable block 1357px vs viewport 900px, **no** constraining
  ancestors, last element bottom 1445 within scrollHeight 1469.
- Page errors: none.

Live API cross-check (`/api/accounting/balance-sheet?year=2026`):
`N46 2800.0000 + N50 -1220.0000 = ownersEquity 1580.0000`;
`N45 0.0000 + 1580.0000 = liabilitiesAndEquity 1580.0000`, equal to
`totalAssets 1580.0000` with `difference 0.0000`; `rows` length 23.
