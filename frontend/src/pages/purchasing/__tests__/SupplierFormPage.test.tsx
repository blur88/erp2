import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

import SupplierFormPage from '../SupplierFormPage'
import purchasingReducer from '@/store/slices/purchasingSlice'

const {
  mockNavigate,
  mockCreateSupplier,
  mockUpdateSupplier,
  mockShowSuccess,
  mockShowError,
  mockApiGet,
  mockCheckDuplicate,
  mockFetchSupplierBySlug,
  mockBlockerState,
  mockBlockerProceed,
  mockBlockerReset,
} = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
  mockCreateSupplier: vi.fn(),
  mockUpdateSupplier: vi.fn(),
  mockShowSuccess: vi.fn(),
  mockShowError: vi.fn(),
  mockApiGet: vi.fn(),
  mockCheckDuplicate: vi.fn(),
  mockFetchSupplierBySlug: vi.fn(),
  mockBlockerState: { current: 'idle' as 'idle' | 'blocked' },
  mockBlockerProceed: vi.fn(),
  mockBlockerReset: vi.fn(),
}))

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useBlocker: () => ({
      state: mockBlockerState.current,
      proceed: mockBlockerProceed,
      reset: mockBlockerReset,
    }),
  }
})

vi.mock('@/store/api/purchasingApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/store/api/purchasingApi')>()
  return {
    ...actual,
    useCreateSupplierMutation: vi.fn(() => [mockCreateSupplier, { isLoading: false }]),
    useUpdateSupplierMutation: vi.fn(() => [mockUpdateSupplier, { isLoading: false }]),
    useLazyCheckDuplicateCompanyNameQuery: vi.fn(() => [mockCheckDuplicate]),
    useLazyGetSupplierBySlugQuery: vi.fn(() => [mockFetchSupplierBySlug]),
  }
})

vi.mock('@/hooks/useNotification', () => ({
  useNotification: () => ({ showSuccess: mockShowSuccess, showError: mockShowError }),
}))

vi.mock('@/services/api', () => ({
  default: { get: mockApiGet },
}))

function renderCreatePage() {
  const store = configureStore({ reducer: { purchasing: purchasingReducer } })

  return render(
    <Provider store={store}>
      <MemoryRouter initialEntries={['/purchasing/suppliers/create']}>
        <Routes>
          <Route path="/purchasing/suppliers/create" element={<SupplierFormPage />} />
        </Routes>
      </MemoryRouter>
    </Provider>,
  )
}

function renderEditPage(supplierSlug = 'global-parts-ltd') {
  const store = configureStore({ reducer: { purchasing: purchasingReducer } })

  return render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[`/purchasing/suppliers/${supplierSlug}/edit`]}>
        <Routes>
          <Route path="/purchasing/suppliers/:slug/edit" element={<SupplierFormPage />} />
        </Routes>
      </MemoryRouter>
    </Provider>,
  )
}

describe('SupplierFormPage - Create mode', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockBlockerState.current = 'idle'
    mockCreateSupplier.mockReturnValue({ unwrap: vi.fn().mockResolvedValue({ id: 'new-sup' }) })
    mockUpdateSupplier.mockReturnValue({ unwrap: vi.fn().mockResolvedValue({ id: 'sup-1' }) })
    mockCheckDuplicate.mockReturnValue({ unwrap: vi.fn().mockResolvedValue({ exists: false }) })
    mockFetchSupplierBySlug.mockReturnValue({ unwrap: vi.fn().mockResolvedValue(null) })
  })

  it('renders empty form with New Supplier heading', () => {
    renderCreatePage()

    expect(screen.getByText('New Supplier')).toBeInTheDocument()
    expect(screen.getByLabelText(/company name/i)).toHaveValue('')
  })

  it('shows validation error when company name is empty on submit', async () => {
    const user = userEvent.setup()
    renderCreatePage()

    await user.click(screen.getByRole('button', { name: /create/i }))

    await waitFor(() => {
      expect(screen.getByText('Company name is required')).toBeInTheDocument()
    })
    expect(mockCreateSupplier).not.toHaveBeenCalled()
  })

  it('calls createSupplier and navigates on successful submit', async () => {
    const user = userEvent.setup()
    renderCreatePage()

    await user.type(screen.getByLabelText(/company name/i), 'Acme Supplies')
    await user.click(screen.getByRole('button', { name: /create/i }))

    await waitFor(() => {
      expect(mockCreateSupplier).toHaveBeenCalledWith(
        expect.objectContaining({ companyName: 'Acme Supplies' }),
      )
    })
    expect(mockNavigate).toHaveBeenCalledWith('/purchasing/suppliers?highlight=new-sup')
  })

  it('navigates back on Cancel click', async () => {
    const user = userEvent.setup()
    renderCreatePage()

    await user.click(screen.getByRole('button', { name: /cancel/i }))

    expect(mockNavigate).toHaveBeenCalledWith('/purchasing/suppliers')
  })

  it('shows discard dialog when blocker intercepts navigation on dirty form', () => {
    mockBlockerState.current = 'blocked'
    renderCreatePage()

    expect(screen.getByText(/discard changes/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /discard/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /keep editing/i })).toBeInTheDocument()
    mockBlockerState.current = 'idle'
  })
})

