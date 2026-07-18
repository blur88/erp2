import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'

import SourceLink from '../SourceLink'

function renderLink(ui: React.ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>)
}

describe('SourceLink', () => {
  it('renders the reference number as link text for a SALES_ORDER (text variant)', () => {
    renderLink(
      <SourceLink sourceType="SALES_ORDER" sourceDocumentId="so-uuid" sourceRef="SO-26-008" />,
    )
    const link = screen.getByRole('link', { name: 'SO-26-008' })
    expect(link).toHaveAttribute('href', '/sales/orders/SO-26-008/view')
  })

  it('shows the source type in a tooltip and as the link accessible description', async () => {
    const user = userEvent.setup()
    renderLink(
      <SourceLink sourceType="SALES_ORDER" sourceDocumentId="so-uuid" sourceRef="SO-26-008" />,
    )
    const link = screen.getByRole('link', { name: 'SO-26-008' })
    // describeChild keeps the accessible NAME as the ref and adds the type as description.
    expect(link).toHaveAccessibleDescription('Sales Order')
    // Hovering surfaces the actual tooltip popup (verifies MUI Tooltip behaviour, not just aria).
    await user.hover(link)
    expect(await screen.findByRole('tooltip', { name: 'Sales Order' })).toBeInTheDocument()
  })

  it('renders as a button when variant="button"', () => {
    renderLink(
      <SourceLink
        variant="button"
        sourceType="PURCHASE_ORDER"
        sourceDocumentId="po-uuid"
        sourceRef="PO-26-015"
      />,
    )
    const btn = screen.getByRole('link', { name: 'PO-26-015' })
    expect(btn).toHaveAttribute('href', '/purchasing/orders/PO-26-015/view')
  })

  it('links a STOCK_ADJUSTMENT by document id but shows the ref as text', () => {
    renderLink(
      <SourceLink sourceType="STOCK_ADJUSTMENT" sourceDocumentId="adj-uuid" sourceRef="SA-000012" />,
    )
    const link = screen.getByRole('link', { name: 'SA-000012' })
    expect(link).toHaveAttribute('href', '/inventory/stock-adjustments/adj-uuid/view')
  })

  it('falls back to the type label with no tooltip and no tab stop when sourceRef is null', () => {
    renderLink(
      <SourceLink sourceType="OPENING_BALANCE" sourceDocumentId={null} sourceRef={null} />,
    )
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
    const span = screen.getByText('Opening Balance')
    expect(span).not.toHaveAttribute('tabindex')
    expect(span).not.toHaveAccessibleDescription()
  })

  it('renders ref as focusable plain text with a tooltip when ref present but no href', () => {
    // No buildSourceLink route for OPENING_BALANCE, but a non-null ref must still show + describe.
    renderLink(
      <SourceLink sourceType="OPENING_BALANCE" sourceDocumentId={null} sourceRef="OB-2026" />,
    )
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
    const span = screen.getByText('OB-2026')
    expect(span).toHaveAttribute('tabindex', '0')
    expect(span).toHaveAccessibleDescription('Opening Balance')
    // MUI Tooltip sets the native HTML title attribute as a fallback (visible in JSDOM).
    expect(span).toHaveAttribute('title', 'Opening Balance')
  })
})
