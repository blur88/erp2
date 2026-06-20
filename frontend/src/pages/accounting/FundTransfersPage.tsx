import React, { useMemo, useState } from 'react'

import GenericListPage from '@/components/common/GenericListPage'
import { useFilterBar } from '@/hooks/useFilterBar'
import { useAppDispatch, useAppSelector } from '@/hooks/useRedux'
import {
  useCreateFundTransferMutation,
  useGetChartOfAccountsQuery,
  useGetFundTransfersQuery,
  useUpdateFundTransferMutation,
} from '@/store/api/accountingApi'
import { selectSelectedFundTransfer } from '@/store/slices/accountingSlice'
import { selectCurrentUser } from '@/store/slices/authSlice'
import type { ChartOfAccount } from '@/types'
import type { FilterBarConfig, PeriodValue } from '@/types/filterBar.types'
import { getCurrentDate } from '@/utils/formatters'
import { getPeriodDateRange, getStartOfWeek } from '@/utils/dateRange'

import DeletedFundTransfersDialog from '@/components/accounting/DeletedFundTransfersDialog'
import { FundTransferContextHeader } from './components/FundTransferContextHeader'
import { FundTransfersDialogs, type FundTransferFormState } from './components/FundTransfersDialogs'
import { FundTransfersList } from './components/FundTransfersList'
import { FundTransferWorkspaceCard } from './components/FundTransferWorkspaceCard'
import { useFundTransfersWorkspace } from './hooks/useFundTransfersWorkspace'

interface FTFilters {
  search: string
  status: string | null
  period: PeriodValue
  sourceAccountId: string | null
  destinationAccountId: string | null
}

const filterConfig: FilterBarConfig<FTFilters> = {
  search: { placeholder: 'Search fund transfers...' },
  fields: [
    { field: 'period', label: 'Period', type: 'period' },
    { field: 'status', label: 'Status', type: 'fund-transfer-status' },
    { field: 'sourceAccountId', label: 'Source Account', type: 'fund-transfer-source-account' },
    { field: 'destinationAccountId', label: 'Destination Account', type: 'fund-transfer-destination-account' },
  ],
  defaults: { search: '', status: null, period: { key: null, from: null, to: null }, sourceAccountId: null, destinationAccountId: null },
}

const defaultForm: FundTransferFormState = {
  sourceAccountId: '',
  destinationAccountId: '',
  amount: '',
  transferDate: getCurrentDate(),
  description: '',
}

