import { test, expect, type Page, type TestInfo } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { PDFDocument } from 'pdf-lib'
import { readDescriptor } from './fixtures/print-fixture'
import {
  capturePrintPdf,
  assertPrintableTallerThanViewport,
  assertNoAncestorClamps,
  assertNoContentClipping,
  assertLastElementWithinScrollHeight,
  assertExactAmount,
  assertAllRowsRenderInBothMedia,
  assertScreenVisiblePrintHidden,
  renderAndAssertPdf,
  renderOrder,
} from './helpers/print-assertions'
import {
  extractPdfText,
  pdfLines,
  locateRows,
  rowCandidates,
  derivePairs,
  hasCodeToken,
  type PdfTextItem,
  type ExpectedRow,
  type RowIdentity,
} from './helpers/pdf-text'

const descriptor = readDescriptor()

/**
 * Independent, serialized tests (workers: 1, fullyParallel: false) sharing one
 * globalSetup fixture. Deliberately NOT test.describe.serial: that skips
 * remaining tests after a failure, which would suppress the second report's
 * diagnostics — and both reports must report on every run.
 */

/**
 * Capture the print PDF whenever a test fails, so a clamp or visibility
 * failure still ships the paper output. Saving only at the end of the happy
 * path would preserve nothing for exactly the failures this gate exists to
 * catch.
 *
 * capturePrintPdf never throws, so this cannot mask the original error; the
 * hook is also wrapped, because a hook that throws would replace the failure
 * with its own.
 */
test.afterEach(async ({ page }, testInfo) => {
  if (testInfo.status === testInfo.expectedStatus) return
  const name = `${testInfo.title.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-FAILED`
  try {
    await capturePrintPdf(page, testInfo, name)
    // Write-then-attach, mirroring capturePrintPdf: with the list/json
    // reporters an in-memory (body-only) attachment is dropped, so the PNG
    // must hit disk explicitly to survive the run.
    const pngPath = path.join('e2e-results', `${name}.png`)
    mkdirSync(path.dirname(pngPath), { recursive: true })
    writeFileSync(pngPath, await page.screenshot({ fullPage: true }))
    await testInfo.attach(`${name}.png`, { path: pngPath, contentType: 'image/png' })
  } catch {
    // Never let diagnostics displace the real failure.
  }
})

async function login(page: Page) {
  await page.goto('/login')
  // descriptor.password: globalSetup rotated off the seeded Admin@123! (fresh
  // seeds force a mandatory UI password change that would otherwise gate
  // every report route). See print-fixture.ts.
  await page.fill('input[name="usernameOrEmail"]', 'admin')
  await page.fill('input[name="password"]', descriptor.password)
  await page.click('button[type="submit"]')
  await page.waitForURL((u) => !u.pathname.includes('login'), { timeout: 30000 })
}

/**
 * Exact per-account row locator. P&L rows are `pl-row-${rowId}` and rowId is
 * `account:${accountId}` (profit-and-loss.classify.ts:354). Verified in Task 6
 * Step 2 — if the template has changed, fix this to match the component.
 */
const plRowSelector = (accountId: string) => `[data-testid="pl-row-account:${accountId}"]`

/**
 * Wait for the Form B tax view to be FULLY LOADED before capturing.
 *
 * `pl-tax-view` is the view wrapper and renders before the query settles —
 * the third instance of the same trap as `bs-print-block` and
 * `pl-accounting-view`. A capture taken then yields a one-page PDF of section
 * heads, which fails the multi-page assertion intermittently (observed ~1 run
 * in 4 locally).
 *
 * The period line is the discriminator: ProfitAndLossPage renders
 * `periodLabel(year, formVersion)` ONLY when `taxQuery.currentData` exists and
 * otherwise falls back to `Year ${year}` (ProfitAndLossPage.tsx:166-169).
 *
 * Match "Year of Assessment", which BOTH periodLabel branches emit
 * (formBRows.ts:69-73) — the "presented using Form B YA N" suffix appears only
 * when the form version differs from the year, so matching it alone would hang
 * whenever they agree.
 */
async function waitForFormBLoaded(page: Page) {
  await page.waitForSelector('[data-testid="pl-tax-view"]', { timeout: 30000 })
  await page.waitForSelector('.stmt-cell-figure-frac', { timeout: 30000 })
  await expect(
    page.locator('.acct-print-header'),
    'the Form B period line must come from the payload (periodLabel), not the ' +
      '`Year N` fallback that renders before the query settles',
  ).toContainText(/Year of Assessment \d{4}/, { timeout: 30000 })
}

/**
 * Wait for the Balance Sheet to be FULLY LOADED before capturing a PDF.
 *
 * `bs-print-block` is the outer wrapper and renders IMMEDIATELY, before the
 * query settles — so waiting on it proves only that the route mounted. A
 * capture taken then catches the pre-data state, and BalanceSheetPage renders
 * `report?.asOfDate ?? `${year}-12-31`` (BalanceSheetPage.tsx:195), so that
 * state carries a plausible-looking but WRONG period line.
 *
 * That is what turned the expansion-invariance test red in CI (run
 * 34545301311): the collapsed capture produced a 1-line PDF dated 2026-12-31
 * while the expanded capture had 92 lines dated 2026-09-11. Two captures of
 * different load states, compared as if they differed only by expansion.
 *
 * Two conditions, because either alone is insufficient:
 *   1. a real report ROW is present — proves rows rendered, not just the shell;
 *   2. the period line shows the SERVER's as-of date — proves the data is this
 *      year's report and not the fallback. The backend computes
 *      `min(businessToday, yearEnd)` (balance-sheet.service.ts:43), so for the
 *      current year the loaded value is TODAY and provably differs from the
 *      `${year}-12-31` fallback.
 */
async function waitForBalanceSheetLoaded(page: Page, year: number) {
  // A row that exists on every Balance Sheet regardless of fixture data.
  await page.waitForSelector('[data-testid="bs-row-N41"]', { timeout: 30000 })

  const expectedAsOf = expectedAsOfDate(year)
  await expect(
    page.locator('.acct-print-header'),
    `Balance Sheet must render the server's as-of date (${expectedAsOf}); ` +
      'a different date means the capture caught the pre-data fallback',
  ).toContainText(`As at ${expectedAsOf}`, { timeout: 30000 })
}

/**
 * Wait for the Profit & Loss to be FULLY LOADED before measuring or capturing.
 *
 * `pl-accounting-view` is the view wrapper and renders before the query
 * settles — the same trap as the Balance Sheet's `bs-print-block`. Worse here,
 * because `useFilterBar` revalidates the year against the response's
 * `availableYears` and REWRITES the URL when the query has not settled: a
 * capture taken too early can be a different YEAR's report.
 *
 * Observed in the font-fallback test, which blocks fonts.googleapis.com and so
 * shifts load timing: the probe found 0 figure cells and `location.href` had
 * lost its `?year=` parameter entirely.
 *
 * Two conditions:
 *   1. a real figure cell exists — proves account rows rendered, not just the
 *      section heads a pre-data render produces;
 *   2. the print header reports the requested YEAR — proves the render is the
 *      year we asked for, not one a revalidation reset us to.
 *
 * Deliberately NOT a check on the URL's `?year=` parameter. The page strips it
 * when it equals the default, because a bare URL is the canonical form for the
 * current year — so asserting the parameter survives fails on correct
 * behaviour. The rendered period line is the year that was actually used.
 */
async function waitForProfitAndLossLoaded(page: Page, year: number) {
  await page.waitForSelector('[data-testid="pl-accounting-view"]', { timeout: 30000 })
  await page.waitForSelector('.stmt-cell-figure-frac', { timeout: 30000 })
  await expect(
    page.locator('.acct-print-header'),
    `the P&L must render year ${year}; a different year means the filter ` +
      'revalidated against an unsettled query',
  ).toContainText(`Year ${year}`, { timeout: 30000 })
}

