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

interface VendorPaymentPrintProps {
  open: boolean
  onClose: () => void
  payment: any
}

const VendorPaymentPrint: React.FC<VendorPaymentPrintProps> = ({ open, onClose, payment }) => {
  const { currency } = useCurrency()
  const { data: printSettings, isLoading } = useGetPrintSettingsQuery()
  const printRef = useRef<HTMLDivElement>(null)

  const handlePrint = () => {
    window.print()
  }

  if (!payment) return null

  // Prepare items from purchase order
  const purchaseOrder = payment.purchaseOrder || {}
  const items = (purchaseOrder.items || []).map((item: any) => ({
    description: item.product?.name || item.productName || 'Unknown Product',
    quantity: parseFloat(item.quantity) || 0,
    unitPrice: parseFloat(item.unitCost) || 0,
    discount: parseFloat(item.discountAmount) || 0,
    amount: parseFloat(item.totalAmount) || 0,
  }))

  // Prepare totals (follows payment receipt format)
  const poTotal = parseFloat(purchaseOrder.totalAmount) || 0
  const totals = {
    subtotal: parseFloat(purchaseOrder.subtotal) || 0,
    shipping: parseFloat(purchaseOrder.shippingAmount) || 0,
    total: poTotal,
    paid: parseFloat(payment.amount) || 0,
    balance: poTotal - (parseFloat(payment.amount) || 0),
  }

  // Prepare recipient (supplier)
  const recipient = {
    name: payment.supplier?.companyName || purchaseOrder.supplier?.companyName || 'Unknown Supplier',
    address: payment.supplier?.streetAddress || payment.supplier?.address || purchaseOrder.supplier?.streetAddress || purchaseOrder.supplier?.address || '',
    city: payment.supplier?.city || purchaseOrder.supplier?.city || '',
    state: payment.supplier?.state || purchaseOrder.supplier?.state || '',
    postalCode: payment.supplier?.postalCode || purchaseOrder.supplier?.postalCode || '',
    country: payment.supplier?.country || purchaseOrder.supplier?.country || '',
    phone: payment.supplier?.phone || purchaseOrder.supplier?.phone || '',
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        Print Vendor Payment - {purchaseOrder.orderNumber || payment.id}
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
              documentTitle="Vendor Payment"
              documentNumber={purchaseOrder.orderNumber || payment.id || ''}
              documentDate={formatDate(payment.paymentDate || new Date())}
              recipient={recipient}
              items={items}
              totals={totals}
              notes={payment.notes || ''}
              perPageFooter={printSettings?.purchasingPerPageFooter || ''}
              endOfDocFooter={printSettings?.purchasingEndOfDocFooter || ''}
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
          disabled={isLoading}
        >
          Print
        </Button>
      </DialogActions>
    </Dialog>
  )
}

export default VendorPaymentPrint
