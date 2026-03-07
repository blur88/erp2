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

interface GRNPrintProps {
  open: boolean
  onClose: () => void
  grn: any
}

const GRNPrint: React.FC<GRNPrintProps> = ({ open, onClose, grn }) => {
  const { currency } = useCurrency()
  const { data: printSettings, isLoading } = useGetPrintSettingsQuery()
  const printRef = useRef<HTMLDivElement>(null)

  const handlePrint = () => {
    window.print()
  }

  if (!grn) return null

  // Prepare items (GRN only shows product and quantity, no pricing)
  const items = (grn.items || []).map((item: any) => ({
    description: item.purchaseOrderItem?.product?.name || item.product?.name || item.productName || 'Unknown Product',
    quantity: item.receivedQuantity || item.quantity || 0,
    unitPrice: 0,
    discount: 0,
    amount: 0,
  }))

  // GRN doesn't show pricing
  const totals = {
    subtotal: 0,
    total: 0,
  }

  // Prepare recipient (supplier from purchase order)
  const purchaseOrder = grn.purchaseOrder || {}
  const recipient = {
    name: purchaseOrder.supplier?.companyName || grn.supplier?.companyName || 'Unknown Supplier',
    address: purchaseOrder.supplier?.address || grn.supplier?.address || '',
    city: purchaseOrder.supplier?.city || grn.supplier?.city || '',
    state: purchaseOrder.supplier?.state || grn.supplier?.state || '',
    postalCode: purchaseOrder.supplier?.postalCode || grn.supplier?.postalCode || '',
    country: purchaseOrder.supplier?.country || grn.supplier?.country || '',
    phone: purchaseOrder.supplier?.phone || grn.supplier?.phone || '',
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        Print Goods Received Note - {purchaseOrder.orderNumber || grn.id}
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
              documentTitle="Goods Received Note"
              documentNumber={purchaseOrder.orderNumber || grn.id || ''}
              documentDate={formatDate(grn.receivedDate || new Date())}
              recipient={recipient}
              items={items}
              totals={totals}
              notes={grn.notes || ''}
              perPageFooter={printSettings?.purchasingPerPageFooter || ''}
              endOfDocFooter={printSettings?.purchasingEndOfDocFooter || ''}
              showDiscount={false}
              showPricing={false}
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

export default GRNPrint