/**
 * The as-of date the BACKEND will report for `year`: `min(businessToday,
 * yearEnd)` (balance-sheet.service.ts:43). Computed here independently of the
 * page, so the wait compares against an expectation rather than against
 * whatever the page happens to show.
 */
function expectedAsOfDate(year: number): string {
  const yearEnd = `${year}-12-31`
  const now = new Date()
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
    now.getDate(),
  ).padStart(2, '0')}`
  return today < yearEnd ? today : yearEnd
}

/**
 * The exact SIGNED figure `formatCurrency` renders for a 4dp backend amount.
 *
 * formatCurrency passes the decimal string straight to
 * `Intl.NumberFormat('en-MY')` at 2dp, which groups by thousands and renders a
 * negative with a LEADING MINUS (verified on the gate stack: "MYR -250.00").
 * Parentheses never occur, so nothing here produces or accepts them.
 *
 * The previous helper returned the ABSOLUTE value and a separate `negative`
 * flag, which is what let the sign be asserted loosely and separately — the
 * root of review finding 3. This returns one signed string that assertions
 * match exactly.
 */
const signedAmount = (fourDp: string): string => {
  const negative = fourDp.trim().startsWith('-')
  // 'en-MY' mirrors formatCurrency's `Intl.NumberFormat('en-MY')` deliberately.
  // These agree with 'en-US' for every value this fixture produces, so the
  // previous 'en-US' was not a live defect — but it made the expectation side
  // and the render side agree by accident of two locales matching, and a locale
  // change on either would turn every amount assertion red for a formatting
  // reason rather than a financial one. Stating the coupling costs nothing.
  const magnitude = Math.abs(parseFloat(fourDp)).toLocaleString('en-MY', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  // -0.00 is never rendered: Intl formats a zero as "0.00" either way.
  if (!negative || parseFloat(fourDp) === 0) return magnitude
  return `-${magnitude}`
}

/** Negate a 4dp decimal string without going through a float. */
const negate4dp = (fourDp: string) =>
  fourDp.trim().startsWith('-') ? fourDp.trim().slice(1) : `-${fourDp.trim()}`

/**
 * The accessible rendering of an amount: the sign is LEXICAL there, because
 * parentheses are unreliably announced and straddle two cells (spec §4.5.3).
 * Use this whenever the selector targets the statement's `stmt-a11y-only`
 * node; `signedAmount()` stays for visible-text comparisons.
 */
const spokenAmount = (fourDp: string): string => {
  const magnitude = signedAmount(fourDp).replace(/^-/, '')
  return fourDp.trim().startsWith('-') ? `negative ${magnitude}` : magnitude
}

test('Balance Sheet prints N38, N48 and all three balance-check lines', async ({ page }, testInfo) => {
  await login(page)
  await page.goto(`/accounting/balance-sheet?year=${descriptor.year}`)
  await waitForBalanceSheetLoaded(page, descriptor.year)

  // ---- Anti-vacuity: EXACT SIGNED amounts, per row, BEFORE print work. ---
  // Explicitly declared expectations; never derived from the components'
  // hiding rules, which would let accidental hiding pass.
  //
  // Every figure on this report is determined by the fixture's total expense
  // (verified against the live API on the gate stack):
  //   N38 Bank Balance                = -total   (BANK-channel payments)
  //   N41 TOTAL ASSETS                = -total
  //   N45 TOTAL LIABILITIES           =  0.00    (the fixture creates none)
  //   N48 Current-year Profit / Loss  = -total
  //   N50 Current Account Carried Fwd = -total
  //   derived owner's equity          = -total
  //   derived liabilities and equity  = -total
  //   check assets / check L&E        = -total
  //   difference                      =  0.00    (balanced)
  const loss = signedAmount(descriptor.expected.currentYearLossN48)
  const bank = signedAmount(descriptor.expected.bankMovementN38)
  const zero = signedAmount('0.0000')
  // The a11y node states the sign lexically; the visible cells use parens.
  const spokenLoss = spokenAmount(descriptor.expected.currentYearLossN48)
  const spokenBank = spokenAmount(descriptor.expected.bankMovementN38)

  // Amount elements, not whole rows. `[data-testid="bs-row-N48"]` includes the
  // label "Current-year Profit / Loss", whose hyphen satisfied the old
  // unanchored `/^\(|-/` sign check even when the amount was POSITIVE. Each
  // official row carries a child `[data-testid="bs-amount"]` — the single node
  // whose text is the complete amount (now the statement's accessible value).
  const bsAmount = (line: string) =>
    `[data-testid="bs-row-${line}"] [data-testid="bs-amount"]`
  // The derived subtotals carry the same single-node hook as official rows.
  const bsDerivedAmount = (testId: string) =>
    `[data-testid="${testId}"] [data-testid="bs-amount"]`

  await assertExactAmount(page, bsAmount('N38'), spokenBank)
  await assertExactAmount(page, bsAmount('N41'), spokenBank)
  await assertExactAmount(page, bsAmount('N45'), zero)
  await assertExactAmount(page, bsAmount('N48'), spokenLoss)
  await assertExactAmount(page, bsAmount('N50'), spokenLoss)

  // The derived subtotals (#1212) must show the COMPUTED figure, not merely
  // exist: `expectedText: ''` on these rows previously asserted nothing.
  await assertExactAmount(page, bsDerivedAmount('bs-derived-owners-equity'), spokenLoss)
  await assertExactAmount(
    page,
    bsDerivedAmount('bs-derived-liabilities-and-equity'),
    spokenLoss,
  )

  // All three balance-check figures, each by its own test id and its own exact
  // value. They render through the plain formatter, so they keep the SIGNED
  // rendering (leading minus), not the statement's lexical sign.
  await assertExactAmount(page, '[data-testid="bs-check-assets"]', bank)
  await assertExactAmount(page, '[data-testid="bs-check-liabilities-equity"]', bank)
  await assertExactAmount(page, '[data-testid="bs-difference-value"]', zero)

  // ---- Screen/print equality + visibility, EVERY asserted row. -----------
  // One pass per media mode, all failures collected, so a print rule that
  // drops or blanks any of these is named rather than masked by the first.
  await assertAllRowsRenderInBothMedia(page, [
    { selector: bsAmount('N38'), expectedText: spokenBank },
    { selector: bsAmount('N41'), expectedText: spokenBank },
    { selector: bsAmount('N45'), expectedText: zero },
    { selector: bsAmount('N48'), expectedText: spokenLoss },
    { selector: bsAmount('N50'), expectedText: spokenLoss },
    { selector: '[data-testid="bs-row-N38"]', expectedText: spokenBank },
    { selector: '[data-testid="bs-row-N48"]', expectedText: spokenLoss },
    { selector: '[data-testid="bs-row-N50"]', expectedText: spokenLoss },
    { selector: '[data-testid="bs-derived-owners-equity"]', expectedText: spokenLoss },
    {
      selector: '[data-testid="bs-derived-liabilities-and-equity"]',
      expectedText: spokenLoss,
    },
    { selector: '[data-testid="bs-check-assets"]', expectedText: bank },
    { selector: '[data-testid="bs-check-liabilities-equity"]', expectedText: bank },
    { selector: '[data-testid="bs-difference-value"]', expectedText: zero },
  ])
  // (assertAllRowsRenderInBothMedia leaves print media emulated.)

  // Nothing on the printed Balance Sheet may be geometrically clipped. Long
  // amounts and long labels both live in `bs-amount`'s row, and ellipsis
  // truncation does not change innerText, so the equality pass above cannot
  // see it (review finding 1).
  // Every figure-bearing element on the report, not just the official rows: the
  // derived subtotals and the three balance-check spans render their amounts
  // outside both `bs-row-*` and `bs-amount`, so neither of the original two
  // selectors reached them. The scan now also walks each match's text-bearing
  // DESCENDANTS, which is where a row's LABEL actually lives (a Typography
  // inside a nested flex Box, BalanceSheetPage.tsx:270).
  await assertNoContentClipping(
    page,
    '[data-testid="bs-print-block"]',
    [
      '[data-testid^="bs-row-"]',
      '[data-testid="bs-amount"]',
      '[data-testid="bs-derived-owners-equity"]',
      '[data-testid="bs-derived-liabilities-and-equity"]',
      '[data-testid="bs-check-assets"]',
      '[data-testid="bs-check-liabilities-equity"]',
      '[data-testid="bs-difference-value"]',
    ].join(', '),
  )

  await assertPrintableTallerThanViewport(page, '[data-testid="bs-print-block"]')

  // The #1216 print order: the derived pair sits between N49 and N50, and N50
  // — the memo carried-forward figure — prints AFTER the grand total.
  //
  // renderOrder() silently DROPS a selector that matches nothing, so a missing
  // row would shorten the array rather than fail on order. The toEqual below
  // pins all five, which catches that — but assert presence first so a missing
  // element reports as missing rather than as a confusing order mismatch.
  for (const sel of [
    '[data-testid="bs-row-N49"]',
    '[data-testid="bs-row-N50"]',
    '[data-testid="bs-derived-owners-equity"]',
    '[data-testid="bs-derived-liabilities-and-equity"]',
    '[data-testid="bs-balance-check"]',
  ]) {
    await expect(page.locator(sel)).toHaveCount(1)
  }

  expect(
    await renderOrder(page, [
      '[data-testid="bs-row-N49"]',
      '[data-testid="bs-row-N50"]',
      '[data-testid="bs-derived-owners-equity"]',
      '[data-testid="bs-derived-liabilities-and-equity"]',
      '[data-testid="bs-balance-check"]',
    ]),
  ).toEqual([
    '[data-testid="bs-row-N49"]',
    '[data-testid="bs-derived-owners-equity"]',
    '[data-testid="bs-derived-liabilities-and-equity"]',
    '[data-testid="bs-row-N50"]',
    '[data-testid="bs-balance-check"]',
  ])

  // The #1172 detector.
  await assertNoAncestorClamps(page, '[data-testid="bs-print-block"]')
  await assertLastElementWithinScrollHeight(page, '[data-testid="bs-balance-check"]')

  // Always render and RETAIN the PDF as evidence, even where no page-count
  // contract applies — a failure should ship the actual paper output.
  //
  // TASK 3 DECISION: BS is 2 pages even at zero-data baseline (invariant
  // block 1313.78); its 23-row form cannot shrink via fixture changes, so
  // assert >= 2 unconditionally.
  await renderAndAssertPdf(page, testInfo, 'balance-sheet-print', 2)
})

test('Profit & Loss prints every fixture account across multiple pages', async ({ page }, testInfo) => {
  await login(page)
  await page.goto(`/accounting/profit-and-loss?year=${descriptor.year}`)
  await waitForProfitAndLossLoaded(page, descriptor.year)
  // pl-accounting-view is the outer container: present during the loading
  // skeleton too, so it does NOT prove rows arrived (locator.count() does not
  // auto-wait and would race the load). Rows render in one pass from the
  // loaded statement, so the last fixture account row proves the full list.
  await expect(
    page.locator(plRowSelector(descriptor.accounts[descriptor.accounts.length - 1].id)),
    'last fixture account row must render',
  ).toBeVisible({ timeout: 30000 })

  // ---- Anti-vacuity: EVERY expected account and amount. ------------------
  // Not "at least one": a partially rendered report is a defect, and the
  // fixture volume exists precisely so all of them must appear.
  const view = page.locator('[data-testid="pl-accounting-view"]')
  // Deliberately NO whole-report innerText buffer here any more. The last
  // consumer was the vacuous `toContain(totalMagnitude)` (see below); a
  // substring search over the whole report is exactly how one row's figure
  // comes to satisfy another row's assertion.

  // Presence is asserted by exact row locator — one row per fixture account —
  // and each row's own text must carry that account's amount. Substring
  // searches over the whole report would let one row's figure satisfy
  // another's assertion.
  const missing: string[] = []
  const wrongAmount: string[] = []
  for (const a of descriptor.accounts) {
    const row = page.locator(plRowSelector(a.id))
    // Single evaluation: count() does not auto-wait, so calling it twice
    // (once in the check, once in the message) can report a stale value.
    const rowCount = await row.count()
    if (rowCount !== 1) {
      missing.push(`${a.code} (count=${rowCount})`)
      continue
    }
    const rowText = (await row.innerText()).replace(/\s+/g, ' ')
    if (!rowText.includes(a.name)) missing.push(`${a.code} (name absent from its row)`)
    if (!rowText.includes(signedAmount(a.amount))) {
      wrongAmount.push(`${a.code}: expected ${a.amount}, row read "${rowText}"`)
    }
  }
  // The grouped parent must render too, as a summary row carrying the child's
  // total. Its postable CHILD is intentional print-hidden detail and is
  // asserted by the drill-down test, not here.
  const groupRow = page.locator(plRowSelector(descriptor.group.parentId))
  const groupCount = await groupRow.count()
  if (groupCount !== 1) {
    missing.push(`${descriptor.group.parentCode} grouped parent (count=${groupCount})`)
  } else {
    const groupText = (await groupRow.innerText()).replace(/\s+/g, ' ')
    if (!groupText.includes(descriptor.group.parentName)) {
      missing.push(`${descriptor.group.parentCode} (grouped parent name absent from its row)`)
    }
    if (!groupText.includes(signedAmount(descriptor.group.amount))) {
      wrongAmount.push(
        `${descriptor.group.parentCode}: expected ${descriptor.group.amount}, row read "${groupText}"`,
      )
    }
  }

  expect(
    missing,
    `every fixture account must render exactly one row; ${missing.length} of ${descriptor.accounts.length + 1} failed`,
  ).toEqual([])
  expect(wrongAmount, 'every fixture account row must render its own amount').toEqual([])

  // Totals, not just rows. Net profit is the EXACT signed figure: the fixture
  // creates only expenses, so net profit is the negated total. Asserting the
  // magnitude alone (the old `total.grouped`) would accept a profit of the
  // same size as the loss — a sign error on the report's headline number.
  //
  // The visible cells render negative as (1,956.03); `pl-amount` addresses the
  // accessible node, whose sign is LEXICAL, so expectations are spoken.
  const netProfit = spokenAmount(negate4dp(descriptor.expected.totalExpense))
  const totalExpenses = spokenAmount(descriptor.expected.totalExpense)

  // Total Expenses on its OWN element, exact and signed.
  //
  // This line was `expect(rendered, ...).toContain(totalMagnitude)` against the
  // whole report's innerText, and it could not fail: net profit renders as
  // "MYR -1,956.03", which CONTAINS "1,956.03", and the very next line asserts
  // that net-profit figure is present and exact. So Total Expenses could be
  // absent, blank or carrying a different number and the check still passed —
  // satisfied by a different row that a different assertion already guaranteed.
  // It is the one target from finding 3's list that survived the round, with
  // only its variable renamed.
  //
  // The section total has its own id: classify.ts emits
  // `totalRowId: '${key}.total'` and the view renders
  // data-testid="pl-row-expenses.total". `td:last-child` is now the FRACTIONAL
  // cell, so the single `pl-amount` hook carries the whole figure.
  await assertExactAmount(
    page,
    '[data-testid="pl-row-expenses.total"] [data-testid="pl-amount"]',
    totalExpenses,
  )
  await assertExactAmount(
    page,
    '[data-testid="pl-row-netProfit"] [data-testid="pl-amount"]',
    netProfit,
  )

  // ---- Screen/print equality + visibility for EVERY fixture account. -----
  // NOT a first/middle/last spread (review finding 2): that left twelve of the
  // fifteen accounts with no print-visibility assertion, so hiding any of them
  // under print media passed while the PDF stayed two pages. Chromium also
  // confirmed a hidden element's innerText can still return its text, so
  // `assertAllRowsRenderInBothMedia` decides visibility from rendered geometry
  // and computed style over the whole ancestor chain, not from text.
  //
  // Each P&L row carries data-testid="pl-row-${node.rowId}" and rowId is
  // `account:${accountId}` (profit-and-loss.classify.ts:354), so the fixture's
  // own account id yields an exact, unique locator. No substring text
  // matching: a code like "9601" is a substring of "96011".
  await assertAllRowsRenderInBothMedia(page, [
    ...descriptor.accounts.map((a) => ({
      selector: plRowSelector(a.id),
      expectedText: signedAmount(a.amount),
    })),
    // The grouped parent prints as a summary row; its postable child is
    // intentional print-hidden detail and is asserted in the drill-down test.
    { selector: plRowSelector(descriptor.group.parentId), expectedText: signedAmount(descriptor.group.amount) },
    { selector: '[data-testid="pl-row-expenses.total"]', expectedText: totalExpenses },
    { selector: '[data-testid="pl-row-netProfit"]', expectedText: netProfit },
  ])
  await assertPrintableTallerThanViewport(page, '[data-testid="pl-accounting-view"]')

  // Long fixture names must survive into print-visible rows — as TEXT...
  const printedText = (await view.innerText()).replace(/\s+/g, ' ')
  expect(printedText, 'long fixture account names must render in print').toContain(
    descriptor.accounts[0].name,
  )
  // ...and as PAINTED GLYPHS. The check above is satisfied by a name that is
  // present in the DOM but ellipsis-truncated on paper: `text-overflow` does
  // not change innerText, and a Chromium probe with print-only
  // `width:80px; overflow:hidden; text-overflow:ellipsis` passed both the text
  // equality and `toBeVisible()` (review finding 1). Clipping is therefore
  // detected geometrically, on the account-name cells AND their in-report
  // ancestors — the deliberately long fixture names are what make a clip
  // overflow far enough to be unambiguous.
  await assertNoContentClipping(
    page,
    '[data-testid="pl-accounting-view"]',
    'tr[data-testid^="pl-row-"] td',
  )

  await assertNoAncestorClamps(page, '[data-testid="pl-accounting-view"]')
  await assertLastElementWithinScrollHeight(page, '[data-testid="pl-row-netProfit"]')

  // Unconditional: fixture volume is sized so P&L exceeds one A4 page.
  const pages = await renderAndAssertPdf(page, testInfo, 'profit-and-loss-print', 2)
  console.log(`profit-and-loss print PDF: ${pages} pages`)
})

test('drill-down detail is visible on screen and hidden in print', async ({ page }) => {
  await login(page)
  await page.goto(`/accounting/profit-and-loss?year=${descriptor.year}`)
  await waitForProfitAndLossLoaded(page, descriptor.year)

  // P&L drill-down detail rows (.stmt-row--detail) exist only as children
  // of an expanded NON-POSTABLE group (profitAndLossRows.ts sets printDetail
  // only at depth > 0; assembleSections emits children only under a
  // non-postable category).
  //
  // This leg was previously CONDITIONAL — `if (plHasGroups)` — and the flat
  // fixture guaranteed the condition was false, so it never ran on any run: a
  // missing expander read as success, and deleting the detail-row print rule
  // would have escaped detection entirely (review finding 4). The fixture now
  // creates a real grouped account, so the expander is fixture-guaranteed and
  // this is REQUIRED: no skip path remains.
  //
  // NOTE on waiting: locator.count() does NOT auto-wait, so a bare count()
  // here races the report load and reads 0 on a slow first paint. Playwright's
  // web-first `toBeVisible` assertion settles that race with a bounded wait.
  const groupExpander = page.locator(`[data-testid="pl-expand-account:${descriptor.group.parentId}"]`)
  await expect(
    groupExpander,
    `the fixture's grouped expense account (${descriptor.group.parentCode}) must render an ` +
      `expander; without it there is no .stmt-row--detail to assert and this test is inert`,
  ).toBeVisible({ timeout: 30000 })

  await groupExpander.click()

  // The child row must actually appear, and it must be the FIXTURE's child —
  // a bare `.stmt-row--detail` count could be satisfied by unrelated detail
  // from some other group.
  const childRow = page.locator(plRowSelector(descriptor.group.childId))
  await expect(
    childRow,
    'expanding the grouped account must reveal the fixture child row',
  ).toBeVisible({ timeout: 10000 })
  await expect(
    childRow,
    'the revealed child row must carry .stmt-row--detail — that class is the ' +
      'print hook the hiding rule targets',
  ).toHaveClass(/(^|\s)stmt-row--detail(\s|$)/)

  // The property under test: visible on screen, genuinely hidden in print.
  await assertScreenVisiblePrintHidden(page, plRowSelector(descriptor.group.childId))
  await assertScreenVisiblePrintHidden(page, '.stmt-row--detail')

  // The same print-detail mechanism, asserted on the Balance Sheet where each
  // mapped line's account drill-down is marked printDetail.
  // N38 anchors this leg: the fixture always pays through a BANK-channel
  // method, so N38 (Bank Balance) always carries that account and its
  // expander is fixture-guaranteed — no silent skip when it is absent.
  await page.emulateMedia({ media: 'screen' })
  await page.goto(`/accounting/balance-sheet?year=${descriptor.year}`)
  await waitForBalanceSheetLoaded(page, descriptor.year)
  await expect(page.locator('[data-testid="bs-expand-N38"]'), 'N38 drill-down must exist').toBeVisible({
    timeout: 10000,
  })
  await page.locator('[data-testid="bs-expand-N38"]').click()
  await expect(page.locator('[data-testid="bs-accounts-N38"]')).toBeVisible({ timeout: 10000 })
  await assertScreenVisiblePrintHidden(page, '[data-testid="bs-accounts-N38"]')
})

