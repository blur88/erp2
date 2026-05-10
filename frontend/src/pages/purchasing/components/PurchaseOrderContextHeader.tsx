import React from 'react'
import { default as DeleteIcon } from '@mui/icons-material/Delete'
import { default as EditIcon } from '@mui/icons-material/Edit'
import { default as PrintIcon } from '@mui/icons-material/Print'
import {
  Box,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableRow,
  Typography,
} from '@mui/material'
import Grid from '@mui/material/Grid'
import { useNavigate } from 'react-router-dom'

import { AppButton } from '@/components/common/AppButton'
import { EntityContextHeaderBar } from '@/components/common/EntityContextHeaderBar'
import { TABLE_STYLES } from '@/constants/tableStyles'
import type { JournalEntryRef } from '@/hooks/useJournalEntryRef'
import type { PurchaseOrder } from '@/types'
import { formatCurrency, formatDate } from '@/utils/formatters'

interface PurchaseOrderContextHeaderProps {
  selectedOrder: PurchaseOrder | null
  isLoading: boolean
  journalEntryRefs: JournalEntryRef[]
  journalEntryRefLoading: boolean
  onEditClick: () => void
  onDeleteClick: () => void
  onPrint: () => void
  onNavigateToGoodsReceived: (grnId: string) => void
  onNavigateToVendorPayment: (paymentId: string) => void
  onNavigateToJournalEntry: () => void
  onUnpay: () => void
  onOpenPaymentDialog: (order: PurchaseOrder) => void
  onReturn: () => void
  onReceive: () => void
}

const detailTableSx = {
  tableLayout: 'fixed',
  '& .MuiTableCell-root': {
    border: 'none',
    py: TABLE_STYLES.cell.padding.py,
    px: TABLE_STYLES.cell.padding.px,
    '&:nth-of-type(1)': { width: '40%' },
    '&:nth-of-type(2)': { width: '60%' },
  },
}

const labelCellSx = {
  fontWeight: 600,
  color: 'text.secondary',
  fontSize: '0.8rem',
}

const valueCellSx = {
  fontSize: '0.8rem',
}

const linkButtonSx = {
  fontSize: '0.8rem',
  color: 'primary.main',
  cursor: 'pointer',
  textDecoration: 'none',
  border: 'none',
  background: 'none',
  padding: 0,
  '&:hover': { color: 'primary.dark' },
}

