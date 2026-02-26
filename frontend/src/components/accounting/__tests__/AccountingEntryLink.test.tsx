import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
import AccountingEntryLink from '../AccountingEntryLink'

const mockNavigate = vi.fn()
const routerFutureFlags = {
  v7_startTransition: true,
  v7_relativeSplatPath: true,
}

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')

  const BrowserRouter = ({ future, children, ...props }: any) => (
    <actual.BrowserRouter {...props} future={future ?? routerFutureFlags}>
      {children}
    </actual.BrowserRouter>
  )

  return {
    ...actual,
    useNavigate: () => mockNavigate,
    BrowserRouter,
  }
})

describe('AccountingEntryLink', () => {
  beforeEach(() => {
    mockNavigate.mockClear()
  })

  it('renders button variant by default', () => {
    render(
      <BrowserRouter>
        <AccountingEntryLink sourceType="sales_order" sourceId="123" />
      </BrowserRouter>
    )

    expect(screen.getByRole('button', { name: /view journal entry/i })).toBeInTheDocument()
  })

  it('navigates to journal entries page with correct query params when clicked', () => {
    render(
      <BrowserRouter>
        <AccountingEntryLink sourceType="payment" sourceId="456" />
      </BrowserRouter>
    )

    const button = screen.getByRole('button', { name: /view journal entry/i })
    fireEvent.click(button)

    expect(mockNavigate).toHaveBeenCalledWith(
      '/accounting/journal-entries?sourceType=payment&sourceId=456'
    )
  })

  it('renders alert variant when specified', () => {
    render(
      <BrowserRouter>
        <AccountingEntryLink
          sourceType="goods_received_note"
          sourceId="789"
          variant="alert"
          label="View Entry"
        />
      </BrowserRouter>
    )

    expect(screen.getByText('Accounting Information')).toBeInTheDocument()
    expect(screen.getByText(/this transaction has been posted/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /view entry/i })).toBeInTheDocument()
  })

  it('renders inline variant when specified', () => {
    render(
      <BrowserRouter>
        <AccountingEntryLink
          sourceType="vendor_payment"
          sourceId="abc"
          variant="inline"
        />
      </BrowserRouter>
    )

    const link = screen.getByText(/view journal entry/i)
    expect(link).toBeInTheDocument()

    fireEvent.click(link)
    expect(mockNavigate).toHaveBeenCalledWith(
      '/accounting/journal-entries?sourceType=vendor_payment&sourceId=abc'
    )
  })

  it('renders table-row variant when specified', () => {
    render(
      <BrowserRouter>
        <AccountingEntryLink
          sourceType="stock_adjustment"
          sourceId="xyz"
          variant="table-row"
        />
      </BrowserRouter>
    )

    expect(screen.getByText('Accounting Entry')).toBeInTheDocument()

    const link = screen.getByText(/view journal entry/i)
    fireEvent.click(link)

    expect(mockNavigate).toHaveBeenCalledWith(
      '/accounting/journal-entries?sourceType=stock_adjustment&sourceId=xyz'
    )
  })

  it('uses custom label when provided', () => {
    render(
      <BrowserRouter>
        <AccountingEntryLink
          sourceType="payment"
          sourceId="123"
          label="Custom Label"
        />
      </BrowserRouter>
    )

    expect(screen.getByRole('button', { name: 'Custom Label' })).toBeInTheDocument()
  })

  it('uses custom message in alert variant', () => {
    render(
      <BrowserRouter>
        <AccountingEntryLink
          sourceType="payment"
          sourceId="123"
          variant="alert"
          message="Custom message here"
        />
      </BrowserRouter>
    )

    expect(screen.getByText('Custom message here')).toBeInTheDocument()
  })
})
