import '@testing-library/jest-dom/vitest'
import { render } from '@testing-library/react'
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// SimpleListPage is stubbed to capture the props the page hands it. The sibling
// ChartOfAccountsPage.test.tsx renders the REAL SimpleListPage for its other
// cases, which is why this assertion lives in its own file.
let captured: any = null

vi.mock('@/components/common/SimpleListPage', () => ({
  default: (props: any) => {
    captured = props
    return null
  },
}))

vi.mock('@/store/api/accountingApi', () => ({
  useGetAccountTreeQuery: vi.fn(),
  useCreateAccountMutation: vi.fn().mockReturnValue([vi.fn(), { isLoading: false }]),
  useUpdateAccountMutation: vi.fn().mockReturnValue([vi.fn(), { isLoading: false }]),
}))

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return { ...actual, useNavigate: () => vi.fn() }
})

vi.mock('@/hooks/useNotification', () => ({
  useNotification: () => ({ showSuccess: vi.fn(), showError: vi.fn() }),
}))

import { useGetAccountTreeQuery } from '@/store/api/accountingApi'
import ChartOfAccountsPage from '../ChartOfAccountsPage'

// The page reads state.auth.user.role, and useFilterBar reads useLocation, so
// the page needs both a Provider and a router even with SimpleListPage stubbed.
function renderPage() {
  const store = configureStore({
    reducer: { auth: (s = { user: { role: 'admin' }, isAuthenticated: true }) => s } as any,
  })
  return render(
    <Provider store={store}>
      <MemoryRouter>
        <ChartOfAccountsPage />
      </MemoryRouter>
    </Provider>,
  )
}

describe('ChartOfAccountsPage sort config', () => {
  beforeEach(() => {
    captured = null
    vi.mocked(useGetAccountTreeQuery).mockReset()
    vi.mocked(useGetAccountTreeQuery).mockReturnValue(
      { data: [], isFetching: false, error: undefined } as any,
    )
  })

  // Accounting convention, and the order the backend already returns (#899).
  // field === sortBy also matters on its own: FilterBar renders the sort button
  // as ACTIVE only when sortBy === field (AppButton.tsx:44), so a mismatch would
  // show an inactive button over a sorted list. Asserting the literal config
  // covers that too.
  it('defaults the list sort to code ascending', () => {
    renderPage()
    expect(captured.sort).toEqual({
      field: 'code',
      sortBy: 'code',
      sortOrder: 'asc',
      onSort: expect.any(Function),
    })
  })
})
