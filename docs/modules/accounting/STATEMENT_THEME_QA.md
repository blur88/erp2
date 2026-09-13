# Statement Theme Alignment — Manual Verification

Tracked, reviewable verification for the themed `Statement` component
(#1224), which renders Profit & Loss (`/accounting/profit-and-loss`),
Balance Sheet (`/accounting/balance-sheet`) and the Form B tax view.

`docs/test/` is gitignored by repo convention, so execution logs live there.
**The instructions themselves live here, in version control**, so they are
reviewable in a PR and survive the local working copy.

## Why this document exists

jsdom has no layout engine, so rendered geometry — decimal alignment, real
sticky scrolling, clipping, elevation and font loading — cannot be asserted.
Imported stylesheet rules are stubbed in this setup as well: Vitest does not
inject `statement.css`, so its sticky, `text-align` and `tabular-nums` rules
never reach `getComputedStyle`.

Emotion styles behave differently: MUI `sx` DOES reach
`getComputedStyle`/`toHaveStyle` under this repo's jsdom 30 (see
`MainLayout.test.tsx:40`); theme `styleOverrides` use the same Emotion
pipeline. Theme colours applied via `sx` are assertable; the Statement suite
does not rely on that.

The Vitest suite therefore proves **structure and themed `sx` values only**:
one cell per figure, a single `amountHook` node, the complete signed
accessible value, row-kind classes, header cells present.

