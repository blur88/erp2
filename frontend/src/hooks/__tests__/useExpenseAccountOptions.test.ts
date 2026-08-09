import { describe, expect, it } from 'vitest'

import { buildEligibleExpenseAccountOptions } from '@/hooks/useExpenseAccountOptions'
import type { AccountTreeNode } from '@/types'

function node(
  id: string,
  code: string,
  name: string,
  isPostable: boolean,
  children: AccountTreeNode[] = [],
): AccountTreeNode {
  return { id, code, name, isPostable, children } as AccountTreeNode
}

// 5000 Operating Expenses (parent, non-postable)
//   ├── 5010 Office Expenses (postable)
//   └── 5100 Cost of Goods Sold (postable, configured COGS)
// 6990 Other Expenses (postable)
const tree: AccountTreeNode[] = [
  node('acct-parent', '5000', 'Operating Expenses', false, [
    node('acct-office', '5010', 'Office Expenses', true),
    node('acct-cogs', '5100', 'Cost of Goods Sold', true),
  ]),
  node('acct-other', '6990', 'Other Expenses', true),
]

describe('buildEligibleExpenseAccountOptions', () => {
  it('flattens to postable nodes only, recursing through non-postable parents', () => {
    const options = buildEligibleExpenseAccountOptions(tree, null)

    expect(options).toEqual([
      { value: 'acct-office', label: '5010 Office Expenses' },
      { value: 'acct-cogs', label: '5100 Cost of Goods Sold' },
      { value: 'acct-other', label: '6990 Other Expenses' },
    ])
  })

  it('excludes the configured COGS account', () => {
    const options = buildEligibleExpenseAccountOptions(tree, 'acct-cogs')

    expect(options.map((o) => o.value)).toEqual(['acct-office', 'acct-other'])
    expect(options.map((o) => o.label)).not.toContain('5100 Cost of Goods Sold')
  })

  it('retains COGS when keepId matches it, for a legacy expense already booked to it', () => {
    const options = buildEligibleExpenseAccountOptions(tree, 'acct-cogs', 'acct-cogs')

    expect(options.map((o) => o.value)).toEqual(['acct-office', 'acct-cogs', 'acct-other'])
  })

  it('excludes nothing when no COGS account is configured', () => {
    expect(buildEligibleExpenseAccountOptions(tree, undefined)).toHaveLength(3)
    expect(buildEligibleExpenseAccountOptions(tree, '')).toHaveLength(3)
  })

  it('returns an empty list for an empty tree', () => {
    expect(buildEligibleExpenseAccountOptions([], 'acct-cogs')).toEqual([])
  })
})
