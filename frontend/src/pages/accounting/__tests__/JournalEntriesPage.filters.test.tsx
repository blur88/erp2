import React from 'react'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { Provider } from 'react-redux'
import { LocalizationProvider } from '@mui/x-date-pickers'
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns'

import { store } from '@/store'
import JournalEntriesPage from '@/pages/accounting/JournalEntriesPage'
import * as accountingApi from '@/store/api/accountingApi'

const listSpy = vi.fn()

vi.mock('@/store/api/accountingApi', async () => {
  const actual = await vi.importActual<typeof accountingApi>('@/store/api/accountingApi')
  return {
    ...actual,
    useGetJournalEntriesQuery: (args: unknown) => {
      listSpy(args)
      return {
        data: {
          data: [],
          meta: { page: 1, limit: 25, total: 100, totalPages: 4 },
        },
        isFetching: false,
        error: undefined,
      }
    },
  }
})

const wrapper = ({ children }: { children: React.ReactNode }) =>
  React.createElement(LocalizationProvider, { dateAdapter: AdapterDateFns },
    React.createElement(Provider as any, { store },
      React.createElement(MemoryRouter, null, children),
    ),
  )

function renderPage() {
  render(React.createElement(JournalEntriesPage), { wrapper: wrapper as any })
}

beforeEach(() => { listSpy.mockClear() })

afterEach(() => {
  // useListUrlState hydrates from the live window.location, which jsdom
  // persists across tests in this file.
  window.history.replaceState(null, '', '/')
})

describe('JournalEntriesPage filters', () => {
  it('renders search, period, source type, and status filters', () => {
    renderPage()
    expect(screen.getByPlaceholderText(/journal no/i)).toBeInTheDocument()
    expect(screen.getAllByRole('combobox').length).toBeGreaterThanOrEqual(3)
    expect(screen.getByRole('combobox', { name: /source type/i })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: /status/i })).toBeInTheDocument()
  })

  it('passes source type into the query', async () => {
    renderPage()
    await userEvent.click(screen.getByRole('combobox', { name: /source type/i }))
    await userEvent.click(screen.getByRole('option', { name: 'Sales Order' }))
    expect(listSpy).toHaveBeenLastCalledWith(
      expect.objectContaining({ sourceType: 'SALES_ORDER', page: 1 }),
    )
  })

  it('passes status into the query', async () => {
    renderPage()
    await userEvent.click(screen.getByRole('combobox', { name: /status/i }))
    await userEvent.click(screen.getByRole('option', { name: 'Reversed' }))
    expect(listSpy).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: 'Reversed' }),
    )
  })

  it('omits filters that are not set', () => {
    renderPage()
    expect(listSpy).toHaveBeenLastCalledWith({ page: 1, limit: 25, sortBy: 'journalNo', sortOrder: 'DESC' })
  })

  it('maps a debounced search into the query, trimmed', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    renderPage()
    await userEvent.type(screen.getByPlaceholderText(/journal no/i), '  INV-1  ')
    act(() => { vi.advanceTimersByTime(500) })
    expect(listSpy).toHaveBeenLastCalledWith(
      expect.objectContaining({ search: 'INV-1', page: 1 }),
    )
    vi.useRealTimers()
  })

  it('maps a period preset into fromDate/toDate', async () => {
    renderPage()
    const combos = screen.getAllByRole('combobox')
    await userEvent.click(combos[0])
    await userEvent.click(screen.getByRole('menuitem', { name: 'This Month' }))

    const args: any = listSpy.mock.calls.at(-1)?.[0]
    expect(args.fromDate).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(args.toDate).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(args.fromDate <= args.toDate).toBe(true)
  })

  it('combines source type and status in one query', async () => {
    renderPage()
    await userEvent.click(screen.getByRole('combobox', { name: /source type/i }))
    await userEvent.click(screen.getByRole('option', { name: 'Purchase Order' }))
    await userEvent.click(screen.getByRole('combobox', { name: /status/i }))
    await userEvent.click(screen.getByRole('option', { name: 'Posted' }))

    expect(listSpy).toHaveBeenLastCalledWith(
      expect.objectContaining({ sourceType: 'PURCHASE_ORDER', status: 'Posted', page: 1 }),
    )
  })

  it('Clear All drops every filter and returns to page 1', async () => {
    renderPage()
    await userEvent.click(screen.getByRole('combobox', { name: /source type/i }))
    await userEvent.click(screen.getByRole('option', { name: 'Sales Order' }))

    await userEvent.click(screen.getByRole('button', { name: /reset/i }))
    expect(listSpy).toHaveBeenLastCalledWith({ page: 1, limit: 25, sortBy: 'journalNo', sortOrder: 'DESC' })
  })

  it('never requests new filters against a stale page', async () => {
    renderPage()
    await userEvent.click(screen.getByRole('button', { name: /go to next page/i }))
    expect(listSpy).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2 }))

    listSpy.mockClear()
    await userEvent.click(screen.getByRole('combobox', { name: /status/i }))
    await userEvent.click(screen.getByRole('option', { name: 'Posted' }))

    const offending = listSpy.mock.calls.filter(
      ([args]: any) => args.status === 'Posted' && args.page !== 1,
    )
    expect(offending).toEqual([])
  })

  it('renders the Sort button', () => {
    renderPage()
    expect(screen.getByRole('button', { name: /^sort$/i })).toBeInTheDocument()
  })

  it('sends default sort (journalNo DESC) on first render', () => {
    renderPage()
    expect(listSpy).toHaveBeenLastCalledWith(
      expect.objectContaining({ sortBy: 'journalNo', sortOrder: 'DESC' }),
    )
  })

  it('toggles to ASC when the Sort button is clicked', async () => {
    renderPage()
    await userEvent.click(screen.getByRole('button', { name: /^sort$/i }))
    expect(listSpy).toHaveBeenLastCalledWith(
      expect.objectContaining({ sortBy: 'journalNo', sortOrder: 'ASC' }),
    )
  })

  it('resets to page 1 when the sort direction is toggled', async () => {
    renderPage()
    await userEvent.click(screen.getByRole('button', { name: /go to next page/i }))
    expect(listSpy).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2 }))

    await userEvent.click(screen.getByRole('button', { name: /^sort$/i }))
    expect(listSpy).toHaveBeenLastCalledWith(
      expect.objectContaining({ page: 1, sortOrder: 'ASC' }),
    )
  })

  it('keeps active filters applied when sorting', async () => {
    renderPage()
    await userEvent.click(screen.getByRole('combobox', { name: /status/i }))
    await userEvent.click(screen.getByRole('option', { name: 'Posted' }))

    await userEvent.click(screen.getByRole('button', { name: /^sort$/i }))
    expect(listSpy).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: 'Posted', sortBy: 'journalNo', sortOrder: 'ASC' }),
    )
  })
})
