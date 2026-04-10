import React from 'react'
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material'
import Grid from '@mui/material/Grid'

import AccountingEntryLink from '@/components/accounting/AccountingEntryLink'
import ConfirmationDialog from '@/components/common/ConfirmationDialog'
import PaymentDialog from '@/components/sales/PaymentDialog'
import BlockedSalesOrderDialog from '@/components/sales/BlockedSalesOrderDialog'
import DeletedOrdersDialog from '@/components/sales/DeletedOrdersDialog'
import { SalesOrderPrint } from '@/components/print'
import { TABLE_STYLES } from '@/constants/tableStyles'
import type { SalesOrder } from '@/types'
import { formatCurrency, formatDate } from '@/utils/formatters'

interface OrdersDialogsProps {
  selectedOrder: SalesOrder | null
  viewDialogOpen: boolean
  onCloseViewDialog: () => void
  blockedDialogOpen: boolean
  blockedDialogAction: 'edit' | 'delete'
  onCloseBlockedDialog: () => void
  onUnfulfillAndEdit: () => Promise<void>
  onUnfulfillOnly: () => Promise<void>
  onUnpayAndEdit: () => Promise<void>
  onUnfulfillAndDelete: () => Promise<void>
  onUnpayAndDelete: () => Promise<void>
  deletedOrdersDialogOpen: boolean
  onCloseDeletedOrdersDialog: () => void
  deleteConfirmOpen: boolean
  orderToDeleteName: string
  onConfirmDelete: () => Promise<void> | void
  onCancelDelete: () => void
  printDialogOpen: boolean
  onClosePrintDialog: () => void
  paymentDialogOpen: boolean
  onClosePaymentDialog: () => void
  onSubmitPayments: (payments: { paymentMethodId: string; amount: number; reference?: string }[]) => Promise<void>
  isLoading: boolean
}

