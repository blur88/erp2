import React from 'react'

import EntityTable, { type ColumnConfig } from '@/components/common/EntityTable'

import type { PaymentListItem } from '../hooks/usePaymentsWorkspace'

const COLUMNS: ColumnConfig<PaymentListItem>[] = [
  { key: 'paymentNumber', render: (payment) => payment.paymentNumber },
]

interface PaymentsTableProps {
  payments: PaymentListItem[]
  loading: boolean
  total: number
  selectedPaymentId?: string
  focusedPaymentIndex: number
  onPaymentSelect: (payment: PaymentListItem) => void
  paymentListRef: React.RefObject<HTMLDivElement | null>
}

const PaymentsTable: React.FC<PaymentsTableProps> = ({
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
    label="Payment List"
    selectedId={selectedPaymentId}
    focusedIndex={focusedPaymentIndex}
    onSelect={onPaymentSelect}
    listRef={paymentListRef}
    dataAttr="payment"
  />
)

export default PaymentsTable
