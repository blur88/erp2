import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider'
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns'

import ExpenseFormPage from '../ExpenseFormPage'

const {
  mockNavigate,
  mockCreateExpense,
  mockUpdateExpense,
  mockShowSuccess,
  mockShowError,
  mockGetExpense,
  mockGetAccountTree,
  mockGetAccountingSettings,
  mockGetDocumentNumberSettings,
} = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
  mockCreateExpense: vi.fn(),
  mockUpdateExpense: vi.fn(),
  mockShowSuccess: vi.fn(),
  mockShowError: vi.fn(),
  mockGetExpense: vi.fn(),
  mockGetAccountTree: vi.fn(),
  mockGetAccountingSettings: vi.fn(),
  mockGetDocumentNumberSettings: vi.fn(),
}))

const { mockBlockerState, mockBlockerProceed, mockBlockerReset, mockLocationState } = vi.hoisted(() => ({
  mockBlockerState: { current: 'idle' as 'idle' | 'blocked' },
  mockBlockerProceed: vi.fn(),
  mockBlockerReset: vi.fn(),
  mockLocationState: { current: null as Record<string, unknown> | null },
}))

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useLocation: () => ({
      pathname: '/accounting/expenses/exp-1/edit',
      search: '',
      hash: '',
      key: 'test',
      state: mockLocationState.current,
    }),
    useBlocker: () => ({
      state: mockBlockerState.current,
      proceed: mockBlockerProceed,
      reset: mockBlockerReset,
    }),
  }
})

vi.mock('@/store/api/accountingApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/store/api/accountingApi')>()
  return {
    ...actual,
    useGetExpenseQuery: vi.fn((id: string) => mockGetExpense(id)),
    useCreateExpenseMutation: vi.fn(() => [mockCreateExpense, { isLoading: false }]),
    useUpdateExpenseMutation: vi.fn(() => [mockUpdateExpense, { isLoading: false }]),
    useGetAccountTreeQuery: vi.fn((params: any) => mockGetAccountTree(params)),
    useGetAccountingSettingsQuery: vi.fn(() => mockGetAccountingSettings()),
  }
})

vi.mock('@/store/api/settingsApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/store/api/settingsApi')>()
  return {
    ...actual,
    useGetDocumentNumberSettingsQuery: (arg: unknown, opts?: { skip?: boolean }) =>
      mockGetDocumentNumberSettings(arg, opts),
  }
})

vi.mock('@/hooks/useNotification', () => ({
  useNotification: () => ({ showSuccess: mockShowSuccess, showError: mockShowError }),
}))

beforeEach(() => {
  localStorage.removeItem('dateFormat')
})

const yy = String(new Date().getFullYear() % 100).padStart(2, '0')

const EXPENSE_DOC_SETTINGS = {
  data: {
    configurations: [
      { documentName: 'Expenses', prefix: 'EXP', nextNumber: 1, paddingDigits: 3, lastResetYear: 26 },
    ],
  },
  isLoading: false,
}

const defaultAccounts = [
  { id: 'exp-acc-1', code: '5000', name: 'Office Supplies', type: 'Expense', isActive: true, isPostable: true, balance: '0', children: [] },
  { id: 'exp-acc-2', code: '5010', name: 'Utilities', type: 'Expense', isActive: true, balance: '0', children: [] },
  { id: 'cogs-acc', code: '5100', name: 'Cost of Goods Sold', type: 'Expense', isActive: true, isPostable: true, balance: '0', children: [] },
  { id: 'exp-acc-3', code: '6990', name: 'Other Expenses', type: 'Expense', isActive: true, isPostable: true, balance: '0', children: [] },
]

const defaultExpense = {
  id: 'exp-1',
  expenseNumber: 'EXP-001',
  expenseDate: '2024-06-15',
  payee: 'Vendor Corp',
  description: 'Office supplies purchase',
  expenseAccountId: 'exp-acc-1',
  expenseAccount: { id: 'exp-acc-1', code: '5000', name: 'Office Supplies' },
  totalAmount: '150.00',
  paidAmount: '0.00',
  balance: '150.00',
  documentStatus: 'DRAFT' as const,
  paymentStatus: 'UNPAID' as const,
  notes: 'Some notes',
  createdAt: '2024-06-15T10:00:00Z',
  updatedAt: '2024-06-15T10:00:00Z',
}

function renderCreatePage() {
  const store = configureStore({ reducer: {} })
  return render(
    <LocalizationProvider dateAdapter={AdapterDateFns}>
      <Provider store={store}>
        <MemoryRouter initialEntries={['/accounting/expenses/new']}>
          <Routes>
            <Route path="/accounting/expenses/new" element={<ExpenseFormPage />} />
            <Route path="/accounting/expenses/:id" element={<div>Expense Detail Page</div>} />
          </Routes>
        </MemoryRouter>
      </Provider>
    </LocalizationProvider>,
  )
}

