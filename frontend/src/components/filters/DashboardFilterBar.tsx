import { Box, Button, CircularProgress, FormControl, InputLabel, MenuItem, Select, Tooltip } from '@mui/material'

import type { DashboardCompare, DashboardPeriod } from '@/hooks/useDashboardFilters'

import { FilterPeriod } from './FilterPeriod'
import { FilterSelect } from './FilterSelect'

interface DashboardFilterBarProps {
  period: DashboardPeriod
  compareWith: DashboardCompare
  customFrom: string | null
  customTo: string | null
  isFetching: boolean
  isDefault: boolean
  onPeriodChange: (period: DashboardPeriod) => void
  onCompareChange: (compare: DashboardCompare) => void
  onCustomRangeChange: (from: string, to: string) => void
  onReset: () => void
  customers?: { id: string; name: string }[]
  customerId?: string | null
  onCustomerChange?: (id: string | null) => void
  suppliers?: { id: string; name: string }[]
  supplierId?: string | null
  onSupplierChange?: (id: string | null) => void
  isFulfilled?: boolean | null
  onFulfilledChange?: (value: boolean | null) => void
  status?: string | null
  onStatusChange?: (value: string | null) => void
  paymentStatus?: string | null
  onPaymentStatusChange?: (value: string | null) => void
  paymentStatusOptions?: { value: string; label: string }[]
  categories?: { id: string; name: string }[]
  categoryId?: string | null
  onCategoryChange?: (id: string | null) => void
  stockStatus?: string | null
  onStockStatusChange?: (value: string | null) => void
}

export function DashboardFilterBar({
  period,
  compareWith,
  customFrom,
  customTo,
  isFetching,
  isDefault,
  onPeriodChange,
  onCompareChange,
  onCustomRangeChange,
  onReset,
  customers,
  customerId,
  onCustomerChange,
  suppliers,
  supplierId,
  onSupplierChange,
  isFulfilled,
  onFulfilledChange,
  status,
  onStatusChange,
  paymentStatus,
  onPaymentStatusChange,
  paymentStatusOptions,
  categories,
  categoryId,
  onCategoryChange,
  stockStatus,
  onStockStatusChange,
}: DashboardFilterBarProps) {
  const compareDisabled = period === 'today'
  const resolvedPaymentStatusOptions = paymentStatusOptions ?? [
    { value: 'paid', label: 'Paid' },
    { value: 'partial_paid', label: 'Partially Paid' },
    { value: 'draft', label: 'Draft' },
  ]

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap', mb: 3 }}>
      <FilterPeriod
        value={period}
        customFrom={customFrom}
        customTo={customTo}
        onChange={(key, from, to) => {
          if (key === 'custom' && from && to) {
            onCustomRangeChange(from, to)
          } else {
            onPeriodChange(key)
          }
        }}
      />

      <Tooltip title={compareDisabled ? 'Comparison is not available for Today' : ''} placement="top">
        <span>
          <FormControl size="small" sx={{ minWidth: 210 }} disabled={compareDisabled}>
            <InputLabel>Compare</InputLabel>
            <Select
              value={compareWith ?? ''}
              label="Compare"
              onChange={(event) => onCompareChange((event.target.value || null) as DashboardCompare)}
            >
              <MenuItem value="">No Comparison</MenuItem>
              <MenuItem value="previous_period">Previous Period</MenuItem>
              <MenuItem value="last_month">Same Period Last Month</MenuItem>
              <MenuItem value="last_year">Same Period Last Year</MenuItem>
            </Select>
          </FormControl>
        </span>
      </Tooltip>

      {customers !== undefined && onCustomerChange && (
        <FilterSelect
          field="customer"
          label="Customer"
          type="select"
          value={customerId ?? null}
          options={customers.map((c) => ({ value: c.id, label: c.name }))}
          onChange={(v) => onCustomerChange(v as string | null)}
          emptyLabel="All Customers"
          minWidth={170}
        />
      )}

      {suppliers !== undefined && onSupplierChange && (
        <FilterSelect
          field="supplier"
          label="Supplier"
          type="select"
          value={supplierId ?? null}
          options={suppliers.map((s) => ({ value: s.id, label: s.name }))}
          onChange={(v) => onSupplierChange(v as string | null)}
          emptyLabel="All Suppliers"
          minWidth={170}
        />
      )}

      {categories !== undefined && onCategoryChange && (
        <FilterSelect
          field="category"
          label="Category"
          type="select"
          value={categoryId ?? null}
          options={categories.map((c) => ({ value: c.id, label: c.name }))}
          onChange={(v) => onCategoryChange(v as string | null)}
          emptyLabel="All Categories"
          minWidth={170}
        />
      )}

      {stockStatus !== undefined && onStockStatusChange && (
        <FormControl size="small" sx={{ minWidth: 150 }}>
          <InputLabel id="dashboard-stock-status-label">Stock Status</InputLabel>
          <Select
            labelId="dashboard-stock-status-label"
            id="dashboard-stock-status"
            value={stockStatus ?? ''}
            label="Stock Status"
            onChange={(e) => onStockStatusChange(e.target.value || null)}
          >
            <MenuItem value="">All</MenuItem>
            <MenuItem value="in_stock">In Stock</MenuItem>
            <MenuItem value="low_stock">Low Stock</MenuItem>
            <MenuItem value="out_of_stock">Out of Stock</MenuItem>
          </Select>
        </FormControl>
      )}

      {isFulfilled !== undefined && onFulfilledChange && (
        <FormControl size="small" sx={{ minWidth: 150 }}>
          <InputLabel id="dashboard-order-status-label">Order Status</InputLabel>
          <Select
            labelId="dashboard-order-status-label"
            id="dashboard-order-status"
            value={isFulfilled === null ? '' : String(isFulfilled)}
            label="Order Status"
            onChange={(e) => {
              const value = e.target.value
              onFulfilledChange(value === '' ? null : value === 'true')
            }}
          >
            <MenuItem value="">All</MenuItem>
            <MenuItem value="true">Fulfilled</MenuItem>
            <MenuItem value="false">Pending</MenuItem>
          </Select>
        </FormControl>
      )}

      {status !== undefined && onStatusChange && (
        <FormControl size="small" sx={{ minWidth: 150 }}>
          <InputLabel id="dashboard-purchasing-order-status-label">Order Status</InputLabel>
          <Select
            labelId="dashboard-purchasing-order-status-label"
            id="dashboard-order-status-purchasing"
            value={status ?? ''}
            label="Order Status"
            onChange={(e) => onStatusChange(e.target.value || null)}
          >
            <MenuItem value="">All</MenuItem>
            <MenuItem value="received">Received</MenuItem>
            <MenuItem value="pending">Pending</MenuItem>
          </Select>
        </FormControl>
      )}

      {paymentStatus !== undefined && onPaymentStatusChange && (
        <FormControl size="small" sx={{ minWidth: 170 }}>
          <InputLabel id="dashboard-payment-status-label">Payment Status</InputLabel>
          <Select
            labelId="dashboard-payment-status-label"
            id="dashboard-payment-status"
            value={paymentStatus ?? ''}
            label="Payment Status"
            onChange={(e) => onPaymentStatusChange(e.target.value || null)}
          >
            <MenuItem value="">All</MenuItem>
            {resolvedPaymentStatusOptions.map((option) => (
              <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>
            ))}
          </Select>
        </FormControl>
      )}

      {!isDefault && (
        <Button variant="outlined" size="small" onClick={onReset} sx={{ height: 40 }}>
          Reset
        </Button>
      )}

      {isFetching && <CircularProgress size={16} />}
    </Box>
  )
}
