import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Typography } from '@mui/material'
import GenericDeletedDialog from './GenericDeletedDialog'
import type { ColumnDef, GenericDeletedDialogProps } from './GenericDeletedDialog'

type TestEntity = { id: string; name: string }

const items: TestEntity[] = [
  { id: '1', name: 'Alpha' },
  { id: '2', name: 'Beta' },
  { id: '3', name: 'Gamma' },
]

const columns: ColumnDef<TestEntity>[] = [
  {
    label: 'Name',
    render: (item) => <Typography>{item.name}</Typography>,
  },
]

const notifications = vi.hoisted(() => ({
  showSuccess: vi.fn(),
  showError: vi.fn(),
}))

vi.mock('@/hooks/useNotification', () => ({
  useNotification: () => notifications,
}))

const makeQueryHook = (data: TestEntity[] = items) =>
  vi.fn(() => ({
    data: { data },
    isFetching: false,
    refetch: vi.fn(),
  }))

const makeMutationHook = (fn = vi.fn(() => ({ unwrap: () => Promise.resolve({}) }))) =>
  vi.fn(() => [fn, { isLoading: false }] as const)

const makeBulkMutationHook = (
  fn = vi.fn(() => ({
    unwrap: () => Promise.resolve({ restoredCount: 1, deletedCount: 1, failedIds: [] }),
  })),
) => vi.fn(() => [fn, { isLoading: false }] as const)

function renderDialog(
  overrides: Partial<GenericDeletedDialogProps<TestEntity>> = {},
) {
  const props: GenericDeletedDialogProps<TestEntity> = {
    open: true,
    onClose: vi.fn(),
    title: 'Deleted Items',
    entityLabel: 'item',
    icon: <span data-testid="test-icon" />,
    columns,
    getItemLabel: (item) => item.name,
    searchPlaceholder: 'Search...',
    filterItem: (item, term) => item.name.toLowerCase().includes(term),
    useGetDeletedQuery: makeQueryHook(items),
    useRestoreMutation: makeMutationHook(),
    usePermanentDeleteMutation: makeMutationHook(),
    useBulkRestoreMutation: makeBulkMutationHook(),
    useBulkPermanentDeleteMutation: makeBulkMutationHook(),
    ...overrides,
  }

  return render(<GenericDeletedDialog {...props} />)
}

