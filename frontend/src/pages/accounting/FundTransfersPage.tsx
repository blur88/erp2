import React, { useMemo, useState } from 'react'

import GenericListPage from '@/components/common/GenericListPage'
import { useFilterBar } from '@/hooks/useFilterBar'
import { useAppSelector } from '@/hooks/useRedux'
import { useCreateFundTransferMutation, useGetChartOfAccountsQuery, useGetFundTransfersQuery } from '@/store/api/accountingApi'
import { selectCurrentUser } from '@/store/slices/authSlice'
import type { ChartOfAccount } from '@/types'
import type { FilterBarConfig, PeriodValue } from '@/types/filterBar.types'
import { getCurrentDate } from '@/utils/formatters'
import { getPeriodDateRange, getStartOfWeek } from '@/utils/dateRange'

import { FundTransferContextHeader } from './components/FundTransferContextHeader'
import { FundTransfersDialogs } from './components/FundTransfersDialogs'
import { FundTransfersList } from './components/FundTransfersList'
import { FundTransferWorkspaceCard } from './components/FundTransferWorkspaceCard'
import { useFundTransfersWorkspace } from './hooks/useFundTransfersWorkspace'

type FormState = {
  sourceAccountId: string
  destinationAccountId: string
  amount: string
  transferDate: string
  description: string
}


interface FTFilters {
  search: string
  status: string | null
  period: PeriodValue
}

const filterConfig: FilterBarConfig<FTFilters> = {
  search: { placeholder: 'Search fund transfers...' },
  fields: [
    { field: 'period', label: 'Period', type: 'period' },
    { field: 'status', label: 'Status', type: 'fund-transfer-status' },
  ],
  defaults: { search: '', status: null, period: { key: null, from: null, to: null } },
}

const defaultForm: FormState = { sourceAccountId: '', destinationAccountId: '', amount: '', transferDate: getCurrentDate(), description: '' }

const FundTransfersPage: React.FC = () => {
  const currentUser = useAppSelector(selectCurrentUser)
  const canManageTransfers = currentUser?.role === 'admin' || currentUser?.role === 'manager'
  const [dialogOpen, setDialogOpen] = useState(false)
  const [form, setForm] = useState<FormState>(defaultForm)
  const { appliedFilters, draftFilters, handlers, hasActiveFilters } = useFilterBar(filterConfig)
  const weekStartsOn = getStartOfWeek()
  const dateRange = useMemo(() => {
    const period = appliedFilters.period
    if (!period || period.key === null) return { fromDate: undefined, toDate: undefined }
    if (period.key === 'custom') return { fromDate: period.from ?? undefined, toDate: period.to ?? undefined }
    const resolved = getPeriodDateRange(period.key, weekStartsOn)
    return { fromDate: resolved.from, toDate: resolved.to }
  }, [appliedFilters.period, weekStartsOn])

  const filters = useMemo(() => ({
    startDate: dateRange.fromDate,
    endDate: dateRange.toDate,
    status: appliedFilters.status || undefined,
  }), [appliedFilters.status, dateRange])

  const { data, isLoading, refetch } = useGetFundTransfersQuery(filters)
  const { data: accountsResponse } = useGetChartOfAccountsQuery({ isCashEquivalent: true, limit: 200 })
  const [createFundTransfer, { isLoading: creating }] = useCreateFundTransferMutation()

  const workspace = useFundTransfersWorkspace(() => { void refetch() })
  const cashAccounts = useMemo(() => ((accountsResponse?.data ?? []) as ChartOfAccount[]).filter((account) => account.isActive && account.isCashEquivalent), [accountsResponse])
  const availableDestinations = useMemo(() => cashAccounts.filter((account) => account.id !== form.sourceAccountId), [cashAccounts, form.sourceAccountId])
  const transfers = useMemo(() => {
    const rows = data?.data ?? []
    const term = appliedFilters.search.trim().toLowerCase()
    if (!term) return rows
    return rows.filter((row) => [row.referenceNumber, row.description, row.sourceAccount.name, row.destinationAccount.name].filter(Boolean).join(' ').toLowerCase().includes(term))
  }, [appliedFilters.search, data?.data])

  const resetForm = () => { setDialogOpen(false); setForm(defaultForm) }

  const handleCreate = async () => {
    if (!form.sourceAccountId || !form.destinationAccountId || !form.amount || !form.transferDate || Number(form.amount) <= 0 || form.sourceAccountId === form.destinationAccountId) return
    await createFundTransfer({ sourceAccountId: form.sourceAccountId, destinationAccountId: form.destinationAccountId, amount: Number(form.amount), transferDate: form.transferDate, description: form.description || undefined }).unwrap()
    resetForm()
    void refetch()
  }

  return (
    <GenericListPage
      title="Fund Transfers"
      subtitle="Move funds between accounts and review transfer history"
      primaryAction={canManageTransfers ? { label: 'New Transfer', onClick: () => setDialogOpen(true) } : undefined}
      filterConfig={filterConfig}
      draftFilters={draftFilters}
      handlers={handlers}
      hasActiveFilters={hasActiveFilters}
      searchInputRef={workspace.searchInputRef}
      sort={{ field: 'transferDate', sortBy: 'transferDate', sortOrder: 'desc', onSort: () => {} }}
      listSlot={<FundTransfersList transfers={transfers} loading={isLoading} selectedId={workspace.selected?.id ?? null} focusedIndex={workspace.focusedIndex} onSelect={workspace.handleSelect} listRef={workspace.listRef} />}
      headerSlot={<FundTransferContextHeader selected={workspace.selected} onCancel={() => workspace.selected && workspace.setCancelTarget(workspace.selected)} canManageTransfers={canManageTransfers} />}
      workspaceSlot={<FundTransferWorkspaceCard selected={workspace.selected} />}
      dialogs={<FundTransfersDialogs dialogOpen={dialogOpen} canManageTransfers={canManageTransfers} creating={creating} form={form} cashAccounts={cashAccounts} availableDestinations={availableDestinations} onCloseDialog={resetForm} onFormChange={(field, value) => setForm((current) => ({ ...current, [field]: value, ...(field === 'sourceAccountId' && value === current.destinationAccountId ? { destinationAccountId: '' } : {}) }))} onCreate={() => void handleCreate()} cancelTarget={workspace.cancelTarget} cancelling={workspace.cancelling} onConfirmCancel={() => void workspace.handleConfirmCancel()} onCancelCancel={() => workspace.setCancelTarget(null)} />}
    />
  )
}

export default FundTransfersPage
