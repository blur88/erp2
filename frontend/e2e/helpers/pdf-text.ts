import { readFile } from 'node:fs/promises'

/**
 * Text extracted from a generated PDF, with page attribution and coordinates.
 *
 * pdf-lib (used elsewhere in this suite) gives page COUNT only. The spec's
 * grouping and completeness assertions need to know which page a given row
 * landed on, which requires real text extraction.
 *
 * IMPORTANT: PDF text-item order is NOT row order. Items are emitted in
 * content-stream order, which need not follow visual or DOM order. Rows are
 * therefore identified by code + label, never by index.
 */

/**
 * One text fragment, with REAL PDF geometry retained.
 *
 * `width` comes from pdf.js and is needed for two things a character offset
 * cannot do: infer a missing space from the horizontal gap between runs, and
 * decide which column region a fragment sits in.
 */
export interface PdfTextItem {
  text: string
  /** 1-based page number. */
  page: number
  /** PDF user-space coordinates; y increases UPWARD from the page bottom. */
  x: number
  y: number
  /** Advance width of this fragment, in points. */
  width: number
  /** Glyph height, in points — used as the baseline-proximity scale. */
  height: number
}

/**
 * One reassembled visual line.
 *
 * `cells` preserves the fragment geometry so callers can select a COLUMN
 * REGION. Matching a bare line substring is not sound: "Revenue" occurs inside
 * "Total Revenue", and "Cost of Sales" inside "Total Cost of Sales", so a
 * substring completeness check fails on correct output.
 */
export interface PdfLine {
  page: number
  /** Baseline y of the line's first fragment. */
  y: number
  /** Whole-line text, spaces inferred from inter-fragment gaps. */
  text: string
  /** Fragments in x order, geometry retained. */
  cells: PdfTextItem[]
}

export async function extractPdfText(pdfPath: string): Promise<PdfTextItem[]> {
  // Legacy build: Node has no DOM, and the default build assumes browser APIs.
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const data = new Uint8Array(await readFile(pdfPath))
  // pdfjs-dist v6 removed PDFDocumentProxy.destroy(); the LOADING TASK owns
  // teardown, so keep a handle to it.
  const task = pdfjs.getDocument({ data, useSystemFonts: true })
  const doc = await task.promise

  const items: PdfTextItem[] = []
  for (let page = 1; page <= doc.numPages; page += 1) {
    const content = await (await doc.getPage(page)).getTextContent()
    for (const item of content.items as any[]) {
      if (typeof item.str !== 'string' || item.str.trim() === '') continue
      items.push({
        text: item.str,
        page,
        // transform is [a, b, c, d, e, f]; e and f are the x/y translation.
        x: item.transform[4],
        y: item.transform[5],
        width: typeof item.width === 'number' ? item.width : 0,
        height: typeof item.height === 'number' && item.height > 0 ? item.height : 10,
      })
    }
  }
  await task.destroy()
  return items
}

/**
 * Group fragments into visual lines by BASELINE PROXIMITY, not by rounding y
 * into fixed buckets.
 *
 * Rounding splits two nearly identical baselines whenever they straddle a
 * bucket edge (y=699.9 and y=700.1 round apart at any integer bucket). This
 * sorts by y and starts a new line only when the gap exceeds a fraction of the
 * glyph height, so jitter well below one line-height always coalesces.
 */
const normalizeText = (t: string) => t.replace(/\s+/g, ' ').trim()

export function pdfLines(items: PdfTextItem[]): PdfLine[] {
  const lines: PdfLine[] = []

  for (const page of [...new Set(items.map((i) => i.page))].sort((a, b) => a - b)) {
    const onPage = items.filter((i) => i.page === page).sort((a, b) => b.y - a.y)
    let group: PdfTextItem[] = []

    const flush = () => {
      if (group.length === 0) return
      const cells = [...group].sort((a, b) => a.x - b.x)
      lines.push({ page, y: cells[0].y, text: joinCells(cells), cells })
      group = []
    }

    for (const item of onPage) {
      if (group.length === 0) {
        group.push(item)
        continue
      }
      // Same line while the baseline gap stays well under one glyph height.
      const tolerance = Math.max(1, Math.min(item.height, group[0].height) * 0.5)
      if (Math.abs(group[0].y - item.y) <= tolerance) group.push(item)
      else {
        flush()
        group.push(item)
      }
    }
    flush()
  }

  return lines.sort((a, b) => a.page - b.page || b.y - a.y)
}

