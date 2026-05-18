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
      <Typography variant="body2" noWrap sx={{ fontWeight: 500, fontSize: '0.8rem' }}>
        {item.account?.name ?? '-'}
        <Box component="span" sx={{ color: 'text.secondary', fontWeight: 400 }}>
          {' • '}
          {format(new Date(item.reconciliationDate), 'MMMM yyyy')}
        </Box>
      </Typography>
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
