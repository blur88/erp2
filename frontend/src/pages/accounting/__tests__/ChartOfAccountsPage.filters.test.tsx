import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { Provider } from 'react-redux'

import { store } from '@/store'
import ChartOfAccountsPage from '@/pages/accounting/ChartOfAccountsPage'
import * as accountingApi from '@/store/api/accountingApi'

const treeSpy = vi.fn()

const useGetAccountTreeQuery = vi.fn((args: unknown, opts?: { skip?: boolean }) => {
  treeSpy(args, opts)
  return { data: [], isFetching: false, error: undefined }
})

vi.mock('@/hooks/useNotification', () => ({
  useNotification: () => ({ showSuccess: vi.fn(), showError: vi.fn() }),
}))

vi.mock('@/store/api/accountingApi', async () => {
  const actual = await vi.importActual<typeof accountingApi>('@/store/api/accountingApi')
  return { ...actual, useGetAccountTreeQuery: (...a: any[]) => (useGetAccountTreeQuery as any)(...a) }
})

function renderPage() {
  render(
    <Provider store={store}>
      <MemoryRouter>
        <ChartOfAccountsPage />
      </MemoryRouter>
    </Provider>,
  )
}

beforeEach(() => {
  treeSpy.mockClear()
  useGetAccountTreeQuery.mockClear()
  useGetAccountTreeQuery.mockImplementation((args: unknown, opts?: { skip?: boolean }) => {
    treeSpy(args, opts)
    return { data: [], isFetching: false, error: undefined }
  })
})

describe('ChartOfAccountsPage filters', () => {
  it('renders Account Type and Status filters', () => {
    renderPage()
    expect(screen.getByRole('combobox', { name: /account type/i })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: /status/i })).toBeInTheDocument()
  })

  it('always requests the unfiltered tree for the dialog', () => {
    renderPage()
    expect(treeSpy).toHaveBeenCalledWith({}, undefined)
  })

  it('skips the filtered query when no filter is active', () => {
    renderPage()
    const filtered = treeSpy.mock.calls.find(([, opts]) => opts && 'skip' in opts)
    expect(filtered?.[1].skip).toBe(true)
  })

  it('issues a filtered request for a type-only filter', async () => {
    renderPage()
    await userEvent.click(screen.getByRole('combobox', { name: /account type/i }))
    await userEvent.click(screen.getByRole('option', { name: 'Asset' }))

    const filtered = treeSpy.mock.calls.filter(([, opts]) => opts && 'skip' in opts).pop()
    expect(filtered?.[0]).toEqual({ type: 'Asset' })
    expect(filtered?.[1].skip).toBe(false)
  })

  it('converts status to a boolean isActive', async () => {
    renderPage()
    await userEvent.click(screen.getByRole('combobox', { name: /^status/i }))
    await userEvent.click(screen.getByRole('option', { name: 'Inactive' }))

    const filtered = treeSpy.mock.calls.filter(([, opts]) => opts && 'skip' in opts).pop()
    expect(filtered?.[0]).toEqual({ isActive: false })
  })

  it('combines type and status into one request', async () => {
    renderPage()
    await userEvent.click(screen.getByRole('combobox', { name: /account type/i }))
    await userEvent.click(screen.getByRole('option', { name: 'Expense' }))
    await userEvent.click(screen.getByRole('combobox', { name: /^status/i }))
    await userEvent.click(screen.getByRole('option', { name: 'Active' }))

    const filtered = treeSpy.mock.calls.filter(([, opts]) => opts && 'skip' in opts).pop()
    expect(filtered?.[0]).toEqual({ type: 'Expense', isActive: true })
  })

  it('Clear All returns to the unfiltered tree', async () => {
    renderPage()
    await userEvent.click(screen.getByRole('combobox', { name: /account type/i }))
    await userEvent.click(screen.getByRole('option', { name: 'Asset' }))

    await userEvent.click(screen.getByRole('button', { name: /reset/i }))

    const filtered = treeSpy.mock.calls.filter(([, opts]) => opts && 'skip' in opts).pop()
    expect(filtered?.[1].skip).toBe(true)
  })
})

describe('ChartOfAccountsPage rendered tree', () => {
  it('renders the filtered tree, not the unfiltered one, and keeps ancestors', async () => {
    const full = [
      { id: 'a', code: '1000', name: 'Assets', type: 'Asset', isActive: true, balance: '0.0000', children: [] },
      { id: 'c', code: '2000', name: 'Liabilities', type: 'Liability', isActive: true, balance: '0.0000', children: [] },
    ]
    const filtered = [
      {
        id: 'c', code: '2000', name: 'Liabilities', type: 'Liability', isActive: false, balance: '0.0000',
        children: [
          { id: 'd', code: '2100', name: 'Payables', type: 'Liability', isActive: true, balance: '0.0000', children: [] },
        ],
      },
    ]

    treeSpy.mockClear()
    useGetAccountTreeQuery.mockImplementation((args: any, opts?: { skip?: boolean }) => ({
      data: opts?.skip === undefined ? full : (opts.skip ? [] : filtered),
      isFetching: false,
      error: undefined,
    }) as any)

    renderPage()
    await userEvent.click(screen.getByRole('combobox', { name: /^status/i }))
    await userEvent.click(screen.getByRole('option', { name: 'Active' }))

    expect(await screen.findByText('2100')).toBeInTheDocument()
    expect(screen.getByText('2000')).toBeInTheDocument()
    expect(screen.queryByText('1000')).not.toBeInTheDocument()
  })
})