/**
 * Join fragments, INFERRING a space from the horizontal gap.
 *
 * Joining with '' cannot restore a space the content stream omitted between
 * runs ("Total" + "Revenue" → "TotalRevenue"); joining with ' ' invents spaces
 * inside a word split mid-token. Using the gap decides per boundary: a gap
 * wider than a nominal quarter-em means the glyphs are visually separated.
 */
function joinCells(cells: PdfTextItem[]): string {
  let out = cells[0]?.text ?? ''
  for (let i = 1; i < cells.length; i += 1) {
    const prev = cells[i - 1]
    const cur = cells[i]
    const gap = cur.x - (prev.x + prev.width)
    const spaceThreshold = Math.max(0.5, cur.height * 0.25)
    const needsSpace =
      gap > spaceThreshold && !prev.text.endsWith(' ') && !cur.text.startsWith(' ')
    out += (needsSpace ? ' ' : '') + cur.text
  }
  return normalizeText(out)
}

/**
 * A row's IDENTITY: its code and its label together.
 *
 * Neither alone is a key. Labels repeat by design — Form B's N7 subtotal is
 * labelled "Cost of Sales", the same as the uncoded section heading above it;
 * the Balance Sheet's N33 "Investments" collides with its section label. And a
 * heading has no code at all. `code: null` therefore means "an uncoded row
 * with this label", which is itself a distinct identity.
 */
export interface RowIdentity {
  code: string | null
  label: string
}

export type RowKind = 'section' | 'line' | 'subtotal' | 'bottomLine'

/** One entry of a report's ordered expected-row inventory. */
export interface ExpectedRow extends RowIdentity {
  kind: RowKind
}

/**
 * A located row: its identity plus where it landed in the PDF.
 */
export interface LocatedRow extends RowIdentity {
  page: number
  y: number
}

/**
 * A leading row code, as a COMPLETE token: an N-code (`N38`) or an account
 * code (`4100`, `9a06510`). Required to be followed by whitespace, so `410`
 * never matches inside `41000`.
 */
const LEADING_CODE_RE = /^(N\d{1,3}|\d[\w-]*)(?=\s)\s+/

/** Integer part, with or without thousands separators. */
const INT_PART = String.raw`\d{1,3}(?:,\d{3})*|\d+`

/**
 * ONE rendered amount. Three shapes must all match:
 *   joined      `1,234.00`      `(1,234.00)`
 *   SPLIT CELLS `1,234 .00`     `(1,234 .00)`   ← what this redesign emits
 *   unknown     `—`
 *
 * The optional `\s?` before the fraction is what covers the split, and it is
 * why the fraction is NOT a separate alternative: making `\.\d{2}` its own
 * token meant a joined `1,234.00` matched nothing, and the old
 * strip-until-stable loop then ate backwards through numeric label text
 * ("Office 365 1,234 .00" → "Office").
 */
const AMOUNT = String.raw`(?:\(?(?:${INT_PART})\s?\.\d{2}\)?|—)`

/** Exactly `n` trailing amounts, anchored at end of line. */
const trailingAmountsRe = (n: number) =>
  new RegExp(String.raw`(?:\s${AMOUNT}){${n}}$`)

/**
 * Split a reassembled line into `{ code, label }`.
 *
 * Strips a leading code token, then EXACTLY the expected number of trailing
 * amounts in ONE anchored match — never by repeatedly removing whatever
 * numeric token happens to sit at the end. That distinction is the whole
 * point: a label may legitimately end in a number ("Office 365",
 * "Sub-account 2"), and a repeated strip cannot tell that from a figure.
 *
 * `figureCount` is the number of figure columns the report renders (1 today).
 * Fewer amounts than expected is normal — a section heading has none — so this
 * tries `figureCount` down to 1 and takes the first that matches.
 *
 * No column boundary is measured. An earlier attempt derived one from the
 * leftmost "money-shaped" fragment, which was unsound in both directions: the
 * pattern also matched bare integers (a page number, a numeric label
 * fragment) and missed the split fractional cell.
 */
