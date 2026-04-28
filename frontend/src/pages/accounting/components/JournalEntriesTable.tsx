import React from 'react'
import { Chip, Link, Typography } from '@mui/material'

import EntityTable, { type ColumnConfig } from '@/components/common/EntityTable'
import { EntityStatusChip } from '@/components/common/EntityStatusChip'
import { JournalEntry } from '@/types'
import { formatCurrency, formatDate } from '@/utils/formatters'

const ENTRY_TYPE_LABELS: Record<string, string> = {
  manual: 'Manual Entry',
  sales_order: 'Sales Order',
  payment: 'Customer Payment',
  settlement: 'Settlement',
  goods_received_note: 'Goods Receipt',
  vendor_payment: 'Vendor Payment',
  stock_adjustment: 'Stock Adjustment',
  owner_equity_transaction: 'Owner Equity',
  expense: 'Expense',
  opening_balance: 'Opening Balance',
  fund_transfer: 'Fund Transfer',
}

interface Props {
  entries: JournalEntry[]
  loading: boolean
  total: number
  selectedEntryId: string | null
  focusedIndex: number
  onSelect: (entry: JournalEntry) => void
  onViewSource: (sourceType: string, sourceId: string) => void
  listRef: React.RefObject<HTMLDivElement | null>
}

export function JournalEntriesTable({
  entries,
  loading,
  total,
  selectedEntryId,
  focusedIndex,
  onSelect,
  onViewSource,
  listRef,
}: Props) {
  const columns: ColumnConfig<JournalEntry>[] = [
    {
      key: 'reference',
      width: 120,
      render: (entry) => (
        <Typography variant="body2" sx={{ fontWeight: 500, color: 'primary.main', fontSize: '0.8rem' }}>
          {entry.referenceNumber}
        </Typography>
      ),
      raw: true,
    },
    {
      key: 'date',
      width: 90,
      render: (entry) => formatDate(entry.entryDate),
    },
    {
      key: 'description',
      render: (entry) => (
        <Typography variant="body2" sx={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '0.8rem' }}>
          {entry.description}
        </Typography>
      ),
      raw: true,
    },
    {
      key: 'type',
      width: 120,
      render: (entry) => (
        <Chip label={ENTRY_TYPE_LABELS[entry.sourceType ?? ''] ?? 'Manual Entry'} size="small" />
      ),
      raw: true,
    },
    {
      key: 'source',
      width: 120,
      render: (entry) =>
        entry.sourceType && entry.sourceType !== 'manual' && entry.sourceId ? (
          <Link
            component="button"
            variant="body2"
            onClick={(e) => { e.stopPropagation(); onViewSource(entry.sourceType!, entry.sourceId!) }}
          >
            View Source
          </Link>
        ) : null,
      raw: true,
    },
    {
      key: 'debits',
      width: 90,
      render: (entry) => (
        <Typography variant="body2" sx={{ textAlign: 'right', fontSize: '0.8rem' }}>
          {formatCurrency(entry.totalDebits)}
        </Typography>
      ),
      raw: true,
    },
    {
      key: 'credits',
      width: 90,
      render: (entry) => (
        <Typography variant="body2" sx={{ textAlign: 'right', fontSize: '0.8rem' }}>
          {formatCurrency(entry.totalCredits)}
        </Typography>
      ),
      raw: true,
    },
    {
      key: 'status',
      width: 90,
      render: (entry) => <EntityStatusChip status={entry.status} />,
      raw: true,
    },
  ]

  return (
    <EntityTable
      rows={entries}
      columns={columns}
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
