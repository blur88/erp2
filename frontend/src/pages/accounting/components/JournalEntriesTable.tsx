import { useRef, type RefObject } from 'react'
import { Typography } from '@mui/material'

import EntityTable, { type ColumnConfig } from '@/components/common/EntityTable'
import { JournalEntry } from '@/types'

const COLUMNS: ColumnConfig<JournalEntry>[] = [
  {
    key: 'referenceNumber',
    raw: true,
    render: (entry) => (
      <Typography variant="body2" sx={{ fontWeight: 500, color: 'primary.main', fontSize: '0.8rem' }}>
        {entry.referenceNumber}
      </Typography>
    ),
  },
]

interface Props {
  entries: JournalEntry[]
  loading: boolean
  total: number
  selectedEntryId: string | null
  onSelect: (entry: JournalEntry) => void
  listRef?: RefObject<HTMLDivElement | null>
}

export function JournalEntriesTable({
  entries,
  loading,
  total,
  selectedEntryId,
  onSelect,
  listRef,
}: Props) {
  const fallbackRef = useRef<HTMLDivElement | null>(null)

  return (
    <EntityTable
      rows={entries}
      columns={COLUMNS}
      loading={loading}
      total={total}
      label="Journal Entries"
      selectedId={selectedEntryId ?? undefined}
      focusedIndex={-1}
      onSelect={onSelect}
      listRef={listRef ?? fallbackRef}
      dataAttr="entry"
    />
  )
}