export function parseRowIdentity(lineText: string, figureCount = 1): RowIdentity {
  let rest = normalizeText(lineText)

  const codeMatch = LEADING_CODE_RE.exec(rest)
  const code = codeMatch ? codeMatch[1] : null
  if (codeMatch) rest = rest.slice(codeMatch[0].length)

  for (let n = figureCount; n >= 1; n -= 1) {
    const stripped = rest.replace(trailingAmountsRe(n), '')
    if (stripped !== rest) {
      rest = stripped
      break
    }
  }

  return { code, label: normalizeText(rest) }
}

const sameIdentity = (a: RowIdentity, b: RowIdentity) =>
  a.code === b.code && normalizeText(a.label) === normalizeText(b.label)

/**
 * A candidate row assembled from ONE OR MORE consecutive visual lines.
 *
 * A long label WRAPS: the browser lays one table row across several baselines,
 * with the code and the figure on the first line and the label's remaining
 * words on the lines below. Parsing each visual line independently can never
 * match such a row's full inventory label, so the parser joins continuation
 * lines before comparing.
 *
 * A continuation line is recognised structurally, not by guessing:
 *   - it carries NO leading code token, and
 *   - it carries NO trailing amount, and
 *   - its label text starts at or right of the parent line's label x, and
 *   - it is within one line-height of the previous line.
 *
 * A row that has its own code or its own figure therefore can never be
 * absorbed as a continuation — which is what stops a wrapped label from
 * swallowing the row beneath it.
 */
interface RowCandidate extends RowIdentity {
  page: number
  y: number
  /** How many visual lines were joined. 1 for an unwrapped row. */
  lineCount: number
}

/** x of the first fragment that is not the leading code, i.e. where the label starts. */
function labelStartX(line: PdfLine, hasCode: boolean): number {
  const cells = line.cells
  if (!hasCode || cells.length < 2) return cells[0]?.x ?? 0
  return cells[1].x
}

/**
 * Assemble row candidates from visual lines, joining wrapped continuations.
 *
 * `expected` is REQUIRED, and it is what makes this safe. An UNCODED HEADING —
 * a P&L section head, a Form B cohort heading ("Mapped to this line") — has no
 * code, no amount, and label-column text near the row above it, which is
 * exactly the shape a structural continuation test accepts. Without the
 * inventory, such a heading is silently absorbed into the row above and BOTH
 * rows then fail to match.
 *
 * So a line whose own text matches the start of any expected row's label
 * begins a new row, never continues one. Expected row starts win over the
 * geometric heuristic.
 *
 * `figureCount` is the number of figure columns, so a trailing amount is
 * recognised the same way `parseRowIdentity` recognises it.
 */
export function rowCandidates(
  items: PdfTextItem[],
  expected: readonly ExpectedRow[],
  figureCount = 1,
): RowCandidate[] {
  const lines = pdfLines(items)
  const out: RowCandidate[] = []

  /*
   * The set of label PREFIXES that begin an expected row. A wrapped row's
   * first line carries only the start of its label, so matching on a prefix
   * (rather than the whole label) is what lets a long row still be recognised
   * as a row start.
   */
  const expectedLabels = expected.map((e) => normalizeText(e.label))
  const startsAnExpectedRow = (text: string): boolean => {
    const t = normalizeText(text)
    if (t === '') return false
    return expectedLabels.some((label) => label === t || label.startsWith(t))
  }

  for (const [i, line] of lines.entries()) {
    const text = normalizeText(line.text)
    const hasCode = LEADING_CODE_RE.test(text)
    const hasAmount = trailingAmountsRe(1).test(text)
    const prev = out[out.length - 1]
    const prevLine = i > 0 ? lines[i - 1] : undefined

    const isContinuation =
      prev !== undefined &&
      prevLine !== undefined &&
      !hasCode &&
      !hasAmount &&
      // An uncoded HEADING is not a continuation, however it is positioned.
      !startsAnExpectedRow(text) &&
      prev.page === line.page &&
      // Within roughly one line-height of the line above.
      Math.abs(prevLine.y - line.y) <= (line.cells[0]?.height ?? 10) * 2 &&
      // Indented to (or beyond) the parent's label column.
      line.cells[0].x >=
        labelStartX(prevLine, LEADING_CODE_RE.test(normalizeText(prevLine.text))) - 1

    if (isContinuation) {
      prev.label = normalizeText(`${prev.label} ${text}`)
      prev.lineCount += 1
      continue
    }

    const identity = parseRowIdentity(text, figureCount)
    out.push({ ...identity, page: line.page, y: line.y, lineCount: 1 })
  }

  return out
}

