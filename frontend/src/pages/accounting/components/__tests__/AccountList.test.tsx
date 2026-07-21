import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/store/api/accountingApi', () => ({
  useUpdateAccountMutation: vi.fn().mockReturnValue([vi.fn(), { isLoading: false }]),
}))

vi.mock('@/hooks/useNotification', () => ({
  useNotification: () => ({ showSuccess: vi.fn(), showError: vi.fn() }),
}))

import AccountList from '../AccountList'

const group = {
  id: 'asset-group',
  code: '1000',
  name: 'Current Assets',
  type: 'Asset' as const,
  parentId: null,
  description: null,
  isActive: true,
  isSystem: false,
  isPostable: false,
  openingBalance: '0.0000',
  createdAt: '',
  updatedAt: '',
  balance: '5000.0000',
  children: [],
}

const leaf = {
  ...group,
  id: 'cash',
  code: '1100',
  name: 'Cash',
  parentId: 'asset-group',
  isPostable: true,
  children: [],
}

// Siblings deliberately out of order. Two properties this fixture must have:
//   1. "Zebra Child" is coded BELOW its own parent ("0100" < "9000") — a flat
//      sort would rip it away from the parent and hoist it to the top.
//   2. The children's NAME order is the reverse of their CODE order, so a name
//      sort and a code sort produce different rows and the tests can tell them
//      apart.
const zulu = {
  ...group,
  id: 'zulu',
  code: '9000',
  name: 'Zulu Group',
  isPostable: false,
  children: [
    { ...leaf, id: 'zebra', code: '0100', name: 'Zebra Child', parentId: 'zulu' },
    { ...leaf, id: 'apple', code: '9200', name: 'Apple Child', parentId: 'zulu' },
  ],
}

function rowNames(): string[] {
  return Array.from(document.querySelectorAll('tbody tr'))
    .map((tr) => tr.querySelector('td')?.textContent?.trim() ?? '')
    .filter(Boolean)
}

function renderList(props: Partial<React.ComponentProps<typeof AccountList>> = {}) {
  return render(
    <AccountList
      tree={[group]}
      onAddChild={vi.fn()}
      onEdit={vi.fn()}
      isAdmin
      {...props}
    />,
  )
}

describe('AccountList', () => {
  // A search that matches a group returns it with children: [] — it is still a
  // group. Group identity is the domain flag, not the child count.
  it('treats a childless non-postable account as a group', async () => {
    renderList({ tree: [group] })
    const user = userEvent.setup()
    const row = screen.getByText('Current Assets').closest('tr')!
    await user.click(row.querySelector('button[aria-label="row actions"]')!)

    expect(screen.getByText('Add Child Account')).toBeInTheDocument()
    expect(screen.queryByText('Edit')).not.toBeInTheDocument()
    expect(screen.queryByText('Set Inactive')).not.toBeInTheDocument()
  })

  it('still treats a postable account as a leaf', async () => {
    renderList({ tree: [leaf] })
    const user = userEvent.setup()
    const row = screen.getByText('Cash').closest('tr')!
    await user.click(row.querySelector('button[aria-label="row actions"]')!)

    expect(screen.getByText('Edit')).toBeInTheDocument()
    expect(screen.getByText('Set Inactive')).toBeInTheDocument()
    expect(screen.queryByText('Add Child Account')).not.toBeInTheDocument()
  })

  // EntityTable shows its empty state on !loading && rows.length === 0, so an
  // in-flight search with no rows yet must report loading, not "not found".
  it('shows the loading state, not the empty state, while fetching with no rows', () => {
    renderList({ tree: [], isFetching: true })
    expect(screen.queryByText(/No accounts found/i)).not.toBeInTheDocument()
  })

  it('shows the empty state once a search returns no matches', () => {
    renderList({ tree: [], isFetching: false })
    expect(screen.getByText(/No accounts found/i)).toBeInTheDocument()
  })

  // #923: the count strip made the accounting pages inconsistent with the
  // Sales/Purchasing/Inventory lists, which all pass showHeader={false}.
  it('does not render the count header strip', () => {
    renderList({ tree: [group] })
    expect(screen.queryByText(/Chart of Accounts \(\d+\)/i)).not.toBeInTheDocument()
  })

  it('renders the balance column formatted as currency', () => {
    renderList({ tree: [leaf] })
    const row = screen.getByText('Cash').closest('tr')!
    const cells = row.querySelectorAll('td')
    expect(cells[3]).toHaveTextContent('RM 5,000.00')
    expect(cells[3]).not.toHaveTextContent('5000.0000')
  })

  it('formats the balance in the deactivate confirmation dialog', async () => {
    renderList({ tree: [leaf] })
    const user = userEvent.setup()
    const row = screen.getByText('Cash').closest('tr')!
    await user.click(row.querySelector('button[aria-label="row actions"]')!)
    await user.click(screen.getByText('Set Inactive'))
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveTextContent('RM 5,000.00')
    expect(dialog).not.toHaveTextContent('5000.0000')
  })
})

