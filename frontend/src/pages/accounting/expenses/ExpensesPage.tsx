import { useCallback, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Box, Button } from '@mui/material'

import SimpleListPage from '@/components/common/SimpleListPage'
import EntityTable, { type ColumnConfig } from '@/components/common/EntityTable'
import PagePagination from '@/components/common/PagePagination'
import { StatusChip } from '@/components/common/StatusChip'
import RowActionMenu, { type RowAction } from '@/components/common/RowActionMenu'
import { useFilterBar } from '@/hooks/useFilterBar'
import { useGetExpensesQuery, useGetAccountTreeQuery } from '@/store/api/accountingApi'
import { formatCurrency } from '@/utils/currency'
import { getPeriodDateRange, getStartOfWeek } from '@/utils/dateRange'
import { PAGINATION } from '@/constants/tableStyles'
import { getExpenseActionMetas } from '@/pages/accounting/expenses/expenseActions'
import type { Expense, ExpenseDocumentStatus, ExpensePaymentStatus } from '@/types'
import type { FilterBarConfig, PeriodValue } from '@/types/filterBar.types'

interface ExpenseFilters {
  search: string
  period: PeriodValue
  expenseAccountId: string | null
  paymentStatus: ExpensePaymentStatus | null
  documentStatus: ExpenseDocumentStatus | null
}

function buildAccountOptions(tree: { id: string; code: string; name: string; children?: unknown[] }[]): { value: string; label: string }[] {
  const options: { value: string; label: string }[] = []
  const flatten = (nodes: typeof tree) => {
    for (const node of nodes) {
      options.push({ value: node.id, label: `${node.code} ${node.name}` })
      if (node.children?.length) flatten(node.children as typeof tree)
    }
  }
  flatten(tree)
  return options
}

function getFilterConfig(
  accountOptions: { value: string; label: string }[],
): FilterBarConfig<ExpenseFilters> {
  return {
    search: { placeholder: 'Search by expense no., description...' },
    fields: [
      { field: 'period', label: 'Period', type: 'period' },
      { field: 'expenseAccountId', label: 'Expense Account', type: 'select',
        options: accountOptions,
        emptyLabel: 'All accounts' },
      { field: 'paymentStatus', label: 'Payment Status', type: 'payment-status' },
      { field: 'documentStatus', label: 'Document Status', type: 'select',
        options: [
          { value: 'DRAFT', label: 'Draft' },
          { value: 'CANCELLED', label: 'Cancelled' },
        ] as const },
    ],
    defaults: {
      search: '',
      period: { key: null, from: null, to: null },
      expenseAccountId: null,
      paymentStatus: null,
      documentStatus: null,
    },
  }
}

