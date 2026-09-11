import { PDFDocument, StandardFonts } from 'pdf-lib'
import { writeFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'

import {
  extractPdfText,
  pdfLines,
  parseRowIdentity,
  locateRows,
  rowCandidates,
  derivePairs,
  hasCodeToken,
  type ExpectedRow,
} from '../pdf-text.js'

const outDir = path.join(process.cwd(), 'e2e-results')
mkdirSync(outDir, { recursive: true })
const out = path.join(outDir, 'pdf-text-probe.pdf')

const doc = await PDFDocument.create()
const font = await doc.embedFont(StandardFonts.Helvetica)
const size = 10

/**
 * Draw a statement row the way the redesign renders it: code, label, then the
 * figure SPLIT into an integer cell and a fractional cell.
 */
const drawRow = (
  page: any,
  y: number,
  code: string,
  label: string,
  int: string,
  frac: string,
) => {
  if (code) page.drawText(code, { x: 40, y, size, font })
  page.drawText(label, { x: 90, y, size, font })
  // Integer part right-aligned to the anchor; fraction left-aligned after it.
  const anchor = 480
  page.drawText(int, { x: anchor - font.widthOfTextAtSize(int, size), y, size, font })
  page.drawText(frac, { x: anchor, y, size, font })
}

const p1 = doc.addPage([595.28, 841.89])
// A page number — a bare integer that must NEVER be read as a figure or row.
p1.drawText('1', { x: 300, y: 30, size, font })

drawRow(p1, 780, '', 'Cost of Sales', '', '')            // uncoded heading
drawRow(p1, 760, 'N4', 'Opening Inventory', '1,000', '.00')
drawRow(p1, 740, 'N5', 'Purchases and Production Costs', '61,200', '.00')
drawRow(p1, 720, 'N6', 'Closing Inventory', '(840', '.00)')   // negative, split parens
drawRow(p1, 700, 'N7', 'Cost of Sales', '61,360', '.00')      // SAME label as heading
drawRow(p1, 680, 'N8', 'Gross Profit / Loss', '1,234,567,890', '.00') // large
drawRow(p1, 660, 'N9', 'Other Business', '—', '')             // unknown
// Numeric account codes that must match as COMPLETE tokens only.
drawRow(p1, 640, '4100', 'Coded Row', '5', '.00')
drawRow(p1, 620, '41000', 'Other Coded Row', '5', '.00')
// A label long enough to cross any fixed fraction of page width.
const LONG = 'Provision for Doubtful Debts on Long Outstanding Trade Receivables'
drawRow(p1, 600, 'N24', LONG, '9,999', '.00')

// Page 2: one identity rendered TWICE — the duplicate locateRows must reject.
const p2 = doc.addPage([595.28, 841.89])
drawRow(p2, 780, 'N30', 'Twice Printed', '1', '.00')
drawRow(p2, 760, 'N30', 'Twice Printed', '1', '.00')

/*
 * Page 3: a WRAPPED label. The code and figure sit on the first baseline; the
 * label's remaining words are laid out below, indented to the label column.
 * Immediately after it sits an ordinary row that must NOT be absorbed as a
 * continuation — it has its own code and its own figure.
 */
const WRAPPED = 'Provision for Doubtful Debts on Long Outstanding Trade Receivables Balance'
const [w1, w2] = ['Provision for Doubtful Debts on Long', 'Outstanding Trade Receivables Balance']
const p3 = doc.addPage([595.28, 841.89])
drawRow(p3, 780, 'N31', w1, '9,999', '.00')
// Continuation: no code, no figure, indented to the label x used by drawRow.
p3.drawText(w2, { x: 90, y: 768, size, font })
// The neighbour that must stay its own row.
drawRow(p3, 740, 'N32', 'Not Absorbed', '1', '.00')

/*
 * Page 4: a wrapped row followed IMMEDIATELY by an UNCODED HEADING.
 * The heading has no code, no amount, and sits in the label column right
 * below the wrap — the exact shape a purely geometric continuation test
 * absorbs. Only the expected-row-starts guard keeps them separate.
 */
const p4 = doc.addPage([595.28, 841.89])
drawRow(p4, 780, 'N33', w1, '5,000', '.00')
p4.drawText(w2, { x: 90, y: 768, size, font })       // continuation of N33
p4.drawText('Mapped to this line', { x: 90, y: 756, size, font })  // UNCODED heading
drawRow(p4, 736, 'N34', 'After Heading', '7', '.00')

writeFileSync(out, await doc.save())
const items = await extractPdfText(out)

const id = (label: string) => {
  const line = pdfLines(items).find((l) => l.text.includes(label))
  return line ? parseRowIdentity(line.text) : null
}

const inventory: ExpectedRow[] = [
  { code: null, label: 'Cost of Sales', kind: 'section' },
  { code: 'N4', label: 'Opening Inventory', kind: 'line' },
  { code: 'N5', label: 'Purchases and Production Costs', kind: 'line' },
  { code: 'N6', label: 'Closing Inventory', kind: 'line' },
  { code: 'N7', label: 'Cost of Sales', kind: 'subtotal' },
]

/** The wrap/heading cases as an inventory, so rowCandidates gets its guard. */
const wrapInventory: ExpectedRow[] = [
  { code: 'N31', label: WRAPPED, kind: 'line' },
  { code: 'N32', label: 'Not Absorbed', kind: 'line' },
  { code: 'N33', label: WRAPPED, kind: 'line' },
  { code: null, label: 'Mapped to this line', kind: 'line' },
  { code: 'N34', label: 'After Heading', kind: 'line' },
]
const wrapCandidates = rowCandidates(items, wrapInventory)

const throws = (fn: () => unknown) => {
  try {
    fn()
    return false
  } catch {
    return true
  }
}

const checks: [string, boolean][] = [
  ['extracted text', items.length > 0],
  [
    'items carry coordinates and widths',
    items.every((i) => [i.x, i.y, i.width].every(Number.isFinite)),
  ],

  /*
   * --- Identity parsing, as PURE unit cases. ---
   * These ran against the planned regex and are the exact shapes an earlier
   * draft got wrong: a JOINED amount was left in the label, and a
   * strip-until-stable loop ate a numeric label ("Office 365" → "Office").
   */
  ['joined amount stripped', parseRowIdentity('Total Revenue 1,234.00').label === 'Total Revenue'],
  [
    'joined NEGATIVE amount stripped',
    parseRowIdentity('Total Revenue (1,234.00)').label === 'Total Revenue',
  ],
  ['split amount stripped', parseRowIdentity('Total Revenue 1,234 .00').label === 'Total Revenue'],
  [
    'split NEGATIVE amount stripped',
    parseRowIdentity('N6 Closing Inventory (840 .00)').label === 'Closing Inventory',
  ],
  // A label that legitimately ENDS IN A NUMBER must survive, both figure shapes.
  [
    'numeric label survives a split amount',
    parseRowIdentity('Office 365 1,234 .00').label === 'Office 365',
  ],
  [
    'numeric label survives a joined amount',
    parseRowIdentity('Office 365 1,234.00').label === 'Office 365',
  ],
  ['em-dash amount stripped', parseRowIdentity('Other Business —').label === 'Other Business'],
  ['no amount leaves the label whole', parseRowIdentity('Cost of Sales').label === 'Cost of Sales'],
  [
    'account code captured as a token',
    parseRowIdentity('4100 Coded Row 5 .00').code === '4100',
  ],
  [
    'two figure columns stripped when expected',
    parseRowIdentity('N30 Trade Debtors 10 .00 20 .00', 2).label === 'Trade Debtors',
  ],
  [
    'large amount stripped',
    parseRowIdentity('Provision for Doubtful Debts 1,234,567,890 .00').label ===
      'Provision for Doubtful Debts',
  ],

  // --- Identity against a REAL rendered PDF. ---
  ['plain figure stripped', id('Opening Inventory')?.label === 'Opening Inventory'],
  ['code captured', id('Opening Inventory')?.code === 'N4'],
  ['NEGATIVE split parens stripped', id('Closing Inventory')?.label === 'Closing Inventory'],
  ['LARGE amount stripped', id('Gross Profit / Loss')?.label === 'Gross Profit / Loss'],
  ['em-dash figure stripped', id('Other Business')?.label === 'Other Business'],
  ['LONG label survives intact', id(LONG)?.label === LONG],

  // --- Identity: uncoded heading vs coded subtotal, same label. ---
  ['heading is uncoded', inventory.length > 0 && locateRows(items, inventory).some(
    (r) => r.code === null && r.label === 'Cost of Sales',
  )],
  ['N7 subtotal is coded', locateRows(items, inventory).some(
    (r) => r.code === 'N7' && r.label === 'Cost of Sales',
  )],

  // --- Completeness: every row exactly once, throwing on either failure. ---
  ['locateRows accepts a complete inventory', !throws(() => locateRows(items, inventory))],
  [
    'locateRows REJECTS a missing row',
    throws(() =>
      locateRows(items, [...inventory, { code: 'N99', label: 'Absent', kind: 'line' }]),
    ),
  ],
  [
    'locateRows REJECTS a row DUPLICATED IN THE PDF',
    // p2 below renders one identity twice; expecting it once must fail.
    throws(() =>
      locateRows(items, [{ code: 'N30', label: 'Twice Printed', kind: 'line' }]),
    ),
  ],

  // --- Codes as complete tokens. ---
  ['code 4100 matches once', hasCodeToken(items, '4100') === 1],
  ['code 410 matches nothing', hasCodeToken(items, '410') === 0],
  ['page number is not a row code', hasCodeToken(items, '1') === 1], // only the page number line

  // --- WRAPPED labels reconstruct into ONE row, absorbing nothing. ---
  [
    'wrapped label resolves to its full inventory label',
    wrapCandidates.filter((c) => c.code === 'N31' && c.label === WRAPPED).length === 1,
  ],
  [
    'wrapped row joined exactly two visual lines',
    wrapCandidates.find((c) => c.code === 'N31')?.lineCount === 2,
  ],
  [
    'the NEIGHBOUR below a wrapped label is not absorbed',
    wrapCandidates.filter((c) => c.code === 'N32' && c.label === 'Not Absorbed').length === 1,
  ],
  // --- An UNCODED HEADING after a wrap must not be swallowed. ---
  [
    'a wrapped row followed by an uncoded heading still resolves',
    wrapCandidates.filter((c) => c.code === 'N33' && c.label === WRAPPED).length === 1,
  ],
  [
    'the uncoded heading survives as its own row',
    wrapCandidates.filter((c) => c.code === null && c.label === 'Mapped to this line')
      .length === 1,
  ],
  [
    'the row after the heading is unaffected',
    wrapCandidates.filter((c) => c.code === 'N34' && c.label === 'After Heading').length === 1,
  ],
  [
    'locateRows accepts wrap + heading + neighbours exactly once each',
    !throws(() => locateRows(items, wrapInventory)),
  ],

  // --- derivePairs covers every promised adjacency. ---
  ['derivePairs yields heading→first-row', derivePairs(inventory).some(
    (p) => p.neighbour.label === 'Cost of Sales' && p.row.label === 'Opening Inventory',
  )],
  ['derivePairs yields preceding→subtotal', derivePairs(inventory).some(
    (p) => p.row.code === 'N7' && p.neighbour.code === 'N6',
  )],
]

let failed = 0
for (const [name, ok] of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`)
  if (!ok) failed += 1
}
console.log(`\n${items.length} items, ${pdfLines(items).length} lines`)
process.exit(failed === 0 ? 0 : 1)
