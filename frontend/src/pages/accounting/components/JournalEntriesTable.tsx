import { useRef, type RefObject } from 'react'
import { Chip, Link, Typography } from '@mui/material'

import EntityTable, { type ColumnConfig } from '@/components/common/EntityTable'
import { JournalEntry, JournalEntryStatus } from '@/types'
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

function statusColor(status: JournalEntryStatus) {
  if (status === JournalEntryStatus.POSTED) return 'success' as const
  if (status === JournalEntryStatus.REVERSED) return 'error' as const
  return 'default' as const
}

interface Props {
  entries: JournalEntry[]
  loading: boolean
  selectedEntryId: string | null
  onSelect: (entry: JournalEntry) => void
  onViewSource?: (sourceType: string, sourceId: string) => void
  listRef?: RefObject<HTMLDivElement | null>
}

export function JournalEntriesTable({
  entries,
  loading,
  selectedEntryId,
  onSelect,
  onViewSource,
  listRef,
}: Props) {
  const fallbackRef = useRef<HTMLDivElement | null>(null)

  const columns: ColumnConfig<JournalEntry>[] = [
    {
      key: 'referenceNumber',
      raw: true,
      render: (entry) => (
        <Typography variant="body2" sx={{ fontWeight: 500, color: 'primary.main', fontSize: '0.8rem' }}>
          {entry.referenceNumber}
        </Typography>
      ),
    },
    {
      key: 'entryDate',
      render: (entry) => formatDate(entry.entryDate),
    },
    {
      key: 'description',
      render: (entry) => entry.description,
    },
    {
      key: 'sourceType',
      raw: true,
      render: (entry) => (
        <Chip label={ENTRY_TYPE_LABELS[entry.sourceType ?? ''] ?? 'Manual Entry'} size="small" />
      ),
    },
    {
      key: 'source',
      raw: true,
      render: (entry) => (
        entry.sourceType && entry.sourceType !== 'manual' && entry.sourceId && onViewSource
          ? (
              <Link
                component="button"
                variant="body2"
                onClick={(event) => {
                  event.stopPropagation()
                  onViewSource(entry.sourceType!, entry.sourceId!)
                }}
              >
                View Transaction
              </Link>
            )
          : null
      ),
    },
    {
      key: 'totalDebits',
      render: (entry) => formatCurrency(entry.totalDebits),
    },
    {
      key: 'totalCredits',
      render: (entry) => formatCurrency(entry.totalCredits),
    },
    {
      key: 'status',
      raw: true,
      render: (entry) => (
        <Chip label={entry.status} color={statusColor(entry.status)} size="small" />
      ),
    },
  ]

  return (
    <EntityTable
      rows={entries}
      columns={columns}
      loading={loading}
      total={entries.length}
      label="Journal Entries"
      selectedId={selectedEntryId ?? undefined}
      focusedIndex={-1}
      onSelect={onSelect}
      listRef={listRef ?? fallbackRef}
      dataAttr="entry"
    />
  )
}
