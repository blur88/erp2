import React from 'react'
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

interface TemplatePreviewProps {
  template: any
  settings: any
}

const TemplatePreview: React.FC<TemplatePreviewProps> = ({ template, settings }) => {
  // Sample data for preview
  const sampleItems = [
    { no: 1, description: 'Sample Product 1', quantity: 2, unitPrice: 100.00, discount: 10.00, amount: 190.00 },
    { no: 2, description: 'Sample Product 2', quantity: 1, unitPrice: 150.00, discount: 0, amount: 150.00 },
    { no: 3, description: 'Sample Product 3', quantity: 3, unitPrice: 75.00, discount: 15.00, amount: 210.00 },
  ]

  const subtotal = 550.00
  const tax = 55.00
  const shipping = 25.00
  const total = 575.00

  // Always show discount column for sales orders and invoices
  const showDiscountColumn = template.id === 'salesOrder' || template.id === 'invoice'

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
        <Box sx={{ display: 'flex', alignItems: 'flex-start', mb: 3 }}>
          {settings?.logoUrl && (
            <Box
              component="img"
              src={settings.logoUrl}
              sx={{
                width: 100,
                height: 100,
                objectFit: 'contain',
                mr: 3,
              }}
            />
          )}
          <Box sx={{ flexGrow: 1 }}>
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
              {settings?.email && ` | Email: ${settings.email}`}
            </Typography>
            {settings?.website && (
              <Typography variant="body2" sx={{ color: '#000000' }}>
                Website: {settings.website}
              </Typography>
            )}
          </Box>
          <Box sx={{ textAlign: 'right', minWidth: 200 }}>
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
              <strong>Document No:</strong> DOC-2024-001
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
                <TableCell align="right" sx={{ fontWeight: 600, color: '#000000', border: '1px solid #000000' }}>Unit Price</TableCell>
                {showDiscountColumn && (
                  <TableCell align="right" sx={{ fontWeight: 600, color: '#000000', border: '1px solid #000000' }}>Discount</TableCell>
                )}
                <TableCell align="right" sx={{ fontWeight: 600, color: '#000000', border: '1px solid #000000' }}>Amount</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {sampleItems.map((item) => (
                <TableRow key={item.no}>
                  <TableCell sx={{ color: '#000000', border: '1px solid #000000' }}>{item.description}</TableCell>
                  <TableCell align="right" sx={{ color: '#000000', border: '1px solid #000000' }}>{item.quantity}</TableCell>
                  <TableCell align="right" sx={{ color: '#000000', border: '1px solid #000000' }}>${item.unitPrice.toFixed(2)}</TableCell>
                  {showDiscountColumn && (
                    <TableCell align="right" sx={{ color: '#000000', border: '1px solid #000000' }}>${item.discount.toFixed(2)}</TableCell>
                  )}
                  <TableCell align="right" sx={{ color: '#000000', border: '1px solid #000000' }}>${item.amount.toFixed(2)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>

        {/* Totals */}
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 3 }}>
          <Box sx={{ width: 300, border: '1px solid #000000', p: 2 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
              <Typography variant="body2" sx={{ color: '#000000' }}>Subtotal:</Typography>
              <Typography variant="body2" sx={{ color: '#000000' }}>${subtotal.toFixed(2)}</Typography>
            </Box>
            {template.id !== 'salesOrder' && (
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                <Typography variant="body2" sx={{ color: '#000000' }}>Tax (10%):</Typography>
                <Typography variant="body2" sx={{ color: '#000000' }}>${tax.toFixed(2)}</Typography>
              </Box>
            )}
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
              <Typography variant="body2" sx={{ color: '#000000' }}>Shipping Cost:</Typography>
              <Typography variant="body2" sx={{ color: '#000000' }}>${shipping.toFixed(2)}</Typography>
            </Box>
            <Divider sx={{ my: 1, borderColor: '#000000' }} />
            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
              <Typography variant="body1" sx={{ fontWeight: 700, color: '#000000' }}>
                Total:
              </Typography>
              <Typography variant="body1" sx={{ fontWeight: 700, color: '#000000' }}>
                ${total.toFixed(2)}
              </Typography>
            </Box>
          </Box>
        </Box>

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
