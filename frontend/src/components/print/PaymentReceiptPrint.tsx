import React, { useRef } from 'react'
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  CircularProgress,
  Box,
} from '@mui/material'
import { Print as PrintIcon, Close as CloseIcon } from '@mui/icons-material'
import BasePrintTemplate from './BasePrintTemplate'
import { useGetPrintSettingsQuery } from '@/store/api/printSettingsApi'
import { useCurrency } from '@/hooks/useCurrency'
import { formatDate } from '@/utils/formatters'

interface PaymentReceiptPrintProps {
  open: boolean
  onClose: () => void
  payment: any
}

const PaymentReceiptPrint: React.FC<PaymentReceiptPrintProps> = ({ open, onClose, payment }) => {
  const { currency } = useCurrency()
  const { data: printSettings, isLoading } = useGetPrintSettingsQuery()
  const printRef = useRef<HTMLDivElement>(null)

  const handlePrint = () => {
    window.print()
  }

  if (!payment) return null

  // Prepare items from invoice
  const invoice = payment.invoice || {}
  const items = (invoice.items || []).map((item: any) => {
    const quantity = item.quantity || 0
    const unitPrice = item.unitPrice || 0
    const lineSubtotal = quantity * unitPrice

    // Use totalAmount if available (already calculated), otherwise calculate based on discount
    let amount = item.totalAmount || lineSubtotal
    let discountValue = 0
    let discountDisplay = '-'

    // Invoice items use 'discount' field which is the calculated discount amount
    if (item.discount) {
      discountValue = item.discount
      amount = lineSubtotal - discountValue
      // Try to display as percentage if discountType is percentage
      if (item.discountType === 'percentage' && item.discountPercent) {
        discountDisplay = `${Number(item.discountPercent).toFixed(2)}%`
      } else {
        discountDisplay = `${currency} ${Number(discountValue).toFixed(2)}`
      }
    } else if (item.discountType === 'percentage' && item.discountPercent) {
      discountValue = item.discountAmount || (lineSubtotal * item.discountPercent / 100)
      amount = lineSubtotal - discountValue
      discountDisplay = `${Number(item.discountPercent).toFixed(2)}%`
    } else if (item.discountType === 'amount' && item.discountAmount) {
      discountValue = item.discountAmount
      amount = lineSubtotal - discountValue
      discountDisplay = `${currency} ${Number(discountValue).toFixed(2)}`
    }

    return {
      description: item.product?.name || item.productName || 'Unknown Product',
      quantity,
      unitPrice,
      discount: discountValue,
      discountDisplay,
      amount: Number(amount),
    }
  })

  // Calculate subtotal from items (sum of all line amounts after discount)
  const subtotal = items.reduce((sum, item) => sum + item.amount, 0)
  const invoiceTotal = subtotal + (invoice.shippingAmount || 0)

  // Prepare totals
  const totals = {
    subtotal: subtotal,
    shipping: invoice.shippingAmount || 0,
    total: invoiceTotal,
    paid: payment.amount || 0,
    balance: invoiceTotal - (payment.amount || 0),
  }

  // Prepare recipient
  const recipient = {
    name: payment.customer?.name || invoice.customer?.name || 'Unknown Customer',
    address: payment.customer?.streetAddress || invoice.customer?.streetAddress || payment.customer?.address || invoice.customer?.address || '',
    city: payment.customer?.city || invoice.customer?.city || '',
    state: payment.customer?.state || invoice.customer?.state || '',
    postalCode: payment.customer?.postalCode || invoice.customer?.postalCode || '',
    country: payment.customer?.country || invoice.customer?.country || '',
    phone: payment.customer?.phone || invoice.customer?.phone || '',
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        Print Payment Receipt - {payment.paymentNumber || payment.id}
      </DialogTitle>
      <DialogContent>
        {isLoading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
            <CircularProgress />
          </Box>
        ) : (
          <Box ref={printRef}>
            <BasePrintTemplate
              settings={printSettings}
              documentTitle="Payment Receipt"
              documentNumber={payment.paymentNumber || payment.id || ''}
              documentDate={formatDate(payment.paymentDate || new Date())}
              recipient={recipient}
              items={items}
              totals={totals}
              notes={payment.notes || ''}
              perPageFooter={printSettings?.salesPerPageFooter || ''}
              endOfDocFooter={printSettings?.salesEndOfDocFooter || ''}
              showDiscount={true}
              showPricing={true}
              currency={currency}
            />
          </Box>
        )}
      </DialogContent>
      <DialogActions sx={{ '@media print': { display: 'none' } }}>
        <Button onClick={onClose} startIcon={<CloseIcon />}>
          Close
        </Button>
        <Button
          onClick={handlePrint}
          variant="contained"
          startIcon={<PrintIcon />}
          disabled={isLoading}
        >
          Print
        </Button>
      </DialogActions>
    </Dialog>
  )
}

export default PaymentReceiptPrint