describe('GenericDeletedDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders title, icon, and total item count', async () => {
    renderDialog()

    expect(screen.getByText('Deleted Items')).toBeInTheDocument()
    expect(screen.getByTestId('test-icon')).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.getByText(/3 total/i)).toBeInTheDocument()
    })
  })

  it('filters items by search term', async () => {
    renderDialog()

    await userEvent.type(screen.getByPlaceholderText('Search...'), 'alpha')

    expect(screen.getByText('Alpha')).toBeInTheDocument()
    expect(screen.queryByText('Beta')).not.toBeInTheDocument()
    expect(screen.queryByText('Gamma')).not.toBeInTheDocument()
  })

  it('calls restore mutation with the item id', async () => {
    const restoreFn = vi.fn(() => ({ unwrap: () => Promise.resolve({}) }))

    renderDialog({
      useRestoreMutation: vi.fn(() => [restoreFn, { isLoading: false }] as const),
    })

    await userEvent.click(screen.getAllByRole('button', { name: 'Restore item' })[0])

    await waitFor(() => {
      expect(restoreFn).toHaveBeenCalledWith('1')
    })
  })

  it('opens permanent delete confirmation and deletes the item on confirm', async () => {
    const deleteFn = vi.fn(() => ({ unwrap: () => Promise.resolve({}) }))

    renderDialog({
      usePermanentDeleteMutation: vi.fn(() => [deleteFn, { isLoading: false }] as const),
    })

    await userEvent.click(screen.getAllByRole('button', { name: 'Permanently Delete (Cannot be undone)' })[0])

    expect(screen.getByText('Permanently Delete item')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Permanently Delete' }))

    await waitFor(() => {
      expect(deleteFn).toHaveBeenCalledWith('1')
    })
  })

  it('shows bulk action buttons after selecting an item', async () => {
    renderDialog()

    await userEvent.click(screen.getAllByRole('checkbox')[1])

    expect(screen.getByRole('button', { name: /Restore Selected \(1\)/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Delete Selected \(1\)/i })).toBeInTheDocument()
  })

  it('calls bulk restore mutation with selected ids', async () => {
    const bulkRestoreFn = vi.fn(() => ({
      unwrap: () => Promise.resolve({ restoredCount: 1, failedIds: [] }),
    }))

    renderDialog({
      useBulkRestoreMutation: vi.fn(() => [bulkRestoreFn, { isLoading: false }] as const),
    })

    await userEvent.click(screen.getAllByRole('checkbox')[1])
    await userEvent.click(screen.getByRole('button', { name: /Restore Selected \(1\)/i }))
    await userEvent.click(screen.getByRole('button', { name: /Restore 1 items/i }))

    await waitFor(() => {
      expect(bulkRestoreFn).toHaveBeenCalledWith(['1'])
    })
  })

  it('calls bulk permanent delete mutation with selected ids', async () => {
    const bulkDeleteFn = vi.fn(() => ({
      unwrap: () => Promise.resolve({ deletedCount: 1, failedIds: [] }),
    }))

    renderDialog({
      useBulkPermanentDeleteMutation: vi.fn(() => [bulkDeleteFn, { isLoading: false }] as const),
    })

    await userEvent.click(screen.getAllByRole('checkbox')[1])
    await userEvent.click(screen.getByRole('button', { name: /Delete Selected \(1\)/i }))
    await userEvent.click(screen.getByRole('button', { name: /Delete 1 items/i }))

    await waitFor(() => {
      expect(bulkDeleteFn).toHaveBeenCalledWith(['1'])
    })
  })

  it('select all checkbox selects all filtered items', async () => {
    renderDialog()

    await userEvent.click(screen.getAllByRole('checkbox')[0])

    expect(screen.getByRole('button', { name: /Restore Selected \(3\)/i })).toBeInTheDocument()
  })

  it('clears selection when dialog is reopened', async () => {
    const props: GenericDeletedDialogProps<TestEntity> = {
      open: true,
      onClose: vi.fn(),
      title: 'Deleted Items',
      entityLabel: 'item',
      icon: <span />,
      columns,
      getItemLabel: (item) => item.name,
      searchPlaceholder: 'Search...',
      filterItem: (item, term) => item.name.toLowerCase().includes(term),
      useGetDeletedQuery: makeQueryHook(items),
      useRestoreMutation: makeMutationHook(),
      usePermanentDeleteMutation: makeMutationHook(),
      useBulkRestoreMutation: makeBulkMutationHook(),
      useBulkPermanentDeleteMutation: makeBulkMutationHook(),
    }

    const { rerender } = render(<GenericDeletedDialog {...props} />)

    await userEvent.click(screen.getAllByRole('checkbox')[1])
    expect(screen.getByRole('button', { name: /Restore Selected \(1\)/i })).toBeInTheDocument()

    rerender(<GenericDeletedDialog {...props} open={false} />)
    rerender(<GenericDeletedDialog {...props} open />)

    expect(screen.queryByRole('button', { name: /Restore Selected/i })).not.toBeInTheDocument()
  })

  it('shows an empty state when no items match the search', async () => {
    renderDialog()

    await userEvent.type(screen.getByPlaceholderText('Search...'), 'zzzzz')

    expect(screen.getByText('No deleted items match your search.')).toBeInTheDocument()
  })

  it('does not render bulk controls when no bulk hooks are provided', () => {
    renderDialog({
      useBulkRestoreMutation: undefined,
      useBulkPermanentDeleteMutation: undefined,
    })

    expect(screen.queryAllByRole('checkbox')).toHaveLength(0)
  })
})
