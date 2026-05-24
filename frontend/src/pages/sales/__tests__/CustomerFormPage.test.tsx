import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

import CustomerFormPage from '../CustomerFormPage'
import salesReducer from '@/store/slices/salesSlice'

const {
  mockNavigate,
  mockCreateCustomer,
  mockUpdateCustomer,
  mockRestoreCustomer,
  mockShowSuccess,
  mockShowError,
  mockApiGet,
  mockFetchCustomerBySlug,
  mockPriceListSelectorProps,
} = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
  mockCreateCustomer: vi.fn(),
  mockUpdateCustomer: vi.fn(),
  mockRestoreCustomer: vi.fn(),
  mockShowSuccess: vi.fn(),
  mockShowError: vi.fn(),
  mockApiGet: vi.fn(),
  mockFetchCustomerBySlug: vi.fn(),
  mockPriceListSelectorProps: [] as any[],
}))

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

vi.mock('@/store/api/salesApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/store/api/salesApi')>()
  return {
    ...actual,
    useCreateCustomerMutation: vi.fn(() => [mockCreateCustomer, { isLoading: false }]),
    useUpdateCustomerMutation: vi.fn(() => [mockUpdateCustomer, { isLoading: false }]),
    useRestoreCustomerMutation: vi.fn(() => [mockRestoreCustomer, { isLoading: false }]),
    useLazyGetCustomerBySlugQuery: vi.fn(() => [mockFetchCustomerBySlug]),
  }
})

vi.mock('@/hooks/useNotification', () => ({
  useNotification: () => ({ showSuccess: mockShowSuccess, showError: mockShowError }),
}))

vi.mock('@/components/price-lists/PriceListSelector', () => ({
  default: (props: any) => {
    mockPriceListSelectorProps.push(props)
    return (
      <input
        data-testid="price-list-selector"
        value={props.value || ''}
        onChange={(event) => props.onChange(event.target.value)}
      />
    )
  },
}))

vi.mock('@/services/api', () => ({
  default: {
    get: mockApiGet,
  },
}))

function renderCreatePage(locationState?: Record<string, unknown>) {
  const store = configureStore({ reducer: { sales: salesReducer } })
  const initialEntry = locationState
    ? { pathname: '/sales/customers/create', state: locationState }
    : '/sales/customers/create'
  return render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route path="/sales/customers/create" element={<CustomerFormPage />} />
        </Routes>
      </MemoryRouter>
    </Provider>,
  )
}

function renderEditPage(customerSlug = 'acme-corp') {
  const store = configureStore({ reducer: { sales: salesReducer } })
  return render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[`/sales/customers/${customerSlug}/edit`]}>
        <Routes>
          <Route path="/sales/customers/:slug/edit" element={<CustomerFormPage />} />
        </Routes>
      </MemoryRouter>
    </Provider>,
  )
}

