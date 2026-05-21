import React, { useCallback, useMemo, useState } from 'react'

import DeletedSettlementsDialog from '@/components/accounting/DeletedSettlementsDialog'
import GenericListPage from '@/components/common/GenericListPage'
import { useFilterBar } from '@/hooks/useFilterBar'
import { useNotification } from '@/hooks/useNotification'
import { useAppDispatch, useAppSelector } from '@/hooks/useRedux'
import {
  useCreateSettlementMutation,
  useGetPendingSettlementSummaryQuery,
  useGetSettlementsQuery,
  useUpdateSettlementMutation,
} from '@/store/api/accountingApi'
import { selectSelectedSettlement } from '@/store/slices/accountingSlice'
import { selectCurrentUser } from '@/store/slices/authSlice'
import type { FilterBarConfig, PeriodValue } from '@/types/filterBar.types'
import { getPeriodDateRange, getStartOfWeek } from '@/utils/dateRange'
import { getCurrentDate } from '@/utils/formatters'
import { getErrorMessage } from '@/utils/errorMessage'

import { SettlementContextHeader } from './components/SettlementContextHeader'
import { SettlementsDialogs, type SettlementEditFormState } from './components/SettlementsDialogs'
import { SettlementsTable } from './components/SettlementsTable'
import { SettlementWorkspaceCard } from './components/SettlementWorkspaceCard'
import { useSettlementsWorkspace } from './hooks/useSettlementsWorkspace'

interface SettlementFilters {
  search: string
  status: string | null
  period: PeriodValue
}

const filterConfig: FilterBarConfig<SettlementFilters> = {
  search: { placeholder: 'Search settlements...' },
  fields: [
    { field: 'period', label: 'Period', type: 'period' },
    { field: 'status', label: 'Status', type: 'settlement-status' },
  ],
  defaults: { search: '', status: null, period: { key: null, from: null, to: null } },
}

const defaultEditForm: SettlementEditFormState = {
  settlementDate: getCurrentDate(),
  reference: '',
  notes: '',
}