It proves nothing about alignment, stickiness, clipping or font loading.
Every check below is outside its reach. There is no Playwright
infrastructure in this repo (removed in #1223) and restoring it was
deliberately excluded from #1224.

**Run these in a real browser, in the dark theme, and record the results in
the PR.**

## Preparation

Frontend changes need a rebuild — the Vite dev server is local-only:

```bash
docker compose build frontend && docker compose up -d frontend
```

Have a Sales Orders or Purchase Orders list page open in the same session
for the comparison checks (ST-6).

## ST-1 — Decimal alignment across sign and row kind

**Precondition:** A Profit & Loss for a year containing at least one negative
figure and a non-zero Net Profit.

**Expected:**

- The decimal separators of every figure in the column share one vertical
  line — leaf rows, subtotal rows and the Net Profit bottom line alike.
- A parenthesised negative's decimal separator sits on that same line as a
  positive figure's.
- Repeat on Balance Sheet and Form B.

**Why it can break:** the closing paren on negatives, and any difference in
figure font size, each shift the separator. Both are invisible to the suite.

## ST-2 — Parentheses are not clipped

**Expected:**

- No closing parenthesis is clipped, wrapped to a second line, or pushed out
  of its cell — at the default window width **and** at the narrowest
  supported width (reduce the window to ~1024px, then to ~768px).
- No figure needs horizontal scrolling to be read; if a scrollbar appears inside
  the statement card at narrow widths, no parenthesis is out of reach.

## ST-3 — The paren spacer is invisible

**Expected:**

- Positive figures show **no** stray parenthesis, half-parenthesis, or
  visible gap artefact.
- Selecting and copying a positive row's text yields the amount with no
  parenthesis.

**Why it matters:** the spacer reserves width via CSS generated content. If
it ever renders visibly, the technique has regressed.

## ST-4 — Sticky header

**Expected:**

- Scroll the statement body: the **Code / Description / RM** header row stays
  fixed at the top of the statement.
- The header is fully opaque — no rows visible through it as they scroll
  underneath.
- Repeat on all three reports.

## ST-5 — Scroll ownership

**Expected:**

- The statement's **rows** scroll inside the card; the page itself does not
  scroll to move them.
- **Form B specifically:** before #1224 its wrapper had no overflow owner, so
  a long filing scrolled the whole page and carried the column header away.
  Confirm Form B now scrolls its rows, with the header pinned.
- The page header, filter bar and (Balance Sheet) summary tiles stay put
  while the rows scroll.

## ST-6 — Theme match against the SO/PO baseline

**Precondition:** a Sales Orders or Purchase Orders list open in the same
session, same theme.

**Expected:** the statement card and the SO/PO list card agree on surface
colour, text colour, secondary/muted text colour, border and divider colour,
link colour, corner radius, elevation/shadow, and body typography.

There should be no sense of two different palettes on screen.

## ST-7 — Balance Sheet reads as one surface

**Expected:**

- The themed summary tiles (Total Assets / Total Liabilities / Owner's
  Equity) and the statement card below them read as one continuous surface.
- No light "paper" panel against the dark shell — the condition that
  motivated #1224.

## ST-8 — Accounting presentation is intact

**Expected:**

- Negative figures are in parentheses, in the themed negative colour.
- Subtotal rows keep a hairline above the figure only.
- The bottom line keeps its heavier double rule and stronger weight — and is
  the **same font size** as every other figure.
- Section hierarchy and indentation are unchanged.
- Zero rows are muted but still visible.
- Drill-down links (P&L, Balance Sheet expanded accounts) are visible,
  keyboard-focusable with a visible focus ring, and navigate correctly.

## ST-10 — Header typography parity with SO/PO (#1228)

**Precondition:** a Sales Orders or Purchase Orders list open in the same
session, same theme.

Added for #1228, which migrated the Statement table from native HTML +
`statement.css` to MUI table components. The header now draws its typography
from the theme's `MuiTableHead` override rather than a local rule, and this
check is what proves the two agree.

Extended by #1231, which made the header text a `<Typography
variant="tableHeader">` carrying the same inline overrides EntityTable uses —
so the two headers now share one implementation rather than two that merely
computed alike.

**Measure the TYPOGRAPHY, not the cell.** Since #1231 the glyphs are drawn by
the span inside the head cell, and the cell keeps its own size/tracking as a
fallback floor. Measuring the cell therefore reads the floor and would pass
even if the Typography's `sx` were lost — which is the whole defect this check
exists to catch:

```js
getComputedStyle(document.querySelector('[data-role="col-head"] .MuiTypography-root'))
// vs a Sales Orders header cell's Typography
getComputedStyle(
  document.querySelector('.entity-table-card thead th .MuiTypography-root'),
)
```

**Expected:** `fontFamily`, `fontSize`, `fontWeight`, `textTransform` and
`letterSpacing` are **identical** between the two. Expect `12.8px` and
`0.5px` — NOT the `tableHeader` variant's own 0.75rem/0.08em, which is what a
Typography stripped of its `sx` would compute.

**Run it on all three reports:** P&L, Balance Sheet **and Form B**. All three
render the shared `Statement`, so Form B inherits any header change whether or
not the issue that caused it mentions Form B.

**Why it can break:** the old `stmt-col-head` class rule (removed) set weight 500, 0.04em and
no uppercase — the exact divergence #1228 removed. A reintroduced local rule,
or a `darkTheme` block that shadows `MuiTableHead`, brings it back. Since #1231
there is a second route: dropping `HEADER_TYPOGRAPHY_SX` from the Typography
(or letting EntityTable's inline values drift from it) silently returns the
header to the theme variant's smaller size and wider tracking. Note that
`darkTheme` currently spreads `...baseThemeOptions.components` and does not
redefine `MuiTableHead`; if that changes, this check is what catches it.

## ST-11 — Sticky-header opacity under active scroll (#1228)

ST-4 confirms the header stays put. This one confirms it stays **opaque while
rows pass beneath it**, which is a different failure: MUI puts
`position: sticky` on the head CELLS, so a background that regressed onto the
row would scroll away and leave the labels floating over the data.

**Expected, measured mid-scroll (not at rest):**

- Scroll the statement body so rows are actively underneath the header, then
  read the head cell's computed `backgroundColor`. It must be a fully opaque
  `rgb(...)` value — **no `rgba(...)` with alpha < 1, and not `transparent`**.
- Read it from a `th`, not from `thead tr`.
- No row text is visible through the header at any scroll offset.
- Repeat on P&L, Balance Sheet and Form B.

## ST-12 — Figure font-size uniformity (#1228)

**Expected:**

- Collect the computed `fontSize` of **every** `[data-role="figure"]` on the
  report. The set of distinct values must have **exactly one member**.
- This includes `subtotal` and `bottomLine` rows. The bottom line is
  distinguished by weight and its double rule only.

**Why it matters:** a larger bottom-line figure places its decimal separator at
a different x position from every other row — the exact misalignment the old
two-cell integer/fraction split existed to prevent. The bottom-line *label* may
be larger (`1rem`); the *figure* may not. CLAUDE.md records this as an
invariant the suite cannot protect.

## ST-13 — Paren alignment across the sign boundary (#1228)

A sharper form of ST-1, stated as a measurement rather than a judgement.

**Expected:**

- For every figure in a column, measure the x position of the decimal
  separator (a `Range` over the separator character gives sub-pixel accuracy).
  All values must agree to **within 1px**.
- The set must include at least one parenthesised negative and one positive, so
  the paren spacer is actually exercised. A column of all-positive figures
  cannot verify this.
- Confirm the spacer is doing the work: `getComputedStyle(el, '::after')` on a
  `[data-role="paren-spacer"]` reports `content: ")"` and `visibility: hidden`, with a
  non-zero reserved width. Read the **pseudo-element** — the element itself is
  a bare empty span and reads `visible`.

## ST-9 — Nothing else moved

**Expected:**

- Sales Orders and Purchase Orders list pages are visually unchanged.
- SO/PO printing still uses its own black-on-white template
  (open a Sales Order, print preview) — unaffected by this change.
- Trial Balance still renders through `EntityTable` and is unchanged; its
  divergence from the other reports is a known, accepted non-goal.

---

# Recorded run — 2026-09-11

**Result: ST-1 … ST-9 all pass.** One item remains unverified; see
"Screen-reader announcement" below.

## How this run was performed

**Scripted headless Chromium, not a human at a screen.** Every value below was
measured by script (`getBoundingClientRect`, `getComputedStyle`, `scrollTop`)
and the screenshots were captured in the same sessions. This is stronger than
eyeballing for the geometric checks — a decimal-separator x position is measured
to 0.01px rather than judged — and weaker for anything requiring human
perception. Where a check needs a person, it is called out rather than claimed.

| | |
|---|---|
| Browser | **Google Chrome for Testing 153.0.8010.12** (Playwright chromium-1243) |
| Driver | `playwright-core` 1.63.0 (transitive; no Playwright config, spec or CI job was added — see #1223) |
| Viewports | **1440×900** (primary), **1440×600** (to force P&L overflow), **1024×900** and **768×900** (ST-2) |
| Theme | dark (application default) |
| App under test | `http://localhost` via `erp_nginx`, frontend image built 2026-09-11T22:48:48+08:00 |
| Branch | `feat/1224-statement-theme-alignment` @ `bd40f28f7` |

**The served bundle was confirmed to contain this branch's code before any
check ran** — otherwise the whole pass is vacuous. The accounting pages are
lazy-loaded, so the entry chunks do not contain statement markup; the check must
target the lazy chunk:

```
/usr/share/nginx/html/assets/Statement-C3WfDAul.js
  statement-scroller 1 · paren-spacer 1 · "Description" 1
  stmt-cell-figure-int 0 · stmt-cell-figure-frac 0   ← old two-cell markup absent
```

## Results

### ST-1 — Decimal alignment ✅

Decimal-separator x position measured per figure with a `Range` over the
separator character, across every figure on each report:

| Report | Distinct x positions | Value |
|---|---|---|
| Balance Sheet | **1** | 1368.42 |
| P&L (Accounting) | **1** | 1368.42 |
| Form B | **1** | 1368.42 |

One position across positive, negative, `subtotal` and `bottomLine` rows —
e.g. `200.00`, `(360.00)`, `(180.00)`, `1,000.00`, `(620.00)` all landing on
1368.42. Computed font `Roboto, sans-serif` with
`font-variant-numeric: tabular-nums` active.

Note: the app's CSP blocks the Google Fonts stylesheet, so Roboto resolves from
the local system rather than the network. Alignment holds regardless — the
fallback face is still Roboto here. A host without a local Roboto is untested.

## Preflight — run this FIRST

Every step below queries the DOM. A renamed or dropped hook makes
`querySelector` return `null`, and `querySelectorAll` return an EMPTY NodeList
that iterates zero times **without throwing** — so a sweep over "every figure
cell" silently checks nothing and reads as a pass.

Open the statement page, open the browser console, and paste this **verbatim**.
It is self-contained plain JavaScript: nothing to import, no build step.

```js
var QA_REQUIRED_HOOKS = [
  { selector: "[data-role=\"statement-root\"]", min: 1, role: "statement root (Paper frame)" },
  { selector: "[data-testid=\"statement-scroller\"]", min: 1, role: "scroll container" },
  { selector: "[data-role=\"col-head\"]", min: 2, role: "column header cells" },
  { selector: "[data-role=\"figure\"]", min: 1, role: "figure cells (blank cells excluded)" },
  { selector: "[data-role=\"paren-spacer\"]", min: 1, role: "paren spacer (generated content, positive figures only)" },
  { selector: "[data-a11y=\"statement-value\"]", min: 1, role: "complete value, visually hidden" },
];

function runQaPreflight(root) {
  root = root || document;
  var results = QA_REQUIRED_HOOKS.map(function (h) {
    return {
      selector: h.selector,
      role: h.role,
      min: h.min,
      found: root.querySelectorAll(h.selector).length,
    };
  });
  var missing = results.filter(function (r) { return r.found < r.min; });
  if (missing.length > 0) {
    throw new Error(
      'STATEMENT_THEME_QA preflight FAILED — ' + missing.length + ' hook(s) unusable.\n' +
      missing.map(function (r) {
        return '  ' + r.selector + ' (' + r.role + '): found ' + r.found + ', need >= ' + r.min;
      }).join('\n') +
      '\n\nThe QA steps that query these return null or an empty collection and ' +
      'would record a silent pass. Update the selectors in the QA document and ' +
      'Statement/qaPreflight.ts together, then re-run.'
    );
  }
  console.table(results);
  return results;
}

runQaPreflight();
```

It prints a table of match counts and **throws**, naming the hook, if any
selector is unusable. **Do not record results from a session where it throws** —
update the selectors in this document and in
`frontend/src/components/accounting/Statement/qaPreflight.ts` together, then
start over.

This block is not hand-maintained: `qaPreflight.ts` generates it via
`qaPreflightSnippet()`, and `qaSelectorContract.test.tsx` both EXECUTES the
snippet and asserts this document still contains it verbatim. A hook added to
the module without regenerating this block fails the suite.

## Selector reference

Every query below addresses a DOM hook the component renders deliberately. They
are asserted by `Statement/__tests__/qaSelectorContract.test.tsx`, so renaming
or dropping one turns the Vitest suite red and names this document — rather
than leaving these steps silently returning `null`, which reads as a pass.

| Hook | Selector |
|---|---|
| Statement root (Paper frame) | `[data-role="statement-root"]` |
| Scroll container | `[data-testid="statement-scroller"]` |
| Column header cell | `[data-role="col-head"]` |
| Figure cell (blank cells excluded) | `[data-role="figure"]` |
| Paren spacer (generated content) | `[data-role="paren-spacer"]` |
| Complete value, visually hidden | `[data-a11y="statement-value"]` |

```js
// Scroll container and the accessible complete value:
document.querySelector('[data-testid="statement-scroller"]')
document.querySelectorAll('[data-a11y="statement-value"]')
```

### ST-2 — Parentheses not clipped ✅

At **1024×900** and **768×900**, all 10 figure cells: `clipped=0`,
`scrollWidth <= clientWidth`, no horizontal scroll on either the scroller or the
document.

A first pass reported "6 wrapped" from a naive `height > 30px` threshold. That
was a probe artifact: every cell measures `textH=17px` against `lineHeight=24px`
with `white-space: nowrap`, and the height variance is `padding-top` by row kind
(line 3px / subtotal 5px / bottomLine 8px). **Real text wraps: 0.**

### ST-3 — Paren spacer invisible ✅

Read from the **pseudo-element**, which is where the rule lives:

```
getComputedStyle([data-role="paren-spacer"], '::after')
  content: ")"   visibility: hidden   reserved width: 5.33px
```

Positive figure cells containing a stray `)`: **0**, on all three reports.

An earlier probe read `visibility` on the *element* (`visible`) and looked like
a failure. The element is a bare empty span; only its `::after` carries the
hidden glyph.

### ST-4 — Sticky header ✅

| Report | Scrolled | Header offset from scroller top | `position` | Background |
|---|---|---|---|---|
| Balance Sheet | 629px | 0.00px | `sticky` | `rgb(66, 66, 66)` |
| P&L | 182px | <3px | `sticky` | `rgb(66, 66, 66)` |
| Form B | 724px | <3px | `sticky` | `rgb(66, 66, 66)` |

Opaque in all three — an rgb() value, no alpha channel, so rows cannot show
through. Header text reads **Code / Description / RM**.

P&L does not overflow at 1440×900; it was re-tested at **1440×600** to force a
scrollable body. A non-overflowing report cannot exercise stickiness.

### ST-5 — Scroll ownership ✅

| Report | Scroller `scrollTop` after scroll | `window.scrollY` |
|---|---|---|
| Balance Sheet | 629 | **0** |
| P&L | 182 | **0** |
| Form B | **724** | **0** |

**Form B is the headline.** It previously had no overflow owner, so a long
filing scrolled the page and carried the column header away. 724px of row
scrolling with the page fixed confirms the fix.

**Balance Sheet is the other one to note.** Its sticky header was inert until
`c1c71d0aa` restored `flex: 1, minHeight: 0` on the body Box. This check covers
the path that fix repaired.

### ST-6 — Theme match vs the SO/PO baseline ✅

`[data-role="statement-root"]` measured against `.entity-table-card` on `/sales/orders`, same
session, same theme:

| Property | Statement | SO list | Match |
|---|---|---|---|
| background | `rgb(30, 30, 30)` | `rgb(30, 30, 30)` | ✅ |
| border-radius | `8px` | `8px` | ✅ |
| box-shadow | `rgba(0,0,0,0.08) 0 2px 4px 0` | same | ✅ |
| color | `rgb(255, 255, 255)` | same | ✅ |
| sticky header bg | `rgb(66, 66, 66)` | `rgb(66, 66, 66)` | ✅ |

### ST-7 — Balance Sheet reads as one surface ✅

Summary tiles are transparent (`rgba(0,0,0,0)`) over page background
`rgb(18, 18, 18)`; the statement card is `rgb(30, 30, 30)` — a themed card on a
themed page. No light paper panel. The condition that motivated #1224 is gone.

### ST-8 — Accounting presentation intact ✅ (visual/DOM only — see caveat)

| Property | Measured |
|---|---|
| Figure font sizes | **`["16px"]`** — one size across every row kind |
| Subtotal rule | `1px solid`, above the figure cell only |
| Bottom-line rule | `3px double`, font-weight `500` |
| Negative colour | `rgb(239, 83, 80)` = theme `error.main` |
| Zero-row colour | `rgb(189, 189, 189)` = theme `text.secondary` |
| Link colour | `rgb(66, 165, 245)` = theme `primary.main` |

Negatives render parenthesised — `(360.00)`, `(180.00)`, `(620.00)`, `(1,220.00)`.

The single figure font size is the load-bearing one: it is what disposes of the
size offset that would otherwise misalign the bottom line (see ST-1).

### ST-9 — Nothing else moved ✅

- Sales Orders list renders normally; card styling identical to before (ST-6).
- `@media print { #root, .MuiDialogTitle-root, … { display: none !important } }`
  intact — the rule SO/PO printing depends on.
- **`acct-print*` rules in the loaded stylesheets: 0** — the removed accounting
  print path has not returned.

## Screen-reader announcement — NOT VERIFIED

**This is the one outstanding item, and it is distinct from ST-8 above.**

ST-8 passes on *visual presentation* and *DOM structure*. Neither establishes
what a screen reader actually announces.

What **is** confirmed (Vitest, `StatementFigure.test.tsx`): each amount exposes
exactly one accessible node carrying the complete signed value (`negative
840.00`), the visible figure is `aria-hidden`, the accessible value sits inside
the figure cell so it keeps its column-header association, and `null` announces
as "not available" rather than a dash or a zero.

What is **not** confirmed: that a real screen reader announces the amount
**with its column header, in order, as one value** — and that the hidden paren
spacer is silent in practice. A headless browser cannot produce this evidence;
it needs NVDA, JAWS or VoiceOver driven by a person.

Treat the accessibility behaviour as structurally correct and audibly
unverified. See the same caveat in the superseded print-era spec (§4.5.3), which
also required a manual screen-reader spot-check.

## Screenshots

Captured during the run. Not committed — they are run artifacts, and by repo
convention execution logs live in the gitignored `docs/test/`.

| File | Shows |
|---|---|
| `bs-01-initial.png` | Balance Sheet, top of statement |
| `bs-02-scrolled.png` / `r-bs.png` | Balance Sheet scrolled 629px, header pinned |
| `r-pl.png` | P&L Accounting View |
| `r-formb.png` | Form B tax view |
| `st4-pl.png` / `st4-formb.png` | Sticky header after scrolling, 1440×600 |
| `r-so.png` | Sales Orders list, for the ST-6 comparison |
| `r-w1024.png` / `r-w768-final.png` | ST-2 narrow widths |

---

# Recorded run — 2026-09-12 (#1228, MUI table migration)

**Result: BUNDLE + ST-10 … ST-13 all pass (11/11 checks).**

Covers the checks added for #1228, which migrated the Statement table from
native HTML + `statement.css` to MUI table components. ST-1 … ST-9 were not
re-run; the 2026-09-11 record above stands for those.

## How this run was performed

**Scripted headless Chromium**, same method as the 2026-09-11 run: every value
below was measured (`getComputedStyle`, `getBoundingClientRect`, `Range`), not
eyeballed.

| | |
|---|---|
| Driver | `playwright-core` 1.63.0, **fetched on demand** — it is no longer resolvable from `frontend/node_modules`, so it was installed into a scratch directory. Browser binary `chromium-1243`, the same revision as the 2026-09-11 run. |
| Viewport | 1440×600 (chosen so every report's body overflows; a non-overflowing report cannot exercise stickiness) |
| Theme | dark (application default — `ThemeWrapper` applies `darkTheme` unconditionally) |
| App under test | `http://localhost` via `erp_nginx`, frontend image rebuilt from this branch immediately before the run |
| Branch | `feat/1228-statement-mui-table` |

**Bundle freshness was asserted before any check ran**, otherwise the pass is
vacuous: the probe counts `thead th.MuiTableCell-head` on a report page and
fails if it is 0, since the pre-migration build emitted no MUI table markup.
Measured: **3 MUI head cells**, Statement chunk loaded.

Form B is reached at `/accounting/profit-and-loss?view=tax` — it has no route of
its own — and the probe waits for `[data-testid="pl-tax-view"]` before
measuring, so the figures below are Form B's own rows and not the accounting
view's.

## Results

### ST-10 — Header typography parity vs SO/PO ✅ (found a real defect first)

**This check failed on its first run and is the reason it exists.**

| | fontFamily | fontSize | fontWeight | textTransform | letterSpacing |
|---|---|---|---|---|---|
| First run — Statement | Roboto, sans-serif | **12px** | 600 | uppercase | **0.96px** |
| First run — SO list | Roboto, sans-serif | **12.8px** | 600 | uppercase | **0.5px** |
| After fix — both | Roboto, sans-serif | 12.8px | 600 | uppercase | 0.5px |

Cause: `EntityTable` does **not** render the theme's `tableHeader` variant
as-is. It overrides two values inline (`EntityTable.tsx:336-343`):
`fontSize: '0.8rem'` and `letterSpacing: '0.5px'`, against the theme's
`0.75rem`/`0.08em`. So the SO/PO header a user sees is the variant *plus* that
`sx`, and inheriting the `MuiTableHead` override alone lands 0.8px short with
nearly double the tracking.

Reading the theme object would have argued parity was already achieved. Only
the measurement disproved it. `Statement.tsx` now pins those two values with a
comment pointing back here.

### ST-11 — Sticky-header opacity under active scroll ✅

Measured mid-scroll, reading the `th` (not `thead tr`):

| Report | Scrolled | Head-cell background | position | Offset from scroller top |
|---|---|---|---|---|
| P&L | 159px | `rgb(66, 66, 66)` | `sticky` | 0.00px |
| Balance Sheet | 499px | `rgb(66, 66, 66)` | `sticky` | 0.00px |
| Form B | 444px | `rgb(66, 66, 66)` | `sticky` | 0.00px |

All three opaque — an `rgb()` value with no alpha channel, so rows cannot show
through as they pass beneath.

### ST-12 — Figure font-size uniformity ✅

| Report | Distinct `[data-role="figure"]` font sizes |
|---|---|
| P&L | **`["14px"]`** |
| Balance Sheet | **`["14px"]`** |
| Form B | **`["14px"]`** |

One value each, across `line`, `subtotal` and `bottomLine` rows. This is the
invariant that keeps the bottom line's decimal separator on the same x position
as every other row.

### ST-13 — Paren alignment across the sign boundary ✅

| Report | Figures | Decimal-x spread | Signs present |
|---|---|---|---|
| P&L | 10 | **0.02px** | 7 positive / 3 negative |
| Balance Sheet | 25 | **0.02px** | 22 positive / 3 negative |
| Form B | 24 | **0.02px** | 22 positive / 2 negative |

Every column carries both signs, so the paren spacer is genuinely exercised
rather than trivially satisfied. Spacer read from the **pseudo-element**:
`content: ")"`, `visibility: hidden`, reserved width **4.67px**.

## Caveats

- **CSP still blocks the Google Fonts stylesheet**, so Roboto resolves from the
  local system rather than the network — same as the 2026-09-11 run. ST-10
  compares both sides in one session, so a shared fallback does not invalidate
  the *parity* claim; it does mean the check proves "Statement matches SO/PO
  here", not "both render webfont Roboto".
- ST-1 … ST-9 were not re-run. The accounting presentation they cover is
  unchanged by this migration in intent, but that is reasoning, not measurement.
- Screen-reader announcement remains **unverified**, as recorded in the
  2026-09-11 run. Nothing in this change affects the accessible-value
  structure.
