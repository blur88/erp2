import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { expect, type Page, type TestInfo } from '@playwright/test'
import { PDFDocument } from 'pdf-lib'

export interface ClampFinding {
  tag: string
  className: string
  overflow: string
  height: string
  maxHeight: string
  reason: string
}

export interface ClipFinding {
  /** The selector whose subtree the clip was found under. */
  root: string
  /** Where the clip is, relative to the matched element. */
  where: 'self' | 'descendant' | 'ancestor'
  tag: string
  className: string
  testId: string
  overflowX: string
  overflowY: string
  textOverflow: string
  scrollWidth: number
  clientWidth: number
  scrollHeight: number
  clientHeight: number
  /** First ~80 chars of the clipped element's text, to identify it in a report. */
  text: string
  reason: string
}

/**
 * Detect CONTENT CLIPPING inside a report subtree (review finding 1).
 *
 * Why text comparison cannot do this. `text-overflow: ellipsis` does not change
 * `innerText` — the DOM text is intact, only the painted glyphs are cut — and a
 * Chromium probe confirmed a print-only `width:80px; overflow:hidden;
 * text-overflow:ellipsis` passed BOTH the screen/print text-equality check and
 * `toBeVisible()`. The ancestor clamp scan missed it too, because the clip sat
 * on the text element itself rather than on an ancestor of the print block.
 *
 * What this checks instead: the geometric definition of clipping. A box whose
 * `scrollWidth`/`scrollHeight` exceeds its `clientWidth`/`clientHeight` while
 * its overflow on that axis is `hidden` or `clip` is painting less than it
 * holds.
 *
 * THREE directions are walked, and the downward one is not optional. The
 * matched element is usually a container, not the text: a P&L account name
 * lives in a flex `Box` INSIDE the scanned `td`
 * (ProfitAndLossAccountingView.tsx), and a Balance Sheet row label lives in a
 * `Typography` INSIDE the scanned `bs-row-*`. An earlier version walked only
 * the element and its ancestors, so a clip on either of those — the natural
 * place to put one, since that is where the name column's layout lives — was
 * invisible, and the red-proof passed only because it injected the clip on the
 * `td` itself: one of the few surfaces that version did cover. Injecting at the
 * place the assertion looks at, rather than the place a real defect occurs,
 * proves nothing.
 *
 * Descendants are filtered to elements that DIRECTLY hold text, so the scan
 * reports the box that actually clips something rather than every empty
 * wrapper and icon in the subtree.
 *
 * Scoped to `root`'s subtree so an app-shell box outside the report cannot
 * produce a finding, and the upward walk stops at `root` for the same reason.
 *
 * Deliberately runs against the LIVE styled elements under whatever media mode
 * is currently emulated — never a detached clone, which print CSS cannot reach.
 */
