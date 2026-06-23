import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import CategoryList from './CategoryList'

const mockUnwrap = vi.fn()
const mockSetCategoryEnabled = vi.fn(() => ({ unwrap: mockUnwrap }))
const mockShowSuccess = vi.fn()
const mockShowError = vi.fn()

vi.mock('@/store/api/inventoryApi', () => ({
  useSetCategoryEnabledMutation: () => [mockSetCategoryEnabled, { isLoading: false }],
}))

vi.mock('@/hooks/useNotification', () => ({
  useNotification: () => ({ showSuccess: mockShowSuccess, showError: mockShowError }),
}))

const cats = [
  { id: '1', name: 'Apparel', slug: 'apparel', level: 0, parentId: null, isEnabled: true, productCount: 3 },
  { id: '2', name: "Men's", slug: 'mens', level: 1, parentId: '1', isEnabled: false, productCount: 1 },
] as any

function renderList(props: Partial<React.ComponentProps<typeof CategoryList>> = {}) {
  return render(
    <MemoryRouter>
      <CategoryList
        categories={cats}
        sortBy="name"
        sortOrder="asc"
        onSort={vi.fn()}
        {...props}
      />
    </MemoryRouter>,
  )
}

describe('CategoryList', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUnwrap.mockResolvedValue({})
  })

  it('renders rows with no Delete action and shows item counts', () => {
    renderList()
    expect(screen.getByText('Apparel')).toBeInTheDocument()
    expect(screen.getByText('3 items')).toBeInTheDocument()
    expect(screen.queryByText(/^Delete$/)).not.toBeInTheDocument()
  })

  it('confirms then deactivates and shows a success toast', async () => {
    const user = userEvent.setup()
    renderList()

    // Open the row action menu for the active "Apparel" row, click Set as Inactive.
    const menuButtons = screen.getAllByRole('button')
    await user.click(menuButtons[0])
    await user.click(await screen.findByText('Set as Inactive'))

    // Confirmation dialog appears — nothing called yet.
    expect(mockSetCategoryEnabled).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Set Inactive' }))

    await waitFor(() =>
      expect(mockSetCategoryEnabled).toHaveBeenCalledWith({ id: '1', enabled: false }),
    )
    expect(mockShowSuccess).toHaveBeenCalledWith('Apparel set as inactive')
    expect(mockShowError).not.toHaveBeenCalled()
  })

  it('shows an error toast when the backend rejects the toggle', async () => {
    mockUnwrap.mockRejectedValue({ data: { message: 'Cannot deactivate: has active subcategories' } })
    const user = userEvent.setup()
    renderList()

    const menuButtons = screen.getAllByRole('button')
    await user.click(menuButtons[0])
    await user.click(await screen.findByText('Set as Inactive'))
    await user.click(screen.getByRole('button', { name: 'Set Inactive' }))

    await waitFor(() =>
      expect(mockShowError).toHaveBeenCalledWith('Cannot deactivate: has active subcategories'),
    )
    expect(mockShowSuccess).not.toHaveBeenCalled()
  })
})
