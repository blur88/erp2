import { Link } from '@mui/material'
import { Link as RouterLink } from 'react-router-dom'

import { DataTable, type Column, bold } from '@/components/common/DataTable'
import { useGetJournalEntriesQuery } from '@/store/api/accountingApi'
import type { JournalEntryLine } from '@/types'
import { formatCurrency, formatDate } from '@/utils/formatters'

interface PurchaseOrderJournalEntriesTabProps {
  orderId: string
}

export default function PurchaseOrderJournalEntriesTab({ orderId }: PurchaseOrderJournalEntriesTabProps) {
  const { data, isLoading, isError } = useGetJournalEntriesQuery({
    sourceType: 'purchase_order',
    sourceId: orderId,
  })
  const entries = data?.data ?? []

  const sumLines = (lines: JournalEntryLine[] | undefined, key: 'debitAmount' | 'creditAmount') =>
    (lines ?? []).reduce((sum: number, line: JournalEntryLine) => sum + Number(line[key]), 0)

  const columns: Column<(typeof entries)[number]>[] = [
    {
      header: 'Entry Number',
      width: '18%',
      render: (entry) =>
        bold(
          <Link
            component={RouterLink}
            to={`/accounting/journal-entries?sourceType=purchase_order&sourceId=${orderId}`}
          >
            {entry.referenceNumber}
          </Link>,
        ),
    },
    { header: 'Date', width: '16%', render: (entry) => formatDate(entry.entryDate) },
    { header: 'Description', width: '36%', render: (entry) => entry.description },
    {
      header: 'Debit',
      align: 'right',
      width: '15%',
      render: (entry) => formatCurrency(sumLines(entry.lines, 'debitAmount')),
    },
    {
      header: 'Credit',
      align: 'right',
      width: '15%',
      render: (entry) => formatCurrency(sumLines(entry.lines, 'creditAmount')),
    },
  ]

  return (
    <DataTable
      columns={columns}
      rows={entries}
      getRowKey={(entry) => entry.id}
      emptyText="No journal entries created for this purchase order."
      isLoading={isLoading}
      isError={isError}
      errorText="Failed to load journal entries."
    />
  )
}