function renderEditPage(expenseId = 'exp-1') {
  const store = configureStore({ reducer: {} })
  return render(
    <LocalizationProvider dateAdapter={AdapterDateFns}>
      <Provider store={store}>
        <MemoryRouter initialEntries={[`/accounting/expenses/${expenseId}/edit`]}>
          <Routes>
            <Route path="/accounting/expenses/new" element={<ExpenseFormPage />} />
            <Route path="/accounting/expenses/:id/edit" element={<ExpenseFormPage />} />
            <Route path="/accounting/expenses/:id" element={<div>Expense Detail Page</div>} />
          </Routes>
        </MemoryRouter>
      </Provider>
    </LocalizationProvider>,
  )
}

function renderEditPageFromList(expenseId = 'exp-1') {
  mockLocationState.current = { expenseEditOrigin: 'list' }
  return renderEditPage(expenseId)
}

describe('ExpenseFormPage - Create mode', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockLocationState.current = null
    mockBlockerState.current = 'idle'
    mockCreateExpense.mockReturnValue({ unwrap: vi.fn().mockResolvedValue({ id: 'new-exp-1', expenseNumber: 'EXP-002' }) })
    mockUpdateExpense.mockReturnValue({ unwrap: vi.fn().mockResolvedValue({ id: 'exp-1' }) })
    mockGetExpense.mockReturnValue({ data: defaultExpense, isLoading: false, isFetching: false })
    mockGetAccountTree.mockReturnValue({ data: defaultAccounts, isLoading: false, isFetching: false })
    mockGetAccountingSettings.mockReturnValue({ data: { defaultExpenseAccountId: 'exp-acc-1', cogsAccountId: 'cogs-acc' }, isLoading: false, isFetching: false })
    mockGetDocumentNumberSettings.mockReturnValue(EXPENSE_DOC_SETTINGS)
  })

  it('renders New Expense heading', () => {
    renderCreatePage()
    expect(screen.getByText('New Expense')).toBeInTheDocument()
  })

  it('previews the next configured expense number on create', () => {
    renderCreatePage()
    const expenseNoField = screen.getByLabelText(/expense no/i)
    expect(expenseNoField).toBeDisabled()
    expect(expenseNoField).toHaveValue(`EXP-${yy}-001`)
  })

  it('reflects a custom prefix and padding in the preview', () => {
    mockGetDocumentNumberSettings.mockReturnValue({
      data: {
        configurations: [
          { documentName: 'Expenses', prefix: 'COST', nextNumber: 42, paddingDigits: 5, lastResetYear: 26 },
        ],
      },
      isLoading: false,
    })
    renderCreatePage()
    expect(screen.getByLabelText(/expense no/i)).toHaveValue(`COST-${yy}-00042`)
  })

  it('shows a loading state while document number settings load', () => {
    mockGetDocumentNumberSettings.mockReturnValue({ data: undefined, isLoading: true })
    renderCreatePage()
    expect(screen.getByLabelText(/expense no/i)).toHaveValue('Loading...')
  })

  it('falls back to Auto-generated when no Expenses configuration exists', () => {
    mockGetDocumentNumberSettings.mockReturnValue({ data: { configurations: [] }, isLoading: false })
    renderCreatePage()
    expect(screen.getByLabelText(/expense no/i)).toHaveValue('Auto-generated')
  })

  it('renders account selector with options from tree', () => {
    renderCreatePage()
    expect(screen.getByRole('combobox', { name: /account/i })).toBeInTheDocument()
  })

  it('omits the configured COGS account from the account selector', async () => {
    const user = userEvent.setup()
    renderCreatePage()
    await user.click(screen.getByRole('combobox', { name: /account/i }))
    const listbox = within(screen.getByRole('listbox'))
    expect(listbox.queryByText('5100 Cost of Goods Sold')).not.toBeInTheDocument()
  })

  it('keeps other active postable operating expense accounts selectable', async () => {
    const user = userEvent.setup()
    renderCreatePage()
    await user.click(screen.getByRole('combobox', { name: /account/i }))
    const listbox = within(screen.getByRole('listbox'))
    expect(listbox.getByText('6990 Other Expenses')).toBeInTheDocument()
    expect(listbox.getByText('5000 Office Supplies')).toBeInTheDocument()
  })

  it('excludes by configured id, not by the 5100 code', async () => {
    mockGetAccountingSettings.mockReturnValue({
      data: { defaultExpenseAccountId: 'exp-acc-1', cogsAccountId: 'exp-acc-3' },
      isLoading: false, isFetching: false,
    })
    const user = userEvent.setup()
    renderCreatePage()
    await user.click(screen.getByRole('combobox', { name: /account/i }))
    const listbox = within(screen.getByRole('listbox'))
    expect(listbox.queryByText('6990 Other Expenses')).not.toBeInTheDocument()
    expect(listbox.getByText('5100 Cost of Goods Sold')).toBeInTheDocument()
  })

  it('keeps 6990 Other Expenses selected by default when it is the configured default', async () => {
    mockGetAccountingSettings.mockReturnValue({
      data: { defaultExpenseAccountId: 'exp-acc-3', cogsAccountId: 'cogs-acc' },
      isLoading: false, isFetching: false,
    })
    renderCreatePage()
    await waitFor(() => {
      expect(screen.getByRole('combobox', { name: /account/i })).toHaveTextContent('6990 Other Expenses')
    })
  })

  it('shows validation error for empty description on submit', async () => {
    const user = userEvent.setup()
    renderCreatePage()
    await user.click(screen.getByRole('button', { name: /create expense/i }))
    await waitFor(() => {
      expect(screen.getByText('Description is required')).toBeInTheDocument()
    })
    expect(mockCreateExpense).not.toHaveBeenCalled()
  })

  it('shows validation error for zero amount on submit', async () => {
    const user = userEvent.setup()
    renderCreatePage()
    await user.type(screen.getByLabelText(/description/i), 'Test expense')
    await user.click(screen.getByRole('combobox', { name: /account/i }))
    await user.click(screen.getByRole('option', { name: /5000 office supplies/i }))
    await user.type(screen.getByLabelText(/amount/i), '0')
    await user.click(screen.getByRole('button', { name: /create expense/i }))
    await waitFor(() => {
      expect(screen.getByText('Amount must be greater than 0')).toBeInTheDocument()
    })
    expect(mockCreateExpense).not.toHaveBeenCalled()
  })

  it.each([
    ['1e3'],
    ['.5'],
    ['+1000'],
    ['-5'],
    ['1.00000'],
    ['abc'],
    [' 1000 '],
  ])('rejects malformed amount %j with a format error and no API call', async (amount) => {
    const user = userEvent.setup()
    renderCreatePage()
    await user.type(screen.getByLabelText(/description/i), 'Test expense')
    await user.click(screen.getByRole('combobox', { name: /account/i }))
    await user.click(screen.getByRole('option', { name: /5000 office supplies/i }))
    await user.type(screen.getByLabelText(/amount/i), amount)
    await user.click(screen.getByRole('button', { name: /create expense/i }))
    await waitFor(() => {
      expect(screen.getByText('Enter a valid amount (up to 4 decimal places)')).toBeInTheDocument()
    })
    expect(mockCreateExpense).not.toHaveBeenCalled()
  })

  // `' 1000 '` above is the whitespace case: the grammar has no \s, and
  // normalizeAmountInput deliberately does not trim, so it must surface a format
  // error rather than being silently repaired. userEvent.type enters the spaces
  // literally, so the field value really is ' 1000 '.

  it('reports only the required message for a blank amount', async () => {
    const user = userEvent.setup()
    renderCreatePage()
    await user.type(screen.getByLabelText(/description/i), 'Test expense')
    await user.click(screen.getByRole('combobox', { name: /account/i }))
    await user.click(screen.getByRole('option', { name: /5000 office supplies/i }))
    await user.click(screen.getByRole('button', { name: /create expense/i }))
    await waitFor(() => {
      expect(screen.getByText('Amount is required')).toBeInTheDocument()
    })
    expect(screen.queryByText('Enter a valid amount (up to 4 decimal places)')).not.toBeInTheDocument()
    expect(mockCreateExpense).not.toHaveBeenCalled()
  })

  it('reports only the format message for a negative amount', async () => {
    const user = userEvent.setup()
    renderCreatePage()
    await user.type(screen.getByLabelText(/description/i), 'Test expense')
    await user.click(screen.getByRole('combobox', { name: /account/i }))
    await user.click(screen.getByRole('option', { name: /5000 office supplies/i }))
    await user.type(screen.getByLabelText(/amount/i), '-5')
    await user.click(screen.getByRole('button', { name: /create expense/i }))
    await waitFor(() => {
      expect(screen.getByText('Enter a valid amount (up to 4 decimal places)')).toBeInTheDocument()
    })
    expect(screen.queryByText('Amount must be greater than 0')).not.toBeInTheDocument()
  })

  it('normalizes a trailing decimal point on blur', async () => {
    const user = userEvent.setup()
    renderCreatePage()
    const amountField = screen.getByLabelText(/amount/i)
    await user.type(amountField, '1000.')
    await user.tab()
    await waitFor(() => {
      expect(amountField).toHaveValue('1000.00')
    })
  })

  it('submits the normalized amount after blur', async () => {
    const user = userEvent.setup()
    renderCreatePage()
    await user.type(screen.getByLabelText(/description/i), 'Office supplies')
    await user.click(screen.getByRole('combobox', { name: /account/i }))
    await user.click(screen.getByRole('option', { name: /5000 office supplies/i }))
    await user.type(screen.getByLabelText(/amount/i), '1000.')
    await user.tab()
    await user.click(screen.getByRole('button', { name: /create expense/i }))
    await waitFor(() => {
      expect(mockCreateExpense).toHaveBeenCalledWith(
        expect.objectContaining({ totalAmount: '1000.00' }),
      )
    })
    expect(screen.queryByText('Enter a valid amount (up to 4 decimal places)')).not.toBeInTheDocument()
  })

  it.each([
    ['1000', '1000'],
    ['1000.00', '1000.00'],
  ])('submits a valid amount %s unchanged as %s', async (typed, submitted) => {
    const user = userEvent.setup()
    renderCreatePage()
    await user.type(screen.getByLabelText(/description/i), 'Office supplies')
    await user.click(screen.getByRole('combobox', { name: /account/i }))
    await user.click(screen.getByRole('option', { name: /5000 office supplies/i }))
    await user.type(screen.getByLabelText(/amount/i), typed)
    await user.tab()
    await user.click(screen.getByRole('button', { name: /create expense/i }))
    await waitFor(() => {
      expect(mockCreateExpense).toHaveBeenCalledWith(
        expect.objectContaining({ totalAmount: submitted }),
      )
    })
  })

  // Note the asymmetry: '1000' submits as '1000', NOT padded to '1000.00'.
  // normalizeAmountInput repairs a trailing dot only, so a bare integer passes
  // through untouched — valid against the DTO regex either way.

  it('leaves a malformed value untouched on blur', async () => {
    const user = userEvent.setup()
    renderCreatePage()
    const amountField = screen.getByLabelText(/amount/i)
    await user.type(amountField, '1e3')
    await user.tab()
    await waitFor(() => {
      expect(amountField).toHaveValue('1e3')
    })
  })

  it('preserves a scale-4 amount exactly through submission', async () => {
    const user = userEvent.setup()
    renderCreatePage()
    await user.type(screen.getByLabelText(/description/i), 'Rounding adjustment')
    await user.click(screen.getByRole('combobox', { name: /account/i }))
    await user.click(screen.getByRole('option', { name: /5000 office supplies/i }))
    await user.type(screen.getByLabelText(/amount/i), '1000.0001')
    await user.tab()
    await user.click(screen.getByRole('button', { name: /create expense/i }))
    await waitFor(() => {
      expect(mockCreateExpense).toHaveBeenCalledWith(
        expect.objectContaining({ totalAmount: '1000.0001' }),
      )
    })
  })

  it('accepts a sub-cent scale-4 amount such as 0.0001', async () => {
    const user = userEvent.setup()
    renderCreatePage()
    await user.type(screen.getByLabelText(/description/i), 'Rounding adjustment')
    await user.click(screen.getByRole('combobox', { name: /account/i }))
    await user.click(screen.getByRole('option', { name: /5000 office supplies/i }))
    await user.type(screen.getByLabelText(/amount/i), '0.0001')
    await user.click(screen.getByRole('button', { name: /create expense/i }))
    await waitFor(() => {
      expect(mockCreateExpense).toHaveBeenCalledWith(
        expect.objectContaining({ totalAmount: '0.0001' }),
      )
    })
    expect(screen.queryByText('Amount must be greater than 0')).not.toBeInTheDocument()
  })

  it('submits the picked calendar date without timezone shift', async () => {
    // Force a UTC+8 zone so the test bites even on UTC CI hosts: a UTC-based
    // formatter turns local midnight 2026-07-26 into 2026-07-25.
    const originalTZ = process.env.TZ
    process.env.TZ = 'Asia/Kuala_Lumpur'
    try {
    const user = userEvent.setup()
    // Pin the regional format: the picker's section order follows it, and the
    // fixed Month-first keystrokes below are only valid under MM/DD/YYYY.
    localStorage.setItem('dateFormat', 'MM/DD/YYYY')
    renderCreatePage()
    await user.type(screen.getByLabelText(/description/i), 'Dated expense')
    await user.click(screen.getByRole('combobox', { name: /account/i }))
    await user.click(screen.getByRole('option', { name: /5000 office supplies/i }))
    await user.type(screen.getByLabelText(/amount/i), '10')
    // Type a date into the picker's text field; the picker hands the form a
    // local-midnight Date. On a UTC+ host, formatting that Date via
    // toISOString would submit the previous day.
    // MUI X renders the date as Month/Day/Year spinbutton sections; typing
    // digits auto-advances through them.
    await user.click(screen.getByRole('spinbutton', { name: 'Month' }))
    await user.keyboard('07262026')
    await user.click(screen.getByRole('button', { name: /create expense/i }))
    await waitFor(() => {
      expect(mockCreateExpense).toHaveBeenCalledWith(
        expect.objectContaining({ expenseDate: '2026-07-26' }),
      )
    })
    } finally {
      if (originalTZ === undefined) delete process.env.TZ
      else process.env.TZ = originalTZ
    }
  })

  it('calls createExpense and navigates to the list on submit', async () => {
    const user = userEvent.setup()
    renderCreatePage()

    await user.type(screen.getByLabelText(/description/i), 'Office supplies')
    await user.click(screen.getByRole('combobox', { name: /account/i }))
    await user.click(screen.getByRole('option', { name: /5000 office supplies/i }))
    await user.type(screen.getByLabelText(/amount/i), '250.00')
    await user.click(screen.getByRole('button', { name: /create expense/i }))

    await waitFor(() => {
      expect(mockCreateExpense).toHaveBeenCalledWith(
        expect.objectContaining({
          description: 'Office supplies',
          totalAmount: '250.00',
          expenseAccountId: 'exp-acc-1',
        }),
      )
    })
    expect(mockShowSuccess).toHaveBeenCalled()
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/accounting/expenses')
    })
  })

  it('does not navigate to the Expense Detail page after create', async () => {
    const user = userEvent.setup()
    renderCreatePage()

    await user.type(screen.getByLabelText(/description/i), 'Office supplies')
    await user.click(screen.getByRole('combobox', { name: /account/i }))
    await user.click(screen.getByRole('option', { name: /5000 office supplies/i }))
    await user.type(screen.getByLabelText(/amount/i), '250.00')
    await user.click(screen.getByRole('button', { name: /create expense/i }))

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalled()
    })
    expect(mockNavigate).not.toHaveBeenCalledWith('/accounting/expenses/new-exp-1')
  })

  it('shows the unchanged success notification after create', async () => {
    const user = userEvent.setup()
    renderCreatePage()

    await user.type(screen.getByLabelText(/description/i), 'Office supplies')
    await user.click(screen.getByRole('combobox', { name: /account/i }))
    await user.click(screen.getByRole('option', { name: /5000 office supplies/i }))
    await user.type(screen.getByLabelText(/amount/i), '250.00')
    await user.click(screen.getByRole('button', { name: /create expense/i }))

    await waitFor(() => {
      expect(mockShowSuccess).toHaveBeenCalledWith('Expense created successfully')
    })
  })

  it('stays on the form and surfaces an error when create fails', async () => {
    mockCreateExpense.mockReturnValue({
      unwrap: vi.fn().mockRejectedValue({ data: { message: 'Server exploded' } }),
    })
    const user = userEvent.setup()
    renderCreatePage()

    await user.type(screen.getByLabelText(/description/i), 'Office supplies')
    await user.click(screen.getByRole('combobox', { name: /account/i }))
    await user.click(screen.getByRole('option', { name: /5000 office supplies/i }))
    await user.type(screen.getByLabelText(/amount/i), '250.00')
    await user.click(screen.getByRole('button', { name: /create expense/i }))

    await waitFor(() => {
      expect(mockShowError).toHaveBeenCalledWith('Server exploded')
    })
    expect(mockNavigate).not.toHaveBeenCalled()
    expect(mockShowSuccess).not.toHaveBeenCalled()
  })
})

