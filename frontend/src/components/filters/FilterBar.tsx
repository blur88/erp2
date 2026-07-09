import { CircularProgress, Stack } from '@mui/material'

import { FilterAccountType } from './FilterAccountType'
import { FilterBalancedStatus } from './FilterBalancedStatus'
import { FilterCategory } from './FilterCategory'
import { FilterExpenseStatus } from './FilterExpenseStatus'
import { FilterBankReconciliationStatus } from './FilterBankReconciliationStatus'
import { FilterCompare } from './FilterCompare'
import { FilterCustomer } from './FilterCustomer'
import { FilterCustomerType } from './FilterCustomerType'
import { FilterFiscalPeriodStatus } from './FilterFiscalPeriodStatus'
import { FilterFundTransferStatus } from './FilterFundTransferStatus'
import { FilterOrderStatus } from './FilterOrderStatus'
import { FilterOwnerEquityType } from './FilterOwnerEquityType'
import { FilterPaymentStatus } from './FilterPaymentStatus'
import { FilterPaymentMethod } from './FilterPaymentMethod'
import { FilterPeriod } from './FilterPeriod'
import { FilterPriceList } from './FilterPriceList'
import { FilterProductType } from './FilterProductType'
import { FilterPurchasingStatus } from './FilterPurchasingStatus'
import { FilterRole } from './FilterRole'
import { FilterSearch } from './FilterSearch'
import { FilterStatus } from './FilterStatus'
import { FilterStockAdjustmentStatus } from './FilterStockAdjustmentStatus'
import { FilterStockStatus } from './FilterStockStatus'
import { FilterSupplier } from './FilterSupplier'
import { FilterSupplierType } from './FilterSupplierType'
import { FilterTransactionStatus } from './FilterTransactionStatus'
import { FilterVendorPaymentStatus } from './FilterVendorPaymentStatus'
import { FilterUserStatus } from './FilterUserStatus'
import { AppButton } from '@/components/common/AppButton'
import type {
  FilterBarConfig,
  FilterBarHandlers,
  FilterBarSortConfig,
  PeriodValue,
} from '@/types/filterBar.types'

interface Props<TFilters extends object> {
  config: FilterBarConfig<TFilters>
  draftFilters: TFilters
  handlers: FilterBarHandlers<TFilters>
  hasActiveFilters: boolean
  searchInputRef?: React.RefObject<HTMLInputElement | null>
  sort?: FilterBarSortConfig
  isFetching?: boolean
  extra?: React.ReactNode
}

