import React from 'react'
import {
  Alert,
  Box,
  Chip,
  IconButton,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material'
import Grid from '@mui/material/GridLegacy'
import { Print as PrintIcon } from '@mui/icons-material'

import type { InvoiceJournalEntryRef, InvoiceListItem } from '../hooks/useInvoicesPageState'

import { TABLE_STYLES } from '@/constants/tableStyles'
import { formatCurrency, formatDate } from '@/utils/formatters'
import type { InvoiceItem } from '@/types'

interface InvoiceDetailsPanelProps {
  selectedInvoice: InvoiceListItem | null
  journalEntryRef: InvoiceJournalEntryRef | null
  journalEntryRefLoading: boolean
  onPrint: () => void
  onNavigateToSalesOrder: (salesOrderId: string, event: React.MouseEvent) => void
  onNavigateToPayment: (paymentId: string, event?: React.MouseEvent) => void
  onNavigateToJournalEntry: () => void
}

const InvoiceDetailsPanel: React.FC<InvoiceDetailsPanelProps> = ({
  selectedInvoice,
  journalEntryRef,
  journalEntryRefLoading,
  onPrint,
  onNavigateToSalesOrder,
  onNavigateToPayment,
  onNavigateToJournalEntry,
}) => {
  if (!selectedInvoice) {
    return (
      <Paper sx={{ height: 'calc(100vh - 300px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Typography variant="h6" color="text.secondary">
          Select an invoice to view details
        </Typography>
      </Paper>
    )
  }

  const isOverpaid = (selectedInvoice.paidAmount || 0) > (selectedInvoice.totalAmount || 0)

  return (
    <Paper sx={{ height: 'calc(100vh - 300px)', display: 'flex', flexDirection: 'column' }}>
      <Box
        sx={{
          p: TABLE_STYLES.cell.padding.px,
          borderBottom: TABLE_STYLES.cell.border,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Typography
            variant="tableHeader"
            sx={{
              fontWeight: 600,
              fontSize: '0.8rem',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
            }}
          >
            Invoice Details - {selectedInvoice.invoiceNumber}
          </Typography>
          {isOverpaid ? (
            <Chip
              label="Overpaid"
              size="small"
              color="info"
              sx={{ textTransform: 'capitalize', fontSize: '0.75rem', fontWeight: 600 }}
            />
          ) : (
            <Chip
              label={selectedInvoice.status === 'partial_paid' ? 'Partial Paid' : selectedInvoice.status}
              size="small"
              color={selectedInvoice.status === 'paid' ? 'success' : selectedInvoice.status === 'partial_paid' ? 'warning' : 'default'}
              sx={{ textTransform: 'capitalize', fontSize: '0.75rem', fontWeight: 600 }}
            />
          )}
        </Box>
        <IconButton
          size="small"
          title="Print Invoice"
          onClick={onPrint}
          sx={{
            height: `${TABLE_STYLES.row.height * 0.75}px`,
            width: `${TABLE_STYLES.row.height * 0.75}px`,
            minHeight: 20,
            minWidth: 20,
            p: 0.125,
            color: 'info.main',
            '&:hover': {
              backgroundColor: 'info.light',
              color: 'info.dark',
            },
          }}
        >
          <PrintIcon sx={{ fontSize: `${TABLE_STYLES.row.height * 0.5}px` }} />
        </IconButton>
      </Box>

      <Box sx={{ flex: 1, overflow: 'auto', p: TABLE_STYLES.cell.padding.px }}>
        <Grid container spacing={3}>
          <Grid item xs={12} md={6}>
            <TableContainer>
              <Table size={TABLE_STYLES.size} sx={{ '& .MuiTableCell-root': { border: 'none', py: 0.75, px: 1 } }}>
                <TableBody>
                  <TableRow>
                    <TableCell colSpan={2} sx={{ pb: 0.5, borderTop: TABLE_STYLES.cell.border }}>
                      <Typography variant="h6" sx={{ fontWeight: 600, color: 'primary.main', fontSize: '0.9rem' }}>
                        Invoice Information
                      </Typography>
                    </TableCell>
                  </TableRow>
                  <TableRow sx={{ backgroundColor: 'grey.50' }}>
                    <TableCell sx={{ fontWeight: 600, color: 'text.secondary', fontSize: '0.8rem', width: '40%' }}>
                      Customer
                    </TableCell>
                    <TableCell sx={{ fontSize: '0.8rem' }}>
                      {selectedInvoice.customer?.name || selectedInvoice.customerName}
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 600, color: 'text.secondary', fontSize: '0.8rem' }}>
                      Invoice Date
                    </TableCell>
                    <TableCell sx={{ fontSize: '0.8rem' }}>{formatDate(selectedInvoice.invoiceDate)}</TableCell>
                  </TableRow>
                  {selectedInvoice.salesOrder?.orderNumber && (
                    <TableRow sx={{ backgroundColor: 'grey.50' }}>
                      <TableCell sx={{ fontWeight: 600, color: 'text.secondary', fontSize: '0.8rem' }}>
                        Order No
                      </TableCell>
                      <TableCell sx={{ fontSize: '0.8rem' }}>
                        <Typography
                          component="button"
                          onClick={(event) => onNavigateToSalesOrder(selectedInvoice.salesOrder!.id, event)}
                          sx={{
                            fontSize: '0.8rem',
                            color: 'primary.main',
                            cursor: 'pointer',
                            textDecoration: 'none',
                            border: 'none',
                            background: 'none',
                            padding: 0,
                            '&:hover': { color: 'primary.dark' },
                          }}
                        >
                          {selectedInvoice.salesOrder.orderNumber}
                        </Typography>
                      </TableCell>
                    </TableRow>
                  )}
                  <TableRow>
                    <TableCell sx={{ fontWeight: 600, color: 'text.secondary', fontSize: '0.8rem' }}>
                      Payment No
                    </TableCell>
                    <TableCell sx={{ fontSize: '0.8rem' }}>
                      {(selectedInvoice as any).payments && (selectedInvoice as any).payments.length > 0 ? (
                        (selectedInvoice as any).payments.map((payment: any, index: number) => (
                          <Box key={payment.id} component="span">
                            <Typography
                              component="button"
                              onClick={(event) => onNavigateToPayment(payment.id, event)}
                              sx={{
                                fontSize: '0.8rem',
                                color: 'primary.main',
                                cursor: 'pointer',
                                textDecoration: 'none',
                                border: 'none',
                                background: 'none',
                                padding: 0,
                                '&:hover': { color: 'primary.dark' },
                              }}
                            >
                              {payment.paymentNumber}
                            </Typography>
                            {index < (selectedInvoice as any).payments.length - 1 && (
                              <Typography component="span" sx={{ fontSize: '0.8rem' }}>
                                ,{' '}
                              </Typography>
                            )}
                          </Box>
                        ))
                      ) : (
                        <Typography sx={{ fontSize: '0.8rem', color: 'text.secondary', fontStyle: 'italic' }}>
                          No payments
                        </Typography>
                      )}
                    </TableCell>
                  </TableRow>
                  <TableRow sx={{ backgroundColor: 'grey.50' }}>
                    <TableCell sx={{ fontWeight: 600, color: 'text.secondary', fontSize: '0.8rem' }}>
                      Journal Entry No
                    </TableCell>
                    <TableCell sx={{ fontSize: '0.8rem' }}>
                      {journalEntryRefLoading ? (
                        <Typography sx={{ fontSize: '0.8rem', color: 'text.secondary', fontStyle: 'italic' }}>
                          Loading...
                        </Typography>
                      ) : journalEntryRef ? (
                        <Typography
                          component="button"
                          onClick={onNavigateToJournalEntry}
                          sx={{
                            fontSize: '0.8rem',
                            color: 'primary.main',
                            cursor: 'pointer',
                            textDecoration: 'none',
                            border: 'none',
                            background: 'none',
                            padding: 0,
                            '&:hover': { color: 'primary.dark' },
                          }}
                        >
                          {journalEntryRef.referenceNumber}
                        </Typography>
                      ) : (
                        <Typography sx={{ fontSize: '0.8rem', color: 'text.secondary', fontStyle: 'italic' }}>
                          Pending
                        </Typography>
                      )}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </TableContainer>
          </Grid>

          <Grid item xs={12} md={6}>
            <TableContainer>
              <Table size={TABLE_STYLES.size} sx={{ '& .MuiTableCell-root': { border: 'none', py: 0.75, px: 1 } }}>
                <TableBody>
                  <TableRow>
                    <TableCell colSpan={2} sx={{ pb: 0.5, borderTop: TABLE_STYLES.cell.border }}>
                      <Typography variant="h6" sx={{ fontWeight: 600, color: 'primary.main', fontSize: '0.9rem' }}>
                        Payment Information
                      </Typography>
                    </TableCell>
                  </TableRow>
                  <TableRow sx={{ backgroundColor: 'grey.50' }}>
                    <TableCell sx={{ fontWeight: 600, color: 'text.secondary', fontSize: '0.8rem', width: '40%' }}>
                      Sub-total
                    </TableCell>
                    <TableCell sx={{ fontSize: '0.8rem' }}>
                      {formatCurrency((selectedInvoice.totalAmount || 0) - (selectedInvoice.shippingAmount || 0))}
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 600, color: 'text.secondary', fontSize: '0.8rem' }}>
                      Shipping
                    </TableCell>
                    <TableCell sx={{ fontSize: '0.8rem' }}>{formatCurrency(selectedInvoice.shippingAmount || 0)}</TableCell>
                  </TableRow>
                  <TableRow sx={{ backgroundColor: 'grey.50' }}>
                    <TableCell sx={{ fontWeight: 600, color: 'text.secondary', fontSize: '0.8rem' }}>
                      Total Amount
                    </TableCell>
                    <TableCell sx={{ fontSize: '0.8rem' }}>{formatCurrency(selectedInvoice.totalAmount)}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 600, color: 'text.secondary', fontSize: '0.8rem' }}>
                      Paid Amount
                    </TableCell>
                    <TableCell sx={{ fontSize: '0.8rem' }}>{formatCurrency(selectedInvoice.paidAmount)}</TableCell>
                  </TableRow>
                  <TableRow sx={{ backgroundColor: 'grey.50' }}>
                    <TableCell sx={{ fontWeight: 600, color: 'text.secondary', fontSize: '0.8rem' }}>
                      {isOverpaid ? 'Overpaid Amount' : 'Balance Due'}
                    </TableCell>
                    <TableCell
                      sx={{
                        fontSize: '0.8rem',
                        color: isOverpaid ? 'info.main' : 'inherit',
                        fontWeight: isOverpaid ? 600 : 400,
                      }}
                    >
                      {(() => {
                        const overpaid = (selectedInvoice.paidAmount || 0) - (selectedInvoice.totalAmount || 0)
                        if (overpaid > 0) {
                          return `+${formatCurrency(overpaid)}`
                        }
                        return formatCurrency(selectedInvoice.balanceDue)
                      })()}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </TableContainer>
          </Grid>
        </Grid>

        <Box sx={{ borderTop: '2px solid', borderColor: 'divider', my: 3 }} />

        <Box sx={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <Typography
            variant="tableHeader"
            sx={{
              fontWeight: 600,
              fontSize: '0.8rem',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
              mb: 1,
            }}
          >
            Invoice Items
          </Typography>

          {selectedInvoice.items && selectedInvoice.items.length > 0 ? (
            <TableContainer sx={{ flex: 1, overflow: 'auto' }}>
              <Table
                size={TABLE_STYLES.size}
                sx={{
                  '& .MuiTableCell-root': {
                    borderBottom: TABLE_STYLES.cell.border,
                    py: TABLE_STYLES.cell.padding.py,
                    px: TABLE_STYLES.cell.padding.px,
                  },
                }}
              >
                <TableHead>
                  <TableRow
                    sx={{
                      '& .MuiTableCell-head': {
                        fontWeight: 600,
                        backgroundColor: 'grey.50',
                        color: 'text.primary',
                        fontSize: '0.8rem',
                      },
                    }}
                  >
                    <TableCell sx={{ width: '40%' }}>Product</TableCell>
                    <TableCell align="center" sx={{ width: '12%' }}>
                      Quantity
                    </TableCell>
                    <TableCell align="right" sx={{ width: '16%' }}>
                      Unit Price
                    </TableCell>
                    <TableCell align="right" sx={{ width: '16%' }}>
                      Discount
                    </TableCell>
                    <TableCell align="right" sx={{ width: '16%' }}>
                      Total
                    </TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {selectedInvoice.items.map((item: InvoiceItem, index: number) => (
                    <TableRow
                      key={item.id || index}
                      hover
                      sx={{
                        '&:hover': { backgroundColor: 'action.hover' },
                        transition: 'background-color 0.2s ease',
                        height: TABLE_STYLES.row.height,
                      }}
                    >
                      <TableCell sx={{ fontSize: '0.8rem' }}>{item.product?.name || 'Unknown Product'}</TableCell>
                      <TableCell align="center" sx={{ fontSize: '0.8rem' }}>
                        {item.quantity}
                      </TableCell>
                      <TableCell align="right" sx={{ fontSize: '0.8rem' }}>
                        {formatCurrency(item.unitPrice)}
                      </TableCell>
                      <TableCell align="right" sx={{ fontSize: '0.8rem' }}>
                        {(item as any).discountType === 'percentage' && (item as any).discountPercent
                          ? `${(item as any).discountPercent}%`
                          : item.discount
                            ? `-${formatCurrency(item.discount)}`
                            : '-'}
                      </TableCell>
                      <TableCell align="right" sx={{ fontSize: '0.8rem' }}>
                        {formatCurrency((item as any).totalAmount || item.total)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          ) : (
            <Alert severity="info">No items in this invoice</Alert>
          )}
        </Box>

        {selectedInvoice.notes && (
          <Box sx={{ mt: 1 }}>
            <Typography
              variant="tableHeader"
              sx={{
                fontWeight: 600,
                fontSize: '0.8rem',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
                mb: 1,
              }}
            >
              NOTES
            </Typography>

            <Box
              sx={{
                p: 2,
                backgroundColor: 'grey.50',
                borderRadius: 1,
                fontSize: '0.8rem',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}
            >
              {selectedInvoice.notes}
            </Box>
          </Box>
        )}
      </Box>
    </Paper>
  )
}

export default InvoiceDetailsPanel
