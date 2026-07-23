import { LocalizationProvider } from '@mui/x-date-pickers'
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns'
import { configureStore } from '@reduxjs/toolkit'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Provider } from 'react-redux'
import { describe, expect, it, vi } from 'vitest'

import {
  FULFILLMENT_STATUS_OPTIONS,
  ORDER_STATUS_OPTIONS,
  PURCHASE_ORDER_STATUS_OPTIONS,
  STATUS_OPTIONS,
} from '@/constants/filterOptions'
import type { FilterBarConfig, FilterBarHandlers, PeriodValue } from '@/types/filterBar.types'
import { FilterBar } from '../FilterBar'

vi.mock('@/store/api/salesApi', () => ({
  useGetCustomersQuery: vi.fn(() => ({
    data: { data: [{ id: 'c1', name: 'Amuro Ray' }] },
  })),
}))

vi.mock('@/store/api/purchasingApi', () => ({
  useGetSuppliersQuery: vi.fn(() => ({
    data: { data: [{ id: 's1', companyName: 'Anaheim Electronics' }] },
  })),
}))

interface Filters {
  search: string
  status: string | null
}

const config: FilterBarConfig<Filters> = {
  search: { placeholder: 'Search...' },
  fields: [
    { field: 'status', label: 'Status', type: 'select', options: STATUS_OPTIONS },
  ],
  defaults: { search: '', status: null },
}

const handlers: FilterBarHandlers<Filters> = {
  onSearchChange: vi.fn(),
  onSearchCommit: vi.fn(),
  onQuickFilterChange: vi.fn(),
  onClearField: vi.fn(),
  onClearAll: vi.fn(),
}

const baseProps = {
  config,
  draftFilters: { search: '', status: null },
  handlers,
  hasActiveFilters: false,
}

describe('FilterBar', () => {
  it('renders search and quick filters', () => {
    render(<FilterBar {...baseProps} />)
    expect(screen.getByPlaceholderText('Search...')).toBeInTheDocument()
    expect(screen.getByLabelText(/status/i)).toBeInTheDocument()
  })

  it('renders the optional sort button and calls onSort', () => {
    const onSort = vi.fn()

    render(
      <FilterBar
        {...baseProps}
        sort={{
          field: 'orderNumber',
          sortBy: 'orderNumber',
          sortOrder: 'desc',
          onSort,
        }}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /sort/i }))
    expect(onSort).toHaveBeenCalledWith('orderNumber')
  })

  it('renders sort button in inactive state when sortBy differs from field', () => {
    render(
      <FilterBar
        {...baseProps}
        sort={{
          field: 'orderNumber',
          sortBy: 'orderDate',
          sortOrder: 'asc',
          onSort: vi.fn(),
        }}
      />,
    )

    const btn = screen.getByRole('button', { name: /sort/i })
    expect(btn).toBeInTheDocument()
    // inactive: MUI outlined variant has no contained class
    expect(btn.className).not.toMatch(/MuiButton-contained/)
  })

  it('shows reset only with active filters', () => {
    const { rerender } = render(<FilterBar {...baseProps} />)
    expect(screen.queryByRole('button', { name: /reset/i })).not.toBeInTheDocument()
    rerender(<FilterBar {...baseProps} hasActiveFilters={true} />)
    fireEvent.click(screen.getByRole('button', { name: /reset/i }))
    expect(handlers.onClearAll).toHaveBeenCalled()
  })
})

describe('FilterBar — period field', () => {
  it('renders FilterPeriod when type is period', () => {
    interface PeriodFilters {
      period: PeriodValue
    }

    const periodConfig: FilterBarConfig<PeriodFilters> = {
      fields: [{ field: 'period', label: 'Period', type: 'period' }],
    }

    const periodHandlers: FilterBarHandlers<PeriodFilters> = {
      onSearchChange: vi.fn(),
      onSearchCommit: vi.fn(),
      onQuickFilterChange: vi.fn(),
      onClearField: vi.fn(),
      onClearAll: vi.fn(),
    }

    render(
      <LocalizationProvider dateAdapter={AdapterDateFns}>
        <FilterBar
          config={periodConfig}
          draftFilters={{ period: { key: 'this_month', from: null, to: null } }}
          handlers={periodHandlers}
          hasActiveFilters={false}
        />
      </LocalizationProvider>,
    )

    expect(screen.getByRole('combobox')).toHaveTextContent('This Month')
  })
})

interface DashFilters {
  period: PeriodValue
  compareWith: 'previous_period' | 'last_month' | 'last_year' | null
}

