import { test, expect, type Page } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
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

test('Balance Sheet prints N38, N48 and all three balance-check lines', async ({ page }, testInfo) => {
  await login(page)
  await page.goto(`/accounting/balance-sheet?year=${descriptor.year}`)
  await page.waitForSelector('[data-testid="bs-print-block"]', { timeout: 30000 })

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

  // Amount elements, not whole rows. `[data-testid="bs-row-N48"]` includes the
  // label "Current-year Profit / Loss", whose hyphen satisfied the old
  // unanchored `/^\(|-/` sign check even when the amount was POSITIVE. Each
  // official row carries a child `[data-testid="bs-amount"]`
  // (BalanceSheetPage.tsx:273) — that is the element the figure lives on.
  const bsAmount = (line: string) =>
    `[data-testid="bs-row-${line}"] [data-testid="bs-amount"]`

  await assertExactAmount(page, bsAmount('N38'), bank)
  await assertExactAmount(page, bsAmount('N41'), bank)
  await assertExactAmount(page, bsAmount('N45'), zero)
  await assertExactAmount(page, bsAmount('N48'), loss)
  await assertExactAmount(page, bsAmount('N50'), loss)

  // The derived subtotals (#1212) render their amount directly in the row —
  // they deliberately carry no `bs-amount` child, no N-code and no drill-down.
  // They must show the COMPUTED figure, not merely exist: `expectedText: ''`
  // on these rows previously asserted nothing whatsoever.
  await assertExactAmount(page, '[data-testid="bs-derived-owners-equity"]', loss)
  await assertExactAmount(page, '[data-testid="bs-derived-liabilities-and-equity"]', loss)

  // All three balance-check figures, each by its own test id and its own exact
  // value. The old loop only asserted the text was non-empty, and the zero
  // check used `toContain('0.00')` — which accepts "10.00".
  await assertExactAmount(page, '[data-testid="bs-check-assets"]', bank)
  await assertExactAmount(page, '[data-testid="bs-check-liabilities-equity"]', bank)
  await assertExactAmount(page, '[data-testid="bs-difference-value"]', zero)

  // ---- Screen/print equality + visibility, EVERY asserted row. -----------
  // One pass per media mode, all failures collected, so a print rule that
  // drops or blanks any of these is named rather than masked by the first.
  await assertAllRowsRenderInBothMedia(page, [
    { selector: bsAmount('N38'), expectedText: bank },
    { selector: bsAmount('N41'), expectedText: bank },
    { selector: bsAmount('N45'), expectedText: zero },
    { selector: bsAmount('N48'), expectedText: loss },
    { selector: bsAmount('N50'), expectedText: loss },
    { selector: '[data-testid="bs-row-N38"]', expectedText: bank },
    { selector: '[data-testid="bs-row-N48"]', expectedText: loss },
    { selector: '[data-testid="bs-row-N50"]', expectedText: loss },
    { selector: '[data-testid="bs-derived-owners-equity"]', expectedText: loss },
    { selector: '[data-testid="bs-derived-liabilities-and-equity"]', expectedText: loss },
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

  expect(
    await renderOrder(page, [
      '[data-testid="bs-row-N50"]',
      '[data-testid="bs-derived-owners-equity"]',
      '[data-testid="bs-derived-liabilities-and-equity"]',
      '[data-testid="bs-balance-check"]',
    ]),
  ).toEqual([
    '[data-testid="bs-row-N50"]',
    '[data-testid="bs-derived-owners-equity"]',
    '[data-testid="bs-derived-liabilities-and-equity"]',
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
  await page.waitForSelector('[data-testid="pl-accounting-view"]', { timeout: 30000 })
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
  const netProfit = signedAmount(negate4dp(descriptor.expected.totalExpense))
  const totalExpenses = signedAmount(descriptor.expected.totalExpense)

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
  // data-testid="pl-row-expenses.total".
  await assertExactAmount(
    page,
    '[data-testid="pl-row-expenses.total"] td:last-child',
    totalExpenses,
  )
  await assertExactAmount(page, '[data-testid="pl-row-netProfit"] td:last-child', netProfit)

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
  await page.waitForSelector('[data-testid="pl-accounting-view"]', { timeout: 30000 })

  // P&L drill-down detail rows (.acct-print-detail-row) exist only as children
  // of an expanded NON-POSTABLE group (ProfitAndLossAccountingView sets
  // printClass only at depth > 0; assembleSections emits children only under a
  // non-postable category).
  //
  // This leg was previously CONDITIONAL — `if (plHasGroups)` — and the flat
  // fixture guaranteed the condition was false, so it never ran on any run: a
  // missing expander read as success, and deleting `.acct-print-detail-row`'s
  // print rule would have escaped detection entirely (review finding 4). The
  // fixture now creates a real grouped account, so the expander is
  // fixture-guaranteed and this is REQUIRED: no skip path remains.
  //
  // NOTE on waiting: locator.count() does NOT auto-wait, so a bare count()
  // here races the report load and reads 0 on a slow first paint. Playwright's
  // web-first `toBeVisible` assertion settles that race with a bounded wait.
  const groupExpander = page.locator(`[data-testid="pl-expand-account:${descriptor.group.parentId}"]`)
  await expect(
    groupExpander,
    `the fixture's grouped expense account (${descriptor.group.parentCode}) must render an ` +
      `expander; without it there is no .acct-print-detail-row to assert and this test is inert`,
  ).toBeVisible({ timeout: 30000 })

  await groupExpander.click()

  // The child row must actually appear, and it must be the FIXTURE's child —
  // a bare `.acct-print-detail-row` count could be satisfied by unrelated
  // detail from some other group.
  const childRow = page.locator(plRowSelector(descriptor.group.childId))
  await expect(
    childRow,
    'expanding the grouped account must reveal the fixture child row',
  ).toBeVisible({ timeout: 10000 })
  await expect(
    childRow,
    'the revealed child row must carry .acct-print-detail-row — that class is the ' +
      'print hook the hiding rule targets',
  ).toHaveClass(/(^|\s)acct-print-detail-row(\s|$)/)

  // The property under test: visible on screen, genuinely hidden in print.
  await assertScreenVisiblePrintHidden(page, plRowSelector(descriptor.group.childId))
  await assertScreenVisiblePrintHidden(page, '.acct-print-detail-row')

  // The generic print-hide hook, asserted on the Balance Sheet where each
  // mapped line's account drill-down carries data-print-hide="true".
  // N38 anchors this leg: the fixture always pays through a BANK-channel
  // method, so N38 (Bank Balance) always carries that account and its
  // expander is fixture-guaranteed — no silent skip when it is absent.
  await page.emulateMedia({ media: 'screen' })
  await page.goto(`/accounting/balance-sheet?year=${descriptor.year}`)
  await page.waitForSelector('[data-testid="bs-print-block"]', { timeout: 30000 })
  await expect(page.locator('[data-testid="bs-expand-N38"]'), 'N38 drill-down must exist').toBeVisible({
    timeout: 10000,
  })
  await page.locator('[data-testid="bs-expand-N38"]').click()
  await expect(page.locator('[data-testid="bs-accounts-N38"]')).toBeVisible({ timeout: 10000 })
  await assertScreenVisiblePrintHidden(page, '[data-testid="bs-accounts-N38"]')
})