/*
 * ---------------------------------------------------------------------------
 * ORDERED EXPECTED-ROW INVENTORIES — one per report.
 *
 * Each entry carries a stable identity (`code` + `label`) and a `kind`. From
 * these, `derivePairs()` produces EVERY heading→first-row and
 * preceding-row→subtotal pair, and `locateRows()` requires each row exactly
 * once. The PDF is used only to LOCATE identified rows, never to decide what
 * to expect.
 *
 * There are no ambiguity exceptions: `code` distinguishes Form B's uncoded
 * "Cost of Sales" heading from its N7 subtotal of the same label, and the
 * Balance Sheet's section "Investments" from row N33.
 *
 * TRANSCRIBED FROM THE TAXONOMY — regenerate and diff before trusting them:
 *   Form B:        backend/src/modules/accounting/services/form-b.categories.ts
 *   Balance Sheet: backend/src/modules/accounting/services/balance-sheet.lines.ts
 *   P&L:           frontend/src/pages/accounting/profitAndLossRows.ts
 * ---------------------------------------------------------------------------
 */

/**
 * P&L, in render order. Section headings are uncoded; leaf account rows are
 * fixture-dependent and appended at runtime (see the test).
 */
const PL_INVENTORY: ExpectedRow[] = [
  { code: null, label: 'Revenue', kind: 'section' },
  // fixture revenue accounts are spliced in here
  { code: null, label: 'Total Revenue', kind: 'subtotal' },
  { code: null, label: 'Cost of Sales', kind: 'section' },
  { code: null, label: 'Inventory Adjustments', kind: 'line' },
  { code: null, label: 'Total Cost of Sales', kind: 'subtotal' },
  { code: null, label: 'Gross Profit', kind: 'subtotal' },
  { code: null, label: 'Other Income', kind: 'section' },
  { code: null, label: 'Total Other Income', kind: 'subtotal' },
  { code: null, label: 'Operating Expenses', kind: 'section' },
  // fixture expense accounts are spliced in here
  { code: null, label: 'Total Expenses', kind: 'subtotal' },
  { code: null, label: 'Net Profit', kind: 'bottomLine' },
]