const SettlementsPage: React.FC = () => {
  const currentUser = useAppSelector(selectCurrentUser)
  const isAdmin = currentUser?.role === 'admin'
  const canManage = isAdmin || currentUser?.role === 'manager'
  const { showError } = useNotification()

  const [sortBy, setSortBy] = useState('settlementDate')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')
  const [editForm, setEditForm] = useState<SettlementEditFormState>(defaultEditForm)

  const { appliedFilters, draftFilters, handlers, hasActiveFilters } = useFilterBar(filterConfig)
  const weekStartsOn = getStartOfWeek()
  const dateRange = useMemo(() => {
    const period = appliedFilters.period
    if (!period || period.key === null) return { fromDate: undefined, toDate: undefined }
    if (period.key === 'custom') return { fromDate: period.from ?? undefined, toDate: period.to ?? undefined }
    const resolved = getPeriodDateRange(period.key, weekStartsOn)
    return { fromDate: resolved.from, toDate: resolved.to }
  }, [appliedFilters.period, weekStartsOn])

  const { data: settlementsResponse, isLoading, refetch } = useGetSettlementsQuery({
    page: 1,
    status: appliedFilters.status || undefined,
    startDate: dateRange.fromDate,
    endDate: dateRange.toDate,
    sortBy,
    sortOrder,
  })
  useGetPendingSettlementSummaryQuery()
  const [createSettlement] = useCreateSettlementMutation()
  const [updateSettlement, { isLoading: updating }] = useUpdateSettlementMutation()

  const settlements = useMemo(() => {
    const rows = settlementsResponse?.data ?? []
    const term = appliedFilters.search.trim().toLowerCase()
    if (!term) return rows
    return rows.filter((row) =>
      [row.settlementNumber, row.reference, row.notes, row.paymentMethod?.name]
        .filter(Boolean).join(' ').toLowerCase().includes(term),
    )
  }, [appliedFilters.search, settlementsResponse?.data])

  const dispatch = useAppDispatch()
  const selected = useAppSelector(selectSelectedSettlement)
  const workspace = useSettlementsWorkspace(settlements, () => { void refetch() }, dispatch, selected)

  const filterHandlers = useMemo(() => ({
    ...handlers,
    onSearchChange: (value: string) => {
      handlers.onSearchChange(value)
      workspace.setShouldPreserveSearchFocus(true)
    },
  }), [handlers, workspace])

  const handleSort = useCallback((field: string) => {
    setSortOrder((previous) => (sortBy === field && previous === 'desc' ? 'asc' : 'desc'))
    setSortBy(field)
  }, [sortBy])

  const onCreate = async (data: { paymentMethodId: string; settlementDate: string; paymentIds: string[]; reference?: string; notes?: string }) => {
    await createSettlement(data).unwrap()
    workspace.setDialogOpen(false)
    void refetch()
  }

  const handleOpenEdit = () => {
    if (!selected) return
    workspace.setEditTarget(selected)
    setEditForm({
      settlementDate: typeof selected.settlementDate === 'string'
        ? selected.settlementDate.slice(0, 10)
        : new Date(selected.settlementDate).toISOString().slice(0, 10),
      reference: selected.reference ?? '',
      notes: selected.notes ?? '',
    })
    workspace.setFormOpen(true)
  }

  const resetEditForm = () => {
    workspace.setFormOpen(false)
    workspace.setEditTarget(null)
    setEditForm(defaultEditForm)
  }

  const handleSaveEdit = async () => {
    if (!workspace.editTarget || !editForm.settlementDate) return
    try {
      await updateSettlement({
        id: workspace.editTarget.id,
        settlementDate: editForm.settlementDate,
        reference: editForm.reference || undefined,
        notes: editForm.notes || undefined,
      }).unwrap()
      resetEditForm()
      void refetch()
    } catch (error: unknown) {
      showError(getErrorMessage(error, 'Failed to update settlement'))
    }
  }

  const secondaryAction = isAdmin
    ? { label: 'View Deleted', onClick: () => workspace.setDeletedDialogOpen(true) }
    : undefined

  return (
    <>
      <GenericListPage
        title="Settlements"
        subtitle="Settle pending payments by payment method"
        primaryAction={canManage ? { label: 'Create Settlement', onClick: () => workspace.setDialogOpen(true) } : undefined}
        secondaryAction={secondaryAction}
        filterConfig={filterConfig}
        draftFilters={draftFilters}
        handlers={filterHandlers}
        hasActiveFilters={hasActiveFilters}
        searchInputRef={workspace.searchInputRef}
        sort={{ field: 'settlementDate', sortBy, sortOrder, onSort: handleSort }}
        listSlot={(
          <SettlementsTable
            settlements={settlements}
            loading={isLoading}
            total={settlements.length}
            selectedId={selected?.id ?? null}
            focusedIndex={workspace.focusedIndex}
            onSelect={workspace.handleSelect}
            listRef={workspace.listRef}
          />
        )}
        headerSlot={(
          <SettlementContextHeader
            selected={selected}
            isAdmin={isAdmin}
            canManage={canManage}
            onEdit={handleOpenEdit}
            onPost={() => selected && workspace.setPostTarget(selected)}
            onReverse={() => selected && workspace.setReverseTarget(selected)}
            onDelete={() => selected && workspace.setDeleteTarget(selected)}
            onRestore={() => selected && workspace.setRestoreTarget(selected)}
          />
        )}
        workspaceSlot={<SettlementWorkspaceCard selected={selected} />}
        dialogs={(
          <SettlementsDialogs
            dialogOpen={workspace.dialogOpen}
            onCloseDialog={() => workspace.setDialogOpen(false)}
            onCreate={onCreate}
            formOpen={workspace.formOpen}
            editTarget={workspace.editTarget}
            canManage={canManage}
            saving={updating}
            editForm={editForm}
            onCloseForm={resetEditForm}
            onEditFormChange={(field, value) => setEditForm((previous) => ({ ...previous, [field]: value }))}
            onSaveEdit={() => void handleSaveEdit()}
            postTarget={workspace.postTarget}
            reverseTarget={workspace.reverseTarget}
            deleteTarget={workspace.deleteTarget}
            restoreTarget={workspace.restoreTarget}
            actionLoading={workspace.actionLoading}
            onConfirmPost={() => void workspace.handleConfirmPost()}
            onCancelPost={() => workspace.setPostTarget(null)}
            onConfirmReverse={() => void workspace.handleConfirmReverse()}
            onCancelReverse={() => workspace.setReverseTarget(null)}
            onConfirmDelete={() => void workspace.handleConfirmDelete()}
            onCancelDelete={() => workspace.setDeleteTarget(null)}
            onConfirmRestore={() => void workspace.handleConfirmRestore()}
            onCancelRestore={() => workspace.setRestoreTarget(null)}
          />
        )}
      />
      {isAdmin && (
        <DeletedSettlementsDialog
          open={workspace.deletedDialogOpen}
          onClose={() => workspace.setDeletedDialogOpen(false)}
          onChanged={() => void refetch()}
        />
      )}
    </>
  )
}

export default SettlementsPage
