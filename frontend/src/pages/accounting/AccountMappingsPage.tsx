import React, { useMemo } from 'react'
import { Alert } from '@mui/material'

import GenericListPage from '@/components/common/GenericListPage'
import { useFilterBar } from '@/hooks/useFilterBar'
import { useAppDispatch, useAppSelector } from '@/hooks/useRedux'
import { useGetAccountMappingsQuery, useGetPaymentMethodsQuery, useValidateAccountMappingsQuery } from '@/store/api/accountingApi'
import { selectSelectedAccountMapping } from '@/store/slices/accountingSlice'
import { MappingType, type AccountMapping } from '@/types/accountMapping'
import type { FilterBarConfig } from '@/types/filterBar.types'

import { AccountMappingContextHeader } from './components/AccountMappingContextHeader'
import { AccountMappingsDialogs } from './components/AccountMappingsDialogs'
import { AccountMappingsTable, type MappingRow } from './components/AccountMappingsTable'
import { AccountMappingWorkspaceCard } from './components/AccountMappingWorkspaceCard'
import { useAccountMappingsWorkspace } from './hooks/useAccountMappingsWorkspace'

const MAPPING_TYPE_LABELS: Record<MappingType, { label: string; category: string; description: string }> = {
  [MappingType.SALES_REVENUE]: { label: 'Sales Revenue', category: 'Sales', description: 'Revenue account credited when sales orders are fulfilled' },
  [MappingType.SALES_AR]: { label: 'Accounts Receivable (Sales)', category: 'Sales', description: 'Asset account debited when sales orders are fulfilled' },
  [MappingType.SALES_COGS]: { label: 'Cost of Goods Sold', category: 'Sales', description: 'Expense account debited for product costs on sales' },
  [MappingType.SALES_INVENTORY]: { label: 'Inventory (Sales)', category: 'Sales', description: 'Asset account credited when inventory is sold' },
  [MappingType.PURCHASE_INVENTORY]: { label: 'Inventory (Purchases)', category: 'Purchasing', description: 'Asset account debited when goods are received' },
  [MappingType.PURCHASE_AP]: { label: 'Accounts Payable (Purchases)', category: 'Purchasing', description: 'Liability account credited when goods are received' },
  [MappingType.PAYMENT_AR]: { label: 'Accounts Receivable (Payments)', category: 'Payments', description: 'Asset account credited when customer payments are received' },
  [MappingType.VENDOR_PAYMENT_AP]: { label: 'Accounts Payable (Vendor Payments)', category: 'Vendor Payments', description: 'Liability account debited when vendor payments are made' },
  [MappingType.EQUITY_OWNERS_EQUITY]: { label: "Owner's Equity", category: 'Equity', description: 'Equity account credited for owner capital contributions' },
  [MappingType.EQUITY_DRAWINGS]: { label: 'Owner Drawings', category: 'Equity', description: 'Equity contra account debited for owner withdrawals' },
  [MappingType.INVENTORY_ASSET]: { label: 'Inventory Asset', category: 'Inventory', description: 'Asset account for inventory adjustments' },
  [MappingType.INVENTORY_ADJUSTMENT_GAIN]: { label: 'Inventory Adjustment Gain', category: 'Inventory', description: 'Revenue account credited for positive inventory adjustments' },
  [MappingType.INVENTORY_ADJUSTMENT_LOSS]: { label: 'Inventory Adjustment Loss', category: 'Inventory', description: 'Expense account debited for negative inventory adjustments' },
  [MappingType.OPENING_BALANCE_EQUITY]: { label: 'Opening Balance Equity', category: 'Equity', description: 'Equity account offset when per-account opening balances are posted' },
}

const staticCategories = ['Sales', 'Purchasing', 'Equity', 'Inventory']
interface MappingFilters { search: string }
const filterConfig: FilterBarConfig<MappingFilters> = { search: { placeholder: 'Search account mappings...' }, fields: [], defaults: { search: '' } }