/** LHDN Borang B Part N, N28–N50 — all 23 rows, in taxonomy order. */
const BS_INVENTORY: ExpectedRow[] = [
  { code: null, label: 'Non-current Assets', kind: 'section' },
  { code: 'N28', label: 'Land and Buildings', kind: 'line' },
  { code: 'N29', label: 'Plant and Machinery', kind: 'line' },
  { code: 'N30', label: 'Vehicles', kind: 'line' },
  { code: 'N31', label: 'Other Non-current Assets', kind: 'line' },
  { code: 'N32', label: 'Total Non-current Assets', kind: 'subtotal' },
  { code: null, label: 'Investments', kind: 'section' },
  { code: 'N33', label: 'Investments', kind: 'line' },
  { code: null, label: 'Current Assets', kind: 'section' },
  { code: 'N34', label: 'Inventory', kind: 'line' },
  { code: 'N35', label: 'Trade Debtors', kind: 'line' },
  { code: 'N36', label: 'Other Debtors', kind: 'line' },
  { code: 'N37', label: 'Cash Balance', kind: 'line' },
  { code: 'N38', label: 'Bank Balance', kind: 'line' },
  { code: 'N39', label: 'Other Current Assets', kind: 'line' },
  { code: 'N40', label: 'Total Current Assets', kind: 'subtotal' },
  { code: 'N41', label: 'TOTAL ASSETS', kind: 'subtotal' },
  { code: null, label: 'Liabilities', kind: 'section' },
  { code: 'N42', label: 'Loans and Overdrafts', kind: 'line' },
  { code: 'N43', label: 'Trade Creditors', kind: 'line' },
  { code: 'N44', label: 'Other Creditors', kind: 'line' },
  { code: 'N45', label: 'TOTAL LIABILITIES', kind: 'subtotal' },
  { code: null, label: "Owner's Equity", kind: 'section' },
  { code: 'N46', label: 'Capital Account', kind: 'line' },
  { code: 'N47', label: 'Current Account Brought Forward', kind: 'line' },
  { code: 'N48', label: 'Current-year Profit / Loss', kind: 'line' },
  // Derived presentation subtotals, rendered between N49 and N50 (#1212/#1216).
  // Uncoded: they are NOT LHDN fields.
  { code: 'N49', label: 'Drawings / Advances (Net)', kind: 'line' },
  { code: null, label: "TOTAL OWNER'S EQUITY", kind: 'subtotal' },
  { code: null, label: "TOTAL LIABILITIES AND OWNER'S EQUITY", kind: 'subtotal' },
  { code: 'N50', label: 'Current Account Carried Forward', kind: 'subtotal' },
]