describe('ExpenseFormPage - Edit mode', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockLocationState.current = null
    mockBlockerState.current = 'idle'
    mockCreateExpense.mockReturnValue({ unwrap: vi.fn().mockResolvedValue({ id: 'new-exp-1' }) })
    mockUpdateExpense.mockReturnValue({ unwrap: vi.fn().mockResolvedValue({ id: 'exp-1' }) })
    mockGetExpense.mockReturnValue({ data: defaultExpense, isLoading: false, isFetching: false })
    mockGetAccountTree.mockReturnValue({ data: defaultAccounts, isLoading: false, isFetching: false })
    mockGetAccountingSettings.mockReturnValue({ data: { defaultExpenseAccountId: 'exp-acc-1', cogsAccountId: 'cogs-acc' }, isLoading: false, isFetching: false })
    mockGetDocumentNumberSettings.mockReturnValue(EXPENSE_DOC_SETTINGS)
  })

  it('shows Edit Expense heading and pre-fills fields', async () => {
    renderEditPage()
    await waitFor(() => {
      expect(screen.getByText('Edit Expense')).toBeInTheDocument()
    })
    expect(screen.getByLabelText(/description/i)).toHaveValue('Office supplies purchase')
    expect(screen.getByLabelText(/payee/i)).toHaveValue('Vendor Corp')
  })

  describe('regional date format', () => {
    const cases: [string, string][] = [
      ['DD/MM/YYYY', '27/07/2026'],
      ['MM/DD/YYYY', '07/27/2026'],
      ['YYYY-MM-DD', '2026-07-27'],
    ]

    cases.forEach(([stored, expected]) => {
      it(`displays the expense date as ${stored}`, async () => {
        localStorage.setItem('dateFormat', stored)
        mockGetExpense.mockReturnValue({
          data: { ...defaultExpense, expenseDate: '2026-07-27' },
          isLoading: false,
          isFetching: false,
        })
        renderEditPage()
        await waitFor(() => {
          expect(screen.getByRole('group', { name: /expense date/i })).toHaveTextContent(expected)
        })
      })
    })
  })

  it('shows expense number as read-only on edit', async () => {
    renderEditPage()
    await waitFor(() => {
      const expenseNoField = screen.getByLabelText(/expense no/i)
      expect(expenseNoField).toBeDisabled()
      expect(expenseNoField).toHaveValue('EXP-001')
    })
  })

  it('shows the saved expense number in edit mode', async () => {
    renderEditPage()
    await waitFor(() => {
      expect(screen.getByLabelText(/expense no/i)).toHaveValue(defaultExpense.expenseNumber)
    })
  })

  it('calls updateExpense and navigates on successful submit', async () => {
    const user = userEvent.setup()
    renderEditPage()
    await waitFor(() => {
      expect(screen.getByLabelText(/description/i)).toHaveValue('Office supplies purchase')
    })

    await user.clear(screen.getByLabelText(/description/i))
    await user.type(screen.getByLabelText(/description/i), 'Updated description')
    await user.click(screen.getByRole('button', { name: /save expense/i }))

    await waitFor(() => {
      expect(mockUpdateExpense).toHaveBeenCalledWith({
        id: 'exp-1',
        data: expect.objectContaining({ description: 'Updated description' }),
      })
    })
    expect(mockShowSuccess).toHaveBeenCalled()
    expect(mockNavigate).toHaveBeenCalledWith('/accounting/expenses/exp-1')
  })

  it('still displays a legacy COGS account on an expense already booked to it', async () => {
    mockGetExpense.mockReturnValue({
      data: { ...defaultExpense, expenseAccountId: 'cogs-acc', expenseAccount: { id: 'cogs-acc', code: '5100', name: 'Cost of Goods Sold' } },
      isLoading: false, isFetching: false,
    })
    renderEditPage()
    await waitFor(() => {
      expect(screen.getByRole('combobox', { name: /account/i })).toHaveTextContent('5100 Cost of Goods Sold')
    })
  })

  it('drops the legacy COGS option once the user switches away from it', async () => {
    mockGetExpense.mockReturnValue({
      data: { ...defaultExpense, expenseAccountId: 'cogs-acc', expenseAccount: { id: 'cogs-acc', code: '5100', name: 'Cost of Goods Sold' } },
      isLoading: false, isFetching: false,
    })
    const user = userEvent.setup()
    renderEditPage()
    await waitFor(() => {
      expect(screen.getByRole('combobox', { name: /account/i })).toHaveTextContent('5100 Cost of Goods Sold')
    })
    await user.click(screen.getByRole('combobox', { name: /account/i }))
    await user.click(within(screen.getByRole('listbox')).getByText('6990 Other Expenses'))
    await user.click(screen.getByRole('combobox', { name: /account/i }))
    expect(within(screen.getByRole('listbox')).queryByText('5100 Cost of Goods Sold')).not.toBeInTheDocument()
  })

  it('displays a NUMERIC(18,4) amount without its trailing zeros', async () => {
    mockGetExpense.mockReturnValue({
      data: { ...defaultExpense, totalAmount: '1000.0000', paidAmount: '0.00', balance: '1000.0000' },
      isLoading: false,
      isFetching: false,
    })
    renderEditPage()

    await waitFor(() => {
      expect(screen.getByLabelText(/amount/i)).toHaveValue('1000.00')
    })
  })

  it('submits the normalized amount when the field is left untouched', async () => {
    const user = userEvent.setup()
    mockGetExpense.mockReturnValue({
      data: { ...defaultExpense, totalAmount: '1000.0000', paidAmount: '0.00', balance: '1000.0000' },
      isLoading: false,
      isFetching: false,
    })
    renderEditPage()

    await waitFor(() => {
      expect(screen.getByLabelText(/amount/i)).toHaveValue('1000.00')
    })

    // Edit a different field to make "Amount was never touched" explicit.
    await user.clear(screen.getByLabelText(/description/i))
    await user.type(screen.getByLabelText(/description/i), 'Updated description')
    await user.click(screen.getByRole('button', { name: /save expense/i }))

    await waitFor(() => {
      expect(mockUpdateExpense).toHaveBeenCalledWith({
        id: 'exp-1',
        data: expect.objectContaining({ totalAmount: '1000.00' }),
      })
    })
  })

  it('rejects an amount below a large paid amount that parseFloat cannot distinguish', async () => {
    const user = userEvent.setup()
    mockGetExpense.mockReturnValue({
      data: {
        ...defaultExpense,
        totalAmount: '99999999999999.9900',
        paidAmount: '99999999999999.9900',
        balance: '0.0000',
        paymentStatus: 'PARTIAL' as const,
      },
      isLoading: false,
      isFetching: false,
    })
    renderEditPage()
    const amountField = screen.getByLabelText(/amount/i)
    await user.clear(amountField)
    // One ten-thousandth below the paid amount. parseFloat collapses both this
    // and the paid amount to 99999999999999.98, so the old numeric comparison
    // accepted it; the bigint comparison rejects it.
    await user.type(amountField, '99999999999999.9899')
    await user.click(screen.getByRole('button', { name: /save expense/i }))
    await waitFor(() => {
      expect(screen.getByText('Amount cannot be less than paid amount')).toBeInTheDocument()
    })
    expect(mockUpdateExpense).not.toHaveBeenCalled()
  })
})

