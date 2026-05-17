import type { RefObject } from 'react'
import { Chip } from '@mui/material'

import EntityTable, { type ColumnConfig } from '@/components/common/EntityTable'
import type { FundTransfer } from '@/types'

interface Props {
  transfers: FundTransfer[]
  loading: boolean
  selectedId: string | null
  focusedIndex: number
  onSelect: (item: FundTransfer) => void
  listRef: RefObject<HTMLDivElement | null>
}

function statusColor(status: string) {
  if (status === 'posted') return 'success' as const
  if (status === 'reversed') return 'error' as const
  return 'warning' as const  // draft
}

const columns: ColumnConfig<FundTransfer>[] = [
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

export function FundTransfersList({ transfers, loading, selectedId, focusedIndex, onSelect, listRef }: Props) {
  return (
    <EntityTable
      rows={transfers}
      columns={columns}
      loading={loading}
      total={transfers.length}
      label="Fund Transfers"
      selectedId={selectedId ?? undefined}
      focusedIndex={focusedIndex}
      onSelect={onSelect}
      listRef={listRef}
    />
  )
}
