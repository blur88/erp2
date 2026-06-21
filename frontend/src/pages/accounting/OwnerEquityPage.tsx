import React, { useMemo, useState } from 'react'

import GenericListPage from '@/components/common/GenericListPage'
import { useFilterBar } from '@/hooks/useFilterBar'
import { useAppDispatch, useAppSelector } from '@/hooks/useRedux'
import {
  useCreateOwnerEquityTransactionMutation,
  useGetOwnerEquityTransactionsQuery,
  useGetPaymentMethodsQuery,
  useUpdateOwnerEquityTransactionMutation,
} from '@/store/api/accountingApi'
import { selectSelectedOwnerEquityTransaction } from '@/store/slices/accountingSlice'
import type { OwnerEquityTransaction, PaymentMethodConfig } from '@/types'
import type { FilterBarConfig, PeriodValue } from '@/types/filterBar.types'
import { getPeriodDateRange, getStartOfWeek } from '@/utils/dateRange'

import { OwnerEquityContextHeader } from './components/OwnerEquityContextHeader'
import { OwnerEquityDialogs } from './components/OwnerEquityDialogs'
import { OwnerEquityTable } from './components/OwnerEquityTable'
import { OwnerEquityWorkspaceCard } from './components/OwnerEquityWorkspaceCard'
import { useOwnerEquityWorkspace } from './hooks/useOwnerEquityWorkspace'

type FormState = {
  id?: string
  transactionDate: string
  type: 'capital_injection' | 'owner_drawing'
  amount: string
  paymentMethodId: string
  description: string
}

interface OwnerEquityFilters {
  search: string
  type: string | null
  status: string | null
  period: PeriodValue
}

const filterConfig: FilterBarConfig<OwnerEquityFilters> = {
  search: { placeholder: 'Search owner equity...' },
  fields: [
    { field: 'period', label: 'Period', type: 'period' },
    { field: 'type', label: 'Type', type: 'owner-equity-type' },
    { field: 'status', label: 'Status', type: 'expense-status' },
  ],
  defaults: { search: '', type: null, status: null, period: { key: null, from: null, to: null } },
}

const defaultForm = (): FormState => ({
  transactionDate: new Date().toISOString().slice(0, 10),
  type: 'capital_injection',
  amount: '',
  paymentMethodId: '',
  description: '',
})

