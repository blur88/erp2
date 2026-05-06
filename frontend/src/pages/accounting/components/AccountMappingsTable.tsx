import React from 'react'
import { Chip } from '@mui/material'

import EntityTable, { type ColumnConfig } from '@/components/common/EntityTable'
import type { AccountMapping } from '@/types/accountMapping'

export type MappingRow = {
  id: string
  mappingType: string
  label: string
  category: string
  description: string
  mapping: AccountMapping | undefined
}

const COLUMNS: ColumnConfig<MappingRow>[] = [
  {
    key: 'category',
    width: 140,
    render: (row) => (
      <Chip size="small" label={row.category} color="primary" variant="outlined" />
    ),
  },
  {
    key: 'label',
    render: (row) => row.label,
  },
]

interface Props {
  rows: MappingRow[]
  loading: boolean
  selectedId: string | null
  focusedIndex: number
  onSelect: (row: MappingRow) => void
  listRef: React.RefObject<HTMLDivElement | null>
}

export function AccountMappingsTable({ rows, loading, selectedId, focusedIndex, onSelect, listRef }: Props) {
  return (
    <EntityTable
      rows={rows}
      columns={COLUMNS}
      loading={loading}
      total={rows.length}
      label="Account Mappings List"
      selectedId={selectedId ?? undefined}
      focusedIndex={focusedIndex}
      onSelect={onSelect}
      listRef={listRef}
      dataAttr="mapping"
    />
  )
}
