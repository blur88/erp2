import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { FilterCompare } from '../FilterCompare'

describe('FilterCompare', () => {
  it('renders the Compare label', () => {
    render(<FilterCompare value={null} onChange={vi.fn()} periodValue={null} />)
    expect(screen.getByLabelText(/compare/i)).toBeInTheDocument()
  })

  it('shows all three comparison options', async () => {
    render(<FilterCompare value={null} onChange={vi.fn()} periodValue={null} />)
    await userEvent.click(screen.getByRole('combobox'))
    expect(await screen.findByText('Previous Period')).toBeInTheDocument()
    expect(await screen.findByText('Same Period Last Month')).toBeInTheDocument()
    expect(await screen.findByText('Same Period Last Year')).toBeInTheDocument()
  })

  it('is disabled when period key is today', () => {
    render(
      <FilterCompare
        value={null}
        onChange={vi.fn()}
        periodValue={{ key: 'today', from: null, to: null }}
      />,
    )
    expect(screen.getByRole('combobox')).toHaveAttribute('aria-disabled', 'true')
  })

  it('renders an existing selection without crashing', () => {
    render(<FilterCompare value="previous_period" onChange={vi.fn()} periodValue={null} />)
    expect(screen.getByRole('combobox')).toBeInTheDocument()
  })
})
