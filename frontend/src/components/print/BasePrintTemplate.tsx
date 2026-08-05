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
import { printColors } from '@/styles/printTokens'

interface PrintSettings {
  logoUrl?: string
  companyName?: string
  address?: string
  city?: string
  state?: string
  postalCode?: string
  country?: string
  phone?: string
  email?: string
  website?: string
}

interface PrintItem {
  description: string
  quantity: number
  unitPrice?: number
  discount?: number
  discountDisplay?: string  // Formatted discount display (e.g., "10%" or "RM 5.00")
  amount: number
}

interface PrintTotals {
  subtotal: number
  shipping?: number
  total: number
  paid?: number | string
  balance?: number | string
}

interface RecipientInfo {
  name: string
  address?: string
  city?: string
  state?: string
  postalCode?: string
  country?: string
  phone?: string
}

interface BasePrintTemplateProps {
  settings: PrintSettings
  documentTitle: string
  documentNumber: string
  documentDate: string
  recipient: RecipientInfo
  items: PrintItem[]
  totals: PrintTotals
  notes?: string
  perPageFooter?: string
  endOfDocFooter?: string
  showDiscount?: boolean
  showPricing?: boolean
  currency?: string
}

const BasePrintTemplate: React.FC<BasePrintTemplateProps> = ({
  settings,
  documentTitle,
  documentNumber,
  documentDate,
  recipient,
  items,
  totals,
  notes,
  perPageFooter,
  endOfDocFooter,
  showDiscount = false,
  showPricing = true,
  currency = 'RM',
}) => {
  const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0)

  return (
    <Box
      sx={{
        bgcolor: printColors.background,
        color: printColors.text,
        '@media print': {
          bgcolor: printColors.background,
          color: printColors.text,
        },
      }}
    >
      <Paper
        sx={{
          p: 4,
          width: '210mm',
          minHeight: '297mm',
          mx: 'auto',
          bgcolor: printColors.background,
          color: printColors.text,
          boxShadow: 'none',
          '@media print': {
            boxShadow: 'none',
            p: 2,
            m: 0,
            width: '100%',
            minHeight: 'auto',
          },
        }}
      >
        {/* Header */}
        <Box sx={{ display: 'flex', alignItems: 'flex-start', mb: 3, gap: 2 }}>
          {/* Company Info */}
          <Box sx={{ flex: 1 }}>
            <Typography variant="h5" sx={{ fontWeight: 700, mb: 1, color: printColors.text }}>
              {settings?.companyName || 'Company Name'}
            </Typography>
            <Typography variant="body2" sx={{ color: printColors.text, mb: 0.5 }}>
              {settings?.address || 'Address'}
            </Typography>
            <Typography variant="body2" sx={{ color: printColors.text, mb: 0.5 }}>
              {settings?.postalCode || ''}, {settings?.city || 'City'}
            </Typography>
            <Typography variant="body2" sx={{ color: printColors.text, mb: 1 }}>
              {settings?.state || 'State'}, {settings?.country || 'Country'}
            </Typography>
            <Typography variant="body2" sx={{ color: printColors.text, mb: 0.5 }}>
              {settings?.phone ? `Tel: ${settings.phone}` : 'Tel: '}
            </Typography>
            {settings?.email && (
              <Typography variant="body2" sx={{ color: printColors.text, mb: 0.5 }}>
                Email: {settings.email}
              </Typography>
            )}
            {settings?.website && (
              <Typography variant="body2" sx={{ color: printColors.text }}>
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
                color: printColors.text,
                mb: 1,
              }}
            >
              {documentTitle.toUpperCase()}
            </Typography>
            <Typography variant="body2" sx={{ color: printColors.text, mb: 0.5 }}>
              <strong>Document No:</strong> {documentNumber}
            </Typography>
            <Typography variant="body2" sx={{ color: printColors.text }}>
              <strong>Date:</strong> {documentDate}
            </Typography>
          </Box>
        </Box>

        <Divider sx={{ mb: 3, borderColor: printColors.border }} />

        {/* Recipient Details */}
        <Grid container spacing={3} sx={{ mb: 3 }}>
          <Grid size={6}>
            {/* Empty space for alignment */}
          </Grid>
          <Grid size={6}>
            <Box sx={{ border: `1px solid ${printColors.border}`, p: 2, borderRadius: 1 }}>
              <Typography variant="body2" sx={{ color: printColors.text, fontWeight: 600, mb: 0.5 }}>
                {recipient.name}
              </Typography>
              {recipient.address && (
                <Typography variant="body2" sx={{ color: printColors.text, mb: 0.5 }}>
                  {recipient.address}
                </Typography>
              )}
              {(recipient.postalCode || recipient.city) && (
                <Typography variant="body2" sx={{ color: printColors.text, mb: 0.5 }}>
                  {recipient.postalCode}, {recipient.city}
                </Typography>
              )}
              {(recipient.state || recipient.country) && (
                <Typography variant="body2" sx={{ color: printColors.text, mb: 0.5 }}>
                  {recipient.state}, {recipient.country}
                </Typography>
              )}
              {recipient.phone && (
                <Typography variant="body2" sx={{ color: printColors.text }}>
                  Phone: {recipient.phone}
                </Typography>
              )}
            </Box>
          </Grid>
        </Grid>

        {/* Items Table */}
        <TableContainer sx={{ mb: 3, border: `1px solid ${printColors.border}` }}>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ bgcolor: printColors.tableRowAlt }}>
                <TableCell sx={{ fontWeight: 600, color: printColors.text, border: `1px solid ${printColors.border}` }}>
                  Product
                </TableCell>
                <TableCell align="right" sx={{ fontWeight: 600, color: printColors.text, border: `1px solid ${printColors.border}` }}>
                  Qty
                </TableCell>
                {showPricing && (
                  <>
                    <TableCell align="right" sx={{ fontWeight: 600, color: printColors.text, border: `1px solid ${printColors.border}` }}>
                      Unit Price
                    </TableCell>
                    {showDiscount && (
                      <TableCell align="right" sx={{ fontWeight: 600, color: printColors.text, border: `1px solid ${printColors.border}` }}>
                        Discount
                      </TableCell>
                    )}
                    <TableCell align="right" sx={{ fontWeight: 600, color: printColors.text, border: `1px solid ${printColors.border}` }}>
                      Amount
                    </TableCell>
                  </>
                )}
              </TableRow>
            </TableHead>
            <TableBody>
              {items.map((item, index) => (
                <TableRow key={index}>
                  <TableCell sx={{ color: printColors.text, border: `1px solid ${printColors.border}` }}>
                    {item.description}
                  </TableCell>
                  <TableCell align="right" sx={{ color: printColors.text, border: `1px solid ${printColors.border}` }}>
                    {item.quantity}
                  </TableCell>
                  {showPricing && (
                    <>
                      <TableCell align="right" sx={{ color: printColors.text, border: `1px solid ${printColors.border}` }}>
                        {currency} {Number(item.unitPrice || 0).toFixed(2)}
                      </TableCell>
                      {showDiscount && (
                        <TableCell align="right" sx={{ color: printColors.text, border: `1px solid ${printColors.border}` }}>
                          {item.discountDisplay || '-'}
                        </TableCell>
                      )}
                      <TableCell align="right" sx={{ color: printColors.text, border: `1px solid ${printColors.border}` }}>
                        {currency} {Number(item.amount || 0).toFixed(2)}
                      </TableCell>
                    </>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>

        {/* Totals */}
        {showPricing ? (
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 3 }}>
            <Box sx={{ width: 300, border: `1px solid ${printColors.border}`, p: 2 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                <Typography variant="body2" sx={{ color: printColors.text }}>
                  Subtotal:
                </Typography>
                <Typography variant="body2" sx={{ color: printColors.text }}>
                  {currency} {Number(totals.subtotal || 0).toFixed(2)}
                </Typography>
              </Box>
              {totals.shipping !== undefined && (
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                  <Typography variant="body2" sx={{ color: printColors.text }}>
                    Shipping Cost:
                  </Typography>
                  <Typography variant="body2" sx={{ color: printColors.text }}>
                    {currency} {Number(totals.shipping || 0).toFixed(2)}
                  </Typography>
                </Box>
              )}
              <Divider sx={{ my: 1, borderColor: printColors.border }} />
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                <Typography variant="body1" sx={{ fontWeight: 700, color: printColors.text }}>
                  Total:
                </Typography>
                <Typography variant="body1" sx={{ fontWeight: 700, color: printColors.text }}>
                  {currency} {Number(totals.total || 0).toFixed(2)}
                </Typography>
              </Box>
              {totals.paid !== undefined && (
                <>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                    <Typography variant="body2" sx={{ color: printColors.text }}>
                      Paid:
                    </Typography>
                    <Typography variant="body2" sx={{ color: printColors.text }}>
                      {currency} {Number(totals.paid || 0).toFixed(2)}
                    </Typography>
                  </Box>
                  <Divider sx={{ my: 1, borderColor: printColors.border }} />
                  <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Typography variant="body1" sx={{ fontWeight: 700, color: printColors.text }}>
                      Balance:
                    </Typography>
                    <Typography variant="body1" sx={{ fontWeight: 700, color: printColors.text }}>
                      {currency} {Number(totals.balance || 0).toFixed(2)}
                    </Typography>
                  </Box>
                </>
              )}
            </Box>
          </Box>
        ) : (
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 3 }}>
            <Box sx={{ width: 300, border: `1px solid ${printColors.border}`, p: 2 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant="body1" sx={{ fontWeight: 700, color: printColors.text }}>
                  Total Quantity:
                </Typography>
                <Typography variant="body1" sx={{ fontWeight: 700, color: printColors.text }}>
                  {totalQuantity}
                </Typography>
              </Box>
            </Box>
          </Box>
        )}

        {/* Notes */}
        {notes && (
          <Box sx={{ mb: 3 }}>
            <Typography variant="body2" sx={{ fontWeight: 600, mb: 1, color: printColors.text }}>
              Notes:
            </Typography>
            <Typography variant="body2" sx={{ color: printColors.text }}>
              {notes}
            </Typography>
          </Box>
        )}

        {/* Per-page footer */}
        {perPageFooter && (
          <>
            <Divider sx={{ my: 2, borderColor: printColors.border }} />
            <Typography
              variant="caption"
              align="center"
              sx={{
                display: "block",
                color: printColors.text
              }}>
              {perPageFooter}
            </Typography>
          </>
        )}

        {/* End of document footer */}
        {endOfDocFooter && (
          <>
            <Divider sx={{ my: 2, borderColor: printColors.border }} />
            <Box sx={{ bgcolor: printColors.tableRowAlt, p: 2, borderRadius: 1, border: `1px solid ${printColors.border}` }}>
              <Typography variant="body2" sx={{ color: printColors.text }} align="center">
                {endOfDocFooter}
              </Typography>
            </Box>
          </>
        )}
      </Paper>
    </Box>
  );
}

export default BasePrintTemplate
