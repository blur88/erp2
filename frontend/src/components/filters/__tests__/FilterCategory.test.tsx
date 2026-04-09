import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { FilterCategory } from '../FilterCategory'

const { useGetCategoriesQuery } = vi.hoisted(() => ({
  useGetCategoriesQuery: vi.fn(),
}))

vi.mock('@/store/api/inventoryApi', () => ({
  useGetCategoriesQuery,
}))

describe('FilterCategory', () => {
  it('renders a Category select with no options while loading', () => {
    useGetCategoriesQuery.mockReturnValue({ data: undefined })

    render(<FilterCategory field="category" value={null} onChange={vi.fn()} />)

    expect(screen.getByLabelText('Category')).toBeInTheDocument()
  })

  it('renders category options from the API sorted alphabetically', async () => {
    useGetCategoriesQuery.mockReturnValue({
      data: [
        { id: '2', name: 'Beverages' },
        { id: '1', name: 'Apparel' },
        { id: '3', name: 'Electronics' },
      ],
    })
    const user = userEvent.setup()

    render(<FilterCategory field="category" value={null} onChange={vi.fn()} />)

    await user.click(screen.getByLabelText('Category'))

    const options = screen.getAllByRole('option').map((option) => option.textContent)
    expect(options).toEqual(['All', 'Apparel', 'Beverages', 'Electronics'])
  })

  it('calls onChange with the category id when a category is selected', async () => {
    useGetCategoriesQuery.mockReturnValue({
      data: [{ id: 'abc-123', name: 'Electronics' }],
    })
    const user = userEvent.setup()
    const onChange = vi.fn()

    render(<FilterCategory field="category" value={null} onChange={onChange} />)

    await user.click(screen.getByLabelText('Category'))
    await user.click(screen.getByRole('option', { name: 'Electronics' }))

    expect(onChange).toHaveBeenCalledWith('abc-123')
  })

  it('calls onChange with null when All is selected', async () => {
    useGetCategoriesQuery.mockReturnValue({
      data: [{ id: 'abc-123', name: 'Electronics' }],
    })
    const user = userEvent.setup()
    const onChange = vi.fn()

    render(<FilterCategory field="category" value="abc-123" onChange={onChange} />)

    await user.click(screen.getByLabelText('Category'))
    await user.click(screen.getByRole('option', { name: 'All' }))

    expect(onChange).toHaveBeenCalledWith(null)
  })
})