/** Form B, all 25 statutory lines plus the four section headings. */
const FORMB_INVENTORY: ExpectedRow[] = [
  { code: null, label: 'Sales / Revenue', kind: 'section' },
  { code: 'N3', label: 'Sales / Turnover', kind: 'line' },
  { code: null, label: 'Cost of Sales', kind: 'section' },
  { code: 'N4', label: 'Opening Inventory', kind: 'line' },
  { code: 'N5', label: 'Purchases and Production Costs', kind: 'line' },
  { code: 'N6', label: 'Closing Inventory', kind: 'line' },
  // Same LABEL as the section heading above; the CODE is what distinguishes it.
  { code: 'N7', label: 'Cost of Sales', kind: 'subtotal' },
  { code: 'N8', label: 'Gross Profit / Loss', kind: 'subtotal' },
  { code: null, label: 'Other Income', kind: 'section' },
  { code: 'N9', label: 'Other Business', kind: 'line' },
  { code: 'N10', label: 'Dividends', kind: 'line' },
  { code: 'N11', label: 'Interest and Discounts', kind: 'line' },
  { code: 'N12', label: 'Rent, Royalties and Premiums', kind: 'line' },
  { code: 'N13', label: 'Other Income', kind: 'line' },
  { code: 'N14', label: 'Total Other Income', kind: 'subtotal' },
  { code: null, label: 'Expenses', kind: 'section' },
  { code: 'N15', label: 'Loan Interest', kind: 'line' },
  { code: 'N16', label: 'Salaries and Wages', kind: 'line' },
  { code: 'N17', label: 'Rent / Lease', kind: 'line' },
  { code: 'N18', label: 'Contract and Subcontract', kind: 'line' },
  { code: 'N19', label: 'Commission', kind: 'line' },
  { code: 'N20', label: 'Bad Debts', kind: 'line' },
  { code: 'N21', label: 'Travel and Transportation', kind: 'line' },
  { code: 'N22', label: 'Repairs and Maintenance', kind: 'line' },
  { code: 'N23', label: 'Promotion and Advertising', kind: 'line' },
  { code: 'N24', label: 'Other Expenses', kind: 'line' },
  { code: 'N25', label: 'Total Expenses', kind: 'subtotal' },
  { code: 'N26', label: 'Net Profit / Loss', kind: 'subtotal' },
  { code: 'N27', label: 'Disallowed Expenses', kind: 'line' },
]

/**
 * The A4 box Chromium actually emits in this environment: 595.92 x 842.88pt.
 * That is its mm→pt conversion of 210x297mm (the exact 595.28 x 841.89 values
 * round down), verified against the saved PDFs. Pinned to the produced box so
 * `toBeCloseTo(..., 0)` is decisive; a Letter page (612 x 792) differs by far
 * more than the 0.5pt tolerance on BOTH axes.
 */
const A4_WIDTH_PT = 595.92
const A4_HEIGHT_PT = 842.88

async function capturePdfAndText(page: Page, testInfo: TestInfo, name: string) {
  const pdfPath = path.join('e2e-results', `${name}.pdf`)
  await page.emulateMedia({ media: 'print' })
  const bytes = await page.pdf({ format: 'A4', path: pdfPath })
  await testInfo.attach(`${name}.pdf`, { path: pdfPath, contentType: 'application/pdf' })
  const doc = await PDFDocument.load(bytes, { updateMetadata: false })
  const items = await extractPdfText(pdfPath)
  expect(items.length, `${name}: PDF text extraction returned nothing`).toBeGreaterThan(0)
  return { doc, items, pdfPath }
}

/**
 * Fetch the Form B payload the page is rendering, so expectations are derived
 * from the API rather than from the DOM.
 *
 * AUTHENTICATION: the backend's JWT strategy reads a BEARER HEADER
 * (`ExtractJwt.fromAuthHeaderAsBearerToken()`, jwt.strategy.ts:26) — it does
 * not read cookies, so `credentials: 'include'` alone yields 401. The app
 * injects the header from Redux `state.auth.accessToken` (services/api.ts:40),
 * and redux-persist mirrors that slice to
 * `localStorage['persist:erp-app']` (PERSIST_KEY = 'erp-app', auth is
 * whitelisted). Read it from there, the same source the app uses.
 */
async function fetchFormB(page: Page, year: number) {
  const payload = await page.evaluate(async (y) => {
    // redux-persist stores each whitelisted slice as a JSON STRING inside the
    // outer JSON object, so the auth slice needs a second parse.
    const raw = localStorage.getItem('persist:erp-app')
    if (!raw) throw new Error('no persisted redux state; is the session logged in?')
    const auth = JSON.parse(JSON.parse(raw).auth ?? '{}')
    const token = auth?.accessToken
    if (!token) throw new Error('no accessToken in persisted auth state')

    // Route verified against form-b.controller.ts:
    // @Controller('accounting/profit-and-loss/form-b')
    const res = await fetch(`/api/accounting/profit-and-loss/form-b?year=${y}`, {
      headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
    })
    if (!res.ok) throw new Error(`form-b fetch failed: ${res.status} ${await res.text()}`)
    return res.json()
  }, year)

  // ApiService wraps some responses as { data }, others are bare — accept both.
  const body = (payload?.data ?? payload) as {
    rows: {
      line: string
      accounts?: { code: string; name: string; isActive: boolean }[]
      cohorts:
        | {
            explicit: { code: string; name: string; isActive: boolean }[]
            fallback: { code: string; name: string; isActive: boolean }[]
          }
        | null
    }[]
  }
  expect(Array.isArray(body?.rows), 'form-b payload must carry rows').toBe(true)
  return body
}

function assertA4(doc: PDFDocument, name: string) {
  for (const [i, p] of doc.getPages().entries()) {
    expect(p.getWidth(), `${name} page ${i + 1} width`).toBeCloseTo(A4_WIDTH_PT, 0)
    expect(p.getHeight(), `${name} page ${i + 1} height`).toBeCloseTo(A4_HEIGHT_PT, 0)
  }
}

