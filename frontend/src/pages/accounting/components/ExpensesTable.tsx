import type { RefObject } from 'react'

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

const columns: ColumnConfig<ExpenseRecord>[] = [
  {
    key: 'reference',
    render: (row) => row.referenceNumber,
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
