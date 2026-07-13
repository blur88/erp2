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

// Siblings deliberately out of order, and the child sorts BEFORE its own parent
// by name ("Alpha" < "Zulu") — a flat sort would rip it away from the parent.
const zulu = {
  ...group,
  id: 'zulu',
  code: '9000',
  name: 'Zulu Group',
  isPostable: false,
  children: [
    { ...leaf, id: 'alpha', code: '9100', name: 'Alpha Child', parentId: 'zulu' },
    { ...leaf, id: 'omega', code: '9200', name: 'Omega Child', parentId: 'zulu' },
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
    expect(screen.queryByText(/No Chart of Accounts found/i)).not.toBeInTheDocument()
  })

  it('shows the empty state once a search returns no matches', () => {
    renderList({ tree: [], isFetching: false })
    expect(screen.getByText(/No Chart of Accounts found/i)).toBeInTheDocument()
  })
})

// Rows are a flattened tree, so sorting has to reorder siblings within each
// level and re-flatten — sorting the flat row list would tear children away
// from their parents.
describe('AccountList sorting', () => {
  it('sorts root siblings by name ascending', () => {
    renderList({ tree: [zulu, group], sortBy: 'name', sortOrder: 'asc' })
    expect(rowNames()).toEqual(['Current Assets', 'Zulu Group', 'Alpha Child', 'Omega Child'])
  })

  it('sorts root siblings by name descending', () => {
    renderList({ tree: [group, zulu], sortBy: 'name', sortOrder: 'desc' })
    expect(rowNames()).toEqual(['Zulu Group', 'Omega Child', 'Alpha Child', 'Current Assets'])
  })

  // "Alpha Child" sorts before its own parent "Zulu Group" by name. It must stay
  // under Zulu regardless — this is the test a flat sort fails.
  it('keeps children under their parent even when they sort before it', () => {
    renderList({ tree: [zulu, group], sortBy: 'name', sortOrder: 'asc' })
    const names = rowNames()
    expect(names.indexOf('Alpha Child')).toBeGreaterThan(names.indexOf('Zulu Group'))
  })

  it('sorts by code when asked', () => {
    renderList({ tree: [zulu, group], sortBy: 'code', sortOrder: 'desc' })
    expect(rowNames()).toEqual(['Zulu Group', 'Omega Child', 'Alpha Child', 'Current Assets'])
  })
})
