import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { expect, type Page, type TestInfo } from '@playwright/test'
import { PDFDocument } from 'pdf-lib'

/** Selectors whose subtrees are intentionally hidden in print. */
export const PRINT_HIDDEN_SELECTORS = [
  '[data-print-hide="true"]',
  '.acct-print-detail-row',
] as const

export interface ClampFinding {
  tag: string
  className: string
  overflow: string
  height: string
  maxHeight: string
  reason: string
}

/** A row must be visible with a non-zero box — jsdom can assert neither. */
export async function assertVisibleWithBox(page: Page, selector: string) {
  const locator = page.locator(selector)
  await expect(locator, `${selector} should be visible under print media`).toBeVisible()
  const box = await locator.boundingBox()
  expect(box, `${selector} should have a bounding box`).not.toBeNull()
  expect(box!.width, `${selector} width`).toBeGreaterThan(0)
  expect(box!.height, `${selector} height`).toBeGreaterThan(0)
  return { width: box!.width, height: box!.height }
}

/**
 * This gate's deliberate stress condition. A clamp is detectable by the
 * computed-style scan at any height; height is what makes the clamp actually
 * TRUNCATE, which is the case #1172 shipped. If the block is not taller than
 * the viewport the scan still runs but no longer exercises truncation, so this
 * fails loudly rather than passing weakly.
 */
export async function assertPrintableTallerThanViewport(page: Page, selector: string) {
  const box = await page.locator(selector).boundingBox()
  expect(box, `${selector} should have a bounding box`).not.toBeNull()
  const viewportHeight = page.viewportSize()?.height ?? 0
  expect(
    box!.height,
    `printable block (${box!.height}px) must exceed viewport (${viewportHeight}px) so an ancestor clamp would truncate; shrink the Playwright viewport rather than padding the page`,
  ).toBeGreaterThan(viewportHeight)
  return { blockHeight: box!.height, viewportHeight }
}

/** The #1172 detector: walk the ancestor chain for truncating constraints. */
export async function scanAncestorClamps(page: Page, selector: string): Promise<ClampFinding[]> {
  return page.$$eval(
    `${selector}`,
    (nodes) => {
      const findings: ClampFinding[] = []
      let el = nodes[0]?.parentElement ?? null
      while (el && el !== document.documentElement) {
        const s = getComputedStyle(el)
        const reasons: string[] = []
        if (s.overflow !== 'visible') reasons.push(`overflow=${s.overflow}`)
        if (/vh$/.test(el.style.height || '') || /vh/.test(s.height)) reasons.push(`height=${s.height}`)
        if (s.maxHeight !== 'none') reasons.push(`max-height=${s.maxHeight}`)
        if (reasons.length > 0) {
          findings.push({
            tag: el.tagName.toLowerCase(),
            className: typeof el.className === 'string' ? el.className : '',
            overflow: s.overflow,
            height: s.height,
            maxHeight: s.maxHeight,
            reason: reasons.join(', '),
          })
        }
        el = el.parentElement
      }
      return findings
    },
  ) as unknown as Promise<ClampFinding[]>
}

export async function assertNoAncestorClamps(page: Page, selector: string) {
  const findings = await scanAncestorClamps(page, selector)
  expect(
    findings,
    `ancestors of ${selector} impose print-truncating constraints: ${JSON.stringify(findings, null, 2)}`,
  ).toEqual([])
}

/** Nothing may extend past the document's own scroll height. */
export async function assertLastElementWithinScrollHeight(page: Page, selector: string) {
  const result = await page.locator(selector).evaluate((el) => ({
    bottom: el.getBoundingClientRect().bottom + window.scrollY,
    scrollHeight: document.documentElement.scrollHeight,
  }))
  expect(
    Math.round(result.bottom),
    `${selector} bottom must fall within document scrollHeight`,
  ).toBeLessThanOrEqual(result.scrollHeight + 1)
}

/**
 * Read one row's rendered text FROM THE LIVE PAGE.
 *
 * Deliberately NOT a detached clone: cloning a node into a fragment detaches
 * it from the stylesheet, so print CSS cannot affect the result and any
 * "screen equals print" comparison becomes a comparison of the clone with
 * itself — it would pass even with the whole report `display: none`. Using
 * innerText on the live element means the value reflects what the print
 * stylesheet actually produced.
 */
export async function liveRowText(page: Page, selector: string): Promise<string> {
  return page
    .locator(selector)
    .evaluate((el) => ((el as HTMLElement).innerText ?? '').replace(/\s+/g, ' ').trim())
}

