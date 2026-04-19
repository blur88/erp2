import React, { useMemo } from 'react'
import { Alert, Button } from '@mui/material'

import GenericListPage from '@/components/common/GenericListPage'
import { useFilterBar } from '@/hooks/useFilterBar'
import { useGetAccountMappingsQuery, useGetPaymentMethodsQuery, useValidateAccountMappingsQuery } from '@/store/api/accountingApi'
import type { FilterBarConfig } from '@/types/filterBar.types'
import { MappingType, type AccountMapping } from '@/types/accountMapping'

import { AccountMappingContextHeader } from './components/AccountMappingContextHeader'
import { AccountMappingsDialogs } from './components/AccountMappingsDialogs'
import { AccountMappingsTable } from './components/AccountMappingsTable'
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
  [MappingType.EQUITY_OWNERS_EQUITY]: { label: "Owner's Equity", category: 'Equity', description: "Equity account credited for owner capital contributions" },
  [MappingType.EQUITY_DRAWINGS]: { label: 'Owner Drawings', category: 'Equity', description: 'Equity contra account debited for owner withdrawals' },
  [MappingType.INVENTORY_ASSET]: { label: 'Inventory Asset', category: 'Inventory', description: 'Asset account for inventory adjustments' },
  [MappingType.INVENTORY_ADJUSTMENT_GAIN]: { label: 'Inventory Adjustment Gain', category: 'Inventory', description: 'Revenue account credited for positive inventory adjustments' },
  [MappingType.INVENTORY_ADJUSTMENT_LOSS]: { label: 'Inventory Adjustment Loss', category: 'Inventory', description: 'Expense account debited for negative inventory adjustments' },
}

const staticCategories = ['Sales', 'Purchasing', 'Equity', 'Inventory']
interface MappingFilters { search: string }
const filterConfig: FilterBarConfig<MappingFilters> = { search: { placeholder: 'Search account mappings...' }, fields: [], defaults: { search: '' } }
type MappingOption = { type: string; label: string; category: string; description: string }