const FundTransfersPage: React.FC = () => {
  const currentUser = useAppSelector(selectCurrentUser)
  const dispatch = useAppDispatch()
  const selected = useAppSelector(selectSelectedFundTransfer)
  const isAdmin = currentUser?.role === 'admin'
  const canManageTransfers = isAdmin || currentUser?.role === 'manager'
  const [form, setForm] = useState<FundTransferFormState>(defaultForm)
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
    sourceAccountId: appliedFilters.sourceAccountId || undefined,
    destinationAccountId: appliedFilters.destinationAccountId || undefined,
  }), [appliedFilters.status, appliedFilters.sourceAccountId, appliedFilters.destinationAccountId, dateRange])

  const { data, isLoading, refetch } = useGetFundTransfersQuery(filters)
  const { data: accountsResponse } = useGetChartOfAccountsQuery({ page: 1, isCashEquivalent: true, limit: 200 })
  const [createFundTransfer, { isLoading: creating }] = useCreateFundTransferMutation()
  const [updateFundTransfer, { isLoading: updating }] = useUpdateFundTransferMutation()

  const cashAccounts = useMemo(
    () => ((accountsResponse?.data ?? []) as ChartOfAccount[]).filter((a) => a.isActive && a.isCashEquivalent),
    [accountsResponse],
  )
  const availableDestinations = useMemo(
    () => cashAccounts.filter((a) => a.id !== form.sourceAccountId),
    [cashAccounts, form.sourceAccountId],
  )

  const transfers = useMemo(() => {
    const rows = data?.data ?? []
    const term = appliedFilters.search.trim().toLowerCase()
    if (!term) return rows
    return rows.filter((row) =>
      [row.referenceNumber, row.description, row.sourceAccount.name, row.destinationAccount.name]
        .filter(Boolean).join(' ').toLowerCase().includes(term),
    )
  }, [appliedFilters.search, data?.data])

  const workspace = useFundTransfersWorkspace(() => { void refetch() }, transfers, dispatch, selected)

  const filterHandlers = useMemo(() => ({
    ...handlers,
    onSearchChange: (value: string) => {
      handlers.onSearchChange(value)
      workspace.setShouldPreserveSearchFocus(true)
    },
  }), [handlers, workspace])

  const resetForm = () => {
    workspace.setFormOpen(false)
    workspace.setEditTarget(null)
    setForm(defaultForm)
  }

  const handleFormChange = (field: keyof FundTransferFormState, value: string) => {
    setForm((current) => ({
      ...current,
      [field]: value,
      ...(field === 'sourceAccountId' && value === current.destinationAccountId
        ? { destinationAccountId: '' }
        : {}),
    }))
  }

  const handleOpenEdit = () => {
    if (!selected) return
    workspace.setEditTarget(selected)
    setForm({
      sourceAccountId: selected.sourceAccount.id,
      destinationAccountId: selected.destinationAccount.id,
      amount: String(selected.amount),
      transferDate: typeof selected.transferDate === 'string'
        ? selected.transferDate.slice(0, 10)
        : new Date(selected.transferDate).toISOString().slice(0, 10),
      description: selected.description ?? '',
    })
    workspace.setFormOpen(true)
  }

  const handleSave = async () => {
    if (!form.sourceAccountId || !form.destinationAccountId || !form.amount || !form.transferDate
      || Number(form.amount) <= 0 || form.sourceAccountId === form.destinationAccountId) return

    if (workspace.editTarget) {
      await updateFundTransfer({
        id: workspace.editTarget.id,
        sourceAccountId: form.sourceAccountId,
        destinationAccountId: form.destinationAccountId,
        amount: Number(form.amount),
        transferDate: form.transferDate,
        description: form.description || undefined,
      }).unwrap()
    } else {
      await createFundTransfer({
        sourceAccountId: form.sourceAccountId,
        destinationAccountId: form.destinationAccountId,
        amount: Number(form.amount),
        transferDate: form.transferDate,
        description: form.description || undefined,
      }).unwrap()
    }
    resetForm()
    void refetch()
  }

  const secondaryAction = isAdmin
    ? { label: 'View Deleted', onClick: () => workspace.setDeletedDialogOpen(true) }
    : undefined

  return (
    <>
      <GenericListPage
        title="Fund Transfers"
        subtitle="Move funds between accounts and review transfer history"
        primaryAction={canManageTransfers ? { label: 'New Transfer', onClick: () => workspace.setFormOpen(true) } : undefined}
        secondaryAction={secondaryAction}
        filterConfig={filterConfig}
        draftFilters={draftFilters}
        handlers={filterHandlers}
        hasActiveFilters={hasActiveFilters}
        searchInputRef={workspace.searchInputRef}
        sort={{ field: 'transferDate', sortBy: 'transferDate', sortOrder: 'desc', onSort: () => {} }}
        listSlot={<FundTransfersList transfers={transfers} loading={isLoading} selectedId={selected?.id ?? null} focusedIndex={workspace.focusedIndex} onSelect={workspace.handleSelect} listRef={workspace.listRef} />}
        headerSlot={
          <FundTransferContextHeader
            selected={selected}
            isAdmin={isAdmin}
            onEdit={handleOpenEdit}
            onPost={() => selected && workspace.setPostTarget(selected)}
            onDelete={() => selected && workspace.setDeleteTarget(selected)}
            onUnpost={() => selected && workspace.setUnpostTarget(selected)}
            onRestore={() => selected && workspace.setRestoreTarget(selected)}
          />
        }
        workspaceSlot={<FundTransferWorkspaceCard selected={selected} />}
        dialogs={
          <FundTransfersDialogs
            formOpen={workspace.formOpen}
            editTarget={workspace.editTarget}
            canManageTransfers={canManageTransfers}
            saving={creating || updating}
            form={form}
            cashAccounts={cashAccounts}
            availableDestinations={availableDestinations}
            onCloseForm={resetForm}
            onFormChange={handleFormChange}
            onSave={() => void handleSave()}
            postTarget={workspace.postTarget}
            deleteTarget={workspace.deleteTarget}
            unpostTarget={workspace.unpostTarget}
            restoreTarget={workspace.restoreTarget}
            actionLoading={workspace.actionLoading}
            onConfirmPost={() => void workspace.handleConfirmPost()}
            onCancelPost={() => workspace.setPostTarget(null)}
            onConfirmDelete={() => void workspace.handleConfirmDelete()}
            onCancelDelete={() => workspace.setDeleteTarget(null)}
            onConfirmUnpost={() => void workspace.handleConfirmUnpost()}
            onCancelUnpost={() => workspace.setUnpostTarget(null)}
            onConfirmRestore={() => void workspace.handleConfirmRestore()}
            onCancelRestore={() => workspace.setRestoreTarget(null)}
          />
        }
      />
      {isAdmin && (
        <DeletedFundTransfersDialog
          open={workspace.deletedDialogOpen}
          onClose={() => workspace.setDeletedDialogOpen(false)}
          onChanged={() => void refetch()}
        />
      )}
    </>
  )
}

export default FundTransfersPage
