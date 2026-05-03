import type { RefObject } from 'react'
import { Chip } from '@mui/material'

import EntityTable, { type ColumnConfig } from '@/components/common/EntityTable'
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
  return status === 'posted' ? 'success' as const : 'default' as const
}

const columns: ColumnConfig<ExpenseRecord>[] = [
  {
    key: 'reference',
    render: (row) => row.referenceNumber,
    width: '60%',
  },
  {
    key: 'status',
    raw: true,
    render: (row) => (
      <Chip label={row.status} color={statusColor(row.status)} size="small" />
    ),
    width: '40%',
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