describe('ExpenseFormPage - Edit locks', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockLocationState.current = null
    mockBlockerState.current = 'idle'
    mockUpdateExpense.mockReturnValue({ unwrap: vi.fn().mockResolvedValue({ id: 'exp-1' }) })
    mockGetAccountTree.mockReturnValue({ data: defaultAccounts, isLoading: false, isFetching: false })
    mockGetAccountingSettings.mockReturnValue({ data: { defaultExpenseAccountId: 'exp-acc-1', cogsAccountId: 'cogs-acc' }, isLoading: false, isFetching: false })
    mockGetDocumentNumberSettings.mockReturnValue(EXPENSE_DOC_SETTINGS)
  })

  it('disables account select when expense has payments', async () => {
    const expenseWithPayments = {
      ...defaultExpense,
      payments: [{ id: 'pmt-1', paymentMethodId: 'pm-1', paymentDate: '2024-06-15', amount: '50.00', reference: null, sourcePaymentId: null }],
    }
    mockGetExpense.mockReturnValue({ data: expenseWithPayments, isLoading: false, isFetching: false })
    renderEditPage()

    await waitFor(() => {
      expect(screen.getByRole('combobox', { name: /account/i })).toHaveAttribute('aria-disabled', 'true')
    })
    const user = userEvent.setup()
    await user.hover(screen.getByRole('combobox', { name: /account/i }))
    expect(await screen.findByRole('tooltip', { name: /locked after first payment/i })).toBeInTheDocument()
  })

  it('rejects amount below paidAmount when partially paid', async () => {
    const partiallyPaidExpense = {
      ...defaultExpense,
      paidAmount: '50.00',
      balance: '100.00',
      paymentStatus: 'PARTIAL' as const,
    }
    mockGetExpense.mockReturnValue({ data: partiallyPaidExpense, isLoading: false, isFetching: false })
    const user = userEvent.setup()
    renderEditPage()

    await waitFor(() => {
      expect(screen.getByLabelText(/description/i)).toHaveValue('Office supplies purchase')
    })

    await user.clear(screen.getByLabelText(/amount/i))
    await user.type(screen.getByLabelText(/amount/i), '25.00')
    await user.click(screen.getByRole('button', { name: /save expense/i }))

    await waitFor(() => {
      expect(screen.getByText(/amount cannot be less/i)).toBeInTheDocument()
    })
    expect(mockUpdateExpense).not.toHaveBeenCalled()
  })
})