describe('SupplierFormPage - Edit mode', () => {
  const mockSupplier = {
    id: 'sup-1',
    companyName: 'Global Parts Ltd',
    type: 'local',
    contactPerson: 'Jane Smith',
    phone: '555-1234',
    streetAddress: null,
    city: null,
    state: null,
    postalCode: null,
    country: null,
    notes: null,
    isActive: true,
    slug: 'global-parts-ltd',
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockCreateSupplier.mockReturnValue({ unwrap: vi.fn().mockResolvedValue({ id: 'new-sup' }) })
    mockUpdateSupplier.mockReturnValue({ unwrap: vi.fn().mockResolvedValue({ id: 'sup-1' }) })
    mockCheckDuplicate.mockReturnValue({ unwrap: vi.fn().mockResolvedValue({ exists: false }) })
    mockApiGet.mockImplementation((url: string) => {
      if (url === '/purchasing/suppliers/slug/global-parts-ltd') {
        return Promise.resolve({ data: { data: mockSupplier } })
      }

      return Promise.resolve({ data: { data: [] } })
    })
    mockFetchSupplierBySlug.mockReturnValue({ unwrap: vi.fn().mockResolvedValue(mockSupplier) })
  })

  it('shows Edit Supplier heading and pre-populates company name', async () => {
    renderEditPage('global-parts-ltd')

    await waitFor(() => {
      expect(screen.getByText('Edit Supplier')).toBeInTheDocument()
    })
    expect(screen.getByLabelText(/company name/i)).toHaveValue('Global Parts Ltd')
  })

  it('calls updateSupplier and navigates on successful submit', async () => {
    const user = userEvent.setup()
    renderEditPage('global-parts-ltd')

    await waitFor(() => {
      expect(screen.getByLabelText(/company name/i)).toHaveValue('Global Parts Ltd')
    })

    await user.clear(screen.getByLabelText(/company name/i))
    await user.type(screen.getByLabelText(/company name/i), 'Global Parts Updated')
    await user.click(screen.getByRole('button', { name: /update/i }))

    await waitFor(() => {
      expect(mockUpdateSupplier).toHaveBeenCalledWith({
        id: 'sup-1',
        data: expect.objectContaining({ companyName: 'Global Parts Updated' }),
      })
    })
    expect(mockNavigate).toHaveBeenCalledWith('/purchasing/suppliers?highlight=sup-1')
  })
})

describe('SupplierFormPage - company name duplicate check', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCreateSupplier.mockReturnValue({ unwrap: vi.fn().mockResolvedValue({ id: 'new-sup' }) })
  })

  it('shows duplicate error when company name already exists', async () => {
    mockCheckDuplicate.mockReturnValue({
      unwrap: vi.fn().mockResolvedValue({ exists: true, message: 'Company name already exists' }),
    })

    vi.useFakeTimers()
    renderCreatePage()
    fireEvent.change(screen.getByLabelText(/company name/i), { target: { value: 'Taken Corp' } })

    await act(async () => {
      vi.advanceTimersByTime(500)
      await Promise.resolve()
    })

    expect(screen.getByText('Company name already exists')).toBeInTheDocument()
    vi.useRealTimers()
  })

  it('shows available message when company name is free', async () => {
    mockCheckDuplicate.mockReturnValue({
      unwrap: vi.fn().mockResolvedValue({ exists: false }),
    })

    vi.useFakeTimers()
    renderCreatePage()
    fireEvent.change(screen.getByLabelText(/company name/i), { target: { value: 'New Corp' } })

    await act(async () => {
      vi.advanceTimersByTime(500)
      await Promise.resolve()
    })

    expect(screen.getByText('✓ Available')).toBeInTheDocument()
    vi.useRealTimers()
  })
})
