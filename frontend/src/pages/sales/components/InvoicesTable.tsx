import React from 'react'

import EntityTable, { type ColumnConfig } from '@/components/common/EntityTable'

import type { InvoiceListItem } from '../hooks/invoicesPageState'

const COLUMNS: ColumnConfig<InvoiceListItem>[] = [
  { key: 'invoiceNumber', render: (invoice) => invoice.invoiceNumber },
]

interface InvoicesTableProps {
  invoices: InvoiceListItem[]
  loading: boolean
  total: number
  selectedInvoiceId?: string
  focusedInvoiceIndex: number
  onInvoiceSelect: (invoice: InvoiceListItem) => void
  invoiceListRef: React.RefObject<HTMLDivElement | null>
}

const InvoicesTable: React.FC<InvoicesTableProps> = ({
  invoices,
  loading,
  total,
  selectedInvoiceId,
  focusedInvoiceIndex,
  onInvoiceSelect,
  invoiceListRef,
}) => (
  <EntityTable
    rows={invoices}
    columns={COLUMNS}
    loading={loading}
    total={total}
    label="Invoice List"
    selectedId={selectedInvoiceId}
    focusedIndex={focusedInvoiceIndex}
    onSelect={onInvoiceSelect}
    listRef={invoiceListRef}
    dataAttr="invoice"
  />
)

export default InvoicesTable
