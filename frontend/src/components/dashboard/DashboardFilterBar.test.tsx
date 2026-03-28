// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi, describe, it, expect } from 'vitest'
import { LocalizationProvider } from '@mui/x-date-pickers'
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns'
import { DashboardFilterBar } from './DashboardFilterBar'

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

  it('does not render Payment Status select when paymentStatus prop is absent', () => {
    wrap(<DashboardFilterBar {...baseProps()} />)
    expect(screen.queryByLabelText('Payment Status')).toBeNull()
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
})
