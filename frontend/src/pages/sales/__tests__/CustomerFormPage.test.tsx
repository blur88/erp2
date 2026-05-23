import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

import CustomerFormPage from '../CustomerFormPage'
import salesReducer from '@/store/slices/salesSlice'

const { mockNavigate, mockCreateCustomer, mockUpdateCustomer, mockShowSuccess, mockShowError, mockApiGet, mockFetchCustomerBySlug } = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
  mockCreateCustomer: vi.fn(),
  mockUpdateCustomer: vi.fn(),
  mockShowSuccess: vi.fn(),
  mockShowError: vi.fn(),
  mockApiGet: vi.fn(),
  mockFetchCustomerBySlug: vi.fn(),
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
    useLazyGetCustomerBySlugQuery: vi.fn(() => [mockFetchCustomerBySlug]),
  }
})

vi.mock('@/hooks/useNotification', () => ({
  useNotification: () => ({ showSuccess: mockShowSuccess, showError: mockShowError }),
}))

vi.mock('@/components/price-lists/PriceListSelector', () => ({
  default: ({ value, onChange }: any) => (
    <input
      data-testid="price-list-selector"
      value={value || ''}
      onChange={(event) => onChange(event.target.value)}
    />
  ),
}))

vi.mock('@/services/api', () => ({
  default: {
    get: mockApiGet,
  },
}))

function renderCreatePage() {
  const store = configureStore({ reducer: { sales: salesReducer } })
  return render(
    <Provider store={store}>
      <MemoryRouter initialEntries={['/sales/customers/create']}>
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
    mockApiGet.mockResolvedValue({ data: { data: [] } })
    mockFetchCustomerBySlug.mockReturnValue({ unwrap: vi.fn().mockResolvedValue(null) })
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
})

describe('CustomerFormPage - Edit mode', () => {
  const mockCustomer = {
    id: 'cust-1',
    name: 'Acme Corp',
    type: 'business',
    phone: '555-1234',
    email: null,
    billingStreetAddress: null,
    billingCity: null,
    billingState: null,
    billingPostalCode: null,
    billingCountry: null,
    shippingStreetAddress: null,
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