/**
 * The whole structural check for one report: completeness THEN grouping.
 *
 * `locateRows` throws unless every inventory row appears exactly once, so a
 * missing or duplicated row fails before any positional assertion runs.
 * `derivePairs` then yields every promised adjacency from the inventory order
 * — no hand-picked subset.
 */
function assertStructure(
  items: PdfTextItem[],
  inventory: readonly ExpectedRow[],
  report: string,
) {
  const located = locateRows(items, inventory)
  const pageOf = (row: RowIdentity) =>
    located.find((l) => l.code === row.code && l.label === row.label)?.page

  const pairs = derivePairs(inventory)
  expect(pairs.length, `${report}: inventory must yield grouping pairs`).toBeGreaterThan(0)

  for (const { row, neighbour, because } of pairs) {
    expect(
      pageOf(row),
      `${report}: ${because} — "${row.label}" landed on page ${pageOf(row)}, ` +
        `"${neighbour.label}" on page ${pageOf(neighbour)}`,
    ).toBe(pageOf(neighbour))
  }

  return located
}

test('Profit & Loss: A4, multi-page, complete, and every promised row stays grouped', async ({
  page,
}, testInfo) => {
  await login(page)
  await page.goto(`/accounting/profit-and-loss?year=${descriptor.year}`)
  await waitForProfitAndLossLoaded(page, descriptor.year)

  const { doc, items } = await capturePdfAndText(page, testInfo, 'pl-pagination')

  // Multi-page is a FIXTURE CALIBRATION property (Step 1), not a structural
  // guarantee, and not evidence about clipping — completeness detects missing
  // content.
  expect(doc.getPageCount(), 'P&L fixture must span multiple A4 pages').toBeGreaterThan(1)
  assertA4(doc, 'pl-pagination')

  /*
   * Splice EVERY print-visible fixture row into the inventory, in render
   * order, so they are covered by the same exactly-once and grouping rules as
   * the structural rows.
   *
   * This is load-bearing for grouping, not just completeness: `derivePairs`
   * pairs a subtotal with the row IMMEDIATELY BEFORE it in the inventory, so
   * an omitted printed row makes it pair with the wrong neighbour and the
   * assertion stops describing the layout.
   *
   * What prints, per print-fixture.ts:
   *  - every flat fixture account (postable leaves at depth 0);
   *  - the GROUPED PARENT (non-postable, depth 0, carries the expand control);
   *  - NOT the grouped child — depth 1 carries printDetail, so it is
   *    screen-only and must NOT be expected on paper.
   *
   * The P&L sorts account rows by CODE, and the fixture's codes are
   * run-scoped and sequential, so sorting by code reproduces render order.
   * Both fixture names are deliberately long enough to WRAP when printed;
   * `pdfLines` reassembles a wrapped label's fragments, and a wrapped row that
   * fails to reassemble surfaces here as a missing row.
   */
  const printedExpenseRows: ExpectedRow[] = [
    ...descriptor.accounts.map((a) => ({ code: a.code, label: a.name, kind: 'line' as const })),
    {
      code: descriptor.group.parentCode,
      label: descriptor.group.parentName,
      kind: 'line' as const,
    },
  ].sort((a, b) => a.code.localeCompare(b.code))

  const at = PL_INVENTORY.findIndex((r) => r.label === 'Total Expenses')
  const inventory = [
    ...PL_INVENTORY.slice(0, at),
    ...printedExpenseRows,
    ...PL_INVENTORY.slice(at),
  ]

  const located = assertStructure(items, inventory, 'P&L')

  // The grouped CHILD is screen-only detail and must never reach paper.
  expect(
    hasCodeToken(items, descriptor.group.childCode),
    'the grouped child is print-detail and must not appear in the PDF',
  ).toBe(0)

  expect(located.length, 'every inventory row must have been located').toBe(inventory.length)
})

test('Balance Sheet: A4, multi-page, complete taxonomy, and every promised row stays grouped', async ({
  page,
}, testInfo) => {
  await login(page)
  await page.goto(`/accounting/balance-sheet?year=${descriptor.year}`)
  await waitForBalanceSheetLoaded(page, descriptor.year)

  const { doc, items } = await capturePdfAndText(page, testInfo, 'bs-pagination')

  expect(doc.getPageCount(), 'Balance Sheet fixture must span multiple A4 pages').toBeGreaterThan(1)
  assertA4(doc, 'bs-pagination')

  assertStructure(items, BS_INVENTORY, 'Balance Sheet')
})

test('Form B: A4, multi-page, complete taxonomy, and every promised row stays grouped', async ({
  page,
}, testInfo) => {
  await login(page)
  await page.goto(`/accounting/profit-and-loss?year=${descriptor.year}&view=tax`)
  await waitForFormBLoaded(page)

  const { doc, items } = await capturePdfAndText(page, testInfo, 'formb-pagination')

  expect(doc.getPageCount(), 'Form B fixture must span multiple A4 pages').toBeGreaterThan(1)
  assertA4(doc, 'formb-pagination')

  /*
   * Cohorts PRINT UNCONDITIONALLY (spec §5.2) — they are the classification
   * audit trail — so they are intervening printed rows and belong in the
   * inventory. Omitting them would leave `derivePairs` pairing a statutory
   * subtotal with the line above it when a cohort block actually sits between
   * the two, so the grouping assertion would stop describing the layout.
   *
   * THE EXPECTATION COMES FROM THE API, NOT THE RENDERED PAGE. Reading cohort
   * membership or labels out of the DOM would let a missing or misplaced
   * cohort delete or redefine its own expectation — the assertion would pass
   * on exactly the defect it exists to catch. The Form B response already
   * carries the classification (`row.accounts[]`, `row.cohorts.{explicit,
   * fallback}`, each with `code` and `name`), so fetch it and derive the
   * expected rows independently.
   */
  const formB = await fetchFormB(page, descriptor.year)

  /*
   * Cohort emission order, read off `formBRows.ts:155-196` — deterministic:
   *   - `row.cohorts` present: the explicit block then the fallback block,
   *     each preceded by a heading ONLY when BOTH blocks are non-empty;
   *   - otherwise: `row.accounts` in payload order;
   *   - a row with no contributors emits nothing.
   *
   * Cohort rows carry the contributing account's OWN CODE (`cohortRow` sets
   * `code: ref.code`), and an inactive account's label gains " (inactive)".
   * Heading rows carry an empty code, which parses back as no code.
   */
  const cohortRowsFor = (row: (typeof formB.rows)[number]): ExpectedRow[] => {
    const asRow = (ref: { code: string; name: string; isActive: boolean }): ExpectedRow => ({
      code: ref.code,
      label: ref.isActive ? ref.name : `${ref.name} (inactive)`,
      kind: 'line',
    })
    if (row.cohorts) {
      const { explicit, fallback } = row.cohorts
      const both = explicit.length > 0 && fallback.length > 0
      return [
        ...(explicit.length > 0
          ? [
              ...(both
                ? [{ code: null, label: 'Mapped to this line', kind: 'line' as const }]
                : []),
              ...explicit.map(asRow),
            ]
          : []),
        ...(fallback.length > 0
          ? [
              ...(both
                ? [
                    {
                      code: null,
                      label: 'Unmapped — filed here by default',
                      kind: 'line' as const,
                    },
                  ]
                : []),
              ...fallback.map(asRow),
            ]
          : []),
      ]
    }
    return (row.accounts ?? []).map(asRow)
  }

  const byLine = new Map(formB.rows.map((r) => [r.line, r]))
  const inventory: ExpectedRow[] = []
  for (const row of FORMB_INVENTORY) {
    inventory.push(row)
    const payloadRow = row.code ? byLine.get(row.code) : undefined
    if (payloadRow) inventory.push(...cohortRowsFor(payloadRow))
  }

  /*
   * Anti-vacuity: the fixture seeds expense accounts, so the response MUST
   * classify at least one of them onto some line. A payload that classified
   * nothing would yield an inventory of statutory lines only, and this test
   * would silently stop checking cohorts at all.
   */
  const fixtureCodes = new Set(descriptor.accounts.map((a) => a.code))
  const cohortCodes = inventory.filter((r) => r.code && fixtureCodes.has(r.code))
  expect(
    cohortCodes.length,
    'the Form B response must classify the fixture accounts as cohorts; ' +
      'an empty cohort set would make this test check nothing',
  ).toBeGreaterThan(0)

  assertStructure(items, inventory, 'Form B')
})

