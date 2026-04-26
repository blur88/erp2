import { act, renderHook, waitFor } from '@testing-library/react'
import { createElement, type PropsWithChildren } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useChartOfAccountsWorkspace } from './useChartOfAccountsWorkspace'
import accountingReducer, { selectSelectedAccount } from '@/store/slices/accountingSlice'
import type { ChartOfAccount } from '@/types'

const mockDeleteChartOfAccount = vi.fn(() => ({ unwrap: vi.fn().mockResolvedValue({}) }))
const mockSeedDefaultChartOfAccounts = vi.fn(() => ({
  unwrap: vi.fn().mockResolvedValue({ message: 'Seeded successfully' }),
}))

vi.mock('@/store/api/accountingApi', () => ({
  useDeleteChartOfAccountMutation: () => [mockDeleteChartOfAccount],
  useSeedDefaultChartOfAccountsMutation: () => [mockSeedDefaultChartOfAccounts],
}))

vi.mock('@/hooks/useNotification', () => ({
  useNotification: () => ({
    showSuccess: vi.fn(),
    showError: vi.fn(),
  }),
}))

const makeAccount = (id: string, code: string, name: string): ChartOfAccount => ({
  id,
  code,
  name,
  type: 'ASSET' as any,
  isActive: true,
  fullCode: code,
  isParent: false,
  currentBalance: 0,
  isCashEquivalent: false,
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
})

const ACCOUNTS = [
  makeAccount('1', '1000', 'Cash'),
  makeAccount('2', '2000', 'Accounts Payable'),
  makeAccount('3', '3000', 'Revenue'),
]

function makeStore() {
  return configureStore({ reducer: { accounting: accountingReducer } })
}

function makeWrapper(store: ReturnType<typeof makeStore>, initialUrl = '/accounting/chart-of-accounts') {
  return ({ children }: PropsWithChildren) =>
    createElement(
      Provider,
      { store },
      createElement(MemoryRouter, { initialEntries: [initialUrl] }, children),
    )
}

describe('useChartOfAccountsWorkspace', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('auto-selects first account on load', async () => {
    const store = makeStore()
    const refetch = vi.fn()

    renderHook(
      () =>
        useChartOfAccountsWorkspace(ACCOUNTS, null, store.dispatch, refetch),
      { wrapper: makeWrapper(store) },
    )

    await waitFor(() => {
      expect(selectSelectedAccount(store.getState())?.id).toBe('1')
    })
  })

  it('opens form dialog on Enter key action', () => {
    const store = makeStore()
    const { result } = renderHook(
      () => useChartOfAccountsWorkspace(ACCOUNTS, ACCOUNTS[0], store.dispatch, vi.fn()),
      { wrapper: makeWrapper(store) },
    )

    expect(result.current.formDialogOpen).toBe(false)

    act(() => {
      result.current.handleEnterAction()
    })

    expect(result.current.formDialogOpen).toBe(true)
  })

  it('clears selection and closes dialogs on Escape', async () => {
    const store = makeStore()
    const { result } = renderHook(
      () => useChartOfAccountsWorkspace(ACCOUNTS, ACCOUNTS[0], store.dispatch, vi.fn()),
      { wrapper: makeWrapper(store) },
    )

    act(() => {
      result.current.setFormDialogOpen(true)
    })

    act(() => {
      result.current.handleEscapeAction()
    })

    expect(result.current.formDialogOpen).toBe(false)
    await waitFor(() => {
      expect(selectSelectedAccount(store.getState())).toBeNull()
    })
  })

  it('navigates to account matching ?highlight= param', async () => {
    const store = makeStore()

    renderHook(
      () => useChartOfAccountsWorkspace(ACCOUNTS, null, store.dispatch, vi.fn()),
      { wrapper: makeWrapper(store, '/accounting/chart-of-accounts?highlight=3') },
    )

    await waitFor(() => {
      expect(selectSelectedAccount(store.getState())?.id).toBe('3')
    })
  })

  it('keyboard navigation moves focusedIndex', () => {
    const store = makeStore()
    const { result } = renderHook(
      () => useChartOfAccountsWorkspace(ACCOUNTS, ACCOUNTS[0], store.dispatch, vi.fn()),
      { wrapper: makeWrapper(store) },
    )

    act(() => {
      result.current.setFocusedIndex(0)
    })
    act(() => {
      result.current.handleNavigateDown()
    })

    expect(result.current.focusedIndex).toBe(1)
  })

  it('handleDelete calls deleteChartOfAccount and refetch', async () => {
    const store = makeStore()
    const refetch = vi.fn()
    const { result } = renderHook(
      () => useChartOfAccountsWorkspace(ACCOUNTS, ACCOUNTS[0], store.dispatch, refetch),
      { wrapper: makeWrapper(store) },
    )

    await act(async () => {
      await result.current.handleDelete()
    })

    expect(mockDeleteChartOfAccount).toHaveBeenCalledWith('1')
    expect(refetch).toHaveBeenCalled()
  })

  it('handleSeed calls seedDefaultChartOfAccounts and refetch', async () => {
    const store = makeStore()
    const refetch = vi.fn()
    const { result } = renderHook(
      () => useChartOfAccountsWorkspace(ACCOUNTS, null, store.dispatch, refetch),
      { wrapper: makeWrapper(store) },
    )

    await act(async () => {
      await result.current.handleSeed()
    })

    expect(mockSeedDefaultChartOfAccounts).toHaveBeenCalled()
    expect(refetch).toHaveBeenCalled()
  })

  it('setSelected dispatches setSelectedAccount to Redux', () => {
    const store = makeStore()
    const { result } = renderHook(
      () => useChartOfAccountsWorkspace(ACCOUNTS, null, store.dispatch, vi.fn()),
      { wrapper: makeWrapper(store) },
    )

    act(() => {
      result.current.setSelected(ACCOUNTS[1])
    })

    expect(selectSelectedAccount(store.getState())?.id).toBe('2')
  })
})