/**
 * Assert an explicitly expected row is visible with a non-zero box AND renders
 * the expected text, under whichever media mode is currently emulated.
 */
export async function assertRowRenders(page: Page, selector: string, expectedText: string) {
  await assertVisibleWithBox(page, selector)
  const text = await liveRowText(page, selector)
  expect(text, `${selector} rendered text`).toContain(expectedText)
  return text
}

/**
 * Screen/print equality, asserted per expected row on the live page.
 *
 * Each row is read under screen media, then re-read under print media after
 * emulateMedia, and the two must match. Because both reads hit the live,
 * styled element, a print rule that hides or blanks a row makes this fail —
 * which is the whole point.
 */
export async function assertScreenPrintEquality(
  page: Page,
  rows: { selector: string; expectedText: string }[],
) {
  await page.emulateMedia({ media: 'screen' })
  const onScreen: Record<string, string> = {}
  for (const row of rows) {
    onScreen[row.selector] = await assertRowRenders(page, row.selector, row.expectedText)
  }

  await page.emulateMedia({ media: 'print' })
  for (const row of rows) {
    await assertVisibleWithBox(page, row.selector)
    const printed = await liveRowText(page, row.selector)
    expect(
      printed,
      `${row.selector}: printed text must equal screen text (screen="${onScreen[row.selector]}")`,
    ).toBe(onScreen[row.selector])
  }
  return onScreen
}

/**
 * The promised complement: content that is visible on screen and genuinely
 * hidden in print. Asserted positively so intentional hiding is a CHECKED
 * property rather than something the tests merely route around — and so a row
 * that wrongly gained a print-hiding rule cannot slip through.
 */
export async function assertScreenVisiblePrintHidden(page: Page, selector: string) {
  const locator = page.locator(selector).first()
  await page.emulateMedia({ media: 'screen' })
  await expect(locator, `${selector} should be visible on screen`).toBeVisible()
  await page.emulateMedia({ media: 'print' })
  await expect(locator, `${selector} must be hidden in print`).toBeHidden()
}

/**
 * Render a print PDF and SAVE it, returning its parsed page count.
 *
 * Never throws on a capture problem: this is called from an afterEach failure
 * hook as well as inline, and a capture error must never replace the real
 * assertion failure. Returns null when the PDF could not be produced.
 *
 * Page count comes from the parsed document catalog (pdf-lib), not from
 * counting `/Type /Page` byte patterns, which miscounts across object streams
 * and /Pages nodes.
 */
export async function capturePrintPdf(
  page: Page,
  testInfo: TestInfo,
  name: string,
): Promise<number | null> {
  try {
    const outPath = path.join('e2e-results', `${name}.pdf`)
    mkdirSync(path.dirname(outPath), { recursive: true })
    // Print media must be emulated for the PDF to reflect the print
    // stylesheet. A failure hook may run with screen media still active.
    await page.emulateMedia({ media: 'print' })
    const pdf = await page.pdf({ format: 'A4', path: outPath })
    await testInfo.attach(`${name}.pdf`, { path: outPath, contentType: 'application/pdf' })
    const parsed = await PDFDocument.load(pdf, { updateMetadata: false })
    return parsed.getPageCount()
  } catch (err) {
    // Swallowed deliberately — see the docblock. Surfaced as an attachment so
    // it stays visible without displacing the original failure.
    await testInfo
      .attach(`${name}-capture-error.txt`, {
        body: String(err instanceof Error ? err.stack : err),
        contentType: 'text/plain',
      })
      .catch(() => {})
    return null
  }
}

/** Capture, then assert the page count. Use inline, on the success path. */
export async function renderAndAssertPdf(
  page: Page,
  testInfo: TestInfo,
  name: string,
  minPages: number,
): Promise<number> {
  const pages = await capturePrintPdf(page, testInfo, name)
  expect(pages, `${name}: PDF capture failed; see the attached capture error`).not.toBeNull()
  expect(
    pages as number,
    `${name} should span at least ${minPages} A4 page(s); saved to e2e-results/${name}.pdf`,
  ).toBeGreaterThanOrEqual(minPages)
  return pages as number
}

/** Document order of the given selectors, for asserting render sequence. */
export async function renderOrder(page: Page, selectors: string[]): Promise<string[]> {
  return page.evaluate((sels) => {
    const found = sels
      .map((sel) => ({ sel, el: document.querySelector(sel) }))
      .filter((x): x is { sel: string; el: Element } => x.el !== null)
    return found
      .sort((a, b) =>
        a.el.compareDocumentPosition(b.el) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1,
      )
      .map((x) => x.sel)
  }, selectors)
}
