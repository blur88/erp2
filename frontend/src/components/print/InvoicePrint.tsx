import React from 'react'
import { Box, CircularProgress } from '@mui/material'
import BasePrintTemplate from './BasePrintTemplate'
import { useGetPrintSettingsQuery } from '@/store/api/printSettingsApi'
import { useCurrency } from '@/hooks/useCurrency'
import { formatDate } from '@/utils/formatters'

interface InvoicePrintProps {
  salesOrder: {
    orderNumber: string
    fulfilledAt: string
    subtotalAmount: number
    shippingAmount: number
    totalAmount: number
    customerName?: string
    items?: Array<{
      name: string
      quantity: number
      unitPrice: number
      total: number
    }>
  }
  paidTotal: number
}

const InvoicePrint: React.FC<InvoicePrintProps> = ({ salesOrder, paidTotal }) => {
  const { currency } = useCurrency()
  const { data: printSettings, isLoading } = useGetPrintSettingsQuery()

  const items = (salesOrder.items || []).map((item) => ({
    description: item.name,
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    amount: item.total,
  }))

  const subtotal = salesOrder.subtotalAmount
  const shipping = salesOrder.shippingAmount || 0
  const total = salesOrder.totalAmount
  const balanceDue = total - paidTotal

  const totals = {
    subtotal,
    shipping,
    total,
    paid: paidTotal,
    balance: balanceDue,
  }

  const recipient = {
    name: salesOrder.customerName || '',
    address: '',
    city: '',
    state: '',
    postalCode: '',
    country: '',
    phone: '',
  }

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
        <CircularProgress />
      </Box>
    )
  }

  return (
    <BasePrintTemplate
      settings={printSettings}
      documentTitle="Invoice"
      documentNumber={salesOrder.orderNumber}
      documentDate={formatDate(salesOrder.fulfilledAt)}
      recipient={recipient}
      items={items}
      totals={totals}
      perPageFooter={printSettings?.salesPerPageFooter || ''}
      endOfDocFooter={printSettings?.salesEndOfDocFooter || ''}
      showDiscount={false}
      showPricing={true}
      currency={currency}
    />
  )
}

export default InvoicePrint
