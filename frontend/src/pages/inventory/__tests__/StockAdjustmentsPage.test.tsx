import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, expect, it, vi } from 'vitest'

const { completeSpy, unwrapMock, showSuccessSpy, showErrorSpy, getAdjustmentsSpy } = vi.hoisted(() => ({
  completeSpy: vi.fn(),
  unwrapMock: vi.fn(),
  showSuccessSpy: vi.fn(),
  showErrorSpy: vi.fn(),
  getAdjustmentsSpy: vi.fn(),
}))

vi.mock('@/store/api/inventoryApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/store/api/inventoryApi')>()
  const mockRows = [
    { id: 'a1', adjustmentNumber: 'SA-000001', adjustmentDate: '2026-06-29', status: 'draft', itemCount: 2, totalValue: 100 },
  ]
  return {
    ...actual,
    useGetStockAdjustmentsQuery: (params: unknown) => {
      getAdjustmentsSpy(params)
      return { data: { data: mockRows }, isFetching: false, error: undefined }
    },
    useGetCategoriesQuery: () => ({ data: [] }),
    useCompleteStockAdjustmentMutation: () => [completeSpy, {}],
    // The item-count popover (StockAdjustmentItemsPopover) uses this lazy query;
    // stub it so the unwrapped page render doesn't require a Redux <Provider>.
    useLazyGetStockAdjustmentQuery: () => [vi.fn(), { data: undefined, isFetching: false, isError: false, isUninitialized: true }],
  }
})

vi.mock('@/hooks/useNotification', () => ({
  useNotification: () => ({
    showSuccess: showSuccessSpy,
    showError: showErrorSpy,
    showWarning: vi.fn(),
    showInfo: vi.fn(),
  }),
}))

import StockAdjustmentsPage from '../StockAdjustmentsPage'

function renderPage() {
  return render(<MemoryRouter><StockAdjustmentsPage /></MemoryRouter>)
}

async function openCompleteDialog(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByLabelText('row actions'))
  await user.click(screen.getByText('Complete'))
  await waitFor(() => expect(screen.getByText('Complete Stock Adjustment?')).toBeInTheDocument())
}

function clickConfirm(user: ReturnType<typeof userEvent.setup>) {
  const confirm = screen.getAllByText('Complete').find((el) => el.closest('button'))
  return user.click(confirm!)
}

beforeEach(() => {
  completeSpy.mockReset()
  unwrapMock.mockReset()
  showSuccessSpy.mockReset()
  showErrorSpy.mockReset()
  getAdjustmentsSpy.mockReset()
  completeSpy.mockReturnValue({ unwrap: unwrapMock })
})

it('completes a draft adjustment and shows a success toast', async () => {
  const user = userEvent.setup()
  unwrapMock.mockResolvedValue({})
  renderPage()
  await openCompleteDialog(user)
  await clickConfirm(user)

  await waitFor(() => expect(completeSpy).toHaveBeenCalledWith('a1'))
  expect(showSuccessSpy).toHaveBeenCalledWith('Stock adjustment SA-000001 completed')
  await waitFor(() => expect(screen.queryByText('Complete Stock Adjustment?')).not.toBeInTheDocument())
})

it('surfaces backend error and keeps the dialog open when completion fails', async () => {
  const user = userEvent.setup()
  unwrapMock.mockRejectedValue({ data: { message: 'Insufficient stock. Available: 1.0000, Requested: 15' } })
  renderPage()
  await openCompleteDialog(user)
  await clickConfirm(user)

  await waitFor(() =>
    expect(showErrorSpy).toHaveBeenCalledWith('Insufficient stock. Available: 1, Requested: 15'),
  )
  expect(screen.getByText('Complete Stock Adjustment?')).toBeInTheDocument()
})

it('keeps non-zero fractional digits when tidying the error message', async () => {
  const user = userEvent.setup()
  unwrapMock.mockRejectedValue({ data: { message: 'Insufficient stock. Available: 1.5000, Requested: 15' } })
  renderPage()
  await openCompleteDialog(user)
  await clickConfirm(user)

  await waitFor(() =>
    expect(showErrorSpy).toHaveBeenCalledWith('Insufficient stock. Available: 1.5, Requested: 15'),
  )
})

it('defaults the list sort to newest-first by adjustment date', () => {
  renderPage()

  expect(getAdjustmentsSpy).toHaveBeenNthCalledWith(
    1,
    expect.objectContaining({ sortBy: 'adjustmentDate', sortOrder: 'DESC' }),
  )
})