test('Profit & Loss: expanding detail does not change printed content', async ({
  page,
}, testInfo) => {
  await login(page)
  await page.goto(`/accounting/profit-and-loss?year=${descriptor.year}`)
  await waitForProfitAndLossLoaded(page, descriptor.year)

  const collapsed = await capturePdfAndText(page, testInfo, 'pl-collapsed')
  const collapsedText = collapsed.items.map((i) => i.text).join('\n')

  await page.emulateMedia({ media: 'screen' })
  const toggles = page.locator('[data-testid^="pl-expand-"]')
  const count = await toggles.count()
  // The fixture's grouped account guarantees at least one (print-fixture.ts:
  // "The grouped drill-down. Always present — the P&L hiding test REQUIRES it").
  expect(count, 'fixture must contain at least one expandable group').toBeGreaterThan(0)
  for (let i = 0; i < count; i += 1) await toggles.nth(i).click()

  // Prove the expansion actually revealed the child ON SCREEN, or the
  // comparison below is vacuous — two identical PDFs of nothing.
  await expect(
    page.locator(`text=${descriptor.group.childCode}`).first(),
    'expanding must reveal the grouped child on screen',
  ).toBeVisible({ timeout: 10000 })

  const expanded = await capturePdfAndText(page, testInfo, 'pl-expanded')
  const expandedText = expanded.items.map((i) => i.text).join('\n')

  expect(expandedText, 'printed P&L must not vary with screen expansion state').toBe(
    collapsedText,
  )
  // And specifically: the child that IS visible on screen must NOT be on paper.
  expect(
    hasCodeToken(expanded.items, descriptor.group.childCode),
    'expanded detail must not print',
  ).toBe(0)
})

test('Balance Sheet: expanding account links does not change printed content', async ({
  page,
}, testInfo) => {
  await login(page)

  // INSTRUMENTATION: record every balance-sheet API response so a failure can
  // be attributed to the payload rather than guessed at.
  const apiLog: { when: string; url: string; status: number; asOfDate?: string }[] = []
  page.on('response', async (res) => {
    if (!res.url().includes('/api/accounting/balance-sheet')) return
    let asOfDate: string | undefined
    try {
      const body = await res.json()
      asOfDate = (body?.data ?? body)?.asOfDate
    } catch {
      /* non-JSON or already consumed */
    }
    apiLog.push({ when: new Date().toISOString(), url: res.url(), status: res.status(), asOfDate })
  })

  await page.goto(`/accounting/balance-sheet?year=${descriptor.year}`)
  await waitForBalanceSheetLoaded(page, descriptor.year)

  const periodAt = async () =>
    (await page.locator('.acct-print-header').innerText().catch(() => '')).replace(/\s+/g, ' ').trim()

  const collapsedPeriod = await periodAt()
  const collapsed = await capturePdfAndText(page, testInfo, 'bs-collapsed')
  const collapsedText = collapsed.items.map((i) => i.text).join('\n')

  await page.emulateMedia({ media: 'screen' })
  const toggles = page.locator('[data-testid^="bs-expand-"]')
  const count = await toggles.count()
  expect(count, 'fixture must contain at least one expandable line').toBeGreaterThan(0)
  for (let i = 0; i < count; i += 1) await toggles.nth(i).click()

  // Prove something was actually revealed on screen first.
  await expect(
    page.locator('[data-testid^="bs-accounts-"]').first(),
    'expanding must reveal an account group on screen',
  ).toBeVisible({ timeout: 10000 })

  const expandedPeriod = await periodAt()
  const expanded = await capturePdfAndText(page, testInfo, 'bs-expanded')
  const expandedText = expanded.items.map((i) => i.text).join('\n')

  if (expandedText !== collapsedText) {
    const collapsedLines = collapsedText.split('\n')
    const expandedLines = expandedText.split('\n')
    const onlyExpanded = expandedLines.filter((l) => !collapsedLines.includes(l))
    const onlyCollapsed = collapsedLines.filter((l) => !expandedLines.includes(l))
    await testInfo.attach('bs-expansion-diagnosis.json', {
      body: JSON.stringify(
        {
          collapsedPeriod,
          expandedPeriod,
          collapsedLineCount: collapsedLines.length,
          expandedLineCount: expandedLines.length,
          onlyInExpanded: onlyExpanded.slice(0, 40),
          onlyInCollapsed: onlyCollapsed.slice(0, 40),
          apiLog,
          toggleCount: count,
        },
        null,
        2,
      ),
      contentType: 'application/json',
    })
  }

  // Separate mechanism from the P&L (data-print-hide → printDetail), so the
  // P&L's assertion does not cover this.
  expect(expandedText, 'printed Balance Sheet must not vary with expansion').toBe(
    collapsedText,
  )
})

test('Balance Sheet capture waits for data even when the API is slow', async ({
  page,
}, testInfo) => {
  /*
   * REGRESSION GUARD for the CI failure in run 34545301311.
   *
   * The bug was a race: `bs-print-block` renders before the query settles, so a
   * capture taken on that signal caught the pre-data fallback. It reproduced
   * only on the slower CI runner, which makes it exactly the kind of defect
   * that returns silently.
   *
   * This test DELAYS the Balance Sheet response deliberately, so the race is
   * guaranteed rather than incidental. Against the old wrapper-only wait the
   * first capture lands on the fallback state and the expansion comparison
   * fails; against `waitForBalanceSheetLoaded` it cannot.
   */
  await page.route('**/api/accounting/balance-sheet**', async (route) => {
    // Long enough that a wrapper-only wait certainly captures too early, short
    // enough to stay inside the 30s selector timeouts.
    await new Promise((resolve) => setTimeout(resolve, 3000))
    await route.continue()
  })

  await login(page)
  await page.goto(`/accounting/balance-sheet?year=${descriptor.year}`)

  // The wrapper is present almost immediately — this is the signal the old
  // code trusted, and it proves nothing about the data.
  await page.waitForSelector('[data-testid="bs-print-block"]', { timeout: 30000 })

  // The correct wait blocks until rows AND the server's as-of date are present.
  await waitForBalanceSheetLoaded(page, descriptor.year)

  const { items } = await capturePdfAndText(page, testInfo, 'bs-delayed')
  const text = items.map((i) => i.text).join('\n')

  // The capture carries the real report, not the fallback shell.
  expect(
    text,
    'a capture taken after the proper wait must carry the loaded report',
  ).toContain('TOTAL ASSETS')
  expect(
    text,
    "the capture must show the server's as-of date, not the ${year}-12-31 fallback",
  ).toContain(`As at ${expectedAsOfDate(descriptor.year)}`)
  // More than a shell: the full taxonomy rendered.
  expect(
    items.length,
    'a loaded Balance Sheet must produce substantially more than a shell',
  ).toBeGreaterThan(50)
})

