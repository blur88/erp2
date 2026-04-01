// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { FilterSelect } from '../FilterSelect'

describe('FilterSelect', () => {
  it('renders a custom empty label for single-select filters', async () => {
    render(
      <FilterSelect
        field="customer"
        label="Customer"
        type="select"
        value={null}
        options={[{ value: 'c1', label: 'Acme Corp' }]}
        onChange={vi.fn()}
        emptyLabel="All Customers"
      />,
    )

    await userEvent.click(screen.getByLabelText('Customer'))

    expect(screen.getByText('All Customers')).toBeInTheDocument()
  })

  it('applies a custom minWidth to single-select filters', () => {
    const { container } = render(
      <FilterSelect
        field="customer"
        label="Customer"
        type="select"
        value={null}
        options={[{ value: 'c1', label: 'Acme Corp' }]}
        onChange={vi.fn()}
        minWidth={170}
      />,
    )

    expect(container.querySelector('.MuiFormControl-root')).toHaveStyle({ minWidth: '170px' })
  })
})