export default function ExpensesPage() {
  const navigate = useNavigate()
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState<number>(PAGINATION.defaultPageSize)
  const sortBy = 'expenseDate' as const
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')

  const searchInputRef = useRef<HTMLInputElement | null>(null)

  const { data: accountTreeData = [] } = useGetAccountTreeQuery({
    type: 'Expense',
    isActive: true,
  })

  const accountOptions = useMemo(
    () => buildAccountOptions(accountTreeData),
    [accountTreeData],
  )

  const filterConfig = useMemo(
    () => getFilterConfig(accountOptions),
    [accountOptions],
  )

  const { appliedFilters, draftFilters, handlers, hasActiveFilters } =
    useFilterBar(filterConfig, { onApply: () => setPage(1) })

  const weekStartsOn = getStartOfWeek()

  const dateRange = useMemo(() => {
    const period = appliedFilters.period
    if (!period || period.key === null) return { fromDate: undefined, toDate: undefined }
    if (period.key === 'custom') {
      return { fromDate: period.from ?? undefined, toDate: period.to ?? undefined }
    }
    const range = getPeriodDateRange(period.key, weekStartsOn)
    return { fromDate: range.from, toDate: range.to }
  }, [appliedFilters.period, weekStartsOn])

  const queryParams = useMemo(() => {
    const params: {
      page: number
      limit: number
      sortBy: string
      sortOrder: string
      search?: string
      fromDate?: string
      toDate?: string
      expenseAccountId?: string
      paymentStatus?: ExpensePaymentStatus
      documentStatus?: ExpenseDocumentStatus
    } = {
      page,
      limit,
      sortBy,
      sortOrder: sortOrder.toUpperCase() as 'ASC' | 'DESC',
    }
    const search = appliedFilters.search.trim()
    if (search) params.search = search
    if (appliedFilters.expenseAccountId) params.expenseAccountId = appliedFilters.expenseAccountId
    if (appliedFilters.paymentStatus) params.paymentStatus = appliedFilters.paymentStatus
    if (appliedFilters.documentStatus) params.documentStatus = appliedFilters.documentStatus
    if (dateRange.fromDate) params.fromDate = dateRange.fromDate
    if (dateRange.toDate) params.toDate = dateRange.toDate
    return params
  }, [page, limit, appliedFilters, dateRange, sortBy, sortOrder])

  const { data: response, isFetching, error } = useGetExpensesQuery(queryParams)
  const rows = response?.data ?? []
  const total = response?.meta?.total ?? 0

  const handleLimitChange = (newLimit: number) => {
    setLimit(newLimit)
    setPage(1)
  }

  const handleSort = useCallback(() => {
    setSortOrder((prev) => (prev === 'desc' ? 'asc' : 'desc'))
    setPage(1)
  }, [])

  const handleView = (row: Expense) => {
    navigate(`/accounting/expenses/${row.id}`)
  }

  const buildRowActions = useCallback(
    (row: Expense): RowAction[] => {
      const metas = getExpenseActionMetas(row)
      const actions: RowAction[] = [
        { label: 'View', onClick: () => handleView(row) },
      ]
      for (const meta of metas) {
        actions.push({
          label:
            meta.action.charAt(0).toUpperCase() + meta.action.slice(1),
          onClick: () => {
            if (meta.action === 'edit') {
              navigate(`/accounting/expenses/${row.id}/edit`)
            }
          },
          disabled: meta.disabled,
          tooltip: meta.tooltip,
        })
      }
      return actions
    },
    [],
  )

  const columns: ColumnConfig<Expense>[] = [
    { key: 'expenseNumber', render: (row) => row.expenseNumber },
    { key: 'expenseDate', render: (row) => row.expenseDate },
    { key: 'description', render: (row) => row.description ?? '-' },
    {
      key: 'account',
      render: (row) =>
        row.expenseAccount
          ? `${row.expenseAccount.code} ${row.expenseAccount.name}`
          : '-',
    },
    { key: 'totalAmount', render: (row) => formatCurrency(row.totalAmount) },
    { key: 'paidAmount', render: (row) => formatCurrency(row.paidAmount) },
    { key: 'balance', render: (row) => formatCurrency(row.balance) },
    {
      key: 'documentStatus',
      raw: true,
      render: (row) => (
        <StatusChip
          status={row.documentStatus}
          label={row.documentStatus === 'DRAFT' ? 'Draft' : 'Cancelled'}
        />
      ),
    },
    {
      key: 'paymentStatus',
      raw: true,
      render: (row) => (
        <StatusChip status={row.paymentStatus} />
      ),
    },
    {
      key: 'actions',
      raw: true,
      render: (row) => <RowActionMenu actions={buildRowActions(row)} />,
    },
  ]

  return (
    <SimpleListPage
      title="Expenses"
      subtitle="Track business expenses and payment status"
      primaryAction={{
        label: '+ New Expense',
        onClick: () => navigate('/accounting/expenses/new'),
      }}
      filterConfig={filterConfig}
      draftFilters={draftFilters}
      handlers={handlers}
      hasActiveFilters={hasActiveFilters}
      searchInputRef={searchInputRef}
      sort={{
        field: 'expenseDate',
        sortBy,
        sortOrder,
        onSort: handleSort,
      }}
      isFetching={isFetching}
      error={error ? 'Failed to load expenses.' : null}
      tableSlot={
        <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
          <EntityTable
            rows={rows}
            columns={columns}
            loading={isFetching}
            total={total}
            label="Expenses"
            emptyLabel="expenses"
            showHeader={false}
            focusedIndex={-1}
            onSelect={handleView}
            listRef={searchInputRef}
            headers={[
              'Expense No.',
              'Date',
              'Description',
              'Account',
              'Total',
              'Paid',
              'Balance',
              'Doc Status',
              'Payment Status',
              'Actions',
            ]}
            paginationSlot={
              total > 0 ? (
                <PagePagination
                  total={total}
                  page={page}
                  limit={limit}
                  onPageChange={setPage}
                  onLimitChange={handleLimitChange}
                  pageSizeOptions={PAGINATION.options}
                />
              ) : undefined
            }
          />
        </Box>
      }
    />
  )
}