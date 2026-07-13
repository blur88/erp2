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
