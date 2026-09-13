import { readFileSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ThemeProvider } from '@mui/material/styles'

import { Statement } from '../Statement'
import { QA_REQUIRED_HOOKS, qaPreflightSnippet, runQaPreflight } from '../qaPreflight'
import type { StatementRow } from '../types'
import { darkTheme } from '@/styles/theme'

/**
 * Keeps `docs/modules/accounting/STATEMENT_THEME_QA.md` HONEST.
 *
 * CLAUDE.md designates that document as the substitute for the browser gate
 * removed in #1223 — a tracked manual procedure whose results go in the PR. It
 * is the only remaining check on the invariants jsdom cannot see: real decimal
 * alignment, sticky scrolling, clipping, font loading.
 *
 * Its failure mode is silent and total. Every step is a
 * `document.querySelector(...)` in a browser console; when a selector is
 * renamed or dropped, the query returns `null` — and `querySelectorAll`
 * returns an EMPTY NodeList that iterates zero times without throwing. A
 * careless run reads "no mismatch found" as a pass. That is what happened when
 * #1235 moved Statement from `statement.css` to MUI `sx`: `.stmt-cell-figure`,
 * `.stmt-paren-spacer`, `.stmt-col-head` and `.stmt-scroller` all disappeared
 * while the document kept saying to query them.
 *
 * Three layers guard that here, each covering a hole the previous one leaves:
 *
 *  1. EVERY selector the document actually instructs a reader to query — read
 *     out of its `querySelector(...)` calls, not from a list maintained here —
 *     must match a rendered Statement. A hardcoded list cannot catch a broken
 *     instruction that the list happens not to mention.
 *  2. `runQaPreflight` — the REAL function the QA session pastes in — must
 *     pass on a good render and THROW on a bad one. Testing a reimplementation
 *     would prove nothing about what the reader runs.
 *  3. No selector from the removed stylesheet markup may survive anywhere in
 *     the document.
 *
 * None of this verifies the invariants themselves — only that the procedure
 * for checking them still addresses something real.
 */

const QA_DOC = path.resolve(
  __dirname,
  '../../../../../../docs/modules/accounting/STATEMENT_THEME_QA.md',
)

const doc = readFileSync(QA_DOC, 'utf8')

/**
 * EVERY attribute selector the document names, wherever it appears.
 *
 * Read from the prose rather than declared here on purpose: a hardcoded list
 * passes as long as the correct selector appears SOMEWHERE — including only in
 * the reference table — while a step further down still names a dead one.
 *
 * Deliberately NOT limited to `querySelector(...)` calls. ST-12 ("collect the
 * computed fontSize of every `[data-role="figure"]`") and ST-13 (the
 * `::after` read on `[data-role="paren-spacer"]`) state their selector as a
 * bare literal in prose, with no call around it — a call-only parser reports
 * an unchanged list when those rot, leaving the two steps that guard the
 * font-size and paren-spacer invariants completely unprotected.
 *
 * So every `[data-*="..."]` literal in the document is extracted and must
 * resolve. Historical prose naming a REMOVED hook would fail here, which is
 * correct: the dead-selector test already forbids that, and a document should
 * not name a hook it does not want the reader to query.
 */
