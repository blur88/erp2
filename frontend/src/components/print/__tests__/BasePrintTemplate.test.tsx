import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import BasePrintTemplate from '../BasePrintTemplate'

const baseProps = {
  settings: { companyName: 'Acme' },
  documentTitle: 'Invoice',
  documentNumber: 'INV-1',
  documentDate: '2026-09-17',
  recipient: { name: 'Customer' },
  currency: 'RM',
} as const

describe('BasePrintTemplate money formatting (#1241)', () => {
  it('renders exactly two decimals, including a rounded line value', () => {
    render(
      <BasePrintTemplate
        {...baseProps}
        items={
          [{ description: 'Widget', quantity: 1, unitPrice: '0.335', amount: '0.335' }] as any
        }
        totals={{ subtotal: '100', shipping: 0, total: '100' } as any}
      />
    )

    expect(screen.getAllByText('RM 0.34').length).toBeGreaterThan(0)
    expect(screen.getByText('RM 0.00')).toBeInTheDocument()
  })

  it('never renders negative zero', () => {
    render(
      <BasePrintTemplate
        {...baseProps}
        items={
          [{ description: 'Widget', quantity: 1, unitPrice: 0, amount: '-0.0032' }] as any
        }
        totals={{ subtotal: '-0.0032', shipping: 0, total: '-0.0032' } as any}
      />
    )

    expect(screen.queryByText(/-0\.00/)).toBeNull()
  })
})