// Rows are a flattened tree, so sorting has to reorder siblings within each
// level and re-flatten — sorting the flat row list would tear children away
// from their parents.
describe('AccountList sorting', () => {
  // No sortOrder prop: this exercises the 'asc' default.
  it('sorts siblings by code ascending by default', () => {
    renderList({ tree: [zulu, group] })
    expect(rowNames()).toEqual(['Current Assets', 'Zulu Group', 'Zebra Child', 'Apple Child'])
  })

  it('sorts siblings by code descending', () => {
    renderList({ tree: [group, zulu], sortOrder: 'desc' })
    expect(rowNames()).toEqual(['Zulu Group', 'Apple Child', 'Zebra Child', 'Current Assets'])
  })

  // "Zebra Child" (0100) sorts before its own parent "Zulu Group" (9000) by code.
  // It must stay under Zulu regardless — this is the test a flat sort fails.
  it('keeps children under their parent even when they sort before it', () => {
    renderList({ tree: [zulu, group] })
    const names = rowNames()
    expect(names.indexOf('Zebra Child')).toBeGreaterThan(names.indexOf('Zulu Group'))
  })

  // `code` is a free-form varchar(20), so codes of unequal digit length are legal.
  // Numeric collation is what makes 9000 precede 10000; a plain lexicographic sort
  // (and the backend's own ORDER BY code) puts '10000' first. This is why the
  // client-side sort is NOT redundant with the backend ordering.
  it('orders codes by numeric value, not lexicographically', () => {
    const short = { ...group, id: 'short', code: '9000', name: 'Nine Thousand' }
    const long = { ...group, id: 'long', code: '10000', name: 'Ten Thousand' }
    renderList({ tree: [long, short] })
    expect(rowNames()).toEqual(['Nine Thousand', 'Ten Thousand'])
  })

  // Numeric collation reports '0100' and '100' as EQUAL, yet both are legal and
  // unique in the DB. Without a lexical tie-break the comparator is not
  // antisymmetric: a stable sort pins the pair in input order, so DESC comes out
  // identical to ASC and the Sort toggle silently does nothing on these rows.
  // Both directions are asserted on purpose — a one-direction test passes even
  // with the bug present.
  describe('codes that collate as equal but are distinct', () => {
    const padded = { ...group, id: 'padded', code: '0100', name: 'Padded' }
    const bare = { ...group, id: 'bare', code: '100', name: 'Bare' }

    it('breaks the tie deterministically ascending', () => {
      renderList({ tree: [bare, padded] })
      expect(rowNames()).toEqual(['Padded', 'Bare'])
    })

    it('reverses that tie when descending', () => {
      renderList({ tree: [bare, padded], sortOrder: 'desc' })
      expect(rowNames()).toEqual(['Bare', 'Padded'])
    })
  })
})