const AccountMappingsPage: React.FC = () => {
  const { appliedFilters, draftFilters, handlers, hasActiveFilters } = useFilterBar(filterConfig)
  const { data: mappings = [], isLoading, error, refetch: refetchMappings } = useGetAccountMappingsQuery()
  const { data: validationResult, refetch: refetchValidation } = useValidateAccountMappingsQuery()
  const { data: paymentMethodsResponse } = useGetPaymentMethodsQuery({ page: 1, isActive: true })
  const paymentMethods = useMemo(() => ((paymentMethodsResponse?.data ?? []) as Array<{ code: string; name: string; requiresSettlement: boolean; useForPurchases: boolean }>), [paymentMethodsResponse])
  const workspace = useAccountMappingsWorkspace(refetchMappings, refetchValidation)

  const getAllMappingTypes = (): MappingOption[] => Object.values(MappingType).map((type) => ({ type, ...MAPPING_TYPE_LABELS[type] }))
  const getPaymentMappingTypes = (): MappingOption[] => {
    const items: MappingOption[] = [{ type: MappingType.PAYMENT_AR, label: 'Accounts Receivable (Payments)', category: 'Payments', description: 'Asset account credited when customer payments are received' }]
    for (const paymentMethod of paymentMethods) {
      const code = paymentMethod.code.toLowerCase()
      items.push({ type: `payment_${code}`, label: `${paymentMethod.name} Payment Account`, category: 'Payments', description: `Account debited when ${paymentMethod.name} payments are received` })
      if (paymentMethod.requiresSettlement) items.push({ type: `payment_${code}_settlement`, label: `${paymentMethod.name} Settlement Account`, category: 'Payments', description: `Bank account debited when ${paymentMethod.name} payments are settled` })
    }
    return items
  }
  const getVendorPaymentMappingTypes = (): MappingOption[] => {
    const items: MappingOption[] = [{ type: MappingType.VENDOR_PAYMENT_AP, label: 'Accounts Payable (Vendor Payments)', category: 'Vendor Payments', description: 'Liability account debited when vendor payments are made' }]
    for (const paymentMethod of paymentMethods) {
      if (!paymentMethod.useForPurchases) continue
      const code = paymentMethod.code.toLowerCase()
      items.push({ type: `vendor_payment_${code}`, label: `${paymentMethod.name} Vendor Payment Account`, category: 'Vendor Payments', description: `Account credited when ${paymentMethod.name} vendor payments are made` })
    }
    return items
  }
  const allSections: Array<{ category: string; items: MappingOption[] }> = useMemo(() => [
    ...staticCategories.map((category) => ({ category, items: getAllMappingTypes().filter((mapping) => mapping.category === category) })),
    { category: 'Payments', items: getPaymentMappingTypes() },
    { category: 'Vendor Payments', items: getVendorPaymentMappingTypes() },
  ], [paymentMethods])

  const tableRows = useMemo(() => {
    const rows = allSections.flatMap(({ items }) => items.map((item) => ({ mappingType: item.type, label: item.label, category: item.category, description: item.description, mapping: (mappings as AccountMapping[]).find((mapping) => mapping.mappingType === item.type) })))
    const term = appliedFilters.search.trim().toLowerCase()
    if (!term) return rows
    return rows.filter((row) => [row.label, row.category, row.description, row.mapping?.account?.name, row.mapping?.account?.code].filter(Boolean).join(' ').toLowerCase().includes(term))
  }, [allSections, appliedFilters.search, mappings])

  const selectedMeta = useMemo(() => tableRows.find((row) => row.mapping?.id === workspace.selected?.id), [tableRows, workspace.selected?.id])

  return (
    <>
      {!validationResult?.isValid && validationResult?.missingMappings?.length ? (
        <Alert severity="warning" sx={{ mb: 2 }}>
          Configuration Incomplete
        </Alert>
      ) : validationResult?.isValid ? (
        <Alert severity="success" sx={{ mb: 2 }}>
          All required account mappings are configured.
        </Alert>
      ) : null}
      <GenericListPage
        title="Account Mappings"
        subtitle="Configure default account assignments for transactions"
        filterConfig={filterConfig}
        draftFilters={draftFilters}
        handlers={handlers}
        hasActiveFilters={hasActiveFilters}
        searchInputRef={workspace.searchInputRef}
        sort={{ field: 'mappingType', sortBy: 'mappingType', sortOrder: 'asc', onSort: () => {} }}
        error={(error as any)?.data ?? null}
        onErrorClose={() => {}}
        filterExtra={<Button size="small" onClick={() => { void refetchMappings(); void refetchValidation() }}>Refresh</Button>}
        listSlot={<AccountMappingsTable mappings={tableRows} loading={isLoading} selectedId={workspace.selected?.id ?? null} onSelect={workspace.setSelected} listRef={workspace.listRef} />}
        headerSlot={<AccountMappingContextHeader selected={workspace.selected} label={selectedMeta?.label || 'Account Mapping'} category={selectedMeta?.category || ''} onEdit={() => { workspace.setSelectedMapping(workspace.selected); workspace.setSelectedMappingType(null); workspace.setDialogOpen(true) }} onDelete={() => workspace.selected && workspace.setMappingToClear(workspace.selected)} />}
        workspaceSlot={<AccountMappingWorkspaceCard selected={workspace.selected} />}
        dialogs={<AccountMappingsDialogs dialogOpen={workspace.dialogOpen} selectedMapping={workspace.selectedMapping} selectedMappingType={workspace.selectedMappingType} onCloseDialog={() => { workspace.setDialogOpen(false); workspace.setSelectedMapping(null); workspace.setSelectedMappingType(null) }} onSaveSuccess={() => { workspace.setDialogOpen(false); workspace.setSelectedMapping(null); workspace.setSelectedMappingType(null); void refetchMappings(); void refetchValidation() }} mappingToClear={workspace.mappingToClear} clearing={workspace.clearing} onConfirmClear={() => void workspace.handleClear()} onCancelClear={() => !workspace.clearing && workspace.setMappingToClear(null)} />}
      />
    </>
  )
}

export default AccountMappingsPage
