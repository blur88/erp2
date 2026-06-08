import React, { useState } from 'react';
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
} from '@mui/material';
import { default as PrintIcon } from '@mui/icons-material/Print';
import { default as CloseIcon } from '@mui/icons-material/Close';

import BasePrintTemplate from '@/components/print/BasePrintTemplate';
import InvoicePrint from '@/components/print/InvoicePrint';
import { useGetPrintSettingsQuery } from '@/store/api/printSettingsApi';
import { useCurrency } from '@/hooks/useCurrency';
import { formatDate } from '@/utils/formatters';
import type { SalesOrder } from '@/types';

interface SalesOrderPrintDialogProps {
  open: boolean;
  salesOrder: SalesOrder;
  onClose: () => void;
}

function mapPrintItems(items: any[], currency: string) {
  return (items || []).map((item: any) => {
    const quantity = item.quantity || 0;
    const unitPrice = item.unitPrice || 0;
    const lineSubtotal = quantity * unitPrice;

    let amount = item.totalAmount || lineSubtotal;
    let discountValue = 0;
    let discountDisplay = '-';

    if (item.discountType === 'percentage' && item.discountPercent) {
      discountValue = item.discountAmount || (lineSubtotal * item.discountPercent) / 100;
      amount = lineSubtotal - discountValue;
      discountDisplay = `${Number(item.discountPercent).toFixed(2)}%`;
    } else if (item.discountType === 'amount' && item.discountAmount) {
      discountValue = item.discountAmount;
      amount = lineSubtotal - discountValue;
      discountDisplay = `${currency} ${Number(discountValue).toFixed(2)}`;
    }

    return {
      description: item.product?.name || item.productName || 'Unknown Product',
      quantity,
      unitPrice,
      discount: discountValue,
      discountDisplay,
      amount: Number(amount),
    };
  });
}