describe('ExpenseFormPage - Dirty cancel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockLocationState.current = null
    mockCreateExpense.mockReturnValue({ unwrap: vi.fn().mockResolvedValue({ id: 'new-exp-1' }) })
    mockGetExpense.mockReturnValue({ data: defaultExpense, isLoading: false, isFetching: false })
    mockGetAccountTree.mockReturnValue({ data: defaultAccounts, isLoading: false, isFetching: false })
    mockGetAccountingSettings.mockReturnValue({ data: { defaultExpenseAccountId: 'exp-acc-1', cogsAccountId: 'cogs-acc' }, isLoading: false, isFetching: false })
    mockGetDocumentNumberSettings.mockReturnValue(EXPENSE_DOC_SETTINGS)
  })

  it('shows discard dialog when blocker intercepts navigation on dirty form', () => {
    mockBlockerState.current = 'blocked'
    renderCreatePage()
    expect(screen.getByText(/discard this expense/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /discard/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /keep editing/i })).toBeInTheDocument()
    mockBlockerState.current = 'idle'
  })

  it('delegates to the blocker when the discard is confirmed', async () => {
    const user = userEvent.setup()
    mockBlockerState.current = 'blocked'
    renderCreatePage()

    await user.click(screen.getByRole('button', { name: /discard/i }))

    // The component's responsibility ends at calling proceed(). Do NOT assert that
    // a navigation then completes: with useNavigate and useBlocker both mocked,
    // proceed() cannot resume a pending router navigation — resumption is React
    // Router's own behaviour. The destination itself is covered by the
    // list-origin and detail-origin Cancel tests in the Edit origin block.
    expect(mockBlockerProceed).toHaveBeenCalled()
    mockBlockerState.current = 'idle'
  })
})

