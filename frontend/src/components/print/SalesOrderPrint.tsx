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
import { default as PrintIcon } from '@mui/icons-material/Print'
import { default as CloseIcon } from '@mui/icons-material/Close'
import BasePrintTemplate from './BasePrintTemplate'
import { useGetPrintSettingsQuery } from '@/store/api/printSettingsApi'
import { useCurrency } from '@/hooks/useCurrency'
import { formatDate } from '@/utils/formatters'

interface SalesOrderPrintProps {
  open: boolean
  onClose: () => void
  salesOrder: any
}

const SalesOrderPrint: React.FC<SalesOrderPrintProps> = ({ open, onClose, salesOrder }) => {
  const { currency } = useCurrency()
  const { data: printSettings, isLoading } = useGetPrintSettingsQuery()
  const printRef = useRef<HTMLDivElement>(null)

  const handlePrint = () => {
    window.print()
  }

  if (!salesOrder) return null

  // Prepare items
  const items = (salesOrder.items || []).map((item: any) => {
    const quantity = item.quantity || 0
    const unitPrice = item.unitPrice || 0
    const lineSubtotal = quantity * unitPrice

    // Use totalAmount if available (already calculated), otherwise calculate based on discount type
    let amount = item.totalAmount || lineSubtotal
    let discountValue = 0
    let discountDisplay = '-'

    if (item.discountType === 'percentage' && item.discountPercent) {
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

  // Prepare totals
  const totals = {
    subtotal: subtotal,
    shipping: salesOrder.shippingAmount || 0,
    total: subtotal + (salesOrder.shippingAmount || 0),
  }

  // Prepare recipient
  const recipient = {
    name: salesOrder.customer?.name || salesOrder.customerName || 'Unknown Customer',
    address: salesOrder.customer?.streetAddress || salesOrder.customer?.address || '',
    city: salesOrder.customer?.city || '',
    state: salesOrder.customer?.state || '',
    postalCode: salesOrder.customer?.postalCode || '',
    country: salesOrder.customer?.country || '',
    phone: salesOrder.customer?.phone || '',
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        Print Sales Order - {salesOrder.orderNumber}
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
              documentTitle="Sales Order"
              documentNumber={salesOrder.orderNumber || ''}
              documentDate={formatDate(salesOrder.orderDate || new Date())}
              recipient={recipient}
              items={items}
              totals={totals}
              notes={salesOrder.notes || ''}
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

export default SalesOrderPrint
