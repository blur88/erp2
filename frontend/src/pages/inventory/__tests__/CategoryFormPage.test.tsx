import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

import CategoryFormPage from '../CategoryFormPage'

const {
  mockNavigate,
  mockCreateCategory,
  mockUpdateCategory,
  mockShowError,
  mockGetCategoryBySlug,
  mockBlockerState,
  mockBlockerProceed,
  mockBlockerReset,
  mockDuplicateState,
} = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
  mockCreateCategory: vi.fn(),
  mockUpdateCategory: vi.fn(),
  mockShowError: vi.fn(),
  mockGetCategoryBySlug: vi.fn(),
  mockBlockerState: { current: 'idle' as 'idle' | 'blocked' },
  mockBlockerProceed: vi.fn(),
  mockBlockerReset: vi.fn(),
  mockDuplicateState: { hasNameDuplicate: false, nameError: '' },
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

vi.mock('@/store/api/inventoryApi', () => ({
  useGetCategoryBySlugQuery: (...args: any[]) => mockGetCategoryBySlug(...args),
  useGetCategoriesQuery: () => ({ data: [] }),
  useCreateCategoryMutation: () => [mockCreateCategory, { isLoading: false }],
  useUpdateCategoryMutation: () => [mockUpdateCategory, { isLoading: false }],
}))

vi.mock('@/hooks/useNotification', () => ({
  useNotification: () => ({ showSuccess: vi.fn(), showError: mockShowError }),
}))

vi.mock('@/hooks/useCategoryDuplicateCheck', () => ({
  useCategoryDuplicateCheck: () => ({
    checkDuplicate: vi.fn(),
    isChecking: false,
    error: mockDuplicateState.nameError || null,
    nameError: mockDuplicateState.nameError,
    hasNameDuplicate: mockDuplicateState.hasNameDuplicate,
    hasCheckedName: mockDuplicateState.hasNameDuplicate,
  }),
}))

vi.mock('@/components/inventory/CategorySelector', () => ({
  default: ({ value, onChange, excludeCategories }: any) => (
    <button type="button" onClick={() => onChange(null)}>
      {excludeCategories?.length ? `Select Parent (excluded: ${excludeCategories.join(',')})` : 'Select Parent'}
    </button>
  ),
}))

function renderCreatePage() {
  const store = configureStore({ reducer: { _noop: (state = {}) => state } })
  return render(
    <Provider store={store}>
      <MemoryRouter initialEntries={['/inventory/categories/create']}>
        <Routes>
          <Route path="/inventory/categories/create" element={<CategoryFormPage />} />
        </Routes>
      </MemoryRouter>
    </Provider>,
  )
}

function renderEditPage() {
  const store = configureStore({ reducer: { _noop: (state = {}) => state } })
  return render(
    <Provider store={store}>
      <MemoryRouter initialEntries={['/inventory/categories/mens/edit']}>
        <Routes>
          <Route path="/inventory/categories/:slug/edit" element={<CategoryFormPage />} />
        </Routes>
      </MemoryRouter>
    </Provider>,
  )
}

describe('CategoryFormPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockBlockerState.current = 'idle'
    mockCreateCategory.mockReturnValue({ unwrap: vi.fn().mockResolvedValue({ id: 'cat-1' }) })
    mockUpdateCategory.mockReturnValue({ unwrap: vi.fn().mockResolvedValue({ id: 'cat-1' }) })
    mockGetCategoryBySlug.mockReturnValue({ data: null, isFetching: false })
    mockDuplicateState.hasNameDuplicate = false
    mockDuplicateState.nameError = ''
  })

  it('shows duplicate-name error and blocks submit', async () => {
    const user = userEvent.setup()
    renderCreatePage()

    await user.type(screen.getByLabelText(/name/i), 'Existing Cat')

    mockDuplicateState.hasNameDuplicate = true
    mockDuplicateState.nameError = "Category with name 'Existing Cat' already exists at this level"

    // trigger re-render so the mock change is picked up
    await user.type(screen.getByLabelText(/name/i), ' ')

    await waitFor(() => {
      expect(screen.getByText(/already exists/i)).toBeInTheDocument()
    })

    expect(screen.getByRole('button', { name: /create/i })).toBeDisabled()
  })

  it('populates fields and excludes self from parent options in edit mode', async () => {
    mockGetCategoryBySlug.mockReturnValue({
      data: {
        id: 'cat-2',
        name: "Men's",
        slug: 'mens',
        description: 'Menswear',
        parentId: 'cat-1',
        parent: { id: 'cat-1', name: 'Apparel', slug: 'apparel' },
        isEnabled: true,
      },
      isFetching: false,
    })

    renderEditPage()

    await waitFor(() => {
      expect(screen.getByDisplayValue("Men's")).toBeInTheDocument()
    })
    expect(screen.getByDisplayValue('Menswear')).toBeInTheDocument()
    // self must be excluded from the parent selector to prevent self-parenting
    expect(screen.getByText(/excluded: cat-2/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /update/i })).toBeInTheDocument()
  })
})
