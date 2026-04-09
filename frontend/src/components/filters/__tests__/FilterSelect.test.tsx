// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { FilterSelect } from '../FilterSelect'

describe('FilterSelect', () => {
  it('renders a custom empty label', async () => {
    render(
      <FilterSelect
        field="customer"
        label="Customer"
        value={null}
        options={[{ value: 'c1', label: 'Acme Corp' }]}
        onChange={vi.fn()}
        emptyLabel="All Customers"
      />,
    )

    await userEvent.click(screen.getByLabelText('Customer'))

    expect(within(screen.getByRole('listbox')).getByText('All Customers')).toBeInTheDocument()
  })

  it('applies a custom minWidth', () => {
    const { container } = render(
      <FilterSelect
        field="customer"
        label="Customer"
        value={null}
        options={[{ value: 'c1', label: 'Acme Corp' }]}
        onChange={vi.fn()}
        minWidth={170}
      />,
    )

    expect(container.querySelector('.MuiFormControl-root')).toHaveStyle({ minWidth: '170px' })
  })

  it('defaults empty label to All when emptyLabel is omitted', async () => {
    render(
      <FilterSelect
        field="status"
        label="Status"
        value={null}
        options={[{ value: 'active', label: 'Active' }]}
        onChange={vi.fn()}
      />,
    )

    await userEvent.click(screen.getByLabelText('Status'))

    expect(within(screen.getByRole('listbox')).getByText('All')).toBeInTheDocument()
  })

  it('defaults minWidth to 160 when minWidth is omitted', () => {
    const { container } = render(
      <FilterSelect
        field="status"
        label="Status"
        value={null}
        options={[{ value: 'active', label: 'Active' }]}
        onChange={vi.fn()}
      />,
    )

    expect(container.querySelector('.MuiFormControl-root')).toHaveStyle({ minWidth: '160px' })
  })
})
