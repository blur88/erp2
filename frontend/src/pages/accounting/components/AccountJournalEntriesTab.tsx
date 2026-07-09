import { DataTable, type Column } from '@/components/common/DataTable'
import { useGetChartOfAccountRecentActivityQuery } from '@/store/api/accountingApi'
import type { RecentActivityItem } from '@/types'
import { formatCurrency, formatDate } from '@/utils/formatters'

export default function AccountJournalEntriesTab({ accountId }: { accountId: string }) {
  const { data, isLoading, isError } = useGetChartOfAccountRecentActivityQuery({ id: accountId })
  const rows = data ?? []

  const columns: Column<RecentActivityItem>[] = [
    { header: 'Date', render: (r) => formatDate(r.date) },
    { header: 'Reference', render: (r) => r.reference },
    { header: 'Description', render: (r) => r.description },
    { header: 'Debit', render: (r) => r.debit != null ? formatCurrency(r.debit) : '—', align: 'right' },
    { header: 'Credit', render: (r) => r.credit != null ? formatCurrency(r.credit) : '—', align: 'right' },
  ]

  return (
    <DataTable
      columns={columns}
      rows={rows}
      getRowKey={(r) => r.date + r.reference}
      emptyText="No posted journal entries for this account."
      isLoading={isLoading}
      isError={isError}
      errorText="Failed to load journal entries."
    />
  )
}