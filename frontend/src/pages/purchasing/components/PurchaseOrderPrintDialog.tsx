import { useEffect, useState } from 'react'
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  Radio,
  RadioGroup,
  Typography,
} from '@mui/material'
import PrintIcon from '@mui/icons-material/Print'

import { PurchaseOrderPrint, VendorPaymentPrint } from '@/components/print'
import type { PurchaseOrder, VendorPayment } from '@/types'

type PrintKind = 'purchase-order' | 'vendor-payment'

interface PurchaseOrderPrintDialogProps {
  open: boolean
  onClose: () => void
  purchaseOrder: PurchaseOrder
  payment?: Partial<VendorPayment> | null
}

export default function PurchaseOrderPrintDialog({
  open,
  onClose,
  purchaseOrder,
  payment,
}: PurchaseOrderPrintDialogProps) {
  const [selectedKind, setSelectedKind] = useState<PrintKind>('purchase-order')
  const [purchaseOrderPrintOpen, setPurchaseOrderPrintOpen] = useState(false)
  const [vendorPaymentPrintOpen, setVendorPaymentPrintOpen] = useState(false)

  useEffect(() => {
    if (open) {
      setSelectedKind('purchase-order')
      setPurchaseOrderPrintOpen(false)
      setVendorPaymentPrintOpen(false)
    }
  }, [open])

  const handlePrint = () => {
    if (selectedKind === 'vendor-payment' && payment) {
      setVendorPaymentPrintOpen(true)
    } else {
      setPurchaseOrderPrintOpen(true)
    }
    onClose()
  }

  const printablePayment = payment
    ? {
        ...payment,
        purchaseOrder: payment.purchaseOrder ?? purchaseOrder,
        supplier: payment.supplier ?? purchaseOrder.supplier,
      }
    : null

  return (
    <>
      <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
        <DialogTitle>Print Purchase Order</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2 }}>
            Choose which document to print for {purchaseOrder.orderNumber}.
          </Typography>
          <RadioGroup
            value={selectedKind}
            onChange={(event) => setSelectedKind(event.target.value as PrintKind)}
          >
            <FormControlLabel
              value="purchase-order"
              control={<Radio />}
              label="Purchase Order"
            />
            <FormControlLabel
              value="vendor-payment"
              control={<Radio disabled={!payment} />}
              label="Vendor Payment"
            />
          </RadioGroup>
          {!payment && (
            <Box sx={{ mt: 1 }}>
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                No vendor payment is available for this order yet.
              </Typography>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>Close</Button>
          <Button
            variant="contained"
            startIcon={<PrintIcon />}
            onClick={handlePrint}
          >
            Print
          </Button>
        </DialogActions>
      </Dialog>

      {purchaseOrderPrintOpen && (
        <PurchaseOrderPrint
          open={purchaseOrderPrintOpen}
          onClose={() => setPurchaseOrderPrintOpen(false)}
          purchaseOrder={purchaseOrder}
        />
      )}

      {vendorPaymentPrintOpen && payment && (
        <VendorPaymentPrint
          open={vendorPaymentPrintOpen}
          onClose={() => setVendorPaymentPrintOpen(false)}
          payment={printablePayment}
        />
      )}
    </>
  )
}
