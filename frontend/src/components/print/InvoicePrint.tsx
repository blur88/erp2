import React, { useState, useEffect, useRef } from 'react'
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  CircularProgress,
  Box,
  Alert,
} from '@mui/material'
import { Print as PrintIcon, Close as CloseIcon } from '@mui/icons-material'
import BasePrintTemplate from './BasePrintTemplate'
import { printSettingsApi } from '@/services/printSettingsApi'
import { useCurrency } from '@/hooks/useCurrency'
import { formatDate } from '@/utils/formatters'

interface InvoicePrintProps {
  open: boolean
  onClose: () => void
  invoice: any
}

const InvoicePrint: React.FC<InvoicePrintProps> = ({ open, onClose, invoice }) => {
  const { currency } = useCurrency()
  const [settings, setSettings] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const printRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (open) {
      fetchPrintSettings()
    }
  }, [open])

  const fetchPrintSettings = async () => {
    try {
      setLoading(true)
      setError(null)
      const response = await printSettingsApi.getPrintSettings()
      setSettings(response)
    } catch (err: any) {
      console.error('Error fetching print settings:', err)
      setError('Failed to load print settings')
    } finally {
      setLoading(false)
    }
  }

  const handlePrint = () => {
    window.print()
  }

  if (!invoice) return null

  // Prepare items
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
  const totalWithShipping = subtotal + (invoice.shippingAmount || 0)

  // Prepare totals
  const totals = {
    subtotal: subtotal,
    shipping: invoice.shippingAmount || 0,
    total: totalWithShipping,
    paid: invoice.paidAmount || 0,
    balance: totalWithShipping - (invoice.paidAmount || 0),
  }

  // Prepare recipient
  const recipient = {
    name: invoice.customer?.name || invoice.customerName || 'Unknown Customer',
    address: invoice.customer?.streetAddress || invoice.customer?.address || '',
    city: invoice.customer?.city || '',
    state: invoice.customer?.state || '',
    postalCode: invoice.customer?.postalCode || '',
    country: invoice.customer?.country || '',
    phone: invoice.customer?.phone || '',
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        Print Invoice - {invoice.invoiceNumber}
      </DialogTitle>
      <DialogContent>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
            <CircularProgress />
          </Box>
        ) : error ? (
          <Alert severity="error">{error}</Alert>
        ) : (
          <Box ref={printRef}>
            <BasePrintTemplate
              settings={settings}
              documentTitle="Invoice"
              documentNumber={invoice.invoiceNumber || ''}
              documentDate={formatDate(invoice.invoiceDate || invoice.issueDate || new Date())}
              recipient={recipient}
              items={items}
              totals={totals}
              notes={invoice.notes || ''}
              perPageFooter={settings?.salesPerPageFooter || ''}
              endOfDocFooter={settings?.salesEndOfDocFooter || ''}
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
          disabled={loading || !!error}
        >
          Print
        </Button>
      </DialogActions>
    </Dialog>
  )
}

export default InvoicePrint