const dashConfig: FilterBarConfig<DashFilters> = {
  fields: [
    { field: 'period', label: 'Period', type: 'period' },
    { field: 'compareWith', label: 'Compare', type: 'compare' },
  ],
  defaults: {
    period: { key: 'this_month', from: null, to: null },
    compareWith: null,
  },
}

const dashHandlers: FilterBarHandlers<DashFilters> = {
  onSearchChange: vi.fn(),
  onSearchCommit: vi.fn(),
  onQuickFilterChange: vi.fn(),
  onClearField: vi.fn(),
  onClearAll: vi.fn(),
}

function wrapWithProvider(ui: React.ReactElement) {
  return render(
    <LocalizationProvider dateAdapter={AdapterDateFns}>{ui}</LocalizationProvider>,
  )
}

describe('FilterBar — compare field', () => {
  it('renders the Compare select', () => {
    wrapWithProvider(
      <FilterBar
        config={dashConfig}
        draftFilters={{ period: { key: 'this_month', from: null, to: null }, compareWith: null }}
        handlers={dashHandlers}
        hasActiveFilters={false}
      />,
    )
    expect(screen.getByLabelText('Compare')).toBeInTheDocument()
  })

  it('compare select is enabled when period is this_month', () => {
    wrapWithProvider(
      <FilterBar
        config={dashConfig}
        draftFilters={{ period: { key: 'this_month', from: null, to: null }, compareWith: null }}
        handlers={dashHandlers}
        hasActiveFilters={false}
      />,
    )
    const select = screen.getByLabelText('Compare')
    expect(select).not.toHaveAttribute('aria-disabled', 'true')
  })

  it('compare select is disabled when period is today', () => {
    wrapWithProvider(
      <FilterBar
        config={dashConfig}
        draftFilters={{ period: { key: 'today', from: null, to: null }, compareWith: null }}
        handlers={dashHandlers}
        hasActiveFilters={false}
      />,
    )
    const select = screen.getByLabelText('Compare')
    expect(select).toHaveAttribute('aria-disabled', 'true')
  })

  it('calls onQuickFilterChange with previous_period when that option is selected', async () => {
    const onQuickFilterChange = vi.fn()
    wrapWithProvider(
      <FilterBar
        config={dashConfig}
        draftFilters={{ period: { key: 'this_month', from: null, to: null }, compareWith: null }}
        handlers={{ ...dashHandlers, onQuickFilterChange }}
        hasActiveFilters={false}
      />,
    )
    await userEvent.click(screen.getByLabelText('Compare'))
    await userEvent.click(screen.getByText('Previous Period'))
    expect(onQuickFilterChange).toHaveBeenCalledWith('compareWith', 'previous_period')
  })

  it('calls onQuickFilterChange with null when No Comparison is selected', async () => {
    const onQuickFilterChange = vi.fn()
    wrapWithProvider(
      <FilterBar
        config={dashConfig}
        draftFilters={{ period: { key: 'this_month', from: null, to: null }, compareWith: 'last_year' }}
        handlers={{ ...dashHandlers, onQuickFilterChange }}
        hasActiveFilters={false}
      />,
    )
    await userEvent.click(screen.getByLabelText('Compare'))
    await userEvent.click(screen.getByText('No Comparison'))
    expect(onQuickFilterChange).toHaveBeenCalledWith('compareWith', null)
  })
})

