import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { FilterSelect } from '../FilterSelect'

const options = [
  { value: '2026', label: '2026' },
  { value: '2025', label: '2025' },
]

describe('FilterSelect showEmptyOption', () => {
  it('offers the empty choice by default, so existing filters are unchanged', async () => {
    render(
      <FilterSelect field="status" label="Status" value={null} options={options} onChange={vi.fn()} />,
    )
    await userEvent.click(screen.getByRole('combobox'))
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['All', '2026', '2025'])
  })

  it('omits the empty choice when showEmptyOption is false', async () => {
    render(
      <FilterSelect
        field="year"
        label="Year"
        value="2026"
        options={options}
        showEmptyOption={false}
        onChange={vi.fn()}
      />,
    )
    await userEvent.click(screen.getByRole('combobox'))
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['2026', '2025'])
  })
})
