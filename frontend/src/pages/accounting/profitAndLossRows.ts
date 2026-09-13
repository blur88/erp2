import type { StatementRow } from '@/components/accounting/Statement'
import type { PlAccountRow, ProfitAndLossResponse } from '@/types'

const isZeroAmount = (amount: string) => amount === '0.0000'

/**
 * ProfitAndLossResponse → StatementRow[].
 *
 * Extracted from ProfitAndLossAccountingView so the shaping is unit-testable
 * without rendering. Row ids and testids are unchanged: 46 existing tests
 * address rows by testid.
 */
export function buildProfitAndLossRows(
  data: ProfitAndLossResponse,
  expanded: Set<string>,
  buildHref: (accountId: string) => string,
  toggle: (rowId: string) => void,
): StatementRow[] {
  const out: StatementRow[] = []
  const amountFigures = (amount: string, isCalculatedTotal = false, isTotal = false) =>
    isCalculatedTotal
      ? {
          figures: [null, amount],
          blankFigures: [true, false],
          topBorderFigures: isTotal ? [false, true] : [false, false],
        }
      : {
          figures: [amount, null],
          blankFigures: [false, true],
          topBorderFigures: isTotal ? [true, false] : [false, false],
        }

  for (const section of data.sections) {
    const isCogs = section.key === 'cogs'
    const totalAmount = isCogs ? data.totalCostOfSales : section.total
    const totalRowId = isCogs ? data.totalCostOfSalesRowId : section.totalRowId

    out.push({
      id: section.rowId,
      kind: 'section',
      depth: 0,
      label: section.label,
      figures: [],
      testId: `pl-section-${section.key}`,
    })

    /*
     * PlAccountRow.children is RECURSIVE and each descendant carries its own
     * isPostable, so this must walk, not loop one level. A nested non-postable
     * node stays expandable and non-selectable at any depth; treating every
     * child as a selectable leaf would link a group row to an account that
     * cannot be posted to.
     */
    const walk = (nodes: PlAccountRow[], depth: number) => {
      for (const node of nodes) {
        const isZero = isZeroAmount(node.amount)

        if (node.isPostable) {
          out.push({
            id: node.rowId,
            kind: 'line',
            depth,
            code: node.code,
            label: node.name,
            ...amountFigures(node.amount),
            testId: `pl-row-${node.rowId}`,
            isZero,
            href: node.accountId ? buildHref(node.accountId) : undefined,
          })
          continue
        }

        const isExpanded = expanded.has(node.rowId)
        out.push({
          id: node.rowId,
          kind: 'line',
          depth,
          code: node.code,
          label: node.name,
          ...amountFigures(node.amount),
          testId: `pl-row-${node.rowId}`,
          isZero,
          expand: { expanded: isExpanded, onToggle: () => toggle(node.rowId) },
          expandTestId: `pl-expand-${node.rowId}`,
        })
        if (isExpanded) walk(node.children, depth + 1)
      }
    }
    walk(section.rows, 0)

    if (isCogs) {
      out.push({
        id: data.inventoryAdjustmentsRowId,
        kind: 'line',
        depth: 0,
        label: 'Inventory Adjustments',
        ...amountFigures(data.inventoryAdjustments),
        testId: `pl-row-${data.inventoryAdjustmentsRowId}`,
        isZero: isZeroAmount(data.inventoryAdjustments),
      })
    }

    out.push({
      id: totalRowId,
      kind: 'subtotal',
      depth: 0,
      label: section.totalLabel,
      ...amountFigures(totalAmount, false, true),
      sectionTotalGap: true,
      testId: `pl-row-${totalRowId}`,
      amountHook: 'pl-amount',
      isZero: isZeroAmount(totalAmount),
    })

    // Gross Profit follows Cost of Sales directly, before Other Income.
    if (isCogs) {
      out.push({
        id: 'grossProfit',
        kind: 'subtotal',
        depth: 0,
        label: 'Gross Profit',
        ...amountFigures(data.grossProfit, true, true),
        sectionTotalGap: true,
        testId: 'pl-row-grossProfit',
        isZero: isZeroAmount(data.grossProfit),
      })
    }
  }

  out.push({
    id: 'netProfit',
    kind: 'bottomLine',
    depth: 0,
    label: 'Net Profit',
    ...amountFigures(data.netProfit, true, true),
    // The bottom line closes the statement and kept this spacing before the
    // label-matched rule was replaced ('NET PROFIT' was in that set).
    sectionTotalGap: true,
    testId: 'pl-row-netProfit',
    // Single-node amount hook, for consistency with the Balance Sheet rows.
    // No suite asserts it on a rendered P&L row; StatementFigure's tests
    // synthesize the hook. It exists so every report exposes its amounts the
    // same way.
    amountHook: 'pl-amount',
    isZero: isZeroAmount(data.netProfit),
  })

  return out
}
