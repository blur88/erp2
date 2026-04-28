import React from 'react'

import EntityTable, { type ColumnConfig } from '@/components/common/EntityTable'
import { JournalEntry } from '@/types'

const COLUMNS: ColumnConfig<JournalEntry>[] = [
  { key: 'reference', render: (entry) => entry.referenceNumber },
]

interface Props {
  entries: JournalEntry[]
  loading: boolean
  total: number
  selectedEntryId: string | null
  focusedIndex: number
  onSelect: (entry: JournalEntry) => void
  listRef: React.RefObject<HTMLDivElement | null>
}

export function JournalEntriesTable({
  entries,
  loading,
  total,
  selectedEntryId,
  focusedIndex,
  onSelect,
  listRef,
}: Props) {
  return (
    <EntityTable
      rows={entries}
      columns={COLUMNS}
      loading={loading}
      total={total}
      label="Journal Entries"
      selectedId={selectedEntryId ?? undefined}
      focusedIndex={focusedIndex}
      onSelect={onSelect}
      listRef={listRef}
      dataAttr="journal-entry"
    />
  )
}
