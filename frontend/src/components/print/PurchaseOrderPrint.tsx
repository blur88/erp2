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

interface PurchaseOrderPrintProps {
  open: boolean
  onClose: () => void
  purchaseOrder: any
}

const PurchaseOrderPrint: React.FC<PurchaseOrderPrintProps> = ({ open, onClose, purchaseOrder }) => {
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

  if (!purchaseOrder) return null

  // Prepare items (no discount for purchasing)
  const items = (purchaseOrder.items || []).map((item: any) => ({
    description: item.product?.name || item.productName || 'Unknown Product',
    quantity: item.quantity || 0,
    unitPrice: item.unitPrice || 0,
    discount: 0,
    amount: (item.quantity || 0) * (item.unitPrice || 0),
  }))

  // Prepare totals
  const totals = {
    subtotal: purchaseOrder.subtotal || 0,
    shipping: purchaseOrder.shippingAmount || 0,
    total: purchaseOrder.totalAmount || 0,
  }

  // Prepare recipient (supplier)
  const recipient = {
    name: purchaseOrder.supplier?.companyName || purchaseOrder.supplierName || 'Unknown Supplier',
    address: purchaseOrder.supplier?.address || '',
    city: purchaseOrder.supplier?.city || '',
    state: purchaseOrder.supplier?.state || '',
    postalCode: purchaseOrder.supplier?.postalCode || '',
    country: purchaseOrder.supplier?.country || '',
    phone: purchaseOrder.supplier?.phone || '',
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        Print Purchase Order - {purchaseOrder.orderNumber}
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
              documentTitle="Purchase Order"
              documentNumber={purchaseOrder.orderNumber || ''}
              documentDate={formatDate(purchaseOrder.orderDate || new Date())}
              recipient={recipient}
              items={items}
              totals={totals}
              notes={purchaseOrder.notes || ''}
              perPageFooter={settings?.purchasingPerPageFooter || ''}
              endOfDocFooter={settings?.purchasingEndOfDocFooter || ''}
              showDiscount={false}
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

export default PurchaseOrderPrint
