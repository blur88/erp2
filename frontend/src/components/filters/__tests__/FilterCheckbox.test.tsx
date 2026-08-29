import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { FilterCheckbox } from '../FilterCheckbox'

function renderFilterCheckbox(value = false, onChange = vi.fn()) {
  return {
    onChange,
    ...render(
      <FilterCheckbox
        field="showZero"
        label="Show zero-balance accounts"
        value={value}
        onChange={onChange}
      />,
    ),
  }
}

describe('FilterCheckbox', () => {
  it('renders a labelled checkbox', () => {
    renderFilterCheckbox()
    expect(screen.getByRole('checkbox', { name: /show zero-balance accounts/i })).toBeInTheDocument()
  })

  it('reflects the checked state', () => {
    renderFilterCheckbox(true)
    expect(screen.getByRole('checkbox')).toBeChecked()
  })

  it('emits true when checked', async () => {
    const { onChange } = renderFilterCheckbox(false)
    await userEvent.click(screen.getByRole('checkbox'))
    expect(onChange).toHaveBeenCalledWith(true)
  })

  it('emits false when unchecked', async () => {
    const { onChange } = renderFilterCheckbox(true)
    await userEvent.click(screen.getByRole('checkbox'))
    expect(onChange).toHaveBeenCalledWith(false)
  })
})
