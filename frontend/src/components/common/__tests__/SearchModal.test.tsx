import { act, fireEvent, render, screen } from '@testing-library/react'
import { configureStore } from '@reduxjs/toolkit'
import { Provider } from 'react-redux'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import SearchModal from '../SearchModal'
import { searchApiSlice } from '@/store/api/searchApi'

function makeStore() {
  return configureStore({
    reducer: {
      [searchApiSlice.reducerPath]: searchApiSlice.reducer,
    },
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware().concat(searchApiSlice.middleware),
  })
}

const mockUseSearchGlobal = vi.fn()
vi.mock('@/store/api/searchApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/store/api/searchApi')>()
  return {
    ...actual,
    useSearchGlobalQuery: (...args: any[]) => mockUseSearchGlobal(...args),
  }
})

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

function renderModal(open = true) {
  const onClose = vi.fn()
  const store = makeStore()

  render(
    <Provider store={store}>
      <MemoryRouter>
        <SearchModal open={open} onClose={onClose} />
      </MemoryRouter>
    </Provider>,
  )

  return { onClose }
}

// Helper: type into input and advance debounce timer
function typeAndFlush(value: string) {
  fireEvent.change(screen.getByPlaceholderText(/search/i), { target: { value } })
  act(() => { vi.advanceTimersByTime(300) })
}

describe('SearchModal', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    mockUseSearchGlobal.mockReturnValue({
      data: undefined,
      isLoading: false,
      isFetching: false,
      isError: false,
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders nothing when closed', () => {
    renderModal(false)

    expect(screen.queryByPlaceholderText(/search/i)).not.toBeInTheDocument()
  })

  it('shows help text when query is shorter than 2 characters', () => {
    renderModal()

    expect(
      screen.getByText(/type at least 2 characters/i),
    ).toBeInTheDocument()
  })

  it('skips the query when trimmed length is less than 2', () => {
    renderModal()

    expect(mockUseSearchGlobal).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ skip: true }),
    )
  })

  it('calls onClose when Escape is pressed', () => {
    const { onClose } = renderModal()

    fireEvent.keyDown(document, { key: 'Escape' })

    expect(onClose).toHaveBeenCalled()
  })

  it('shows loading state while fetching with no prior results', () => {
    mockUseSearchGlobal.mockReturnValue({
      data: undefined,
      isLoading: true,
      isFetching: true,
      isError: false,
    })

    renderModal()
    typeAndFlush('abc')

    expect(screen.getByRole('progressbar')).toBeInTheDocument()
  })

  it('renders grouped results by type', () => {
    mockUseSearchGlobal.mockReturnValue({
      data: {
        query: 'abc',
        results: [
          {
            type: 'page',
            label: 'Customers',
            description: 'Navigation',
            route: '/sales/customers',
          },
          {
            type: 'customer',
            id: '1',
            label: 'ABC Trading',
            description: '0123456789',
            route: '/sales/customers/1',
          },
          {
            type: 'product',
            id: '2',
            label: 'ABC Widget',
            description: 'SKU-001',
            route: '/inventory/products/2/edit',
          },
        ],
      },
      isLoading: false,
      isFetching: false,
      isError: false,
    })

    renderModal()
    typeAndFlush('abc')

    expect(screen.getByText('Pages')).toBeInTheDocument()
    expect(screen.getAllByText('Customers').length).toBeGreaterThan(0)
    expect(screen.getByText('ABC Trading')).toBeInTheDocument()
    expect(screen.getByText('ABC Widget')).toBeInTheDocument()
  })

  it('shows no-results message when results are empty', () => {
    mockUseSearchGlobal.mockReturnValue({
      data: { query: 'zzz', results: [] },
      isLoading: false,
      isFetching: false,
      isError: false,
    })

    renderModal()
    typeAndFlush('zzz')

    expect(screen.getByText(/no results/i)).toBeInTheDocument()
  })

  it('navigates and closes when Enter is pressed on selected result', () => {
    mockUseSearchGlobal.mockReturnValue({
      data: {
        query: 'abc',
        results: [
          {
            type: 'customer',
            id: '1',
            label: 'ABC Trading',
            route: '/sales/customers/1',
          },
        ],
      },
      isLoading: false,
      isFetching: false,
      isError: false,
    })

    const { onClose } = renderModal()
    typeAndFlush('abc')
    const input = screen.getByPlaceholderText(/search/i)
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(mockNavigate).toHaveBeenCalledWith('/sales/customers/1')
    expect(onClose).toHaveBeenCalled()
  })

  it('shows error message when query fails', () => {
    mockUseSearchGlobal.mockReturnValue({
      data: undefined,
      isLoading: false,
      isFetching: false,
      isError: true,
    })

    renderModal()
    typeAndFlush('abc')

    expect(screen.getByText(/search unavailable/i)).toBeInTheDocument()
  })

  it('skips the query when typing fewer than 2 characters', () => {
    renderModal()

    const input = screen.getByPlaceholderText(/search/i)
    fireEvent.change(input, { target: { value: 'a' } })

    expect(mockUseSearchGlobal).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ skip: true }),
    )
  })

  it('resets query when modal reopens', () => {
    const store = makeStore()
    const onClose = vi.fn()
    const { rerender } = render(
      <Provider store={store}>
        <MemoryRouter>
          <SearchModal open={true} onClose={onClose} />
        </MemoryRouter>
      </Provider>,
    )

    const input = screen.getByPlaceholderText(/search/i)
    typeAndFlush('abc')
    expect(input).toHaveValue('abc')

    rerender(
      <Provider store={store}>
        <MemoryRouter>
          <SearchModal open={false} onClose={onClose} />
        </MemoryRouter>
      </Provider>,
    )
    rerender(
      <Provider store={store}>
        <MemoryRouter>
          <SearchModal open={true} onClose={onClose} />
        </MemoryRouter>
      </Provider>,
    )

    expect(screen.getByPlaceholderText(/search/i)).toHaveValue('')
  })

  it('ArrowUp wraps from first result to last', () => {
    mockUseSearchGlobal.mockReturnValue({
      data: {
        query: 'abc',
        results: [
          {
            type: 'customer',
            id: '1',
            label: 'First',
            route: '/sales/customers/1',
          },
          {
            type: 'customer',
            id: '2',
            label: 'Second',
            route: '/sales/customers/2',
          },
        ],
      },
      isLoading: false,
      isFetching: false,
      isError: false,
    })

    renderModal()
    typeAndFlush('abc')

    const input = screen.getByPlaceholderText(/search/i)
    fireEvent.keyDown(input, { key: 'ArrowUp' })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(mockNavigate).toHaveBeenCalledWith('/sales/customers/2')
  })

  it('ArrowDown wraps from last result to first', () => {
    mockUseSearchGlobal.mockReturnValue({
      data: {
        query: 'abc',
        results: [
          {
            type: 'customer',
            id: '1',
            label: 'First',
            route: '/sales/customers/1',
          },
          {
            type: 'customer',
            id: '2',
            label: 'Second',
            route: '/sales/customers/2',
          },
        ],
      },
      isLoading: false,
      isFetching: false,
      isError: false,
    })

    renderModal()
    typeAndFlush('abc')

    const input = screen.getByPlaceholderText(/search/i)
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(mockNavigate).toHaveBeenCalledWith('/sales/customers/1')
  })
})