const OwnerEquityPage: React.FC = () => {
  const [form, setForm] = useState<FormState>(defaultForm())
  const { appliedFilters, draftFilters, handlers, hasActiveFilters } = useFilterBar(filterConfig)
  const weekStartsOn = getStartOfWeek()
  const dateRange = useMemo(() => {
    const period = appliedFilters.period
    if (!period || period.key === null) return { fromDate: undefined, toDate: undefined }
    if (period.key === 'custom') return { fromDate: period.from ?? undefined, toDate: period.to ?? undefined }
    const resolved = getPeriodDateRange(period.key, weekStartsOn)
    return { fromDate: resolved.from, toDate: resolved.to }
  }, [appliedFilters.period, weekStartsOn])

  const { data: ownerEquityResponse, isLoading, refetch } = useGetOwnerEquityTransactionsQuery({
    page: 1,
    sortBy: 'referenceNumber',
    sortOrder: 'DESC',
    type: appliedFilters.type || undefined,
    status: appliedFilters.status || undefined,
    startDate: dateRange.fromDate,
    endDate: dateRange.toDate,
  })
  const { data: paymentMethodsResponse } = useGetPaymentMethodsQuery({ isActive: true })
  const paymentMethods = (paymentMethodsResponse?.data ?? []) as PaymentMethodConfig[]

  const [createOwnerEquityTransaction] = useCreateOwnerEquityTransactionMutation()
  const [updateOwnerEquityTransaction] = useUpdateOwnerEquityTransactionMutation()

  const rows = useMemo(() => {
    const items = ownerEquityResponse?.data ?? []
    const term = appliedFilters.search.trim().toLowerCase()
    if (!term) return items
    return items.filter((item) =>
      [item.referenceNumber, item.description, item.paymentMethod?.name]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(term),
    )
  }, [appliedFilters.search, ownerEquityResponse?.data])

  const dispatch = useAppDispatch()
  const selected = useAppSelector(selectSelectedOwnerEquityTransaction)
  const workspace = useOwnerEquityWorkspace(rows, () => { void refetch() }, dispatch, selected)

  const filterHandlers = useMemo(() => ({
    ...handlers,
    onSearchChange: (value: string) => {
      handlers.onSearchChange(value)
      workspace.setShouldPreserveSearchFocus(true)
    },
  }), [handlers, workspace])

  const openCreate = () => {
    setForm({ ...defaultForm(), paymentMethodId: paymentMethods[0]?.id || '' })
    workspace.setDialogOpen(true)
  }

  const openEdit = (row: OwnerEquityTransaction) => {
    setForm({
      id: row.id,
      transactionDate: row.transactionDate.slice(0, 10),
      type: row.type,
      amount: String(row.amount),
      paymentMethodId: row.paymentMethodId,
      description: row.description || '',
    })
    workspace.setDialogOpen(true)
  }

  const closeDialog = () => {
    workspace.setDialogOpen(false)
    setForm(defaultForm())
  }

  const save = async () => {
    if (!form.paymentMethodId || !form.amount || Number(form.amount) <= 0) return
    const payload = {
      transactionDate: form.transactionDate,
      type: form.type,
      amount: Number(form.amount),
      paymentMethodId: form.paymentMethodId,
      description: form.description || undefined,
    }
    if (form.id) await updateOwnerEquityTransaction({ id: form.id, data: payload }).unwrap()
    else await createOwnerEquityTransaction(payload).unwrap()
    closeDialog()
    void refetch()
  }

  return (
    <GenericListPage
      title="Owner Equity"
      subtitle="Track owner contributions and equity transactions"
      primaryAction={{ label: 'New Transaction', onClick: openCreate }}
      filterConfig={filterConfig}
      draftFilters={draftFilters}
      handlers={filterHandlers}
      hasActiveFilters={hasActiveFilters}
      searchInputRef={workspace.searchInputRef}
      sort={{ field: 'referenceNumber', sortBy: 'referenceNumber', sortOrder: 'desc', onSort: () => {} }}
      listSlot={(
        <OwnerEquityTable
          transactions={rows}
          loading={isLoading}
          total={rows.length}
          selectedId={selected?.id ?? null}
          focusedIndex={workspace.focusedIndex}
          onSelect={workspace.handleSelect}
          listRef={workspace.listRef}
        />
      )}
      headerSlot={(
        <OwnerEquityContextHeader
          selected={selected}
          onEdit={() => selected && openEdit(selected)}
          onPost={() => selected && workspace.setPostTarget(selected)}
          onDelete={() => selected && workspace.setDeleteTarget(selected)}
          onReverse={() => selected && workspace.setReverseTarget(selected)}
        />
      )}
      workspaceSlot={<OwnerEquityWorkspaceCard selected={selected} />}
      dialogs={(
        <OwnerEquityDialogs
          dialogOpen={workspace.dialogOpen}
          form={form}
          paymentMethods={paymentMethods}
          onCloseDialog={closeDialog}
          onFormChange={(field, value) => setForm((current) => ({ ...current, [field]: value }))}
          onSave={() => void save()}
          reverseTarget={workspace.reverseTarget}
          deleteTarget={workspace.deleteTarget}
          postTarget={workspace.postTarget}
          onCancelReverse={() => workspace.setReverseTarget(null)}
          onCancelDelete={() => workspace.setDeleteTarget(null)}
          onCancelPost={() => workspace.setPostTarget(null)}
          onConfirmReverse={() => void workspace.handleReverse()}
          onConfirmDelete={() => void workspace.handleDelete()}
          onConfirmPost={() => void workspace.handlePost()}
        />
      )}
    />
  )
}

export default OwnerEquityPage