export async function scanContentClipping(
  page: Page,
  root: string,
  itemSelector: string,
): Promise<ClipFinding[]> {
  return page.evaluate(
    ({ root, itemSelector }) => {
      const rootEl = document.querySelector(root)
      if (!rootEl) {
        // Reported as a SELECTOR defect, not a clipping one. assertNoContentClipping's
        // count guard normally fires first, but if this is ever reached the message
        // must not read as "content is clipped".
        throw new Error(`scanContentClipping: root selector ${root} matched nothing`)
      }

      // 1px tolerance: sub-pixel layout rounding routinely makes scrollWidth
      // exceed clientWidth by a fraction on a box that is not clipping at all.
      // A real ellipsis truncation overflows by far more than this.
      const TOLERANCE = 1
      const CLIPPING = new Set(['hidden', 'clip'])
      const findings: any[] = []
      const seen = new Set<Element>()

      const inspect = (el: Element, where: 'self' | 'descendant' | 'ancestor') => {
        if (seen.has(el)) return
        seen.add(el)
        const s = getComputedStyle(el)
        const reasons: string[] = []
        if (
          CLIPPING.has(s.overflowX) &&
          el.scrollWidth - el.clientWidth > TOLERANCE &&
          el.clientWidth > 0
        ) {
          reasons.push(
            `horizontal: scrollWidth=${el.scrollWidth} > clientWidth=${el.clientWidth} with overflow-x=${s.overflowX}`,
          )
        }
        if (
          CLIPPING.has(s.overflowY) &&
          el.scrollHeight - el.clientHeight > TOLERANCE &&
          el.clientHeight > 0
        ) {
          reasons.push(
            `vertical: scrollHeight=${el.scrollHeight} > clientHeight=${el.clientHeight} with overflow-y=${s.overflowY}`,
          )
        }
        if (reasons.length === 0) return
        findings.push({
          root,
          where,
          tag: el.tagName.toLowerCase(),
          className: typeof el.className === 'string' ? el.className : '',
          testId: el.getAttribute('data-testid') ?? '',
          overflowX: s.overflowX,
          overflowY: s.overflowY,
          textOverflow: s.textOverflow,
          scrollWidth: el.scrollWidth,
          clientWidth: el.clientWidth,
          scrollHeight: el.scrollHeight,
          clientHeight: el.clientHeight,
          text: ((el as HTMLElement).innerText ?? '').replace(/\s+/g, ' ').trim().slice(0, 80),
          reason: reasons.join('; '),
        })
      }

      /**
       * True when the element renders text ANYWHERE beneath it.
       *
       * Deliberately not "has a direct text child". That narrower test left a
       * real gap: an intermediate wrapper holding no text of its own was in
       * neither walk — not a descendant that holds text, and not an ancestor,
       * because the upward walk starts at `item.parentElement`. Concretely the
       * `flex: 1` Box between `bs-row-*` and its label Typography
       * (BalanceSheetPage.tsx:257), which is a plausible place to put a clip:
       * it is the box that owns the label column's width.
       *
       * Empty wrappers and icon-only boxes still contribute nothing, because
       * they render no text — which is the property that actually matters for
       * "did something get cut off", rather than where the text node sits.
       */
      const holdsText = (el: Element) => ((el as HTMLElement).innerText ?? '').trim().length > 0

      for (const item of Array.from(rootEl.querySelectorAll(itemSelector))) {
        inspect(item, 'self')

        // DOWNWARD: the text usually lives below the matched element, and so do
        // the boxes that size it. Every descendant that renders text is
        // inspected, so no level between the matched element and the text is
        // skipped.
        for (const child of Array.from(item.querySelectorAll('*'))) {
          if (holdsText(child)) inspect(child, 'descendant')
        }

        // UPWARD: and every box between the text element and the report root. The
        // clip that hides a long name may well be on a wrapping cell or column
        // container rather than on the text node's own element.
        let el: Element | null = item.parentElement
        while (el && el !== rootEl.parentElement) {
          inspect(el, 'ancestor')
          if (el === rootEl) break
          el = el.parentElement
        }
      }
      return findings
    },
    { root, itemSelector },
  ) as unknown as Promise<ClipFinding[]>
}

/**
 * Fail when any print-visible content in `root` is geometrically clipped.
 *
 * `itemSelector` must select the text-bearing elements that matter — the rows
 * and cells whose content is the report. Passing a selector that matches
 * nothing is itself a failure: a scan over zero elements is exactly the vacuous
 * green this gate exists to prevent.
 */
