import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import type { Category } from '@/types'

import { FilterCategoryLevel } from '../FilterCategoryLevel'

const makeCategory = (id: string, level: number): Category => ({
  id,
  name: `Cat ${id}`,
  level,
  isRoot: level === 0,
  hasChildren: false,
  fullPath: `Cat ${id}`,
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
})

describe('FilterCategoryLevel', () => {
  it('renders level select with no current value', () => {
    const categories = [makeCategory('1', 0), makeCategory('2', 1)]

    render(<FilterCategoryLevel categories={categories} value={null} onChange={vi.fn()} />)

    expect(screen.getByLabelText('Level')).toBeInTheDocument()
  })

  it('derives unique sorted level options from categories', async () => {
    const categories = [
      makeCategory('1', 0),
      makeCategory('2', 2),
      makeCategory('3', 1),
      makeCategory('4', 0),
    ]
    const user = userEvent.setup()

    render(<FilterCategoryLevel categories={categories} value={null} onChange={vi.fn()} />)

    await user.click(screen.getByLabelText('Level'))

    const options = screen.getAllByRole('option').map((option) => option.textContent)
    expect(options).toEqual(['All', 'Root', 'Level 1', 'Level 2'])
  })

  it('labels level 0 as Root and other levels as Level N', async () => {
    const categories = [makeCategory('1', 0), makeCategory('2', 3)]
    const user = userEvent.setup()

    render(<FilterCategoryLevel categories={categories} value={null} onChange={vi.fn()} />)

    await user.click(screen.getByLabelText('Level'))

    expect(screen.getByRole('option', { name: 'Root' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Level 3' })).toBeInTheDocument()
  })

  it('calls onChange with string level value when an option is selected', async () => {
    const categories = [makeCategory('1', 0), makeCategory('2', 1)]
    const onChange = vi.fn()
    const user = userEvent.setup()

    render(<FilterCategoryLevel categories={categories} value={null} onChange={onChange} />)

    await user.click(screen.getByLabelText('Level'))
    await user.click(screen.getByRole('option', { name: 'Root' }))

    expect(onChange).toHaveBeenCalledWith('0')
  })

  it('calls onChange with null when All is selected', async () => {
    const categories = [makeCategory('1', 0), makeCategory('2', 1)]
    const onChange = vi.fn()
    const user = userEvent.setup()

    render(<FilterCategoryLevel categories={categories} value="0" onChange={onChange} />)

    await user.click(screen.getByLabelText('Level'))
    await user.click(screen.getByRole('option', { name: 'All' }))

    expect(onChange).toHaveBeenCalledWith(null)
  })

  it('renders only the All option when categories are empty', async () => {
    const user = userEvent.setup()

    render(<FilterCategoryLevel categories={[]} value={null} onChange={vi.fn()} />)

    await user.click(screen.getByLabelText('Level'))

    const options = screen.getAllByRole('option').map((option) => option.textContent)
    expect(options).toEqual(['All'])
  })
})