describe('ExpenseFormPage - PAID/CANCELLED redirect', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockLocationState.current = null
    mockGetAccountTree.mockReturnValue({ data: defaultAccounts, isLoading: false, isFetching: false })
    mockGetAccountingSettings.mockReturnValue({ data: { defaultExpenseAccountId: 'exp-acc-1', cogsAccountId: 'cogs-acc' }, isLoading: false, isFetching: false })
    mockGetDocumentNumberSettings.mockReturnValue(EXPENSE_DOC_SETTINGS)
  })

  it('redirects to detail page for PAID expense edit URL', async () => {
    const paidExpense = { ...defaultExpense, paymentStatus: 'PAID' as const, documentStatus: 'DRAFT' as const }
    mockGetExpense.mockReturnValue({ data: paidExpense, isLoading: false, isFetching: false })
    renderEditPage()
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/accounting/expenses/exp-1', { replace: true })
    })
  })

  it('redirects to detail page for CANCELLED expense edit URL', async () => {
    const cancelledExpense = { ...defaultExpense, documentStatus: 'CANCELLED' as const, paymentStatus: 'UNPAID' as const }
    mockGetExpense.mockReturnValue({ data: cancelledExpense, isLoading: false, isFetching: false })
    renderEditPage()
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/accounting/expenses/exp-1', { replace: true })
    })
  })

  it('does not redirect for DRAFT + UNPAID expense edit URL', async () => {
    const draftExpense = { ...defaultExpense, documentStatus: 'DRAFT' as const, paymentStatus: 'UNPAID' as const }
    mockGetExpense.mockReturnValue({ data: draftExpense, isLoading: false, isFetching: false })
    renderEditPage()
    await waitFor(() => {
      expect(screen.getByText('Edit Expense')).toBeInTheDocument()
    })
    expect(mockNavigate).not.toHaveBeenCalled()
  })
})