export async function assertNoContentClipping(
  page: Page,
  root: string,
  itemSelector: string,
) {
  // Every alternative must be root-scoped individually. `${root} ${a}, ${b}`
  // parses as "${root} ${a}" OR "${b}" — only the FIRST alternative is scoped,
  // and the rest match document-wide. The in-page scan scopes all of them
  // (it queries within rootEl), so the two disagreed: inert while every test id
  // renders inside the block, but it would fail OPEN the moment one did not,
  // counting an out-of-block element as proof the scan had something to look at.
  const scopedSelector = itemSelector
    .split(',')
    .map((part) => `${root} ${part.trim()}`)
    .join(', ')
  const matched = await page.locator(scopedSelector).count()
  expect(
    matched,
    `clipping scan matched no "${itemSelector}" under ${root}; a scan over zero elements proves nothing`,
  ).toBeGreaterThan(0)

  const findings = await scanContentClipping(page, root, itemSelector)
  expect(
    findings,
    `print-visible content under ${root} is CLIPPED (scrollWidth/Height exceeds ` +
      `clientWidth/Height on a hidden-overflow box). text-overflow: ellipsis does ` +
      `not change innerText, so text equality cannot see this:\n` +
      JSON.stringify(findings, null, 2),
  ).toEqual([])
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

/** Escape a literal for embedding in a RegExp. */
const escapeRegExp = (literal: string) => literal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * Assert an element renders EXACTLY one signed money figure (review finding 3).
 *
 * The previous checks were satisfiable by wrong results. `/^\(|-/` was applied
 * to a whole Balance Sheet row and its `-` branch was unanchored, so the hyphen
 * in "Current-year Profit / Loss" satisfied it even when the amount was
 * positive; `toContain('0.00')` accepts "10.00"; and several rows were asserted
 * with `expectedText: ''`, which asserts nothing at all.
 *
 * `expected` is the signed decimal as `formatCurrency` renders the digits, e.g.
 * "-1,234.56" or "0.00". The element's text must be exactly that, optionally
 * preceded by a currency prefix — `formatCurrency` emits
 * `${symbol} ${Intl.NumberFormat('en-MY').format(v)}`, and the symbol comes from
 * regional settings (MYR on the gate stack, 'RM' with no settings cached), so
 * pinning the symbol would make the assertion environment-dependent while
 * pinning the digits and the SIGN is what actually catches a wrong figure.
 *
 * en-MY renders negatives with a LEADING MINUS. Parentheses never occur, so no
 * parenthesised alternative is accepted: allowing one would let an unexpected
 * accounting format pass unnoticed.
 */
export async function assertExactAmount(page: Page, selector: string, expected: string) {
  const locator = page.locator(selector)
  await expect(locator, `${selector} must match exactly one element`).toHaveCount(1)
  await assertVisibleWithBox(page, selector)
  const text = await liveRowText(page, selector)
  // Anchored on both ends. `[^\d(-]*` is the optional currency prefix: it can
  // contain no digit, no minus and no parenthesis, so it can never swallow part
  // of the figure or hide a sign.
  const pattern = new RegExp(`^[^\\d(-]*${escapeRegExp(expected)}$`)
  expect(
    text,
    `${selector} must render exactly ${JSON.stringify(expected)} (optionally currency-prefixed); ` +
      `got ${JSON.stringify(text)}`,
  ).toMatch(pattern)
  return text
}

/**
 * One-evaluation read of visibility + text for MANY selectors under the media
 * mode currently emulated.
 *
 * `assertRowRenders` costs several round trips per row (locator visibility,
 * bounding box, innerText), which is why the spec previously asserted only a
 * three-row spread — and why hiding any of the other twelve fixture accounts
 * passed (review finding 2). This reads every row in a single page.evaluate, so
 * asserting all of them costs one round trip per media mode instead of per row.
 *
 * Visibility is decided in the page from the RENDERED GEOMETRY and computed
 * style, not from innerText: a Chromium probe confirmed a hidden element's
 * `innerText` can still return its text, so text alone does not prove a row is
 * on the page. A row must have a non-zero client box AND a non-`none` display
 * AND non-`hidden` visibility AND non-zero opacity, on itself and on every
 * ancestor.
 */
export interface RowRead {
  selector: string
  count: number
  visible: boolean
  width: number
  height: number
  text: string
  /** Why it was judged invisible, for the failure message. */
  hiddenBy: string
}

export async function readRows(page: Page, selectors: string[]): Promise<RowRead[]> {
  return page.evaluate((sels) => {
    return sels.map((selector) => {
      const nodes = document.querySelectorAll(selector)
      if (nodes.length !== 1) {
        return {
          selector,
          count: nodes.length,
          visible: false,
          width: 0,
          height: 0,
          text: '',
          hiddenBy: `selector matched ${nodes.length} elements, expected exactly 1`,
        }
      }
      const el = nodes[0] as HTMLElement
      const rect = el.getBoundingClientRect()
      let hiddenBy = ''
      // Walk self + ancestors: display:none on ANY of them removes the row,
      // and that is exactly how a print rule hides content.
      let node: Element | null = el
      while (node && node !== document.documentElement && !hiddenBy) {
        const s = getComputedStyle(node)
        const tag = node.tagName.toLowerCase()
        const cls = typeof node.className === 'string' ? node.className : ''
        const id = node.getAttribute('data-testid')
        const who = id ? `[data-testid="${id}"]` : `${tag}${cls ? '.' + cls.split(/\s+/).join('.') : ''}`
        if (s.display === 'none') hiddenBy = `${who} has display:none`
        else if (s.visibility === 'hidden' || s.visibility === 'collapse') {
          hiddenBy = `${who} has visibility:${s.visibility}`
        } else if (Number(s.opacity) === 0) hiddenBy = `${who} has opacity:0`
        node = node.parentElement
      }
      if (!hiddenBy && rect.width <= 0) hiddenBy = `zero width (${rect.width})`
      if (!hiddenBy && rect.height <= 0) hiddenBy = `zero height (${rect.height})`
      return {
        selector,
        count: 1,
        visible: hiddenBy === '',
        width: rect.width,
        height: rect.height,
        text: (el.innerText ?? '').replace(/\s+/g, ' ').trim(),
        hiddenBy,
      }
    })
  }, selectors) as unknown as Promise<RowRead[]>
}

/**
 * Screen/print equality + visibility for EVERY given row, in two passes.
 *
 * Replaces the representative-spread approach: a report is either complete on
 * paper or it is a defect, and "first, middle and last" left twelve of fifteen
 * fixture accounts with no print-visibility assertion at all.
 *
 * Every failure is COLLECTED and reported together, so one hidden row does not
 * mask the other fourteen — a partial print is diagnosed in one run.
 */
export async function assertAllRowsRenderInBothMedia(
  page: Page,
  rows: { selector: string; expectedText: string }[],
) {
  expect(rows.length, 'no rows given to assert; a zero-row pass proves nothing').toBeGreaterThan(0)
  const selectors = rows.map((r) => r.selector)
  const expectedBySelector = new Map(rows.map((r) => [r.selector, r.expectedText]))

  await page.emulateMedia({ media: 'screen' })
  const screenReads = await readRows(page, selectors)

  await page.emulateMedia({ media: 'print' })
  const printReads = await readRows(page, selectors)

  const screenBySelector = new Map(screenReads.map((r) => [r.selector, r]))
  const problems: string[] = []

  for (const read of screenReads) {
    if (!read.visible) {
      problems.push(`SCREEN ${read.selector}: not visible — ${read.hiddenBy}`)
      continue
    }
    const expected = expectedBySelector.get(read.selector)!
    if (expected && !read.text.includes(expected)) {
      problems.push(
        `SCREEN ${read.selector}: expected text ${JSON.stringify(expected)} absent from ${JSON.stringify(read.text)}`,
      )
    }
  }

  for (const read of printReads) {
    const onScreen = screenBySelector.get(read.selector)!
    if (!read.visible) {
      problems.push(
        `PRINT ${read.selector}: not visible under print media — ${read.hiddenBy} ` +
          `(screen text was ${JSON.stringify(onScreen.text)})`,
      )
      continue
    }
    if (read.text !== onScreen.text) {
      problems.push(
        `PRINT ${read.selector}: printed text ${JSON.stringify(read.text)} !== ` +
          `screen text ${JSON.stringify(onScreen.text)}`,
      )
    }
  }

  expect(
    problems,
    `${problems.length} of ${rows.length} rows failed print visibility / screen-print equality:\n` +
      problems.join('\n'),
  ).toEqual([])

  return { screenReads, printReads }
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