const PurchaseOrderContextHeader: React.FC<PurchaseOrderContextHeaderProps> = ({
  selectedOrder,
  isLoading,
  journalEntryRefs,
  journalEntryRefLoading,
  onEditClick,
  onDeleteClick,
  onPrint,
  onNavigateToGoodsReceived,
  onNavigateToVendorPayment,
  onNavigateToJournalEntry,
  onUnpay,
  onOpenPaymentDialog,
  onReturn,
  onReceive,
}) => {
  const navigate = useNavigate()
  if (!selectedOrder) {
    return (
      <Paper sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', p: 4 }}>
        <Typography variant="h6" sx={{
          color: "text.secondary"
        }}>
          Select a purchase order to view details
        </Typography>
      </Paper>
    );
  }

  const isReceived = !!(
    selectedOrder.goodsReceivedNotes &&
    selectedOrder.goodsReceivedNotes.length > 0 &&
    selectedOrder.goodsReceivedNotes[0].status === 'received'
  )
  const hasPayment = !!(selectedOrder.vendorPayments && selectedOrder.vendorPayments.length > 0)

  return (
    <Paper sx={{ overflow: 'hidden' }}>
      <EntityContextHeaderBar
        title={`Purchase Order Details - ${selectedOrder.orderNumber}`}
        actions={(
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <AppButton
              size="small"
              variant="secondary"
              startIcon={<EditIcon />}
              title="Edit Order"
              onClick={onEditClick}
            >
              Edit
            </AppButton>
            <AppButton
              size="small"
              variant="danger"
              startIcon={<DeleteIcon />}
              title="Delete Order"
              onClick={onDeleteClick}
            >
              Delete
            </AppButton>
            <AppButton
              size="small"
              variant="secondary"
              startIcon={<PrintIcon />}
              title="Print Purchase Order"
              onClick={onPrint}
            >
              Print
            </AppButton>
          </Box>
        )}
        journalEntryRefs={journalEntryRefs}
        journalEntryRefLoading={journalEntryRefLoading}
        onNavigateToJournalEntry={onNavigateToJournalEntry}
      />
      <Box sx={{ p: TABLE_STYLES.cell.padding.px }}>
        <Grid container spacing={3}>
          <Grid size={{ xs: 12, md: 6 }}>
            <TableContainer>
              <Table size={TABLE_STYLES.size} sx={detailTableSx}>
                <TableBody>
                  <TableRow>
                    <TableCell colSpan={2} sx={{ pb: TABLE_STYLES.cell.padding.py * 0.67, py: TABLE_STYLES.cell.padding.py * 0.67, borderTop: TABLE_STYLES.cell.border }}>
                      <Typography variant="h6" sx={{ fontWeight: 600, color: 'primary.main', fontSize: '0.8rem' }}>
                        PO Information
                      </Typography>
                    </TableCell>
                  </TableRow>
                  <TableRow sx={{ backgroundColor: 'grey.50' }}>
                    <TableCell sx={labelCellSx}>Supplier</TableCell>
                    <TableCell sx={valueCellSx}>
                      {selectedOrder.supplier?.id ? (
                        <Typography
                          component="button"
                          onClick={() => navigate(`/purchasing/suppliers?highlight=${selectedOrder.supplier!.id}`)}
                          sx={linkButtonSx}
                        >
                          {selectedOrder.supplier.companyName}
                        </Typography>
                      ) : (
                        'N/A'
                      )}
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell sx={labelCellSx}>PO Date</TableCell>
                    <TableCell sx={valueCellSx}>{formatDate(selectedOrder.orderDate)}</TableCell>
                  </TableRow>
                  <TableRow sx={{ backgroundColor: 'grey.50' }}>
                    <TableCell sx={labelCellSx}>GRN No</TableCell>
                    <TableCell sx={valueCellSx}>
                      {selectedOrder.goodsReceivedNotes && selectedOrder.goodsReceivedNotes.length > 0
                        ? selectedOrder.goodsReceivedNotes.map((grn: any, index: number) => (
                            <Box key={grn.id} component="span">
                              {index > 0 && ', '}
                              <Typography component="button" onClick={() => onNavigateToGoodsReceived(grn.id)} sx={{ fontSize: '0.8rem', color: 'primary.main', cursor: 'pointer', textDecoration: 'none', border: 'none', background: 'none', padding: 0 }}>
                                {grn.grnNumber}
                              </Typography>
                            </Box>
                          ))
                        : '-'}
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell sx={labelCellSx}>VP No</TableCell>
                    <TableCell sx={valueCellSx}>
                      {selectedOrder.vendorPayments && selectedOrder.vendorPayments.length > 0
                        ? selectedOrder.vendorPayments.map((payment: any, index: number) => (
                            <Box key={payment.id} component="span">
                              {index > 0 && ', '}
                              <Typography component="button" onClick={() => onNavigateToVendorPayment(payment.id)} sx={{ fontSize: '0.8rem', color: 'primary.main', cursor: 'pointer', textDecoration: 'none', border: 'none', background: 'none', padding: 0 }}>
                                {payment.paymentNumber}
                              </Typography>
                            </Box>
                          ))
                        : '-'}
                    </TableCell>
                  </TableRow>
                  <TableRow sx={{ backgroundColor: 'grey.50' }}>
                    <TableCell sx={labelCellSx}>Journal Entry No</TableCell>
                    <TableCell sx={valueCellSx}>
                      {journalEntryRefLoading ? (
                        <Typography sx={{ fontSize: '0.8rem', color: 'text.secondary', fontStyle: 'italic' }}>Loading...</Typography>
                      ) : journalEntryRefs.length > 0 ? (
                        <>
                          {journalEntryRefs.map((ref, index) => (
                            <span key={ref.sourceId}>
                              <Typography component="button" onClick={onNavigateToJournalEntry} sx={{ fontSize: '0.8rem', color: 'primary.main', cursor: 'pointer', textDecoration: 'none', border: 'none', background: 'none', padding: 0 }}>
                                {ref.referenceNumber}
                              </Typography>
                              {index < journalEntryRefs.length - 1 && <span style={{ marginRight: 4 }}>,</span>}
                            </span>
                          ))}
                        </>
                      ) : (
                        <Typography sx={{ fontSize: '0.8rem', color: 'text.secondary', fontStyle: 'italic' }}>Pending</Typography>
                      )}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </TableContainer>
          </Grid>

          <Grid size={{ xs: 12, md: 6 }}>
            <TableContainer>
              <Table size={TABLE_STYLES.size} sx={detailTableSx}>
                <TableBody>
                  <TableRow>
                    <TableCell colSpan={2} sx={{ pb: TABLE_STYLES.cell.padding.py * 0.67, py: TABLE_STYLES.cell.padding.py * 0.67, borderTop: TABLE_STYLES.cell.border }}>
                      <Typography variant="h6" sx={{ fontWeight: 600, color: 'primary.main', fontSize: '0.8rem' }}>
                        Payment and Receiving
                      </Typography>
                    </TableCell>
                  </TableRow>
                  <TableRow sx={{ backgroundColor: 'grey.50' }}>
                    <TableCell sx={labelCellSx}>Sub-total</TableCell>
                    <TableCell sx={valueCellSx}>{formatCurrency(selectedOrder.subtotal || 0)}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell sx={labelCellSx}>Shipping</TableCell>
                    <TableCell sx={valueCellSx}>{formatCurrency(selectedOrder.shippingAmount || 0)}</TableCell>
                  </TableRow>
                  <TableRow sx={{ backgroundColor: 'grey.50', borderTop: TABLE_STYLES.cell.border }}>
                    <TableCell sx={labelCellSx}>Total</TableCell>
                    <TableCell sx={valueCellSx}>{formatCurrency(selectedOrder.totalAmount || 0)}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell sx={labelCellSx}>Paid</TableCell>
                    <TableCell sx={valueCellSx}>{formatCurrency(selectedOrder.paidAmount || 0)}</TableCell>
                  </TableRow>
                  <TableRow sx={{ backgroundColor: 'grey.50' }}>
                    <TableCell sx={labelCellSx}>Balance</TableCell>
                    <TableCell sx={valueCellSx}>{formatCurrency(Math.max(0, (selectedOrder.totalAmount || 0) - (selectedOrder.paidAmount || 0)))}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell colSpan={2} sx={{ textAlign: 'center' }}>
                      <Stack
                        direction="row"
                        spacing={1}
                        sx={{
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <AppButton
                          variant={hasPayment ? 'warning' : 'primary'}
                          size="small"
                          onClick={hasPayment ? onUnpay : () => onOpenPaymentDialog(selectedOrder)}
                          disabled={(hasPayment && isReceived) || isLoading}
                          sx={{ minWidth: 110 }}
                        >
                          {hasPayment ? 'Unpay' : 'Pay'}
                        </AppButton>
                        {isReceived ? (
                          <AppButton
                            variant="warning"
                            size="small"
                            sx={{ minWidth: 110 }}
                            onClick={onReturn}
                            disabled={!selectedOrder.items || selectedOrder.items.length === 0 || isLoading}
                          >
                            Return
                          </AppButton>
                        ) : (
                          <AppButton
                            variant="success"
                            size="small"
                            sx={{ minWidth: 110 }}
                            onClick={onReceive}
                            disabled={
                              !selectedOrder.items ||
                              selectedOrder.items.length === 0 ||
                              isLoading ||
                              !((selectedOrder.paidAmount || 0) >= (selectedOrder.totalAmount || 0) && (selectedOrder.paidAmount || 0) > 0)
                            }
                          >
                            Receive
                          </AppButton>
                        )}
                      </Stack>
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </TableContainer>
          </Grid>
        </Grid>
      </Box>
    </Paper>
  );
}

export default PurchaseOrderContextHeader
