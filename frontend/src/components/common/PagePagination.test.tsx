import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import PagePagination from './PagePagination'

const baseProps = {
  total: 148,
  page: 1,
  limit: 25,
  onPageChange: vi.fn(),
  onLimitChange: vi.fn(),
}

describe('PagePagination', () => {
  it('shows the correct record range for page 1', () => {
    render(<PagePagination {...baseProps} />)
    expect(screen.getByText(/showing 1–25 of 148/i)).toBeInTheDocument()
  })

  it('shows the correct record range for page 2', () => {
    render(<PagePagination {...baseProps} page={2} />)
    expect(screen.getByText(/showing 26–50 of 148/i)).toBeInTheDocument()
  })

  it('shows the correct range on the last partial page', () => {
    render(<PagePagination {...baseProps} page={6} total={148} limit={25} />)
    expect(screen.getByText(/showing 126–148 of 148/i)).toBeInTheDocument()
  })

  it('calls onPageChange when a page is selected', () => {
    const onPageChange = vi.fn()
    render(<PagePagination {...baseProps} total={100} onPageChange={onPageChange} />)
    fireEvent.click(screen.getByRole('button', { name: /page 2/i }))
    expect(onPageChange).toHaveBeenCalledWith(2)
  })

  it('renders rows-per-page options', () => {
    render(<PagePagination {...baseProps} />)
    expect(screen.getByRole('combobox')).toBeInTheDocument()
  })

  it('shows 0 records when page exceeds available data', () => {
    // page=2, limit=25, total=5 — stale page after filter change
    render(<PagePagination {...baseProps} page={2} total={5} limit={25} />)
    expect(screen.getByText(/showing 0 of 5 records/i)).toBeInTheDocument()
  })

  it('calls onLimitChange when rows-per-page changes', () => {
    const onLimitChange = vi.fn()
    render(<PagePagination {...baseProps} onLimitChange={onLimitChange} />)
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '50' } })
    expect(onLimitChange).toHaveBeenCalledWith(50)
  })
})
