import React from 'react'

import EntityTable, { type ColumnConfig } from '@/components/common/EntityTable'
import type { VendorPayment } from '@/types'

const COLUMNS: ColumnConfig<VendorPayment>[] = [
  { key: 'paymentNumber', render: (payment) => payment.paymentNumber },
]

interface VendorPaymentTableProps {
  payments: VendorPayment[]
  loading: boolean
  total: number
  selectedPaymentId?: string
  focusedPaymentIndex: number
  onPaymentSelect: (payment: VendorPayment) => void
  paymentListRef: React.RefObject<HTMLDivElement | null>
}

const VendorPaymentTable: React.FC<VendorPaymentTableProps> = ({
  payments,
  loading,
  total,
  selectedPaymentId,
  focusedPaymentIndex,
  onPaymentSelect,
  paymentListRef,
}) => (
  <EntityTable
    rows={payments}
    columns={COLUMNS}
    loading={loading}
    total={total}
    label="Vendor Payments"
    selectedId={selectedPaymentId}
    focusedIndex={focusedPaymentIndex}
    onSelect={onPaymentSelect}
    listRef={paymentListRef}
    dataAttr="payment"
  />
)

export default VendorPaymentTable
