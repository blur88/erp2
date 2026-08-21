import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider'
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import auditLogSlice from '@/store/slices/auditLogSlice'
import FilterSidebar from '../FilterSidebar'

const makeStore = (filters: Record<string, string> = {}) =>
  configureStore({
    reducer: { auditLogs: auditLogSlice },
    preloadedState: {
      auditLogs: {
        pagination: { page: 1, limit: 25 },
        filters: { search: '', ...filters },
        activeTab: 'logs',
        sidebarCollapsed: false,
      } as never,
    },
  })

const renderSidebar = (filters: Record<string, string> = {}) => {
  const store = makeStore(filters)
  render(
    <Provider store={store}>
      <LocalizationProvider dateAdapter={AdapterDateFns}>
        <FilterSidebar entityTypes={['User']} onApply={vi.fn()} />
      </LocalizationProvider>
    </Provider>,
  )
  return store
}

describe('FilterSidebar date pickers', () => {
  beforeEach(() => {
    localStorage.setItem('dateFormat', 'DD/MM/YYYY')
    localStorage.removeItem('audit-logs-filter-presets')
    localStorage.removeItem('audit-logs-sidebar-collapsed')
  })

  it('renders the stored start date in the picker', () => {
    renderSidebar({ startDate: '2026-07-01' })
    expect(screen.getByRole('group', { name: /start date/i })).toHaveTextContent('01/07/2026')
  })

  it('clearing Start Date removes the filter rather than storing an empty string', async () => {
    const store = renderSidebar({ startDate: '2026-07-01' })
    const field = screen.getByRole('group', { name: /start date/i })
    await userEvent.click(within(field).getByRole('button', { name: /clear/i }))

    await waitFor(() => {
      expect(store.getState().auditLogs.filters.startDate).toBeUndefined()
    })
  })
})
