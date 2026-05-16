import type { RefObject } from 'react'
import { Chip } from '@mui/material'

import EntityTable, { type ColumnConfig } from '@/components/common/EntityTable'
import { formatCurrency, formatDate } from '@/utils/formatters'
import type { ExpenseRecord } from '@/types'

interface Props {
  expenses: ExpenseRecord[]
  loading: boolean
  selectedId: string | null
  focusedIndex: number
  onSelect: (item: ExpenseRecord) => void
  listRef: RefObject<HTMLDivElement | null>
}

function statusColor(status: string) {
  if (status === 'posted') return 'success' as const
  if (status === 'reversed') return 'error' as const
  return 'default' as const
}

const columns: ColumnConfig<ExpenseRecord>[] = [
  {
    key: 'expenseDate',
    render: (row) => formatDate(row.expenseDate),
    width: '15%',
  },
  {
    key: 'reference',
    render: (row) => row.referenceNumber,
    width: '25%',
  },
  {
    key: 'vendor',
    render: (row) => row.vendor ?? '-',
    width: '25%',
  },
  {
    key: 'amount',
    render: (row) => formatCurrency(row.amount),
    width: '20%',
  },
  {
    key: 'status',
    raw: true,
    render: (row) => (
      <Chip label={row.status} color={statusColor(row.status)} size="small" />
    ),
    width: '15%',
  },
]

export function ExpensesTable({ expenses, loading, selectedId, focusedIndex, onSelect, listRef }: Props) {
  return (
    <EntityTable
      rows={expenses}
      columns={columns}
      loading={loading}
      total={expenses.length}
      label="Expenses"
      selectedId={selectedId ?? undefined}
      focusedIndex={focusedIndex}
      onSelect={onSelect}
      listRef={listRef}
    />
  )
}