describe('FilterBar — custom filter field types', () => {
  it('renders FilterCustomer when type=customer', () => {
    interface CustomerFilters {
      customerId: string | null
    }

    const customerConfig: FilterBarConfig<CustomerFilters> = {
      fields: [{ field: 'customerId', label: 'Customer', type: 'customer' }],
    }

    render(
      <Provider store={configureStore({ reducer: {} })}>
        <FilterBar
          config={customerConfig}
          draftFilters={{ customerId: null }}
          handlers={{
            onSearchChange: vi.fn(),
            onSearchCommit: vi.fn(),
            onQuickFilterChange: vi.fn(),
            onClearField: vi.fn(),
            onClearAll: vi.fn(),
          }}
          hasActiveFilters={false}
        />
      </Provider>,
    )

    expect(screen.getByLabelText(/customer/i)).toBeInTheDocument()
  })

  it('renders a select field for fulfillment status', () => {
    interface StatusFilters {
      fulfillmentStatus: string | null
    }

    const statusConfig: FilterBarConfig<StatusFilters> = {
      fields: [{ field: 'fulfillmentStatus', label: 'Order Status', type: 'select', options: FULFILLMENT_STATUS_OPTIONS }],
    }

    render(
      <FilterBar
        config={statusConfig}
        draftFilters={{ fulfillmentStatus: null }}
        handlers={{
          onSearchChange: vi.fn(),
          onSearchCommit: vi.fn(),
          onQuickFilterChange: vi.fn(),
          onClearField: vi.fn(),
          onClearAll: vi.fn(),
        }}
        hasActiveFilters={false}
      />,
    )

    // Assert the OPTIONS, not just the label. Fulfillment and sales-order status
    // share the label "Order Status" but are different domains — a label-only
    // check passes even when the wrong option set is wired up.
    expect(screen.getByLabelText(/order status/i)).toBeInTheDocument()
    fireEvent.mouseDown(screen.getByRole('combobox', { name: /order status/i }))
    expect(screen.getByRole('option', { name: 'Unfulfilled' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Fulfilled' })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: 'Draft' })).not.toBeInTheDocument()
  })

  it('renders a select field for order status', () => {
    interface StatusFilters {
      status: string | null
    }

    const statusConfig: FilterBarConfig<StatusFilters> = {
      fields: [{ field: 'status', label: 'Order Status', type: 'select', options: ORDER_STATUS_OPTIONS }],
    }

    render(
      <FilterBar
        config={statusConfig}
        draftFilters={{ status: null }}
        handlers={{
          onSearchChange: vi.fn(),
          onSearchCommit: vi.fn(),
          onQuickFilterChange: vi.fn(),
          onClearField: vi.fn(),
          onClearAll: vi.fn(),
        }}
        hasActiveFilters={false}
      />,
    )

    expect(screen.getByLabelText(/order status/i)).toBeInTheDocument()
  })

  it('renders FilterPaymentStatus when type=payment-status', () => {
    interface PaymentFilters {
      paymentStatus: string | null
    }

    const paymentConfig: FilterBarConfig<PaymentFilters> = {
      fields: [{ field: 'paymentStatus', label: 'Payment', type: 'payment-status' }],
    }

    render(
      <FilterBar
        config={paymentConfig}
        draftFilters={{ paymentStatus: null }}
        handlers={{
          onSearchChange: vi.fn(),
          onSearchCommit: vi.fn(),
          onQuickFilterChange: vi.fn(),
          onClearField: vi.fn(),
          onClearAll: vi.fn(),
        }}
        hasActiveFilters={false}
      />,
    )

    expect(screen.getByLabelText(/payment/i)).toBeInTheDocument()
  })

  it('renders FilterSupplier when type=supplier', () => {
    interface SupplierFilters {
      supplierId: string | null
    }

    const supplierConfig: FilterBarConfig<SupplierFilters> = {
      fields: [{ field: 'supplierId', label: 'Supplier', type: 'supplier' }],
    }

    render(
      <Provider store={configureStore({ reducer: {} })}>
        <FilterBar
          config={supplierConfig}
          draftFilters={{ supplierId: null }}
          handlers={{
            onSearchChange: vi.fn(),
            onSearchCommit: vi.fn(),
            onQuickFilterChange: vi.fn(),
            onClearField: vi.fn(),
            onClearAll: vi.fn(),
          }}
          hasActiveFilters={false}
        />
      </Provider>,
    )

    expect(screen.getByLabelText(/supplier/i)).toBeInTheDocument()
  })

  it('renders a select field for purchasing status', () => {
    interface PurchasingStatusFilters {
      status: string | null
    }

    const purchasingStatusConfig: FilterBarConfig<PurchasingStatusFilters> = {
      fields: [{ field: 'status', label: 'Order Status', type: 'select', options: PURCHASE_ORDER_STATUS_OPTIONS }],
    }

    render(
      <FilterBar
        config={purchasingStatusConfig}
        draftFilters={{ status: null }}
        handlers={{
          onSearchChange: vi.fn(),
          onSearchCommit: vi.fn(),
          onQuickFilterChange: vi.fn(),
          onClearField: vi.fn(),
          onClearAll: vi.fn(),
        }}
        hasActiveFilters={false}
      />,
    )

    expect(screen.getByLabelText(/order status/i)).toBeInTheDocument()
  })
})

describe('FilterBar — isFetching', () => {
  it('renders CircularProgress when isFetching is true', () => {
    render(
      <FilterBar
        config={config}
        draftFilters={{ search: '', status: null }}
        handlers={handlers}
        hasActiveFilters={false}
        isFetching={true}
      />,
    )
    expect(document.querySelector('.MuiCircularProgress-root')).toBeInTheDocument()
  })

  it('does not render CircularProgress when isFetching is false', () => {
    render(
      <FilterBar
        config={config}
        draftFilters={{ search: '', status: null }}
        handlers={handlers}
        hasActiveFilters={false}
        isFetching={false}
      />,
    )
    expect(document.querySelector('.MuiCircularProgress-root')).not.toBeInTheDocument()
  })
})
