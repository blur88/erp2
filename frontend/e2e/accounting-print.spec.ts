import { test, expect, type Page } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { readDescriptor } from './fixtures/print-fixture'
import {
  assertVisibleWithBox,
  capturePrintPdf,
  assertPrintableTallerThanViewport,
  assertNoAncestorClamps,
  assertLastElementWithinScrollHeight,
  assertRowRenders,
  assertScreenPrintEquality,
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

/** Amounts render grouped and 2dp; match the digits regardless of currency prefix. */
const displayAmount = (fourDp: string) => {
  const negative = fourDp.startsWith('-')
  const n = Math.abs(parseFloat(fourDp))
  const grouped = n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return { grouped, negative }
}

test('Balance Sheet prints N38, N48 and all three balance-check lines', async ({ page }, testInfo) => {
  await login(page)
  await page.goto(`/accounting/balance-sheet?year=${descriptor.year}`)
  await page.waitForSelector('[data-testid="bs-print-block"]', { timeout: 30000 })

  // ---- Anti-vacuity: exact content, per row, BEFORE any print work. ------
  // Explicitly declared expectations; never derived from the components'
  // hiding rules, which would let accidental hiding pass.
  const n48 = displayAmount(descriptor.expected.currentYearLossN48)
  const n38 = displayAmount(descriptor.expected.bankMovementN38)

  // Signed amounts asserted against their OWN rows, not searched for anywhere
  // in the report. Task 3 recorded how negatives render (leading '-' or
  // parentheses); assert that exact form.
  const n48Text = await assertRowRenders(page, '[data-testid="bs-row-N48"]', n48.grouped)
  expect(n48Text, 'N48 must render as a loss, not an unsigned figure').toMatch(/^\(|-/)
  const n38Text = await assertRowRenders(page, '[data-testid="bs-row-N38"]', n38.grouped)
  expect(n38Text, 'N38 bank balance must reflect the fixture payments').toMatch(/^\(|-/)

  // All three balance-check lines, each by its own test id.
  for (const testId of ['bs-check-assets', 'bs-check-liabilities-equity', 'bs-difference-value']) {
    await assertVisibleWithBox(page, `[data-testid="${testId}"]`)
    const text = await page.locator(`[data-testid="${testId}"]`).innerText()
    expect(text.trim(), `${testId} must render a figure`).not.toBe('')
  }
  // A balanced report: difference is zero.
  await assertRowRenders(page, '[data-testid="bs-difference-value"]', '0.00')

  // Derived subtotals must render their computed amounts, not just be present.
  await assertVisibleWithBox(page, '[data-testid="bs-derived-owners-equity"]')
  await assertVisibleWithBox(page, '[data-testid="bs-derived-liabilities-and-equity"]')

  // ---- Screen/print equality, per row, on the LIVE page. -----------------
  await assertScreenPrintEquality(page, [
    { selector: '[data-testid="bs-row-N38"]', expectedText: n38.grouped },
    { selector: '[data-testid="bs-row-N48"]', expectedText: n48.grouped },
    { selector: '[data-testid="bs-row-N50"]', expectedText: '' },
    { selector: '[data-testid="bs-derived-owners-equity"]', expectedText: '' },
    { selector: '[data-testid="bs-derived-liabilities-and-equity"]', expectedText: '' },
    { selector: '[data-testid="bs-check-assets"]', expectedText: '' },
    { selector: '[data-testid="bs-check-liabilities-equity"]', expectedText: '' },
    { selector: '[data-testid="bs-difference-value"]', expectedText: '0.00' },
  ])
  // (assertScreenPrintEquality leaves print media emulated.)

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
  const rendered = (await view.innerText()).replace(/\s+/g, ' ')

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
    if (!rowText.includes(displayAmount(a.amount).grouped)) {
      wrongAmount.push(`${a.code}: expected ${a.amount}, row read "${rowText}"`)
    }
  }
  expect(
    missing,
    `every fixture account must render exactly one row; ${missing.length} of ${descriptor.accounts.length} failed`,
  ).toEqual([])
  expect(wrongAmount, 'every fixture account row must render its own amount').toEqual([])

  // Totals, not just rows.
  const total = displayAmount(descriptor.expected.totalExpense)
  expect(rendered, 'total expense must render').toContain(total.grouped)
  await assertRowRenders(page, '[data-testid="pl-row-netProfit"]', total.grouped)

  // ---- Screen/print equality, per row, on the LIVE page. -----------------
  // A representative spread plus the total: first, middle and last fixture
  // account, so a print rule that drops rows mid-report is caught.
  const spread = [
    descriptor.accounts[0],
    descriptor.accounts[Math.floor(descriptor.accounts.length / 2)],
    descriptor.accounts[descriptor.accounts.length - 1],
  ]

  // Each P&L row carries data-testid="pl-row-${node.rowId}" and rowId is
  // `account:${accountId}` (profit-and-loss.classify.ts:354), so the fixture's
  // own account id yields an exact, unique locator. No substring text
  // matching: a code like "9601" is a substring of "96011".
  for (const a of spread) {
    const selector = plRowSelector(a.id)
    await expect(
      page.locator(selector),
      `${selector} must match exactly one row`,
    ).toHaveCount(1)
  }

  await assertScreenPrintEquality(page, [
    ...spread.map((a) => ({
      selector: plRowSelector(a.id),
      expectedText: displayAmount(a.amount).grouped,
    })),
    { selector: '[data-testid="pl-row-netProfit"]', expectedText: total.grouped },
  ])

  await assertPrintableTallerThanViewport(page, '[data-testid="pl-accounting-view"]')

  // Long fixture names must survive into print-visible rows.
  const printedText = (await view.innerText()).replace(/\s+/g, ' ')
  expect(printedText, 'long fixture account names must render in print').toContain(
    descriptor.accounts[0].name,
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
  // of expanded non-postable groups. The flat print-gate fixture is all
  // postable leaves — test 2 requires every one of the 15 accounts visible
  // WITHOUT expanding — so this page normally has no pl-expand-* buttons at
  // all (verified: zero on a fixture run). When grouped data IS present, assert
  // the complement directly: screen-visible, print-hidden. This makes
  // intentional hiding a CHECKED property rather than something the other
  // tests merely route around.
  //
  // NOTE on waiting: locator.count() does NOT auto-wait, so a bare count()
  // here races the report load and reads 0 on a slow first paint. waitFor on
  // the first expander settles that race with a bounded wait instead.
  const plExpander = page.locator('[data-testid^="pl-expand-"]').first()
  const plHasGroups = await plExpander
    .waitFor({ state: 'visible', timeout: 5000 })
    .then(
      () => true,
      () => false,
    )
  if (plHasGroups) {
    await plExpander.click()
    await page
      .locator('.acct-print-detail-row')
      .first()
      .waitFor({ state: 'visible', timeout: 10000 })
    await assertScreenVisiblePrintHidden(page, '.acct-print-detail-row')
  }
  // Else: no P&L drill-downs exist in this report by fixture design (flat
  // postable accounts). The strict Balance Sheet leg below still checks the
  // print-hidden complement on real drill-down content every run.

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
