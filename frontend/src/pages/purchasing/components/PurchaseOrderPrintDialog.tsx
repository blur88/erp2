import React, { useState } from 'react'
import {
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormControlLabel,
  Radio,
  RadioGroup,
  Tooltip,
} from '@mui/material'
import PrintIcon from '@mui/icons-material/Print'
import CloseIcon from '@mui/icons-material/Close'

import BasePrintTemplate from '@/components/print/BasePrintTemplate'
import { useGetPrintSettingsQuery } from '@/store/api/printSettingsApi'
import { useCurrency } from '@/hooks/useCurrency'
import { formatDate } from '@/utils/formatters'
import type { PurchaseOrder, VendorPayment } from '@/types'

// The PO response DTO returns the supplier FLATTENED (address/city/...),
// not the global Supplier entity shape (shipping*/billing*).
// All PrintSupplier fields are optional, so any object is structurally
// assignable — callers pass PurchaseOrder which has Supplier? for supplier.
export interface PrintSupplier {
  companyName?: string | null
  address?: string | null
  city?: string | null
  state?: string | null
  postalCode?: string | null
  country?: string | null
  phone?: string | null
}

// PO line item as returned by the PO response DTO: numeric fields, product.name,
// plus a description fallback. unitCost is a legacy fallback for unitPrice.
export interface PrintPurchaseOrderItem {
  id?: string
  product?: { id?: string; name?: string }
  description?: string
  quantity?: number
  unitPrice?: number
  unitCost?: number
  discountAmount?: number
  totalAmount?: number
}

export type PurchaseOrderPrintData = Omit<PurchaseOrder, 'supplier' | 'items'> & {
  supplier?: PrintSupplier
  items?: PrintPurchaseOrderItem[]
}

interface PurchaseOrderPrintDialogProps {
  open: boolean
  onClose: () => void
  purchaseOrder: PurchaseOrderPrintData
  payment?: Partial<VendorPayment> | null
}

const toRecipient = (s?: PrintSupplier) => ({
  name: s?.companyName || 'Unknown Supplier',
  address: s?.address || '',
  city: s?.city || '',
  state: s?.state || '',
  postalCode: s?.postalCode || '',
  country: s?.country || '',
  phone: s?.phone || '',
})

const itemDescription = (item: PrintPurchaseOrderItem) =>
  item.product?.name || item.description || 'Unknown Product'

const PurchaseOrderPrintDialog: React.FC<PurchaseOrderPrintDialogProps> = ({
  open,
  onClose,
  purchaseOrder,
  payment,
}) => {
  const [printType, setPrintType] = useState<'purchase_order' | 'vendor_payment'>(
    'purchase_order',
  )
  const { currency } = useCurrency()
  const { data: printSettings, isLoading } = useGetPrintSettingsQuery()

  const hasPayment = !!payment

  const printablePayment = payment
    ? {
        ...payment,
        purchaseOrder: (payment.purchaseOrder ?? purchaseOrder) as PurchaseOrderPrintData,
      }
    : null

  const handlePrint = () => {
    window.print()
  }

  const renderPurchaseOrderContent = () => {
    const items = (purchaseOrder.items || []).map((item) => {
      const quantity = Number(item.quantity ?? 0)
      const unitPrice = Number(item.unitPrice ?? item.unitCost ?? 0)
      return {
        description: itemDescription(item),
        quantity,
        unitPrice,
        discount: 0,
        amount: quantity * unitPrice,
      }
    })

    const totals = {
      subtotal: Number(purchaseOrder.subtotal ?? 0),
      shipping: Number(purchaseOrder.shippingAmount ?? 0),
      total: Number(purchaseOrder.totalAmount ?? 0),
    }

    return (
      <BasePrintTemplate
        settings={printSettings}
        documentTitle="Purchase Order"
        documentNumber={purchaseOrder.orderNumber || ''}
        documentDate={formatDate(purchaseOrder.orderDate || new Date())}
        recipient={toRecipient(purchaseOrder.supplier)}
        items={items}
        totals={totals}
        notes={purchaseOrder.notes || ''}
        perPageFooter={printSettings?.purchasingPerPageFooter || ''}
        endOfDocFooter={printSettings?.purchasingEndOfDocFooter || ''}
        showDiscount={false}
        showPricing={true}
        currency={currency}
      />
    )
  }

  const renderVendorPaymentContent = () => {
    const po = printablePayment?.purchaseOrder
    const items = (po?.items || []).map((item) => ({
      description: itemDescription(item),
      quantity: Number(item.quantity ?? 0),
      unitPrice: Number(item.unitPrice ?? item.unitCost ?? 0),
      discount: Number(item.discountAmount ?? 0),
      amount: Number(item.totalAmount ?? 0),
    }))

    const total = Number(po?.totalAmount ?? 0)
    const paid = Number(printablePayment?.amount ?? 0)
    const totals = {
      subtotal: Number(po?.subtotal ?? 0),
      shipping: Number(po?.shippingAmount ?? 0),
      total,
      paid,
      balance: total - paid,
    }

    return (
      <BasePrintTemplate
        settings={printSettings}
        documentTitle="Vendor Payment"
        documentNumber={po?.orderNumber || printablePayment?.id || ''}
        documentDate={formatDate(printablePayment?.paymentDate || new Date())}
        recipient={toRecipient(po?.supplier)}
        items={items}
        totals={totals}
        notes={printablePayment?.notes || ''}
        perPageFooter={printSettings?.purchasingPerPageFooter || ''}
        endOfDocFooter={printSettings?.purchasingEndOfDocFooter || ''}
        showDiscount={false}
        showPricing={true}
        currency={currency}
      />
    )
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>Print Options</DialogTitle>
      <DialogContent>
        <FormControl className="print-chrome" sx={{ mb: 2 }}>
          <RadioGroup
            value={printType}
            onChange={(_, value) =>
              setPrintType(value as 'purchase_order' | 'vendor_payment')
            }
            row
          >
            <FormControlLabel
              value="purchase_order"
              control={<Radio />}
              label="Purchase Order"
            />
            <Tooltip title={!hasPayment ? 'No vendor payment available for this order yet' : ''}>
              <span>
                <FormControlLabel
                  value="vendor_payment"
                  control={<Radio />}
                  label="Vendor Payment"
                  disabled={!hasPayment}
                />
              </span>
            </Tooltip>
          </RadioGroup>
        </FormControl>

        {isLoading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
            <CircularProgress />
          </Box>
        ) : (
          <Box className="print-root" data-testid="print-root">
            {printType === 'vendor_payment'
              ? renderVendorPaymentContent()
              : renderPurchaseOrderContent()}
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

export default PurchaseOrderPrintDialog