describe('CustomerFormPage - Create mode', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCreateCustomer.mockReturnValue({
      unwrap: vi.fn().mockResolvedValue({ id: 'new-cust' }),
    })
    mockUpdateCustomer.mockReturnValue({
      unwrap: vi.fn().mockResolvedValue({ id: 'cust-1' }),
    })
    mockRestoreCustomer.mockReturnValue({ unwrap: vi.fn().mockResolvedValue({}) })
    mockApiGet.mockResolvedValue({ data: { data: [] } })
    mockFetchCustomerBySlug.mockReturnValue({ unwrap: vi.fn().mockResolvedValue(null) })
    mockPriceListSelectorProps.length = 0
  })

  it('renders empty form with New Customer heading', () => {
    renderCreatePage()
    expect(screen.getByText('New Customer')).toBeInTheDocument()
    expect(screen.getByLabelText(/customer name/i)).toHaveValue('')
  })

  it('shows validation error when name is empty on submit', async () => {
    const user = userEvent.setup()
    renderCreatePage()

    await user.click(screen.getByRole('button', { name: /create/i }))

    await waitFor(() => {
      expect(screen.getByText('Name is required')).toBeInTheDocument()
    })
    expect(mockCreateCustomer).not.toHaveBeenCalled()
  })

  it('calls createCustomer and navigates away on successful submit', async () => {
    const user = userEvent.setup()
    renderCreatePage()

    await user.type(screen.getByLabelText(/customer name/i), 'Test Corp')
    await user.click(screen.getByRole('button', { name: /create/i }))

    await waitFor(() => {
      expect(mockCreateCustomer).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Test Corp' }),
      )
    })
    expect(mockNavigate).toHaveBeenCalledWith('/sales/customers?highlight=new-cust')
  })

  it('navigates back on Cancel click', async () => {
    const user = userEvent.setup()
    renderCreatePage()

    await user.click(screen.getByRole('button', { name: /cancel/i }))

    expect(mockNavigate).toHaveBeenCalledWith('/sales/customers')
  })

  it('renders Price List selector with compact field styling', () => {
    renderCreatePage()

    expect(mockPriceListSelectorProps.at(-1)).toEqual(
      expect.objectContaining({
        size: 'small',
        sx: expect.objectContaining({
          '& .MuiInputBase-input': expect.objectContaining({ fontSize: '0.875rem' }),
          '& .MuiInputLabel-root': expect.objectContaining({ fontSize: '0.875rem' }),
        }),
      }),
    )
  })

  it('renders Notes textarea without a fixed row count', () => {
    renderCreatePage()

    expect(screen.getByLabelText(/notes/i)).not.toHaveAttribute('rows')
  })
})

describe('CustomerFormPage - Edit mode', () => {
  const mockCustomer = {
    id: 'cust-1',
    name: 'Acme Corp',
    type: 'business',
    phone: '555-1234',
    email: null,
    billingStreetAddress: null,
    billingStreetAddress2: null,
    billingCity: null,
    billingState: null,
    billingPostalCode: null,
    billingCountry: null,
    shippingStreetAddress: null,
    shippingStreetAddress2: null,
    shippingCity: null,
    shippingState: null,
    shippingPostalCode: null,
    shippingCountry: null,
    priceListId: null,
    notes: null,
    isActive: true,
    slug: 'acme-corp',
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockCreateCustomer.mockReturnValue({
      unwrap: vi.fn().mockResolvedValue({ id: 'new-cust' }),
    })
    mockUpdateCustomer.mockReturnValue({
      unwrap: vi.fn().mockResolvedValue({ id: 'cust-1' }),
    })
    mockRestoreCustomer.mockReturnValue({ unwrap: vi.fn().mockResolvedValue({}) })
    mockApiGet.mockImplementation((url: string) => {
      if (url === '/customers/slug/acme-corp') {
        return Promise.resolve({ data: { data: mockCustomer } })
      }
      return Promise.resolve({ data: { data: [] } })
    })
    mockFetchCustomerBySlug.mockReturnValue({ unwrap: vi.fn().mockResolvedValue(mockCustomer) })
  })

  it('shows Edit Customer heading and pre-populates name', async () => {
    renderEditPage('acme-corp')

    await waitFor(() => {
      expect(screen.getByText('Edit Customer')).toBeInTheDocument()
    })
    expect(screen.getByLabelText(/customer name/i)).toHaveValue('Acme Corp')
  })

  it('calls updateCustomer and navigates on successful submit', async () => {
    const user = userEvent.setup()
    renderEditPage('acme-corp')

    await waitFor(() => {
      expect(screen.getByLabelText(/customer name/i)).toHaveValue('Acme Corp')
    })

    await user.clear(screen.getByLabelText(/customer name/i))
    await user.type(screen.getByLabelText(/customer name/i), 'Acme Corp Updated')
    await user.click(screen.getByRole('button', { name: /update/i }))

    await waitFor(() => {
      expect(mockUpdateCustomer).toHaveBeenCalledWith({
        id: 'cust-1',
        data: expect.objectContaining({ name: 'Acme Corp Updated' }),
      })
    })
    expect(mockNavigate).toHaveBeenCalledWith('/sales/customers?highlight=cust-1')
  })
})

