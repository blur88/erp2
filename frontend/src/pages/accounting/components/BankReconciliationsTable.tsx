import React from 'react'
import { Box, Typography } from '@mui/material'
import { format } from 'date-fns'

import EntityTable, { type ColumnConfig } from '@/components/common/EntityTable'
import { BankReconciliation } from '@/types'

const COLUMNS: ColumnConfig<BankReconciliation>[] = [
  {
    key: 'account',
    raw: true,
    render: (item) => (
      <Box>
        <Typography variant="body2" sx={{ fontWeight: 500, fontSize: '0.8rem', lineHeight: 1.3 }}>
          {item.account?.name ?? '-'}
        </Typography>
        <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.75rem' }}>
          {format(new Date(item.reconciliationDate), 'MMMM yyyy')}
        </Typography>
      </Box>
    ),
  },
]

interface Props {
  reconciliations: BankReconciliation[]
  loading: boolean
  total: number
  selectedId: string | null
  focusedIndex: number
  onSelect: (item: BankReconciliation) => void
  listRef: React.RefObject<HTMLDivElement | null>
}

export function BankReconciliationsTable({
  reconciliations,
  loading,
  total,
  selectedId,
  focusedIndex,
  onSelect,
  listRef,
}: Props) {
  return (
    <EntityTable
      rows={reconciliations}
      columns={COLUMNS}
      loading={loading}
      total={total}
      label="Reconciliations"
      selectedId={selectedId ?? undefined}
      focusedIndex={focusedIndex}
      onSelect={onSelect}
      listRef={listRef}
      dataAttr="reconciliation"
    />
  )
}