const SalesOrderPrintDialog: React.FC<SalesOrderPrintDialogProps> = ({
  open,
  salesOrder,
  onClose,
}) => {
  const [printType, setPrintType] = useState<'sales_order' | 'invoice' | 'payment_receipt'>(
    'sales_order',
  );
  const { currency } = useCurrency();
  const { data: printSettings, isLoading } = useGetPrintSettingsQuery();

  const isFulfilled = salesOrder.status === 'FULFILLED';
  const paidAmount = salesOrder.paidAmount ?? 0;

  const handlePrint = () => {
    window.print();
  };

  const renderSalesOrderContent = () => {
    const items = mapPrintItems(salesOrder.items || [], currency);

    const subtotal = items.reduce((sum, item) => sum + item.amount, 0);
    const totals = {
      subtotal,
      shipping: salesOrder.shippingAmount || 0,
      total: subtotal + (salesOrder.shippingAmount || 0),
    };

    const recipient = {
      name: salesOrder.customer?.name || 'Unknown Customer',
      address:
        salesOrder.customer?.shippingStreetAddress ||
        salesOrder.customer?.billingStreetAddress ||
        '',
      city: salesOrder.customer?.shippingCity || salesOrder.customer?.billingCity || '',
      state: salesOrder.customer?.shippingState || salesOrder.customer?.billingState || '',
      postalCode:
        salesOrder.customer?.shippingPostalCode || salesOrder.customer?.billingPostalCode || '',
      country: salesOrder.customer?.shippingCountry || salesOrder.customer?.billingCountry || '',
      phone: salesOrder.customer?.phone || '',
    };

    return (
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
    );
  };

  const renderPaymentReceiptContent = () => {
    const items = mapPrintItems(salesOrder.items || [], currency);
    const subtotal = items.reduce((sum, item) => sum + item.amount, 0);
    const shipping = salesOrder.shippingAmount || 0;
    const total = subtotal + shipping;
    const payments = salesOrder.payments || [];
    const latestPaymentDate =
      payments.length > 0
        ? payments.reduce(
            (latest, payment) =>
              new Date(payment.paymentDate) > new Date(latest) ? payment.paymentDate : latest,
            payments[0].paymentDate,
          )
        : salesOrder.orderDate || new Date();

    const totals = {
      subtotal,
      shipping,
      total,
      paid: paidAmount,
      balance: total - paidAmount,
    };

    const recipient = {
      name: salesOrder.customer?.name || 'Unknown Customer',
      address:
        salesOrder.customer?.shippingStreetAddress ||
        salesOrder.customer?.billingStreetAddress ||
        '',
      city: salesOrder.customer?.shippingCity || salesOrder.customer?.billingCity || '',
      state: salesOrder.customer?.shippingState || salesOrder.customer?.billingState || '',
      postalCode:
        salesOrder.customer?.shippingPostalCode || salesOrder.customer?.billingPostalCode || '',
      country: salesOrder.customer?.shippingCountry || salesOrder.customer?.billingCountry || '',
      phone: salesOrder.customer?.phone || '',
    };

    return (
      <BasePrintTemplate
        settings={printSettings}
        documentTitle="Payment Receipt"
        documentNumber={salesOrder.orderNumber || ''}
        documentDate={formatDate(latestPaymentDate)}
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
    );
  };

  const renderInvoiceContent = () => {
    const items = mapPrintItems(salesOrder.items || [], currency).map((item) => {
      return {
        name: item.description,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        discount: item.discount,
        discountDisplay: item.discountDisplay,
        total: item.amount,
      };
    });

    return (
      <InvoicePrint
        salesOrder={{
          orderNumber: salesOrder.orderNumber,
          fulfilledAt: (salesOrder.fulfilledAt || salesOrder.fulfilledDate || '') as string,
          subtotalAmount: salesOrder.subtotal ?? salesOrder.totalAmount ?? 0,
          shippingAmount: salesOrder.shippingAmount ?? 0,
          totalAmount: salesOrder.totalAmount ?? 0,
          customerName: salesOrder.customer?.name ?? '',
          customerAddress:
            salesOrder.customer?.shippingStreetAddress ||
            salesOrder.customer?.billingStreetAddress ||
            '',
          customerCity: salesOrder.customer?.shippingCity || salesOrder.customer?.billingCity || '',
          customerState:
            salesOrder.customer?.shippingState || salesOrder.customer?.billingState || '',
          customerPostalCode:
            salesOrder.customer?.shippingPostalCode ||
            salesOrder.customer?.billingPostalCode ||
            '',
          customerCountry:
            salesOrder.customer?.shippingCountry || salesOrder.customer?.billingCountry || '',
          customerPhone: salesOrder.customer?.phone || '',
          items,
        }}
        paidTotal={paidAmount}
      />
    );
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>Print Options</DialogTitle>
      <DialogContent>
        <FormControl className="print-chrome" sx={{ mb: 2 }}>
          <RadioGroup
            value={printType}
            onChange={(_, value) =>
              setPrintType(value as 'sales_order' | 'invoice' | 'payment_receipt')
            }
            row
          >
            <FormControlLabel value="sales_order" control={<Radio />} label="Sales Order" />
            <Tooltip title={!isFulfilled ? 'Available after fulfillment' : ''}>
              <span>
                <FormControlLabel
                  value="invoice"
                  control={<Radio />}
                  label="Invoice"
                  disabled={!isFulfilled}
                />
              </span>
            </Tooltip>
            <Tooltip title={paidAmount <= 0 ? 'Available after payment recorded' : ''}>
              <span>
                <FormControlLabel
                  value="payment_receipt"
                  control={<Radio />}
                  label="Payment Receipt"
                  disabled={paidAmount <= 0}
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
            {printType === 'sales_order'
              ? renderSalesOrderContent()
              : printType === 'invoice'
                ? renderInvoiceContent()
                : renderPaymentReceiptContent()}
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
  );
};

export default SalesOrderPrintDialog;
