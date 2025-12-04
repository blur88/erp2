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
    { no: 1, description: 'Sample Product 1', quantity: 2, unitPrice: 100.00, amount: 200.00 },
    { no: 2, description: 'Sample Product 2', quantity: 1, unitPrice: 150.00, amount: 150.00 },
    { no: 3, description: 'Sample Product 3', quantity: 3, unitPrice: 75.00, amount: 225.00 },
  ]

  const subtotal = 575.00
  const tax = 57.50
  const shipping = 25.00
  const total = 657.50

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
              {settings?.address || '123 Business Street'}
            </Typography>
            <Typography variant="body2" sx={{ color: '#000000', mb: 0.5 }}>
              {settings?.city || 'City'}, {settings?.state || 'State'} {settings?.postalCode || '12345'}
            </Typography>
            <Typography variant="body2" sx={{ color: '#000000', mb: 1 }}>
              {settings?.country || 'Country'}
            </Typography>
            <Typography variant="body2" sx={{ color: '#000000', mb: 0.5 }}>
              {settings?.phone && `Tel: ${settings.phone}`}
              {settings?.email && ` | Email: ${settings.email}`}
            </Typography>
            {settings?.website && (
              <Typography variant="body2" sx={{ color: '#000000' }}>
                Website: {settings.website}
              </Typography>
            )}
          </Box>
        </Box>

        <Divider sx={{ mb: 3, borderColor: '#000000' }} />

        {/* Document Title */}
        <Typography
          variant="h4"
          sx={{
            fontWeight: 700,
            textAlign: 'center',
            mb: 3,
            color: '#000000',
          }}
        >
          {template.title.toUpperCase()}
        </Typography>

        {/* Document Info and Customer Details */}
        <Grid container spacing={3} sx={{ mb: 3 }}>
          <Grid item xs={6}>
            <Typography variant="body2" sx={{ color: '#000000', mb: 0.5 }}>
              <strong>Document No:</strong> DOC-2024-001
            </Typography>
            <Typography variant="body2" sx={{ color: '#000000', mb: 0.5 }}>
              <strong>Date:</strong> {new Date().toLocaleDateString()}
            </Typography>
            <Typography variant="body2" sx={{ color: '#000000' }}>
              <strong>Reference:</strong> REF-001
            </Typography>
          </Grid>
          <Grid item xs={6}>
            <Box sx={{ border: '1px solid #000000', p: 2, borderRadius: 1 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1, color: '#000000' }}>
                Customer Information:
              </Typography>
              <Typography variant="body2" sx={{ color: '#000000', fontWeight: 600, mb: 0.5 }}>
                Sample Company Ltd.
              </Typography>
              <Typography variant="body2" sx={{ color: '#000000', mb: 0.5 }}>
                123 Customer Street
              </Typography>
              <Typography variant="body2" sx={{ color: '#000000', mb: 0.5 }}>
                New York, NY 10001
              </Typography>
              <Typography variant="body2" sx={{ color: '#000000', mb: 0.5 }}>
                United States
              </Typography>
              <Typography variant="body2" sx={{ color: '#000000' }}>
                Phone: +1 (555) 123-4567
              </Typography>
            </Box>
          </Grid>
        </Grid>

        {/* Items Table */}
        <TableContainer sx={{ mb: 3, border: '1px solid #000000' }}>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ bgcolor: '#f0f0f0' }}>
                <TableCell sx={{ fontWeight: 600, color: '#000000', border: '1px solid #000000' }}>No</TableCell>
                <TableCell sx={{ fontWeight: 600, color: '#000000', border: '1px solid #000000' }}>Description</TableCell>
                <TableCell align="right" sx={{ fontWeight: 600, color: '#000000', border: '1px solid #000000' }}>Qty</TableCell>
                <TableCell align="right" sx={{ fontWeight: 600, color: '#000000', border: '1px solid #000000' }}>Unit Price</TableCell>
                <TableCell align="right" sx={{ fontWeight: 600, color: '#000000', border: '1px solid #000000' }}>Amount</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {sampleItems.map((item) => (
                <TableRow key={item.no}>
                  <TableCell sx={{ color: '#000000', border: '1px solid #000000' }}>{item.no}</TableCell>
                  <TableCell sx={{ color: '#000000', border: '1px solid #000000' }}>{item.description}</TableCell>
                  <TableCell align="right" sx={{ color: '#000000', border: '1px solid #000000' }}>{item.quantity}</TableCell>
                  <TableCell align="right" sx={{ color: '#000000', border: '1px solid #000000' }}>${item.unitPrice.toFixed(2)}</TableCell>
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
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
              <Typography variant="body2" sx={{ color: '#000000' }}>Tax (10%):</Typography>
              <Typography variant="body2" sx={{ color: '#000000' }}>${tax.toFixed(2)}</Typography>
            </Box>
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
