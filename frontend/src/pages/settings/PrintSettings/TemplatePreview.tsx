import React, { useState, useEffect } from 'react'
import {
  Box,
  Paper,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Divider,
  Grid,
} from '@mui/material'
import { useCurrency } from '@/hooks/useCurrency'

interface TemplatePreviewProps {
  template: any
  settings: any
}

const TemplatePreview: React.FC<TemplatePreviewProps> = ({ template, settings }) => {
  const { currency } = useCurrency()
  const [displayCurrency, setDisplayCurrency] = useState(currency)

  // Listen for currency changes
  useEffect(() => {
    const handleCurrencyChange = () => {
      const newCurrency = localStorage.getItem('defaultCurrency') || 'RM'
      setDisplayCurrency(newCurrency)
    }

    window.addEventListener('currencyChanged', handleCurrencyChange)
    return () => {
      window.removeEventListener('currencyChanged', handleCurrencyChange)
    }
  }, [])

  // Update when currency from hook changes
  useEffect(() => {
    setDisplayCurrency(currency)
  }, [currency])
  // Separate sample data for sales and purchasing
  const isSalesTemplate = template.id === 'salesOrder' || template.id === 'invoice' || template.id === 'paymentReceipt'
  const isPurchasingTemplate = template.id === 'purchaseOrder' || template.id === 'grn' || template.id === 'vendorPayment'

  // Sales templates: with discounts (Amount = Qty × Unit Price - Qty × Discount)
  const salesItems = [
    { no: 1, description: 'Sample Product 1', quantity: 2, unitPrice: 100.00, discount: 10.00, amount: 180.00 },
    { no: 2, description: 'Sample Product 2', quantity: 1, unitPrice: 150.00, discount: 0, amount: 150.00 },
    { no: 3, description: 'Sample Product 3', quantity: 3, unitPrice: 75.00, discount: 15.00, amount: 180.00 },
  ]

  // Purchasing templates: no discounts (Amount = Qty × Unit Price)
  const purchasingItems = [
    { no: 1, description: 'Sample Product 1', quantity: 2, unitPrice: 100.00, discount: 0, amount: 200.00 },
    { no: 2, description: 'Sample Product 2', quantity: 1, unitPrice: 150.00, discount: 0, amount: 150.00 },
    { no: 3, description: 'Sample Product 3', quantity: 3, unitPrice: 75.00, discount: 0, amount: 225.00 },
  ]

  // Use appropriate sample data based on template type
  const sampleItems = isPurchasingTemplate ? purchasingItems : salesItems

  // Calculate totals based on template type
  const subtotal = isPurchasingTemplate ? 575.00 : 510.00
  const tax = isPurchasingTemplate ? 57.50 : 51.00
  const shipping = 25.00
  const total = isPurchasingTemplate ? 600.00 : 535.00
  const paid = 300.00
  const balance = isPurchasingTemplate ? 300.00 : 235.00
  const totalQuantity = sampleItems.reduce((sum, item) => sum + item.quantity, 0)

  // Always show discount column for sales orders, invoices, and payment receipts
  const showDiscountColumn = isSalesTemplate

  // GRN only shows product and quantity
  const isGRN = template.id === 'grn'

  // Get footer text based on template type
  const getFooterText = () => {
    switch (template.id) {
      case 'salesOrder':
      case 'invoice':
      case 'paymentReceipt':
        return {
          perPage: settings?.salesPerPageFooter || '',
          endOfDoc: settings?.salesEndOfDocFooter || '',
        }
      case 'purchaseOrder':
      case 'grn':
      case 'vendorPayment':
        return {
          perPage: settings?.purchasingPerPageFooter || '',
          endOfDoc: settings?.purchasingEndOfDocFooter || '',
        }
      default:
        return { perPage: '', endOfDoc: '' }
    }
  }

  const footers = getFooterText()

  return (
    <Box sx={{ bgcolor: '#f5f5f5', p: 2 }}>
      <Paper
        sx={{
          p: 4,
          width: '210mm', // A4 width
          minHeight: '297mm', // A4 height
          mx: 'auto',
          bgcolor: '#ffffff', // Pure white for printing
          color: '#000000', // Black text for printing
          '@media print': {
            boxShadow: 'none',
            p: 2,
          }
        }}
      >
        {/* Header */}
        <Box sx={{ display: 'flex', alignItems: 'flex-start', mb: 3, gap: 2 }}>
          {/* Company Info */}
          <Box sx={{ flex: 1 }}>
            <Typography variant="h5" sx={{ fontWeight: 700, mb: 1, color: '#000000' }}>
              {settings?.companyName || 'Company Name'}
            </Typography>
            <Typography variant="body2" sx={{ color: '#000000', mb: 0.5 }}>
              {settings?.address || 'No. 123, Jalan Perdana 1/2'}
            </Typography>
            <Typography variant="body2" sx={{ color: '#000000', mb: 0.5 }}>
              {settings?.postalCode || '47650'}, {settings?.city || 'Subang Jaya'}
            </Typography>
            <Typography variant="body2" sx={{ color: '#000000', mb: 1 }}>
              {settings?.state || 'Selangor'}, {settings?.country || 'Malaysia'}
            </Typography>
            <Typography variant="body2" sx={{ color: '#000000', mb: 0.5 }}>
              {settings?.phone ? `Tel: ${settings.phone}` : 'Tel: +60 3-1234 5678'}
            </Typography>
            {settings?.email && (
              <Typography variant="body2" sx={{ color: '#000000', mb: 0.5 }}>
                Email: {settings.email}
              </Typography>
            )}
            {settings?.website && (
              <Typography variant="body2" sx={{ color: '#000000' }}>
                Website: {settings.website}
              </Typography>
            )}
          </Box>

          {/* Logo - Center */}
          {settings?.logoUrl && (
            <Box
              sx={{
                flex: 1,
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'center',
              }}
            >
              <Box
                component="img"
                src={settings.logoUrl}
                sx={{
                  width: 150,
                  height: 150,
                  objectFit: 'contain',
                }}
              />
            </Box>
          )}

          {/* Document Info */}
          <Box sx={{ flex: 1, textAlign: 'right' }}>
            <Typography
              variant="h4"
              sx={{
                fontWeight: 700,
                color: '#000000',
                mb: 1,
              }}
            >
              {template.title.toUpperCase()}
            </Typography>
            <Typography variant="body2" sx={{ color: '#000000', mb: 0.5 }}>
              <strong>Document No:</strong> {
                template.id === 'salesOrder' ? 'SO-000001' :
                template.id === 'invoice' ? 'INV-000001' :
                template.id === 'paymentReceipt' ? 'INV-000001' :
                template.id === 'purchaseOrder' ? 'PO-000001' :
                template.id === 'grn' ? 'PO-000001' :
                template.id === 'vendorPayment' ? 'PO-000001' :
                'DOC-000001'
              }
            </Typography>
            <Typography variant="body2" sx={{ color: '#000000' }}>
              <strong>Date:</strong> {new Date().toLocaleDateString()}
            </Typography>
          </Box>
        </Box>

        <Divider sx={{ mb: 3, borderColor: '#000000' }} />

        {/* Customer Details */}
        <Grid container spacing={3} sx={{ mb: 3 }}>
          <Grid item xs={6}>
            {/* Empty space for alignment */}
          </Grid>
          <Grid item xs={6}>
            <Box sx={{ border: '1px solid #000000', p: 2, borderRadius: 1 }}>
              <Typography variant="body2" sx={{ color: '#000000', fontWeight: 600, mb: 0.5 }}>
                ABC Trading Sdn Bhd
              </Typography>
              <Typography variant="body2" sx={{ color: '#000000', mb: 0.5 }}>
                No. 45, Jalan SS15/4D
              </Typography>
              <Typography variant="body2" sx={{ color: '#000000', mb: 0.5 }}>
                47500, Subang Jaya
              </Typography>
              <Typography variant="body2" sx={{ color: '#000000', mb: 0.5 }}>
                Selangor, Malaysia
              </Typography>
              <Typography variant="body2" sx={{ color: '#000000' }}>
                Phone: +60 3-5632 8888
              </Typography>
            </Box>
          </Grid>
        </Grid>

        {/* Items Table */}
        <TableContainer sx={{ mb: 3, border: '1px solid #000000' }}>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ bgcolor: '#f0f0f0' }}>
                <TableCell sx={{ fontWeight: 600, color: '#000000', border: '1px solid #000000' }}>Product</TableCell>
                <TableCell align="right" sx={{ fontWeight: 600, color: '#000000', border: '1px solid #000000' }}>Qty</TableCell>
                {!isGRN && (
                  <>
                    <TableCell align="right" sx={{ fontWeight: 600, color: '#000000', border: '1px solid #000000' }}>Unit Price</TableCell>
                    {showDiscountColumn && (
                      <TableCell align="right" sx={{ fontWeight: 600, color: '#000000', border: '1px solid #000000' }}>Discount</TableCell>
                    )}
                    <TableCell align="right" sx={{ fontWeight: 600, color: '#000000', border: '1px solid #000000' }}>Amount</TableCell>
                  </>
                )}
              </TableRow>
            </TableHead>
            <TableBody>
              {sampleItems.map((item) => (
                <TableRow key={item.no}>
                  <TableCell sx={{ color: '#000000', border: '1px solid #000000' }}>{item.description}</TableCell>
                  <TableCell align="right" sx={{ color: '#000000', border: '1px solid #000000' }}>{item.quantity}</TableCell>
                  {!isGRN && (
                    <>
                      <TableCell align="right" sx={{ color: '#000000', border: '1px solid #000000' }}>{displayCurrency} {item.unitPrice.toFixed(2)}</TableCell>
                      {showDiscountColumn && (
                        <TableCell align="right" sx={{ color: '#000000', border: '1px solid #000000' }}>{displayCurrency} {item.discount.toFixed(2)}</TableCell>
                      )}
                      <TableCell align="right" sx={{ color: '#000000', border: '1px solid #000000' }}>{displayCurrency} {item.amount.toFixed(2)}</TableCell>
                    </>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>

        {/* Totals */}
        {isGRN ? (
          // GRN: Show only total quantity
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 3 }}>
            <Box sx={{ width: 300, border: '1px solid #000000', p: 2 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant="body1" sx={{ fontWeight: 700, color: '#000000' }}>
                  Total Quantity:
                </Typography>
                <Typography variant="body1" sx={{ fontWeight: 700, color: '#000000' }}>
                  {totalQuantity}
                </Typography>
              </Box>
            </Box>
          </Box>
        ) : (
          // Other templates: Show standard totals
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 3 }}>
            <Box sx={{ width: 300, border: '1px solid #000000', p: 2 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                <Typography variant="body2" sx={{ color: '#000000' }}>Subtotal:</Typography>
                <Typography variant="body2" sx={{ color: '#000000' }}>{displayCurrency} {subtotal.toFixed(2)}</Typography>
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                <Typography variant="body2" sx={{ color: '#000000' }}>Shipping Cost:</Typography>
                <Typography variant="body2" sx={{ color: '#000000' }}>{displayCurrency} {shipping.toFixed(2)}</Typography>
              </Box>
              <Divider sx={{ my: 1, borderColor: '#000000' }} />
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                <Typography variant="body1" sx={{ fontWeight: 700, color: '#000000' }}>
                  Total:
                </Typography>
                <Typography variant="body1" sx={{ fontWeight: 700, color: '#000000' }}>
                  {displayCurrency} {total.toFixed(2)}
                </Typography>
              </Box>
              {(template.id === 'invoice' || template.id === 'paymentReceipt' || template.id === 'vendorPayment') && (
                <>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                    <Typography variant="body2" sx={{ color: '#000000' }}>Paid:</Typography>
                    <Typography variant="body2" sx={{ color: '#000000' }}>{displayCurrency} {paid.toFixed(2)}</Typography>
                  </Box>
                  <Divider sx={{ my: 1, borderColor: '#000000' }} />
                  <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Typography variant="body1" sx={{ fontWeight: 700, color: '#000000' }}>
                      Balance:
                    </Typography>
                    <Typography variant="body1" sx={{ fontWeight: 700, color: '#000000' }}>
                      {displayCurrency} {balance.toFixed(2)}
                    </Typography>
                  </Box>
                </>
              )}
            </Box>
          </Box>
        )}

        {/* Notes */}
        <Box sx={{ mb: 3 }}>
          <Typography variant="body2" sx={{ fontWeight: 600, mb: 1, color: '#000000' }}>
            Notes:
          </Typography>
          <Typography variant="body2" sx={{ color: '#000000' }}>
            Thank you for your business. Please contact us if you have any questions.
          </Typography>
        </Box>

        {/* Per-page footer */}
        {footers.perPage && (
          <>
            <Divider sx={{ my: 2, borderColor: '#000000' }} />
            <Typography variant="caption" sx={{ color: '#000000' }} align="center" display="block">
              {footers.perPage}
            </Typography>
          </>
        )}

        {/* End of document footer */}
        {footers.endOfDoc && (
          <>
            <Divider sx={{ my: 2, borderColor: '#000000' }} />
            <Box sx={{ bgcolor: '#f0f0f0', p: 2, borderRadius: 1, border: '1px solid #000000' }}>
              <Typography variant="body2" sx={{ color: '#000000' }} align="center">
                {footers.endOfDoc}
              </Typography>
            </Box>
          </>
        )}
      </Paper>
    </Box>
  )
}

export default TemplatePreview
