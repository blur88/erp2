import type { ReactNode } from 'react'
import { Box, Card, CardContent, Grid, Link, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography } from '@mui/material'
import { Link as RouterLink } from 'react-router-dom'

import { TABLE_STYLES } from '@/constants/tableStyles'
import type { PurchaseOrder } from '@/types'
import { formatCurrency, formatDate } from '@/utils/formatters'

import PurchaseOrderPaymentStatusChip from './PurchaseOrderPaymentStatusChip'
import PurchaseOrderStatusChip from './PurchaseOrderStatusChip'

interface PurchaseOrderOverviewTabProps {
  order: PurchaseOrder
}

function Field({ label, value }: { label: string; value?: ReactNode }) {
  return (
    <Box sx={{ mb: 1.5 }}>
      <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: 0.25 }}>
        {label}
      </Typography>
      <Typography component="div" variant="body2" sx={{ color: 'text.primary' }}>
        {value ?? '—'}
      </Typography>
    </Box>
  )
}

export default function PurchaseOrderOverviewTab({ order }: PurchaseOrderOverviewTabProps) {
  const items = order.items ?? []
  const subtotal = order.subtotal ?? order.totalAmount ?? 0
  const shippingAmount = order.shippingAmount ?? 0
  const paidAmount = order.paidAmount ?? 0
  const balance = (order.totalAmount ?? 0) - paidAmount
  const isSurplus = balance < 0
  const balanceLabel = isSurplus ? 'Surplus' : 'Balance Due'
  const balanceValue = formatCurrency(isSurplus ? -balance : balance)

  return (
    <Box>
      <Grid container spacing={3} sx={{ mb: 3, alignItems: 'stretch' }}>
        <Grid size={{ xs: 12, md: 6 }} sx={{ display: 'flex' }}>
          <Card sx={{ flex: 1 }}>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Order Info
              </Typography>
              <Field label="Purchase Order" value={order.orderNumber} />
              <Field label="Order Date" value={formatDate(order.orderDate)} />
              <Field
                label="Supplier"
                value={
                  order.supplier ? (
                    <Link component={RouterLink} to={`/purchasing/suppliers/${order.supplier.slug}/view`}>
                      {order.supplier.companyName}
                    </Link>
                  ) : '—'
                }
              />
              <Field label="Notes" value={order.notes} />
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, md: 6 }} sx={{ display: 'flex' }}>
          <Card sx={{ flex: 1 }}>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Summary
              </Typography>
              <Field
                label="Status"
                value={
                  <Box sx={{ display: 'flex', gap: 1 }}>
                    <PurchaseOrderStatusChip status={order.status} />
                    <PurchaseOrderPaymentStatusChip status={order.paymentStatus} />
                  </Box>
                }
              />
              <Field label="Total Amount" value={formatCurrency(order.totalAmount ?? 0)} />
              <Field label="Shipping Fee" value={formatCurrency(shippingAmount)} />
              <Field label="Paid Amount" value={formatCurrency(paidAmount)} />
              <Field label={balanceLabel} value={balanceValue} />
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <TableContainer component={Paper} variant="outlined">
        <Table size={TABLE_STYLES.size}>
          <TableHead>
            <TableRow sx={{ '& .MuiTableCell-head': { fontWeight: 600 } }}>
              <TableCell>Product</TableCell>
              <TableCell align="right">Quantity</TableCell>
              <TableCell align="right">Unit Cost</TableCell>
              <TableCell align="right">Discount</TableCell>
              <TableCell align="right">Subtotal</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {items.map((item) => (
              <TableRow key={item.id} hover>
                <TableCell>{item.product?.name ?? item.description ?? '—'}</TableCell>
                <TableCell align="right">{item.quantity}</TableCell>
                <TableCell align="right">{formatCurrency(item.unitCost ?? item.unitPrice ?? 0)}</TableCell>
                <TableCell align="right">
                  {item.discountAmount
                    ? `${formatCurrency(item.discountAmount)}${item.discountPercent ? ` (${Number(item.discountPercent).toFixed(2)}%)` : ''}`
                    : '—'}
                </TableCell>
                <TableCell align="right">{formatCurrency(item.totalAmount ?? item.total ?? 0)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 2 }}>
        <Box sx={{ minWidth: 240 }}>
          {[
            { label: 'Subtotal', value: formatCurrency(subtotal) },
            { label: 'Shipping', value: formatCurrency(shippingAmount) },
            { label: 'Total', value: formatCurrency(order.totalAmount ?? 0), bold: true },
            { label: 'Paid', value: formatCurrency(paidAmount) },
            { label: isSurplus ? 'Surplus' : 'Balance', value: balanceValue, bold: true },
          ].map(({ label, value, bold }) => (
            <Box key={label} sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
              <Typography variant="body2" sx={{ fontWeight: bold ? 600 : 400 }}>
                {label}
              </Typography>
              <Typography variant="body2" sx={{ fontWeight: bold ? 600 : 400 }}>
                {value}
              </Typography>
            </Box>
          ))}
        </Box>
      </Box>
    </Box>
  )
}