const AccountMappingsPage: React.FC = () => {
  const dispatch = useAppDispatch()
  const selected = useAppSelector(selectSelectedAccountMapping)

  const { appliedFilters, draftFilters, handlers, hasActiveFilters } = useFilterBar(filterConfig)
  const { data: mappings = [], isLoading, error, refetch: refetchMappings } = useGetAccountMappingsQuery()
  const { data: validationResult, refetch: refetchValidation } = useValidateAccountMappingsQuery()
  const { data: paymentMethodsResponse } = useGetPaymentMethodsQuery({ isActive: true })
  const paymentMethods = useMemo(() => ((paymentMethodsResponse?.data ?? []) as Array<{ code: string; name: string; requiresSettlement: boolean; useForPurchases: boolean }>), [paymentMethodsResponse])

  const tableRows = useMemo(() => {
    const accountMappings = mappings as AccountMapping[]
    const staticRows: MappingRow[] = staticCategories.flatMap((category) =>
      Object.values(MappingType)
        .filter((type) => MAPPING_TYPE_LABELS[type].category === category)
        .map((type) => ({
          id: type,
          mappingType: type,
          ...MAPPING_TYPE_LABELS[type],
          mapping: accountMappings.find((mapping) => mapping.mappingType === type),
        })),
    )

    const paymentRows: MappingRow[] = [{
      id: MappingType.PAYMENT_AR,
      mappingType: MappingType.PAYMENT_AR,
      label: 'Accounts Receivable (Payments)',
      category: 'Payments',
      description: 'Asset account credited when customer payments are received',
      mapping: accountMappings.find((mapping) => mapping.mappingType === MappingType.PAYMENT_AR),
    }]

    for (const paymentMethod of paymentMethods) {
      const code = paymentMethod.code.toLowerCase()
      paymentRows.push({
        id: `payment_${code}`,
        mappingType: `payment_${code}`,
        label: `${paymentMethod.name} Payment Account`,
        category: 'Payments',
        description: `Account debited when ${paymentMethod.name} payments are received`,
        mapping: accountMappings.find((mapping) => mapping.mappingType === `payment_${code}`),
      })
      if (paymentMethod.requiresSettlement) {
        paymentRows.push({
          id: `payment_${code}_settlement`,
          mappingType: `payment_${code}_settlement`,
          label: `${paymentMethod.name} Settlement Account`,
          category: 'Payments',
          description: `Bank account debited when ${paymentMethod.name} payments are settled`,
          mapping: accountMappings.find((mapping) => mapping.mappingType === `payment_${code}_settlement`),
        })
      }
    }

    const vendorPaymentRows: MappingRow[] = [{
      id: MappingType.VENDOR_PAYMENT_AP,
      mappingType: MappingType.VENDOR_PAYMENT_AP,
      label: 'Accounts Payable (Vendor Payments)',
      category: 'Vendor Payments',
      description: 'Liability account debited when vendor payments are made',
      mapping: accountMappings.find((mapping) => mapping.mappingType === MappingType.VENDOR_PAYMENT_AP),
    }]

    for (const paymentMethod of paymentMethods) {
      if (!paymentMethod.useForPurchases) continue
      const code = paymentMethod.code.toLowerCase()
      vendorPaymentRows.push({
        id: `vendor_payment_${code}`,
        mappingType: `vendor_payment_${code}`,
        label: `${paymentMethod.name} Vendor Payment Account`,
        category: 'Vendor Payments',
        description: `Account credited when ${paymentMethod.name} vendor payments are made`,
        mapping: accountMappings.find((mapping) => mapping.mappingType === `vendor_payment_${code}`),
      })
    }

    const allRows = [...staticRows, ...paymentRows, ...vendorPaymentRows]
    const term = appliedFilters.search.trim().toLowerCase()
    if (!term) return allRows
    return allRows.filter((row) =>
      [row.label, row.category, row.description, row.mapping?.account?.name, row.mapping?.account?.code]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(term),
    )
  }, [appliedFilters.search, mappings, paymentMethods])

  const workspace = useAccountMappingsWorkspace(refetchMappings, refetchValidation, tableRows, selected, dispatch)
  const focusedRow = workspace.focusedIndex >= 0 ? tableRows[workspace.focusedIndex] ?? null : null

  return (
    <>
      {!validationResult?.isValid && validationResult?.missingMappings?.length ? (
        <Alert severity="warning" sx={{ mb: 2 }}>Configuration Incomplete</Alert>
      ) : validationResult?.isValid ? (
        <Alert severity="success" sx={{ mb: 2 }}>All required account mappings are configured.</Alert>
      ) : null}
      <GenericListPage
        title="Account Mappings"
        subtitle="Configure default account assignments for transactions"
        secondaryAction={{ label: 'Refresh', onClick: () => { void refetchMappings(); void refetchValidation() } }}
        filterConfig={filterConfig}
        draftFilters={draftFilters}
        handlers={handlers}
        hasActiveFilters={hasActiveFilters}
        searchInputRef={workspace.searchInputRef}
        sort={{ field: 'mappingType', sortBy: 'mappingType', sortOrder: 'asc', onSort: () => {} }}
        error={(error as any)?.data ?? null}
        onErrorClose={() => {}}
        listSlot={(
          <AccountMappingsTable
            rows={tableRows}
            loading={isLoading}
            selectedId={selected?.mappingType ?? null}
            focusedIndex={workspace.focusedIndex}
            onSelect={workspace.handleSelect}
            listRef={workspace.listRef}
          />
        )}
        headerSlot={(
          <AccountMappingContextHeader
            row={focusedRow}
            onConfigure={() => {
              if (focusedRow) workspace.openDialogForRow(focusedRow)
            }}
            onClear={() => {
              if (focusedRow?.mapping) workspace.setMappingToClear(focusedRow.mapping)
            }}
          />
        )}
        workspaceSlot={<AccountMappingWorkspaceCard mapping={focusedRow?.mapping} />}
        dialogs={(
          <AccountMappingsDialogs
            dialogOpen={workspace.dialogOpen}
            selectedMapping={workspace.selectedMapping}
            selectedMappingType={workspace.selectedMappingType}
            onCloseDialog={() => { workspace.setDialogOpen(false); workspace.setSelectedMapping(null); workspace.setSelectedMappingType(null) }}
            onSaveSuccess={() => { workspace.setDialogOpen(false); workspace.setSelectedMapping(null); workspace.setSelectedMappingType(null); void refetchMappings(); void refetchValidation() }}
            mappingToClear={workspace.mappingToClear}
            clearing={workspace.clearing}
            onConfirmClear={() => void workspace.handleClear()}
            onCancelClear={() => !workspace.clearing && workspace.setMappingToClear(null)}
          />
        )}
      />
    </>
  )
}

export default AccountMappingsPage