function renderQuickField<TFilters extends object>(
  field: FilterBarConfig<TFilters>['fields'][number],
  draftFilters: TFilters,
  handlers: FilterBarHandlers<TFilters>,
  config: FilterBarConfig<TFilters>,
) {
  const value = draftFilters[field.field]
  const onChange = (nextValue: unknown) => handlers.onQuickFilterChange(field.field, nextValue)
  const fieldKey = String(field.field)

  if (field.type === 'status') {
    return (
      <FilterStatus
        key={fieldKey}
        field={fieldKey}
        value={(value as string | null) ?? null}
        onChange={onChange}
      />
    )
  }

  if (field.type === 'customer-type') {
    return (
      <FilterCustomerType
        key={fieldKey}
        field={fieldKey}
        value={(value as string | null) ?? null}
        onChange={onChange}
      />
    )
  }

  if (field.type === 'supplier-type') {
    return (
      <FilterSupplierType
        key={fieldKey}
        field={fieldKey}
        value={(value as string | null) ?? null}
        onChange={onChange}
      />
    )
  }

  if (field.type === 'user-status') {
    return (
      <FilterUserStatus
        key={fieldKey}
        field={fieldKey}
        value={(value as string | null) ?? null}
        onChange={onChange}
      />
    )
  }

  if (field.type === 'role') {
    return (
      <FilterRole
        key={fieldKey}
        field={fieldKey}
        value={(value as string | null) ?? null}
        onChange={onChange}
      />
    )
  }

  if (field.type === 'stock-adjustment-status') {
    return (
      <FilterStockAdjustmentStatus
        key={fieldKey}
        field={fieldKey}
        value={(value as string | null) ?? null}
        onChange={onChange}
      />
    )
  }

  if (field.type === 'period') {
    const periodValue = value as PeriodValue
    return (
      <FilterPeriod
        key={fieldKey}
        value={periodValue.key}
        customFrom={periodValue.from}
        customTo={periodValue.to}
        onChange={(key, from, to) =>
          onChange({ key, from: from ?? null, to: to ?? null } as PeriodValue)
        }
      />
    )
  }

  if (field.type === 'compare') {
    const periodField = config.fields.find((configField) => configField.type === 'period')
    const periodValue = periodField ? (draftFilters[periodField.field] as PeriodValue) : null

    return (
      <FilterCompare
        key={fieldKey}
        value={(value as string | null) ?? null}
        onChange={onChange}
        periodValue={periodValue}
      />
    )
  }

  if (field.type === 'customer') {
    return (
      <FilterCustomer
        key={fieldKey}
        field={fieldKey}
        value={(value as string | null) ?? null}
        onChange={onChange}
      />
    )
  }

  if (field.type === 'order-status') {
    return (
      <FilterOrderStatus
        key={fieldKey}
        field={fieldKey}
        value={(value as string | null) ?? null}
        onChange={onChange}
      />
    )
  }

  if (field.type === 'payment-status') {
    return (
      <FilterPaymentStatus
        key={fieldKey}
        field={fieldKey}
        value={(value as string | null) ?? null}
        onChange={onChange}
        includeOverpaid={field.includeOverpaid}
        valueCase={field.valueCase}
      />
    )
  }

  if (field.type === 'supplier') {
    return (
      <FilterSupplier
        key={fieldKey}
        field={fieldKey}
        value={(value as string | null) ?? null}
        onChange={onChange}
      />
    )
  }

  if (field.type === 'price-list') {
    return (
      <FilterPriceList
        key={fieldKey}
        field={fieldKey}
        value={(value as string | null) ?? null}
        onChange={onChange as (value: string | null) => void}
      />
    )
  }

  if (field.type === 'purchasing-status') {
    return (
      <FilterPurchasingStatus
        key={fieldKey}
        field={fieldKey}
        value={(value as string | null) ?? null}
        onChange={onChange}
      />
    )
  }

  if (field.type === 'vendor-payment-status') {
    return (
      <FilterVendorPaymentStatus
        key={fieldKey}
        field={fieldKey}
        value={(value as string | null) ?? null}
        onChange={onChange}
      />
    )
  }

  if (field.type === 'category') {
    return (
      <FilterCategory
        key={fieldKey}
        field={fieldKey}
        value={(value as string | null) ?? null}
        onChange={onChange}
      />
    )
  }

  if (field.type === 'product-type') {
    return (
      <FilterProductType
        key={fieldKey}
        field={fieldKey}
        value={(value as string | null) ?? null}
        onChange={onChange}
      />
    )
  }

  if (field.type === 'stock-status') {
    return (
      <FilterStockStatus
        key={fieldKey}
        field={fieldKey}
        value={(value as string | null) ?? null}
        onChange={onChange}
      />
    )
  }

  if (field.type === 'transaction-status') {
    return (
      <FilterTransactionStatus
        key={fieldKey}
        field={fieldKey}
        value={(value as string | null) ?? null}
        onChange={onChange as (value: string | null) => void}
      />
    )
  }

  if (field.type === 'expense-status') {
    return (
      <FilterExpenseStatus
        key={fieldKey}
        field={fieldKey}
        value={(value as string | null) ?? null}
        onChange={onChange}
      />
    )
  }

  if (field.type === 'payment-method') {
    return (
      <FilterPaymentMethod
        key={fieldKey}
        field={fieldKey}
        value={(value as string | null) ?? null}
        onChange={onChange}
      />
    )
  }

  if (field.type === 'owner-equity-type') {
    return (
      <FilterOwnerEquityType
        key={fieldKey}
        field={fieldKey}
        value={(value as string | null) ?? null}
        onChange={onChange}
      />
    )
  }

  if (field.type === 'fiscal-period-status') {
    return (
      <FilterFiscalPeriodStatus
        key={fieldKey}
        field={fieldKey}
        value={(value as string | null) ?? null}
        onChange={onChange}
      />
    )
  }

  if (field.type === 'bank-reconciliation-status') {
    return (
      <FilterBankReconciliationStatus
        key={fieldKey}
        field={fieldKey}
        value={(value as string | null) ?? null}
        onChange={onChange}
      />
    )
  }

  if (field.type === 'fund-transfer-status') {
    return (
      <FilterFundTransferStatus
        key={fieldKey}
        field={fieldKey}
        value={(value as string | null) ?? null}
        onChange={onChange}
      />
    )
  }

  if (field.type === 'account-type') {
    return (
      <FilterAccountType
        key={fieldKey}
        field={fieldKey}
        value={(value as string | null) ?? null}
        onChange={onChange}
      />
    )
  }

  if (field.type === 'bank-reconciliation-balanced') {
    return (
      <FilterBalancedStatus
        key={fieldKey}
        field={fieldKey}
        value={(value as string | null) ?? null}
        onChange={onChange}
      />
    )
  }

  return null
}

export function FilterBar<TFilters extends object>({
  config,
  draftFilters,
  handlers,
  hasActiveFilters,
  searchInputRef,
  sort,
  isFetching,
  extra,
}: Props<TFilters>) {
  return (
    <Stack
      direction="row"
      spacing={1}
      useFlexGap
      sx={{
        alignItems: "center",
        flexWrap: "wrap"
      }}>
      {config.search ? (
        <FilterSearch
          value={((draftFilters as Record<string, unknown>).search as string | undefined) ?? ''}
          placeholder={config.search.placeholder}
          onChange={handlers.onSearchChange}
          onCommit={handlers.onSearchCommit}
          inputRef={searchInputRef}
        />
      ) : null}
      {config.fields.map((field) => renderQuickField(field, draftFilters, handlers, config))}
      {extra ?? null}
      {sort ? (
        <AppButton
          size="filter"
          sortConfig={{ field: sort.field, sortBy: sort.sortBy, sortOrder: sort.sortOrder }}
          onClick={() => sort.onSort(sort.field)}
        >
          Sort
        </AppButton>
      ) : null}
      {hasActiveFilters ? (
        <AppButton size="filter" variant="outlined" onClick={handlers.onClearAll}>
          Reset
        </AppButton>
      ) : null}
      {isFetching ? <CircularProgress size={16} /> : null}
    </Stack>
  );
}