test('Form B: screen-hidden cohorts still print exactly once each', async ({
  page,
}, testInfo) => {
  await login(page)
  await page.goto(`/accounting/profit-and-loss?year=${descriptor.year}&view=tax`)
  await waitForFormBLoaded(page)

  /*
   * Expected cohorts come from the FIXTURE, not from the page: reading a token
   * out of the DOM and then finding it in the PDF proves only that the two
   * agree, which they would even if the page rendered one cohort out of ten.
   * Every fixture account contributes to some Form B line, so every one must
   * appear on paper.
   */
  const expectedCohorts = descriptor.accounts.map((a) => a.code)
  expect(expectedCohorts.length, 'fixture must seed accounts to assert on').toBeGreaterThan(0)

  /*
   * Count only lines that are a STATEMENT row for the code — i.e. the code as
   * a complete token AND a trailing figure. The findings panel legitimately
   * prints every unmapped account as a labelled paragraph (code, then a
   * wrapped name, no figure), so a bare substring count would read 2 per
   * account and say nothing about the cohort.
   */
  const cohortLineCount = (items: PdfTextItem[], code: string) =>
    pdfLines(items).filter(
      (l) =>
        l.text.split(' ').includes(code) &&
        /(?:\d[\d,]*\s?\.\d{2}|—)\)?$/.test(l.text),
    ).length

  /*
   * Cohorts are ALWAYS screen-hidden in the tax view: the statutory lines are
   * the whole screen, and there is no expansion affordance to change that
   * (formBRows marks every line expandable: false). The printed filing must
   * still carry the classification audit trail for every one of them.
   */
  await expect(
    page.locator('.acct-screen-hidden').first(),
    'cohorts must start screen-hidden for this test to mean anything',
  ).toHaveCount(1, { timeout: 10000 })

  const printed = await capturePdfAndText(page, testInfo, 'formb-cohorts')
  for (const code of expectedCohorts) {
    // EXACTLY once, not "at least once": `> 0` passes on a filing that prints
    // the same cohort twice, which is a real defect on a statutory document.
    expect(
      cohortLineCount(printed.items, code),
      `screen-hidden Form B must print cohort ${code} exactly once (classification audit trail)`,
    ).toBe(1)
  }
})

test('figures stay aligned and unclipped when web fonts fail', async ({ page }) => {
  // Fonts load from Google at runtime, so failure is a real case. Blocking
  // them exercises the monospace FALLBACK stack.
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (route) => route.abort())

  await login(page)
  await page.goto(`/accounting/profit-and-loss?year=${descriptor.year}`)
  await waitForProfitAndLossLoaded(page, descriptor.year)

  // Measure RENDERED TEXT bounds, not cell edges: equal cell right edges prove
  // the cell box and stay equal even when glyphs overflow or digit widths
  // differ.
  const probe = await page.evaluate(() => {
    const fracs = [...document.querySelectorAll('.stmt-cell-figure-frac')]
    const lefts: number[] = []
    let clipped = 0
    let measured = 0
    for (const td of fracs) {
      const range = document.createRange()
      range.selectNodeContents(td)
      const box = range.getBoundingClientRect()
      if (box.width === 0) continue
      measured += 1
      lefts.push(Math.round(box.left * 10) / 10)
      if (box.right > td.getBoundingClientRect().right + 0.5) clipped += 1
    }
    return { lefts: [...new Set(lefts)], clipped, measured, cells: fracs.length }
  })

  expect(probe.cells, 'no figure cells found to measure').toBeGreaterThan(0)
  expect(probe.measured, 'no figure text was measurable').toBeGreaterThan(0)
  // One shared decimal anchor for every row, whatever the sign or font size.
  expect(
    probe.lefts,
    `decimal anchor must be one x position; found ${probe.lefts.join(', ')}`,
  ).toHaveLength(1)
  // max-content sizing removes the REASON to clip, but table layout still
  // negotiates widths — so verify, never assume (spec §4.5.2).
  expect(probe.clipped, 'a figure overflowed its cell').toBe(0)
})

test('a long account name wraps and still resolves as one row', async ({ page }, testInfo) => {
  await login(page)
  await page.goto(`/accounting/profit-and-loss?year=${descriptor.year}`)
  await waitForProfitAndLossLoaded(page, descriptor.year)

  const { items } = await capturePdfAndText(page, testInfo, 'pl-wrapping')

  /*
   * Build the SAME complete inventory the structural test uses. Passing a
   * one-row inventory would strip rowCandidates of its heading guard and of
   * every other row start, so a neighbouring row could be absorbed and this
   * test would not notice.
   */
  const printedExpenseRows: ExpectedRow[] = [
    ...descriptor.accounts.map((a) => ({ code: a.code, label: a.name, kind: 'line' as const })),
    {
      code: descriptor.group.parentCode,
      label: descriptor.group.parentName,
      kind: 'line' as const,
    },
  ].sort((a, b) => a.code.localeCompare(b.code))

  const at = PL_INVENTORY.findIndex((r) => r.label === 'Total Expenses')
  const inventory = [
    ...PL_INVENTORY.slice(0, at),
    ...printedExpenseRows,
    ...PL_INVENTORY.slice(at),
  ]

  // The grouped parent carries the longest fixture name and prints at depth 0.
  const wrappedRow: ExpectedRow = {
    code: descriptor.group.parentCode,
    label: descriptor.group.parentName,
    kind: 'line',
  }
  const candidates = rowCandidates(items, inventory)
  const hit = candidates.filter(
    (c) => c.code === wrappedRow.code && c.label === wrappedRow.label,
  )

  // Exactly one row, carrying the COMPLETE label.
  expect(hit, `"${descriptor.group.parentName}" must resolve to exactly one row`).toHaveLength(1)

  /*
   * And it must genuinely have wrapped. lineCount === 1 means this gate is not
   * exercising multi-line reconstruction at all — widen the fixture name or
   * narrow the label column until it wraps, rather than accepting the pass.
   */
  expect(
    hit[0].lineCount,
    'the long fixture name must WRAP across multiple lines, or this gate does not ' +
      'exercise reconstruction — lengthen the fixture name in print-fixture.ts',
  ).toBeGreaterThan(1)

  // The label ends where the fixture name ends — nothing appended from below.
  expect(hit[0].label.endsWith('print wrapping')).toBe(true)

  /*
   * And the row that ACTUALLY FOLLOWS it resolves separately.
   *
   * Identify that neighbour from the inventory's own order — the P&L sorts
   * account rows by code, which `printedExpenseRows` reproduces — not from
   * `descriptor.accounts[0]`, which is merely first in the fixture array and
   * need not sit after the wrapped row at all. And assert the neighbour as a
   * RESOLVED ROW, since a code surviving somewhere in the PDF does not prove
   * the row was not absorbed.
   */
  const wrappedAt = inventory.findIndex(
    (r) => r.code === wrappedRow.code && r.label === wrappedRow.label,
  )
  expect(wrappedAt, 'the wrapped row must be in the inventory').toBeGreaterThan(-1)
  const following = inventory[wrappedAt + 1]
  expect(following, 'the wrapped row must have a following row to check').toBeDefined()

  const followingHits = candidates.filter(
    (c) => c.code === following.code && c.label === following.label,
  )
  expect(
    followingHits,
    `the row after the wrapped one (${following.code ?? '(no code)'} ` +
      `"${following.label}") must resolve as exactly one separate row`,
  ).toHaveLength(1)
  /*
   * They must be SEPARATE, ADJACENT candidates — not merely two matches
   * somewhere in the document.
   *
   * A distinct-baseline check alone is too weak: it passes if the successor's
   * text was absorbed into the wrapped row and the match found was some other
   * row entirely. Asserting adjacency in candidate order proves the successor
   * begins its own row directly after the wrapped one, which is exactly what
   * absorption would destroy.
   */
  const wrappedIdx = candidates.indexOf(hit[0])
  const followingIdx = candidates.indexOf(followingHits[0])
  expect(wrappedIdx, 'the wrapped row must be among the candidates').toBeGreaterThan(-1)
  expect(
    followingIdx,
    `"${following.label}" must be the candidate IMMEDIATELY after the wrapped row ` +
      `(wrapped at ${wrappedIdx}, following at ${followingIdx}) — a gap means its ` +
      'text was absorbed into the wrap',
  ).toBe(wrappedIdx + 1)

  // And it occupies its own baseline, below the wrapped row's last line.
  expect(followingHits[0].y).not.toBe(hit[0].y)
  expect(
    followingHits[0].y,
    'the following row must sit below the wrapped row',
  ).toBeLessThan(hit[0].y)
})
