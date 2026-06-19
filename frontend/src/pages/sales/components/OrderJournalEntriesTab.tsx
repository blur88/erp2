import JournalEntriesTab from '@/components/accounting/JournalEntriesTab'

interface OrderJournalEntriesTabProps {
  orderId: string
}

export default function OrderJournalEntriesTab({ orderId }: OrderJournalEntriesTabProps) {
  return (
    <JournalEntriesTab
      sourceType="sales_order"
      orderId={orderId}
      emptyText="No journal entries created for this sales order."
    />
  )
}
