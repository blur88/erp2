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
  const total = 632.50

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
    <Box sx={{ bgcolor: 'grey.100', p: 2 }}>
      <Paper sx={{ p: 4, maxWidth: 800, mx: 'auto' }}>
        {/* Header */}
        <Box sx={{ display: 'flex', alignItems: 'flex-start', mb: 3 }}>
          {settings?.logoUrl && (
            <Box
              component="img"
              src={settings.logoUrl}
              sx={{
                width: 80,
                height: 80,
                objectFit: 'contain',
                mr: 3,
              }}
            />
          )}
          <Box sx={{ flexGrow: 1 }}>
            <Typography variant="h5" sx={{ fontWeight: 700, mb: 1 }}>
              {settings?.companyName || 'Company Name'}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {settings?.address || 'Company Address'}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {settings?.phone && `Phone: ${settings.phone}`}
              {settings?.email && ` | Email: ${settings.email}`}
            </Typography>
            {settings?.website && (
              <Typography variant="body2" color="text.secondary">
                Website: {settings.website}
              </Typography>
            )}
            {settings?.miscInfo && (
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                {settings.miscInfo}
              </Typography>
            )}
          </Box>
        </Box>

        <Divider sx={{ mb: 3 }} />

        {/* Document Title */}
        <Typography
          variant="h4"
          sx={{
            fontWeight: 700,
            textAlign: 'center',
            mb: 3,
            color: 'primary.main',
          }}
        >
          {template.title.toUpperCase()}
        </Typography>

        {/* Document Info */}
        <Grid container spacing={2} sx={{ mb: 3 }}>
          <Grid item xs={6}>
            <Typography variant="body2" color="text.secondary">
              <strong>Document No:</strong> DOC-2024-001
            </Typography>
            <Typography variant="body2" color="text.secondary">
              <strong>Date:</strong> {new Date().toLocaleDateString()}
            </Typography>
          </Grid>
          <Grid item xs={6}>
            <Typography variant="body2" color="text.secondary" align="right">
              <strong>Customer/Vendor:</strong> Sample Company Ltd.
            </Typography>
            <Typography variant="body2" color="text.secondary" align="right">
              <strong>Reference:</strong> REF-001
            </Typography>
          </Grid>
        </Grid>

        {/* Items Table */}
        <TableContainer sx={{ mb: 3 }}>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ bgcolor: 'grey.200' }}>
                <TableCell sx={{ fontWeight: 600 }}>No</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Description</TableCell>
                <TableCell align="right" sx={{ fontWeight: 600 }}>Qty</TableCell>
                <TableCell align="right" sx={{ fontWeight: 600 }}>Unit Price</TableCell>
                <TableCell align="right" sx={{ fontWeight: 600 }}>Amount</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {sampleItems.map((item) => (
                <TableRow key={item.no}>
                  <TableCell>{item.no}</TableCell>
                  <TableCell>{item.description}</TableCell>
                  <TableCell align="right">{item.quantity}</TableCell>
                  <TableCell align="right">${item.unitPrice.toFixed(2)}</TableCell>
                  <TableCell align="right">${item.amount.toFixed(2)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>

        {/* Totals */}
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 3 }}>
          <Box sx={{ width: 300 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
              <Typography variant="body2">Subtotal:</Typography>
              <Typography variant="body2">${subtotal.toFixed(2)}</Typography>
            </Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
              <Typography variant="body2">Tax (10%):</Typography>
              <Typography variant="body2">${tax.toFixed(2)}</Typography>
            </Box>
            <Divider sx={{ my: 1 }} />
            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
              <Typography variant="body1" sx={{ fontWeight: 700 }}>
                Total:
              </Typography>
              <Typography variant="body1" sx={{ fontWeight: 700 }}>
                ${total.toFixed(2)}
              </Typography>
            </Box>
          </Box>
        </Box>

        {/* Notes */}
        <Box sx={{ mb: 3 }}>
          <Typography variant="body2" sx={{ fontWeight: 600, mb: 1 }}>
            Notes:
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Thank you for your business. Please contact us if you have any questions.
          </Typography>
        </Box>

        {/* Per-page footer */}
        {footers.perPage && (
          <>
            <Divider sx={{ my: 2 }} />
            <Typography variant="caption" color="text.secondary" align="center" display="block">
              {footers.perPage}
            </Typography>
          </>
        )}

        {/* End of document footer */}
        {footers.endOfDoc && (
          <>
            <Divider sx={{ my: 2 }} />
            <Box sx={{ bgcolor: 'grey.100', p: 2, borderRadius: 1 }}>
              <Typography variant="body2" color="text.secondary" align="center">
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
