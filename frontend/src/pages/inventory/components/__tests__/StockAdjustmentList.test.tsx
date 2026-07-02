import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { vi } from 'vitest'
import StockAdjustmentList from '../StockAdjustmentList'

const h = vi.hoisted(() => ({
  triggerMock: vi.fn(),
  navigateMock: vi.fn(),
  lazyState: { data: undefined as any, isFetching: false, isError: false, isUninitialized: false },
}))

vi.mock('@/store/api/inventoryApi', () => ({
  useLazyGetStockAdjustmentQuery: () => [h.triggerMock, h.lazyState],
}))

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<any>('react-router-dom')
  return { ...actual, useNavigate: () => h.navigateMock }
})

const detail = {
  id: 'a1',
  items: [
    { id: 'i1', product: { id: 'p1', name: 'Widget A' }, difference: 2 },
    { id: 'i2', product: { id: 'p2', name: 'Cable X' }, difference: -1 },
  ],
}

const rows = [
  { id: 'a1', adjustmentNumber: 'SA-000001', adjustmentDate: '2026-06-29', status: 'draft', itemCount: 2, totalValue: 100 },
  { id: 'a2', adjustmentNumber: 'SA-000002', adjustmentDate: '2026-06-28', status: 'completed', itemCount: 1, totalValue: 50 },
  { id: 'a3', adjustmentNumber: 'SA-000003', adjustmentDate: '2026-06-27', status: 'draft', itemCount: 0, totalValue: 0 },
]

const renderList = () =>
  render(<MemoryRouter><StockAdjustmentList rows={rows as any} total={3} loading={false} paginationSlot={null} /></MemoryRouter>)

beforeEach(() => {
  h.triggerMock.mockReset()
  h.navigateMock.mockReset()
  h.lazyState.data = detail
  h.lazyState.isFetching = false
  h.lazyState.isError = false
  h.lazyState.isUninitialized = false
})

it('renders adjustment numbers and status chips', () => {
  renderList()
  expect(screen.getByText('SA-000001')).toBeInTheDocument()
  expect(screen.getAllByText('Draft')).toHaveLength(2)
  expect(screen.getByText('Completed')).toBeInTheDocument()
})

it('pluralizes item count: plural, singular, and zero without icon', () => {
  renderList()
  expect(screen.getByText('2 items')).toBeInTheDocument()
  expect(screen.getByText('1 item')).toBeInTheDocument()
  expect(screen.getByText('0')).toBeInTheDocument()
  expect(screen.getAllByRole('button', { name: /show products/i })).toHaveLength(2)
})

it('opens popover on icon click and shows product names with signed diffs', async () => {
  renderList()
  const icon = screen.getAllByRole('button', { name: /show products/i })[0]
  fireEvent.click(icon)
  expect(h.triggerMock).toHaveBeenCalledWith('a1', true)
  await waitFor(() => expect(screen.getByText('Widget A')).toBeInTheDocument())
  expect(screen.getByText('Cable X')).toBeInTheDocument()
  expect(screen.getByText('+2')).toBeInTheDocument()
  expect(screen.getByText('-1')).toBeInTheDocument()
})

it('does NOT navigate when the icon is clicked (stopPropagation)', () => {
  renderList()
  const icon = screen.getAllByRole('button', { name: /show products/i })[0]
  fireEvent.click(icon)
  expect(h.navigateMock).not.toHaveBeenCalled()
})

it('shows "No adjustments found" when there are no rows', () => {
  render(
    <MemoryRouter>
      <StockAdjustmentList rows={[] as any} total={0} loading={false} paginationSlot={null} />
    </MemoryRouter>,
  )
  expect(screen.getByText('No adjustments found')).toBeInTheDocument()
})

  // NOTE: the "click outside closes the popover without navigating to the row's
// View page" behavior relies on the MUI Popover's viewport-covering backdrop
// catching the dismiss click. That is real-browser overlay hit-testing which
// jsdom does not model (it dispatches synthetic clicks straight at a node,
// ignoring the portal-rendered backdrop). So this is verified manually in the
// browser, not here. The guard itself is the `onClick={(e) => e.stopPropagation()}`
// on the <Popover> in StockAdjustmentItemsPopover (mirrors RowActionMenu).

it('closes the popover on Escape', async () => {
  renderList()
  fireEvent.click(screen.getAllByRole('button', { name: /show products/i })[0])
  await waitFor(() => expect(screen.getByText('Widget A')).toBeInTheDocument())
  fireEvent.keyDown(screen.getByText('Widget A'), { key: 'Escape', code: 'Escape' })
  await waitFor(() => expect(screen.queryByText('Widget A')).not.toBeInTheDocument())
})

it('shows a retry button on error that re-triggers the fetch', async () => {
  h.lazyState.data = undefined
  h.lazyState.isError = true
  renderList()
  fireEvent.click(screen.getAllByRole('button', { name: /show products/i })[0])
  const retry = await screen.findByRole('button', { name: /retry/i })
  h.triggerMock.mockClear()
  fireEvent.click(retry)
  expect(h.triggerMock).toHaveBeenCalledWith('a1', true)
})

it('shows a spinner (not an empty list) before the first fetch settles', async () => {
  // Uninitialized: trigger fired but not yet resolved — no data, not error.
  h.lazyState.data = undefined
  h.lazyState.isUninitialized = true
  renderList()
  fireEvent.click(screen.getAllByRole('button', { name: /show products/i })[0])
  await waitFor(() => expect(screen.getByRole('progressbar')).toBeInTheDocument())
  // No empty "Total:" footer while loading.
  expect(screen.queryByText(/Total:/)).not.toBeInTheDocument()
})
