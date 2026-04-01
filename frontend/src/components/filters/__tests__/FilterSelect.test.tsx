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

  it('defaults empty label to All when emptyLabel is omitted', async () => {
    render(
      <FilterSelect
        field="status"
        label="Status"
        type="select"
        value={null}
        options={[{ value: 'active', label: 'Active' }]}
        onChange={vi.fn()}
      />,
    )

    await userEvent.click(screen.getByLabelText('Status'))

    expect(screen.getByText('All')).toBeInTheDocument()
  })

  it('defaults minWidth to 140 when minWidth is omitted on single-select', () => {
    const { container } = render(
      <FilterSelect
        field="status"
        label="Status"
        type="select"
        value={null}
        options={[{ value: 'active', label: 'Active' }]}
        onChange={vi.fn()}
      />,
    )

    expect(container.querySelector('.MuiFormControl-root')).toHaveStyle({ minWidth: '140px' })
  })

  it('defaults minWidth to 140 when minWidth is omitted on multi-select', () => {
    const { container } = render(
      <FilterSelect
        field="tags"
        label="Tags"
        type="multi-select"
        value={[]}
        options={[{ value: 'a', label: 'A' }]}
        onChange={vi.fn()}
      />,
    )

    expect(container.querySelector('.MuiFormControl-root')).toHaveStyle({ minWidth: '140px' })
  })

  it('applies a custom minWidth to multi-select filters', () => {
    const { container } = render(
      <FilterSelect
        field="tags"
        label="Tags"
        type="multi-select"
        value={[]}
        options={[{ value: 'a', label: 'A' }]}
        onChange={vi.fn()}
        minWidth={200}
      />,
    )

    expect(container.querySelector('.MuiFormControl-root')).toHaveStyle({ minWidth: '200px' })
  })
})
