// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi, describe, it, expect } from 'vitest'
import { LocalizationProvider } from '@mui/x-date-pickers'
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns'
import { DashboardFilterBar } from '../DashboardFilterBar'

function baseProps() {
  return {
    period: 'this_month' as const,
    compareWith: null,
    customFrom: null,
    customTo: null,
    isFetching: false,
    isDefault: true,
    onPeriodChange: vi.fn(),
    onCompareChange: vi.fn(),
    onCustomRangeChange: vi.fn(),
    onCustomFromChange: vi.fn(),
    onCustomToChange: vi.fn(),
    onReset: vi.fn(),
  }
}

function wrap(ui: React.ReactElement) {
  return render(
    <LocalizationProvider dateAdapter={AdapterDateFns}>{ui}</LocalizationProvider>,
  )
}

describe('DashboardFilterBar', () => {
  it('does not render Customer select when customers prop is absent', () => {
    wrap(<DashboardFilterBar {...baseProps()} />)
    expect(screen.queryByLabelText('Customer')).toBeNull()
  })

  it('does not render Order Status select when isFulfilled prop is absent', () => {
    wrap(<DashboardFilterBar {...baseProps()} />)
    expect(screen.queryByLabelText('Order Status')).toBeNull()
  })

  it('does not render Supplier select when suppliers prop is absent', () => {
    wrap(<DashboardFilterBar {...baseProps()} />)
    expect(screen.queryByLabelText('Supplier')).toBeNull()
  })

  it('does not render Payment Status select when paymentStatus prop is absent', () => {
    wrap(<DashboardFilterBar {...baseProps()} />)
    expect(screen.queryByLabelText('Payment Status')).toBeNull()
  })

  it('does not render Category select when categories prop is absent', () => {
    wrap(<DashboardFilterBar {...baseProps()} />)
    expect(screen.queryByLabelText('Category')).toBeNull()
  })

  it('does not render Stock Status select when stockStatus prop is absent', () => {
    wrap(<DashboardFilterBar {...baseProps()} />)
    expect(screen.queryByLabelText('Stock Status')).toBeNull()
  })

  it('renders Customer select when customers prop is provided', () => {
    wrap(
      <DashboardFilterBar
        {...baseProps()}
        customers={[{ id: 'c1', name: 'Acme Corp' }]}
        customerId={null}
        onCustomerChange={vi.fn()}
      />,
    )
    expect(screen.getByLabelText('Customer')).toBeTruthy()
  })

  it('renders Order Status select when isFulfilled prop is provided', () => {
    wrap(
      <DashboardFilterBar
        {...baseProps()}
        isFulfilled={null}
        onFulfilledChange={vi.fn()}
      />,
    )
    expect(screen.getByLabelText('Order Status')).toBeTruthy()
  })

  it('renders Supplier select when suppliers prop is provided', () => {
    wrap(
      <DashboardFilterBar
        {...baseProps()}
        suppliers={[{ id: 's1', name: 'Acme Supplies' }]}
        supplierId={null}
        onSupplierChange={vi.fn()}
      />,
    )
    expect(screen.getByLabelText('Supplier')).toBeTruthy()
  })

  it('renders Order Status select when status prop is provided', () => {
    wrap(
      <DashboardFilterBar
        {...baseProps()}
        status={null}
        onStatusChange={vi.fn()}
      />,
    )
    expect(screen.getByLabelText('Order Status')).toBeTruthy()
  })

  it('renders Payment Status select when paymentStatus prop is provided', () => {
    wrap(
      <DashboardFilterBar
        {...baseProps()}
        paymentStatus={null}
        onPaymentStatusChange={vi.fn()}
      />,
    )
    expect(screen.getByLabelText('Payment Status')).toBeTruthy()
  })

  it('renders Category select when categories prop is provided', () => {
    wrap(
      <DashboardFilterBar
        {...baseProps()}
        categories={[{ id: 'cat1', name: 'Electronics' }]}
        categoryId={null}
        onCategoryChange={vi.fn()}
      />,
    )
    expect(screen.getByLabelText('Category')).toBeTruthy()
  })

  it('renders Stock Status select when stockStatus prop is provided', () => {
    wrap(
      <DashboardFilterBar
        {...baseProps()}
        stockStatus={null}
        onStockStatusChange={vi.fn()}
      />,
    )
    expect(screen.getByLabelText('Stock Status')).toBeTruthy()
  })

  it('renders custom payment status labels when paymentStatusOptions are provided', () => {
    wrap(
      <DashboardFilterBar
        {...baseProps()}
        paymentStatus={null}
        onPaymentStatusChange={vi.fn()}
        paymentStatusOptions={[
          { value: 'paid', label: 'Paid' },
          { value: 'partial', label: 'Partially Paid' },
          { value: 'unpaid', label: 'Unpaid' },
        ]}
      />,
    )
    expect(screen.getByLabelText('Payment Status')).toBeTruthy()
  })

  it('calls onCustomerChange with null when All Customers is selected', async () => {
    const onCustomerChange = vi.fn()
    wrap(
      <DashboardFilterBar
        {...baseProps()}
        customers={[{ id: 'c1', name: 'Acme Corp' }]}
        customerId="c1"
        onCustomerChange={onCustomerChange}
      />,
    )
    await userEvent.click(screen.getByLabelText('Customer'))
    await userEvent.click(screen.getByText('All Customers'))
    expect(onCustomerChange).toHaveBeenCalledWith(null)
  })

  it('calls onFulfilledChange with true when Fulfilled is selected', async () => {
    const onFulfilledChange = vi.fn()
    wrap(
      <DashboardFilterBar
        {...baseProps()}
        isFulfilled={null}
        onFulfilledChange={onFulfilledChange}
      />,
    )
    await userEvent.click(screen.getByLabelText('Order Status'))
    await userEvent.click(screen.getByText('Fulfilled'))
    expect(onFulfilledChange).toHaveBeenCalledWith(true)
  })

  it('calls onSupplierChange with null when All Suppliers is selected', async () => {
    const onSupplierChange = vi.fn()
    wrap(
      <DashboardFilterBar
        {...baseProps()}
        suppliers={[{ id: 's1', name: 'Acme Supplies' }]}
        supplierId="s1"
        onSupplierChange={onSupplierChange}
      />,
    )
    await userEvent.click(screen.getByLabelText('Supplier'))
    await userEvent.click(screen.getByText('All Suppliers'))
    expect(onSupplierChange).toHaveBeenCalledWith(null)
  })

  it('calls onCategoryChange with null when All Categories is selected', async () => {
    const onCategoryChange = vi.fn()
    wrap(
      <DashboardFilterBar
        {...baseProps()}
        categories={[{ id: 'cat1', name: 'Electronics' }]}
        categoryId="cat1"
        onCategoryChange={onCategoryChange}
      />,
    )
    await userEvent.click(screen.getByLabelText('Category'))
    await userEvent.click(screen.getByText('All Categories'))
    expect(onCategoryChange).toHaveBeenCalledWith(null)
  })

  it('calls onStockStatusChange with low_stock when Low Stock is selected', async () => {
    const onStockStatusChange = vi.fn()
    wrap(
      <DashboardFilterBar
        {...baseProps()}
        stockStatus={null}
        onStockStatusChange={onStockStatusChange}
      />,
    )
    await userEvent.click(screen.getByLabelText('Stock Status'))
    await userEvent.click(screen.getByText('Low Stock'))
    expect(onStockStatusChange).toHaveBeenCalledWith('low_stock')
  })

  it('calls onStatusChange with pending when Pending is selected', async () => {
    const onStatusChange = vi.fn()
    wrap(
      <DashboardFilterBar
        {...baseProps()}
        status={null}
        onStatusChange={onStatusChange}
      />,
    )
    await userEvent.click(screen.getByLabelText('Order Status'))
    await userEvent.click(screen.getByText('Pending'))
    expect(onStatusChange).toHaveBeenCalledWith('pending')
  })

  it('calls onPaymentStatusChange with paid when Paid is selected', async () => {
    const onPaymentStatusChange = vi.fn()
    wrap(
      <DashboardFilterBar
        {...baseProps()}
        paymentStatus={null}
        onPaymentStatusChange={onPaymentStatusChange}
      />,
    )
    await userEvent.click(screen.getByLabelText('Payment Status'))
    await userEvent.click(screen.getByText('Paid'))
    expect(onPaymentStatusChange).toHaveBeenCalledWith('paid')
  })

  it('calls onPaymentStatusChange with unpaid when custom options are selected', async () => {
    const onPaymentStatusChange = vi.fn()
    wrap(
      <DashboardFilterBar
        {...baseProps()}
        paymentStatus={null}
        onPaymentStatusChange={onPaymentStatusChange}
        paymentStatusOptions={[
          { value: 'paid', label: 'Paid' },
          { value: 'partial', label: 'Partially Paid' },
          { value: 'unpaid', label: 'Unpaid' },
        ]}
      />,
    )
    await userEvent.click(screen.getByLabelText('Payment Status'))
    await userEvent.click(screen.getByText('Unpaid'))
    expect(onPaymentStatusChange).toHaveBeenCalledWith('unpaid')
  })

  it('renders Reset as an outlined button with left margin when filters are not default', () => {
    wrap(<DashboardFilterBar {...baseProps()} isDefault={false} />)

    const resetButton = screen.getByRole('button', { name: 'Reset' })

    expect(resetButton).toHaveClass('MuiButton-outlined')
    expect(resetButton).toHaveStyle({ height: '40px' })
  })
})