describe('CustomerFormPage - phone duplicate check', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCreateCustomer.mockReturnValue({
      unwrap: vi.fn().mockResolvedValue({ id: 'new-cust' }),
    })
    mockRestoreCustomer.mockReturnValue({ unwrap: vi.fn().mockResolvedValue({}) })
  })

  it('shows phone duplicate error when a matching customer exists', async () => {
    mockApiGet.mockImplementation((url: string) => {
      if (url === '/customers') {
        return Promise.resolve({
          data: { data: [{ id: 'other-cust', name: 'Existing Corp', phone: '555-9999' }] },
        })
      }

      return Promise.resolve({ data: { data: [] } })
    })

    vi.useFakeTimers()
    renderCreatePage()
    fireEvent.change(screen.getByLabelText(/phone/i), { target: { value: '555-9999' } })

    await act(async () => {
      vi.advanceTimersByTime(500)
      await Promise.resolve()
    })

    expect(screen.getByText(/phone already exists for customer: existing corp/i)).toBeInTheDocument()
    vi.useRealTimers()
  })

  it('shows available message when phone has no match', async () => {
    mockApiGet.mockResolvedValue({ data: { data: [] } })

    vi.useFakeTimers()
    renderCreatePage()
    fireEvent.change(screen.getByLabelText(/phone/i), { target: { value: '555-1234' } })

    await act(async () => {
      vi.advanceTimersByTime(500)
      await Promise.resolve()
    })

    expect(screen.getByText('✓ Available')).toBeInTheDocument()
    vi.useRealTimers()
  })
})

describe('CustomerFormPage - name duplicate check', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCreateCustomer.mockReturnValue({ unwrap: vi.fn().mockResolvedValue({ id: 'new-cust' }) })
    mockRestoreCustomer.mockReturnValue({ unwrap: vi.fn().mockResolvedValue({}) })
  })

  it('shows warning banner when an active customer has the same name', async () => {
    mockApiGet.mockImplementation((url: string) => {
      if (url === '/customers') {
        return Promise.resolve({
          data: { data: [{ id: 'other', name: 'Test Corp', isActive: true }] },
        })
      }

      return Promise.resolve({ data: { data: [] } })
    })

    vi.useFakeTimers()
    renderCreatePage()
    fireEvent.change(screen.getByLabelText(/customer name/i), { target: { value: 'Test Corp' } })

    await act(async () => {
      vi.advanceTimersByTime(500)
      await Promise.resolve()
    })

    expect(screen.getByText(/a customer with this name already exists/i)).toBeInTheDocument()
    vi.useRealTimers()
  })

  it('shows reactivate banner when an inactive customer has the same name', async () => {
    mockApiGet.mockImplementation((url: string) => {
      if (url === '/customers/deleted') {
        return Promise.resolve({
          data: { data: [{ id: 'inactive-cust', name: 'Test Corp', isActive: false }] },
        })
      }

      return Promise.resolve({ data: { data: [] } })
    })

    vi.useFakeTimers()
    renderCreatePage()
    fireEvent.change(screen.getByLabelText(/customer name/i), { target: { value: 'Test Corp' } })

    await act(async () => {
      vi.advanceTimersByTime(500)
      await Promise.resolve()
    })

    expect(screen.getByText(/this customer is inactive/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /reactivate/i })).toBeInTheDocument()
    vi.useRealTimers()
  })
})

describe('CustomerFormPage - Same as Billing toggle', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCreateCustomer.mockReturnValue({ unwrap: vi.fn().mockResolvedValue({ id: 'new-cust' }) })
    mockRestoreCustomer.mockReturnValue({ unwrap: vi.fn().mockResolvedValue({}) })
    mockApiGet.mockResolvedValue({ data: { data: [] } })
  })

  it('copies billing address into shipping fields when toggle is enabled', async () => {
    const user = userEvent.setup()
    renderCreatePage()

    const cityInputs = screen.getAllByRole('textbox', { name: /city/i })
    await user.type(cityInputs[0], 'New York')

    await user.click(screen.getByRole('switch', { name: /same as billing/i }))

    expect(cityInputs).toHaveLength(2)
    expect(cityInputs[1]).toHaveValue('New York')
    expect(cityInputs[1]).toBeDisabled()
  })
})

