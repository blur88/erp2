import React from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import type { Supplier } from '@/types'
import { SupplierType } from '@/types'
import SupplierContextHeader from '../SupplierContextHeader'

const mockSupplier: Supplier = {
  id: 'sup-1',
  companyName: 'Acme Corp',
  type: SupplierType.LOCAL,
  isActive: true,
  contactPerson: 'Jane Doe',
  phone: '555-1234',
  streetAddress: '123 Main St',
  city: 'Springfield',
  state: 'IL',
  postalCode: '62701',
  country: 'USA',
  totalPurchases: 50000,
  totalOrders: 10,
  averageOrderValue: 5000,
  lastPurchaseDate: new Date('2026-01-15'),
  firstPurchaseDate: new Date('2025-01-01'),
  notes: undefined,
  createdAt: new Date(),
  updatedAt: new Date(),
}

describe('SupplierContextHeader', () => {
  it('shows empty state when no supplier selected', () => {
    render(<SupplierContextHeader selectedSupplier={null} onEdit={vi.fn()} onDelete={vi.fn()} />)
    expect(screen.getByText('Select a supplier to view details')).toBeInTheDocument()
  })

  it('renders supplier company name in header', () => {
    render(<SupplierContextHeader selectedSupplier={mockSupplier} onEdit={vi.fn()} onDelete={vi.fn()} />)
    expect(screen.getByText(/Supplier Details - Acme Corp/i)).toBeInTheDocument()
  })

  it('renders contact information', () => {
    render(<SupplierContextHeader selectedSupplier={mockSupplier} onEdit={vi.fn()} onDelete={vi.fn()} />)
    expect(screen.getByText('Jane Doe')).toBeInTheDocument()
    expect(screen.getByText('555-1234')).toBeInTheDocument()
  })

  it('calls onEdit when edit button clicked', async () => {
    const onEdit = vi.fn()
    render(<SupplierContextHeader selectedSupplier={mockSupplier} onEdit={onEdit} onDelete={vi.fn()} />)
    await userEvent.click(screen.getByTitle('Edit Supplier'))
    expect(onEdit).toHaveBeenCalledOnce()
  })

  it('calls onDelete when delete button clicked', async () => {
    const onDelete = vi.fn()
    render(<SupplierContextHeader selectedSupplier={mockSupplier} onEdit={vi.fn()} onDelete={onDelete} />)
    await userEvent.click(screen.getByTitle('Delete Supplier'))
    expect(onDelete).toHaveBeenCalledOnce()
  })
})