const documentedSelectors = (): string[] => {
  // (a) The COMPLETE argument of every querySelector/querySelectorAll call.
  //     Whole-selector, so a compound query is checked as one unit: ST-10's
  //     `[data-role="col-head"] .MuiTypography-root` must resolve including
  //     its descendant half. Extracting only the attribute fragment would
  //     leave `.MuiTypography-root` free to rot unnoticed.
  //     The body excludes only the DELIMITER via a backreference, not every
  //     quote character: these arguments are single-quoted but contain double
  //     quotes (`'[data-role="col-head"] .MuiTypography-root'`), so a
  //     `[^'"`]+` body stops at the first inner quote and yields a truncated
  //     selector that silently resolves.
  const calls = [...doc.matchAll(/querySelector(?:All)?\(\s*(['"`])((?:(?!\1).)+)\1/g)].map(
    (m) => m[2],
  )
  // (b) Every bare `[data-*="..."]` literal, wherever it appears — ST-12 and
  //     ST-13 state theirs in prose with no call around them.
  const attrs = [...doc.matchAll(/\[data-[a-z0-9-]+="[^"]+"\]/g)].map((m) => m[0])
  return [...new Set([...calls, ...attrs])]
}

/**
 * Selectors that address something OUTSIDE Statement, so they cannot be
 * resolved against a rendered Statement. Each is verified to exist in its own
 * component's source instead.
 */
const EXTERNAL_SELECTORS: Record<string, string> = {
  '.entity-table-card thead th .MuiTypography-root': 'src/components/common/EntityTable.tsx',
  // The Form B page wrapper the ST-12 probe waits for before measuring; it is
  // the PAGE around Statement, not part of it.
  '[data-testid="pl-tax-view"]': 'src/pages/accounting/FormBTaxView.tsx',
}

const row = (over: Partial<StatementRow> = {}): StatementRow => ({
  id: 'r',
  kind: 'line',
  depth: 0,
  label: 'Row',
  figures: ['1234.5600'],
  testId: 'row-r',
  ...over,
})

/** A statement with enough shape to exercise the plural hooks. */
const renderStatement = () =>
  render(
    <ThemeProvider theme={darkTheme}>
      <Statement
        rows={[row(), row({ id: 's', kind: 'subtotal', label: 'Total', testId: 'row-s' })]}
        figureHeads={['Amount', 'Total']}
        label="QA contract"
      />
    </ThemeProvider>,
  )

describe('STATEMENT_THEME_QA selector contract', () => {
  it('extracts the selectors the document tells the reader to query', () => {
    // Guards the parser itself: a regex that silently matched nothing would
    // make every per-selector test below vacuously pass.
    const found = documentedSelectors()
    expect(found.length).toBeGreaterThanOrEqual(3)
    expect(found).toContain('[data-testid="statement-scroller"]')
  })

  it('extracts COMPOUND queries whole, not just their attribute fragment', () => {
    // ST-10 queries `[data-role="col-head"] .MuiTypography-root`. An extractor
    // that pulled only the `[data-role="col-head"]` fragment would report an
    // unchanged list when the descendant half rots — the header-typography
    // step would then measure nothing while still reading as a pass.
    const found = documentedSelectors()
    expect(found).toContain('[data-role="col-head"] .MuiTypography-root')
    // And the compound must actually resolve: the fragment alone matching is
    // not enough, which is the whole point of keeping it whole.
    const { container } = renderStatement()
    expect(container.querySelector('[data-role="col-head"] .MuiTypography-root')).not.toBeNull()
  })

  it('resolves every documented selector against a rendered Statement', () => {
    const { container } = renderStatement()
    const unresolved = documentedSelectors()
      .filter((s) => !(s in EXTERNAL_SELECTORS))
      .filter((s) => container.querySelector(s) === null)
    expect(unresolved).toEqual([])
  })

  it.each(Object.entries(EXTERNAL_SELECTORS))(
    'external selector %s still exists in %s',
    (selector, sourceFile) => {
      // These address another component, so a render cannot check them. Verify
      // the distinguishing token is still in that component's source: the
      // attribute VALUE for a [data-*="..."] selector, the bare class name for
      // a class selector.
      const source = readFileSync(path.resolve(__dirname, '../../../../..', sourceFile), 'utf8')
      const head = selector.split(' ')[0]
      const attr = head.match(/^\[data-[a-z0-9-]+="([^"]+)"\]$/)
      expect(source).toContain(attr ? attr[1] : head.replace(/^\./, ''))
    },
  )

  it('names no selector from the removed stylesheet markup', () => {
    // `statement.css` and its two-cell figure split are gone (#1224, #1235).
    // Matched with a leading dot so prose naming the historical CLASS (e.g.
    // "the old stmt-col-head rule") is not a false positive — only a live CSS
    // selector is.
    const dead = [
      '.stmt-cell-figure',
      '.stmt-paren-spacer',
      '.stmt-col-head',
      '.stmt-scroller',
      '.stmt-root',
      '.stmt-cell-figure-int',
      '.stmt-cell-figure-frac',
    ].filter((selector) => doc.includes(selector))
    expect(dead).toEqual([])
  })
})

describe('runQaPreflight', () => {
  it('passes on a correctly rendered Statement and reports match counts', () => {
    const { container } = renderStatement()
    const results = runQaPreflight(container)
    expect(results).toHaveLength(QA_REQUIRED_HOOKS.length)
    for (const r of results) expect(r.found).toBeGreaterThanOrEqual(r.min)
  })

  it('THROWS naming the hook when one is missing', () => {
    // The failure the whole preflight exists for: a hook that resolves to
    // nothing. An empty container stands in for a renamed selector.
    const empty = document.createElement('div')
    expect(() => runQaPreflight(empty)).toThrow(/preflight FAILED/)
    expect(() => runQaPreflight(empty)).toThrow(/statement-scroller/)
  })

  it('THROWS on an EMPTY COLLECTION, not just a null match', () => {
    // A statement rendered with no rows still has a root, a scroller and its
    // column heads — but ZERO figure cells. querySelectorAll returns an empty
    // NodeList there, which a hand-run loop would iterate zero times and call
    // a pass. The preflight must reject it.
    const { container } = render(
      <ThemeProvider theme={darkTheme}>
        <Statement rows={[]} figureHeads={['Amount', 'Total']} label="empty" />
      </ThemeProvider>,
    )
    expect(container.querySelector('[data-testid="statement-scroller"]')).not.toBeNull()
    expect(container.querySelectorAll('[data-role="figure"]')).toHaveLength(0)
    expect(() => runQaPreflight(container)).toThrow(/data-role="figure"/)
  })

  it('every hook it requires is one the document documents', () => {
    // Keeps the preflight and the procedure from drifting apart: a hook
    // enforced here but absent from the document would fail a reader who
    // follows the written steps.
    for (const { selector } of QA_REQUIRED_HOOKS) expect(doc).toContain(selector)
  })
})

describe('qaPreflightSnippet — what the QA reader actually pastes', () => {
  /*
   * The module's own source CANNOT be pasted into a console: it is TypeScript
   * with ESM exports (`SyntaxError: Unexpected token 'export'`), and stripping
   * the keywords still leaves `QA_REQUIRED_HOOKS` undefined
   * (`ReferenceError`). The snippet exists to be pasteable, so these tests
   * EXECUTE it the way a console would rather than merely inspecting it.
   */
  const snippet = qaPreflightSnippet()

  /** Run the snippet against a fake DOM, exactly as a console paste would. */
  const runSnippet = (counts: Record<string, number>) => {
    const fakeDoc = { querySelectorAll: (sel: string) => ({ length: counts[sel] ?? 0 }) }
    // eslint-disable-next-line @typescript-eslint/no-implied-eval, no-new-func
    return new Function('document', 'console', snippet)(fakeDoc, { table: () => {} })
  }

  const allPresent = Object.fromEntries(QA_REQUIRED_HOOKS.map((h) => [h.selector, h.min]))

  it('contains no TypeScript or module syntax', () => {
    expect(snippet).not.toMatch(/\bexport\b/)
    expect(snippet).not.toMatch(/\bimport\b/)
    expect(snippet).not.toMatch(/:\s*(string|number|readonly)\b/)
  })

  it('parses and RUNS as plain browser JavaScript', () => {
    expect(() => runSnippet(allPresent)).not.toThrow()
  })

  it('throws, naming the hook, when one is unusable', () => {
    expect(() => runSnippet({ ...allPresent, '[data-role="figure"]': 0 })).toThrow(
      /data-role="figure"/,
    )
  })

  it('throws when the paren spacer is missing', () => {
    // The hook the first version of this preflight omitted entirely, leaving
    // ST-13's ::after read unguarded.
    expect(() => runSnippet({ ...allPresent, '[data-role="paren-spacer"]': 0 })).toThrow(
      /paren-spacer/,
    )
  })

  it('enforces every hook the module declares', () => {
    for (const hook of QA_REQUIRED_HOOKS) {
      expect(() => runSnippet({ ...allPresent, [hook.selector]: hook.min - 1 })).toThrow(
        new RegExp(hook.selector.replace(/[[\]*+?.\\^$|]/g, '\\$&')),
      )
    }
  })

  it('is embedded in the QA document VERBATIM', () => {
    // The document is what a reader copies from, so a stale block there is the
    // whole failure this guards. Regenerate with qaPreflightSnippet() when a
    // hook changes.
    expect(doc).toContain(snippet)
  })
})

describe('Statement paren spacer', () => {
  it('renders as generated content, not a text node', () => {
    // The invariant CLAUDE.md calls out: a real ')' would reserve the same
    // width and look identical in a browser, so only the DOM can tell them
    // apart. `toHaveTextContent` is a substring match and would NOT catch it.
    renderStatement()
    const figure = screen.getByTestId('row-r-fig0')
    // The cell holds TWO text sources: the visually-hidden complete value and
    // the aria-hidden visible span. Assert on the visible one so the check is
    // about the spacer, not the a11y node.
    const visible = figure.querySelector('[aria-hidden="true"]')
    expect(visible?.textContent).toBe('1,234.56')
    expect(figure.textContent).not.toContain(')')
    expect(figure.querySelector('[data-role="paren-spacer"]')?.textContent).toBe('')
  })
})