it('shows discard confirmation dialog when cancelling with unsaved changes', async () => {
  const user = userEvent.setup()
  mockCreateCustomer.mockReturnValue({ unwrap: vi.fn().mockResolvedValue({ id: 'new-cust' }) })
  mockRestoreCustomer.mockReturnValue({ unwrap: vi.fn().mockResolvedValue({}) })
  mockApiGet.mockResolvedValue({ data: { data: [] } })
  renderCreatePage()

  await user.type(screen.getByLabelText(/customer name/i), 'Partial')
  await user.click(screen.getByRole('button', { name: /cancel/i }))

  expect(screen.getByText(/discard changes/i)).toBeInTheDocument()
  expect(mockNavigate).not.toHaveBeenCalled()
})

describe('CustomerFormPage - stale name duplicate banner', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    mockCreateCustomer.mockReturnValue({ unwrap: vi.fn().mockResolvedValue({ id: 'new-cust' }) })
    mockRestoreCustomer.mockReturnValue({ unwrap: vi.fn().mockResolvedValue({}) })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('clears the duplicate banner immediately when the user continues typing, before the debounce resolves', async () => {
    // First check: 'Test Corp' is a duplicate
    mockApiGet.mockImplementation((url: string) => {
      if (url === '/customers') {
        return Promise.resolve({
          data: { data: [{ id: 'other', name: 'Test Corp', isActive: true }] },
        })
      }
      return Promise.resolve({ data: { data: [] } })
    })

    renderCreatePage()

    // Type 'Test Corp' and wait for duplicate check
    fireEvent.change(screen.getByLabelText(/customer name/i), { target: { value: 'Test Corp' } })
    await act(async () => {
      vi.advanceTimersByTime(500)
      await Promise.resolve()
    })
    expect(screen.getByText(/a customer with this name already exists/i)).toBeInTheDocument()

    // Now switch to returning no duplicates for the next check
    mockApiGet.mockResolvedValue({ data: { data: [] } })

    // User types one more character — debounce not yet resolved
    fireEvent.change(screen.getByLabelText(/customer name/i), { target: { value: 'Test Corps' } })

    // Banner should clear immediately (before debounce fires)
    expect(screen.queryByText(/a customer with this name already exists/i)).not.toBeInTheDocument()
  })
})

describe('CustomerFormPage - returnTo navigation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCreateCustomer.mockReturnValue({ unwrap: vi.fn().mockResolvedValue({ id: 'new-cust' }) })
    mockRestoreCustomer.mockReturnValue({ unwrap: vi.fn().mockResolvedValue({}) })
    mockApiGet.mockResolvedValue({ data: { data: [] } })
  })

  it('navigates to sales order on clean cancel when returnTo=sales-order', async () => {
    const user = userEvent.setup()
    renderCreatePage({ returnTo: 'sales-order' })

    await user.click(screen.getByRole('button', { name: /cancel/i }))

    expect(mockNavigate).toHaveBeenCalledWith('/sales/sales-orders/create')
  })

  it('navigates to customer list on clean cancel when no returnTo', async () => {
    const user = userEvent.setup()
    renderCreatePage()

    await user.click(screen.getByRole('button', { name: /cancel/i }))

    expect(mockNavigate).toHaveBeenCalledWith('/sales/customers')
  })

  it('navigates to sales order on discard confirm when returnTo=sales-order', async () => {
    const user = userEvent.setup()
    renderCreatePage({ returnTo: 'sales-order' })

    await user.type(screen.getByLabelText(/customer name/i), 'Partial')
    await user.click(screen.getByRole('button', { name: /cancel/i }))
    expect(screen.getByText(/discard changes/i)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /discard/i }))

    expect(mockNavigate).toHaveBeenCalledWith('/sales/sales-orders/create')
  })

  it('navigates to customer list on discard confirm when no returnTo', async () => {
    const user = userEvent.setup()
    renderCreatePage()

    await user.type(screen.getByLabelText(/customer name/i), 'Partial')
    await user.click(screen.getByRole('button', { name: /cancel/i }))

    await user.click(screen.getByRole('button', { name: /discard/i }))

    expect(mockNavigate).toHaveBeenCalledWith('/sales/customers')
  })
})