const OrdersDialogs: React.FC<OrdersDialogsProps> = ({
  selectedOrder,
  viewDialogOpen,
  onCloseViewDialog,
  blockedDialogOpen,
  blockedDialogAction,
  onCloseBlockedDialog,
  onUnfulfillAndEdit,
  onUnfulfillOnly,
  onUnpayAndEdit,
  onUnfulfillAndDelete,
  onUnpayAndDelete,
  deletedOrdersDialogOpen,
  onCloseDeletedOrdersDialog,
  deleteConfirmOpen,
  orderToDeleteName,
  onConfirmDelete,
  onCancelDelete,
  printDialogOpen,
  onClosePrintDialog,
  paymentDialogOpen,
  onClosePaymentDialog,
  onSubmitPayments,
  isLoading,
}) => {
  return (
    <>
      <Dialog open={viewDialogOpen} onClose={onCloseViewDialog} maxWidth="lg" fullWidth>
        <DialogTitle>
          <Typography variant="h6">SO Details - {selectedOrder?.orderNumber}</Typography>
        </DialogTitle>
        <DialogContent>
          {selectedOrder && (
            <Grid container spacing={3}>
              <Grid size={{ xs: 12, md: 6 }}>
                <Card>
                  <CardContent>
                    <Typography variant="h6" gutterBottom>
                      SO Information
                    </Typography>
                    <Stack spacing={1}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                        <Typography sx={{
                          color: "text.secondary"
                        }}>SO Date:</Typography>
                        <Typography>{formatDate(selectedOrder.orderDate)}</Typography>
                      </Box>
                      {selectedOrder.requiredDate && (
                        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                          <Typography sx={{
                            color: "text.secondary"
                          }}>Required Date:</Typography>
                          <Typography>{formatDate(selectedOrder.requiredDate)}</Typography>
                        </Box>
                      )}
                      {selectedOrder.shippedDate && (
                        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                          <Typography sx={{
                            color: "text.secondary"
                          }}>Shipped Date:</Typography>
                          <Typography>{formatDate(selectedOrder.shippedDate)}</Typography>
                        </Box>
                      )}
                      {selectedOrder.deliveredDate && (
                        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                          <Typography sx={{
                            color: "text.secondary"
                          }}>Delivered Date:</Typography>
                          <Typography>{formatDate(selectedOrder.deliveredDate)}</Typography>
                        </Box>
                      )}
                    </Stack>
                  </CardContent>
                </Card>
              </Grid>

              <Grid size={{ xs: 12, md: 6 }}>
                <Card>
                  <CardContent>
                    <Typography variant="h6" gutterBottom>
                      Customer Information
                    </Typography>
                    <Stack spacing={1}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                        <Typography sx={{
                          color: "text.secondary"
                        }}>Name:</Typography>
                        <Typography>{selectedOrder.customer?.name}</Typography>
                      </Box>
                      {(selectedOrder.customer as any)?.email && (
                        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                          <Typography sx={{
                            color: "text.secondary"
                          }}>Email:</Typography>
                          <Typography>{(selectedOrder.customer as any).email}</Typography>
                        </Box>
                      )}
                    </Stack>
                  </CardContent>
                </Card>
              </Grid>

              <Grid size={{ xs: 12 }}>
                <Card>
                  <CardContent>
                    <Typography variant="h6" gutterBottom>
                      SO Items
                    </Typography>
                    {selectedOrder.items && selectedOrder.items.length > 0 ? (
                      <TableContainer>
                        <Table size={TABLE_STYLES.size} sx={{ '& .MuiTableCell-root': { borderBottom: TABLE_STYLES.cell.border, py: TABLE_STYLES.cell.padding.py, px: TABLE_STYLES.cell.padding.px } }}>
                          <TableHead>
                            <TableRow sx={{ '& .MuiTableCell-head': { fontWeight: 600, backgroundColor: 'grey.50', color: 'text.primary', fontSize: '0.8rem' } }}>
                              <TableCell sx={{ width: '30%' }}>Product</TableCell>
                              <TableCell sx={{ width: '15%' }}>SKU/Barcode</TableCell>
                              <TableCell align="center" sx={{ width: '11%' }}>Quantity</TableCell>
                              <TableCell align="right" sx={{ width: '11%' }}>Unit Price</TableCell>
                              <TableCell align="right" sx={{ width: '16%' }}>Discount</TableCell>
                              <TableCell align="right" sx={{ width: '17%' }}>Total</TableCell>
                            </TableRow>
                          </TableHead>
                          <TableBody>
                            {selectedOrder.items.map((item: any, index: number) => (
                              <TableRow key={index} hover sx={{ '&:hover': { backgroundColor: 'action.hover' }, transition: 'background-color 0.2s ease', height: TABLE_STYLES.row.height }}>
                                <TableCell sx={{ fontSize: '0.8rem', lineHeight: 1.2 }}>
                                  {item.product?.name || 'Unknown Product'}
                                  {item.description && (
                                    <Typography sx={{ fontSize: '0.7rem', color: 'text.secondary', display: 'block' }}>
                                      {item.description}
                                    </Typography>
                                  )}
                                </TableCell>
                                <TableCell sx={{ fontSize: '0.8rem', fontWeight: 400, lineHeight: 1.2 }}>
                                  {item.product?.barcode || item.product?.sku || 'N/A'}
                                </TableCell>
                                <TableCell align="center">{item.quantity || 0}</TableCell>
                                <TableCell align="right">{formatCurrency(item.unitPrice || 0)}</TableCell>
                                <TableCell align="right">
                                  {item.discountType === 'percentage' && item.discountPercent ? `${item.discountPercent}%` : item.discountAmount ? `-${formatCurrency(item.discountAmount)}` : '-'}
                                </TableCell>
                                <TableCell align="right">{formatCurrency(item.totalAmount || item.quantity * item.unitPrice || 0)}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </TableContainer>
                    ) : (
                      <Alert severity="info">No items in this order</Alert>
                    )}
                  </CardContent>
                </Card>
              </Grid>

              {selectedOrder.isFulfilled && (
                <Grid size={{ xs: 12 }}>
                  <Card sx={{ bgcolor: 'info.lighter', borderLeft: '4px solid', borderColor: 'info.main' }}>
                    <CardContent>
                      <Typography variant="h6" gutterBottom>
                        Accounting Information
                      </Typography>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
                        <Typography variant="body2" sx={{
                          color: "text.secondary"
                        }}>
                          This sales order has been posted to the accounting system
                        </Typography>
                        <AccountingEntryLink sourceType="sales_order" sourceId={selectedOrder.id} variant="button" label="View Journal Entry" />
                      </Box>
                    </CardContent>
                  </Card>
                </Grid>
              )}

              <Grid size={{ xs: 12 }}>
                <Card>
                  <CardContent>
                    <Typography variant="h6" gutterBottom>
                      Order Summary
                    </Typography>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                      <Typography variant="h6">Total:</Typography>
                      <Typography variant="h6">{formatCurrency(selectedOrder.totalAmount || selectedOrder.total || 0)}</Typography>
                    </Box>
                  </CardContent>
                </Card>
              </Grid>
            </Grid>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={onCloseViewDialog}>Close</Button>
        </DialogActions>
      </Dialog>
      {selectedOrder && (
        <BlockedSalesOrderDialog
          open={blockedDialogOpen}
          orderNumber={selectedOrder.orderNumber || selectedOrder.id}
          isFulfilled={selectedOrder.isFulfilled}
          isPaid={!!(selectedOrder.paidAmount && selectedOrder.paidAmount > 0)}
          paidAmount={selectedOrder.paidAmount || 0}
          actionType={blockedDialogAction}
          onClose={onCloseBlockedDialog}
          onUnfulfillAndEdit={onUnfulfillAndEdit}
          onUnfulfillOnly={onUnfulfillOnly}
          onUnpayAndEdit={onUnpayAndEdit}
          onUnfulfillAndDelete={onUnfulfillAndDelete}
          onUnpayAndDelete={onUnpayAndDelete}
          loading={isLoading}
        />
      )}
      <DeletedOrdersDialog open={deletedOrdersDialogOpen} onClose={onCloseDeletedOrdersDialog} />
      <ConfirmationDialog
        open={deleteConfirmOpen}
        title="Confirm Delete"
        message={`Are you sure you want to delete order #${orderToDeleteName}? This will move it to deleted orders.`}
        confirmText="Delete"
        cancelText="Cancel"
        onConfirm={onConfirmDelete}
        onCancel={onCancelDelete}
        severity="warning"
      />
      {selectedOrder && <SalesOrderPrint open={printDialogOpen} onClose={onClosePrintDialog} salesOrder={selectedOrder} />}
      {selectedOrder && (
        <PaymentDialog
          open={paymentDialogOpen}
          onClose={onClosePaymentDialog}
          onSubmit={onSubmitPayments}
          orderNumber={selectedOrder.orderNumber}
          totalAmount={selectedOrder.totalAmount || 0}
          paidAmount={selectedOrder.paidAmount || 0}
        />
      )}
    </>
  );
}

export default OrdersDialogs