describe('ExpenseFormPage - Edit origin', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockLocationState.current = null
    mockBlockerState.current = 'idle'
    mockUpdateExpense.mockReturnValue({ unwrap: vi.fn().mockResolvedValue({ id: 'exp-1' }) })
    mockGetExpense.mockReturnValue({ data: defaultExpense, isLoading: false, isFetching: false })
    mockGetAccountTree.mockReturnValue({ data: defaultAccounts, isLoading: false, isFetching: false })
    mockGetAccountingSettings.mockReturnValue({ data: { defaultExpenseAccountId: 'exp-acc-1', cogsAccountId: 'cogs-acc' }, isLoading: false, isFetching: false })
    mockGetDocumentNumberSettings.mockReturnValue(EXPENSE_DOC_SETTINGS)
  })

  it('returns to the list with highlight state after a list-origin Save', async () => {
    const user = userEvent.setup()
    renderEditPageFromList()
    await waitFor(() => {
      expect(screen.getByLabelText(/description/i)).toHaveValue('Office supplies purchase')
    })

    await user.clear(screen.getByLabelText(/description/i))
    await user.type(screen.getByLabelText(/description/i), 'Updated description')
    await user.click(screen.getByRole('button', { name: /save expense/i }))

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/accounting/expenses', {
        state: { highlightExpenseId: 'exp-1' },
      })
    })
  })

  it('returns to the list after a list-origin Cancel', async () => {
    const user = userEvent.setup()
    renderEditPageFromList()
    await waitFor(() => {
      expect(screen.getByLabelText(/description/i)).toHaveValue('Office supplies purchase')
    })

    await user.click(screen.getByRole('button', { name: /^cancel$/i }))

    expect(mockNavigate).toHaveBeenCalledWith('/accounting/expenses', {
      state: { highlightExpenseId: 'exp-1' },
    })
  })

  it('returns to the list when Back is used from a list-origin edit', async () => {
    const user = userEvent.setup()
    renderEditPageFromList()
    await waitFor(() => {
      expect(screen.getByLabelText(/description/i)).toHaveValue('Office supplies purchase')
    })

    // Back is an icon-only IconButton in PageHeader (PageHeader.tsx:67) with no
    // aria-label, so it has no accessible name — getByRole('button', { name: /back/i })
    // will NOT find it. Reach it through the icon, as other suites do.
    await user.click(screen.getByTestId('ArrowBackIcon').closest('button')!)

    expect(mockNavigate).toHaveBeenCalledWith('/accounting/expenses', {
      state: { highlightExpenseId: 'exp-1' },
    })
  })

  it('returns to Detail after a detail-origin Save', async () => {
    const user = userEvent.setup()
    renderEditPage()
    await waitFor(() => {
      expect(screen.getByLabelText(/description/i)).toHaveValue('Office supplies purchase')
    })

    await user.clear(screen.getByLabelText(/description/i))
    await user.type(screen.getByLabelText(/description/i), 'Updated description')
    await user.click(screen.getByRole('button', { name: /save expense/i }))

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/accounting/expenses/exp-1')
    })
  })

  it('returns to Detail after a detail-origin Cancel', async () => {
    const user = userEvent.setup()
    renderEditPage()
    await waitFor(() => {
      expect(screen.getByLabelText(/description/i)).toHaveValue('Office supplies purchase')
    })

    await user.click(screen.getByRole('button', { name: /^cancel$/i }))

    expect(mockNavigate).toHaveBeenCalledWith('/accounting/expenses/exp-1')
  })

  it('returns to Detail when Back is used from a direct edit URL', async () => {
    const user = userEvent.setup()
    renderEditPage()
    await waitFor(() => {
      expect(screen.getByLabelText(/description/i)).toHaveValue('Office supplies purchase')
    })

    // See the list-origin Back test above: the PageHeader back button is icon-only
    // and has no accessible name.
    await user.click(screen.getByTestId('ArrowBackIcon').closest('button')!)

    expect(mockNavigate).toHaveBeenCalledWith('/accounting/expenses/exp-1')
  })

  it('does not navigate when a list-origin Save fails', async () => {
    const user = userEvent.setup()
    mockUpdateExpense.mockReturnValue({
      unwrap: vi.fn().mockRejectedValue({ data: { message: 'Server error' } }),
    })
    renderEditPageFromList()
    await waitFor(() => {
      expect(screen.getByLabelText(/description/i)).toHaveValue('Office supplies purchase')
    })

    await user.clear(screen.getByLabelText(/description/i))
    await user.type(screen.getByLabelText(/description/i), 'Updated description')
    await user.click(screen.getByRole('button', { name: /save expense/i }))

    await waitFor(() => {
      expect(mockShowError).toHaveBeenCalled()
    })
    expect(mockNavigate).not.toHaveBeenCalled()
  })

  it('leaves create navigation unchanged', async () => {
    const user = userEvent.setup()
    mockCreateExpense.mockReturnValue({
      unwrap: vi.fn().mockResolvedValue({ id: 'new-exp-1', expenseNumber: 'EXP-002' }),
    })
    renderCreatePage()

    await user.type(screen.getByLabelText(/description/i), 'New expense')
    await user.type(screen.getByLabelText(/amount/i), '25')
    await user.click(screen.getByRole('button', { name: /create expense/i }))

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/accounting/expenses')
    })
  })
})