/**
 * Locate every expected row in the PDF, asserting each appears EXACTLY ONCE.
 *
 * Candidates come from `rowCandidates`, so a wrapped label is matched as one
 * row. Returns them in PDF render order, so callers derive neighbour
 * relationships from the inventory's own order rather than from adjacent PDF
 * lines (a repeated column header or page footer sits between rows across a
 * break).
 *
 * Throws with a full report — missing rows AND duplicated rows — so one run
 * names every problem rather than the first.
 */
export function locateRows(
  items: PdfTextItem[],
  expected: readonly ExpectedRow[],
  figureCount = 1,
): LocatedRow[] {
  const parsed = rowCandidates(items, expected, figureCount)

  const missing: string[] = []
  const duplicated: string[] = []
  const located: LocatedRow[] = []

  for (const row of expected) {
    const hits = parsed.filter((c) => sameIdentity(c, row))
    const name = `${row.code ?? '(no code)'} "${row.label}"`
    if (hits.length === 0) missing.push(name)
    else if (hits.length > 1)
      duplicated.push(`${name} on pages ${hits.map((h) => h.page).join(', ')}`)
    else located.push({ code: row.code, label: row.label, page: hits[0].page, y: hits[0].y })
  }

  if (missing.length > 0 || duplicated.length > 0) {
    throw new Error(
      [
        missing.length > 0 ? `rows MISSING from the PDF:\n  ${missing.join('\n  ')}` : '',
        duplicated.length > 0
          ? `rows DUPLICATED in the PDF:\n  ${duplicated.join('\n  ')}`
          : '',
      ]
        .filter(Boolean)
        .join('\n'),
    )
  }

  return located.sort((a, b) => a.page - b.page || b.y - a.y)
}

/**
 * Derive every grouping pair from an ordered inventory.
 *
 * Two rules, exactly the two the CSS requests — no hand-picked pairs, and no
 * per-report exceptions:
 *   - `break-after: avoid` on a section  ⇒ each section heading pairs with the
 *     row that FOLLOWS it in the inventory.
 *   - `break-before: avoid` on a subtotal/bottomLine ⇒ each pairs with the row
 *     that PRECEDES it in the inventory.
 *
 * A section may span pages; only these adjacencies are promised.
 */
export function derivePairs(
  expected: readonly ExpectedRow[],
): { row: RowIdentity; neighbour: RowIdentity; because: string }[] {
  const pairs: { row: RowIdentity; neighbour: RowIdentity; because: string }[] = []
  for (const [i, row] of expected.entries()) {
    if (row.kind === 'section' && expected[i + 1]) {
      pairs.push({
        row: expected[i + 1],
        neighbour: row,
        because: `section heading "${row.label}" must keep its first row`,
      })
    }
    if ((row.kind === 'subtotal' || row.kind === 'bottomLine') && expected[i - 1]) {
      pairs.push({
        row,
        neighbour: expected[i - 1],
        because: `${row.kind} "${row.label}" must keep the row above it`,
      })
    }
  }
  return pairs
}

/** A code matched as a COMPLETE whitespace-delimited token. */
export function hasCodeToken(items: PdfTextItem[], code: string): number {
  const target = normalizeText(code)
  return pdfLines(items).filter((l) => normalizeText(l.text).split(' ').includes(target)).length
}

/**
 * Line count containing `needle` as a SUBSTRING anywhere. For amounts only —
 * use `hasCodeToken` for codes.
 */
export function containsText(items: PdfTextItem[], needle: string): number {
  const target = normalizeText(needle)
  return pdfLines(items).filter((l) => normalizeText(l.text).includes(target)).length
}
