import JournalEntriesTab from '@/components/accounting/JournalEntriesTab'

interface PurchaseOrderJournalEntriesTabProps {
  orderId: string
}

export default function PurchaseOrderJournalEntriesTab({ orderId }: PurchaseOrderJournalEntriesTabProps) {
  return (
    <JournalEntriesTab
      sourceType="purchase_order"
      orderId={orderId}
      emptyText="No journal entries created for this purchase order."
    />
  )
}
