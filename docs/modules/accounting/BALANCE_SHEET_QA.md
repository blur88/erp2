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

**A headless browser covers it, and CI now runs that check.** Playwright's
`emulateMedia({ media: 'print' })` plus `page.pdf()` exercises the genuine print
stylesheet, and `getComputedStyle` over the ancestor chain detects exactly the
height/overflow clamp that caused #1172. The check is committed as
`frontend/e2e/accounting-print.spec.ts` and runs in the CI job
**`Accounting Reports - Print/PDF Gate`** on every PR (#1214).

Run it locally with the **same script CI uses** — it performs the isolation
check, the per-service data-directory ownership prep, the image build, `up` and
the readiness wait, so a local run cannot silently omit a step CI depends on:

    ./scripts/print-gate-up.sh

    cd frontend && npm ci && npx playwright install --with-deps chromium
    cd frontend && PRINT_GATE_BASE_URL=http://localhost:3100 \
      PRINT_GATE_API_URL=http://localhost:3101/api npm run test:print

Dependency/browser install, running the suite and teardown are deliberately
outside the script (CI caches the first and owns the last). The script leaves
the stack **running on failure** so a half-started state can be inspected with
`docker compose -p erp_print_gate -f docker-compose.yml -f
docker-compose.print-gate.yml logs`. Tear down when finished:

    docker compose -p erp_print_gate -f docker-compose.yml -f docker-compose.print-gate.yml down -v --remove-orphans
    docker run --rm --user 0:0 -v "$PWD/.print-gate-data:/gate" alpine:3.23 \
      sh -c 'rm -rf /gate/..?* /gate/.[!.]* /gate/*'
    rmdir .print-gate-data

`.print-gate-data` holds files owned by root, uid 70 and uid 999, so it is
cleared from a container for the same reason it is prepared from one — the
procedure must not require host `sudo`. Note that **only that directory is
mounted**, not the repository root: the container runs `rm -rf` as root, so a
typo in the path must not be able to reach the working tree.

**Rebuild before every re-check.** There is no volume mount for live reload, so
an un-rebuilt frontend image serves a stale bundle and every print assertion
passes vacuously. `./scripts/print-gate-up.sh` rebuilds on each invocation.

**The gate is re-runnable in place — no teardown needed between runs.** Run
`npm run test:print` as many times as you like against the same stack and the
same database. `globalSetup` rotates the admin password only when a rotation is
actually pending, uses run-scoped account codes, and deletes the previous run's
fixture rows before creating its own (both reports aggregate over the whole
database, so without that a second run would read multiplied totals and a P&L
that grows by 17 rows per run). Only tear down when you are finished, or when a
run reports that admin login failed with both passwords.

**The fixture refuses to touch anything but the gate database.** Because it
deletes its prior rows, it first asserts that the *connected* database — read
live with `SELECT current_database()`, not taken from the environment — is
`erp_print_gate`, the database the gate's own compose file creates. A run
pointed anywhere else aborts before the delete with a message naming both the
expected and the actual database, and modifies nothing. `PRINT_GATE_DB_NAME`
still steers which database psql connects to; it cannot authorise writing to a
different one. This mirrors `npm run test:redis`, which likewise refuses to run
without an explicit opt-in checked before it touches anything.

**BS-P3 is now a spot-check, not a required manual gate** (downgraded
2026-09-10, #1217). `Accounting Reports - Print/PDF Gate`
(`frontend/e2e/accounting-print.spec.ts`) is a **required** check on ruleset
15609777, so a change that breaks printing cannot merge.

Both downgrade conditions were satisfied:

1. `Accounting Reports - Print/PDF Gate` is listed in ruleset 15609777's
   required checks — alongside Frontend, Backend and Fresh Database Migrations.
2. It passed on `main`: run
   [34437719336](https://github.com/blur88/erp2/actions/runs/34437719336),
   `event=workflow_dispatch`, `headSha=59bacbd25bd299655053468dae9aad2e01c8be2f`,
   `conclusion=success`, with the gate job itself green.

**What the automated gate does not cover**, and what a spot-check is therefore
still for: it asserts print-media visibility, screen/print text equality, render
order, a multi-page PDF and the #1172 ancestor clamp — all against the Balance
Sheet fixture it builds. It does not look at a report you just changed the shape
of. Run BS-P3 by hand when a change alters print layout, adds rows or sections,
or touches the print stylesheet; the parked caveats from #1215 also still apply
(the clipping assertion carries a 1px tolerance, and P&L sits at exactly 2 pages
against a `>= 2` contract).

`ci.yml` triggers on `pull_request` and `workflow_dispatch` only — there is no
`push` trigger, so a merge to `main` produces no run at all. To validate `main`
deliberately:

```bash
git fetch origin && git rev-parse origin/main   # record THIS as the intended SHA
gh workflow run ci.yml --ref main

# Confirm the run you just dispatched — not an unrelated one. Filter by event,
# and check headSha against the SHA you just recorded.
gh run list --workflow=ci.yml --branch=main --event=workflow_dispatch --limit 1 \
  --json databaseId,headSha,conclusion,url
```

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

## BS-P3 — Print / PDF (#1212) — spot-check (CI-gated)

**The jsdom suite alone cannot satisfy this gate.** Do not mark a Balance
Sheet change verified on the strength of the frontend suite alone — jsdom has no
layout engine and never evaluates `@media print`. The required CI job covers
this path in a real browser; the procedure below is the manual equivalent, for
the cases named above.

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
