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

Emotion styles behave differently: MUI `sx` and theme `styleOverrides` DO
reach `getComputedStyle`/`toHaveStyle` under this repo's jsdom 30 (see
`MainLayout.test.tsx:40`). Theme colours applied via `sx` are assertable;
the Statement suite does not rely on that.

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

## ST-9 — Nothing else moved

**Expected:**

- Sales Orders and Purchase Orders list pages are visually unchanged.
- SO/PO printing still uses its own black-on-white template
  (open a Sales Order, print preview) — unaffected by this change.
- Trial Balance still renders through `EntityTable` and is unchanged; its
  divergence from the other reports is a known, accepted non-goal.
