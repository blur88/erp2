import {
  Box,
  Card,
  CardContent,
  Grid,
  Link,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material'
import type { ReactNode } from 'react'
import { Link as RouterLink } from 'react-router-dom'

import { TABLE_STYLES } from '@/constants/tableStyles'
import type { SalesOrder } from '@/types'
import { formatCurrency, formatDate } from '@/utils/formatters'

import { SalesOrderPaymentStatusChip } from './SalesOrderPaymentStatusChip'
import { SalesOrderStatusChip } from './SalesOrderStatusChip'

interface OrderOverviewTabProps {
  order: SalesOrder
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

function formatDiscount(item: ReturnType<typeof getItems>[number]): string {
  if (item.discountType === 'percentage' && item.discountPercent && item.discountPercent > 0) {
    return `${Number(item.discountPercent).toFixed(2)}%`
  }

  if (item.discountType === 'amount' && item.discountAmount && item.discountAmount > 0) {
    return formatCurrency(item.discountAmount)
  }

  return '—'
}

function getItems(order: SalesOrder) {
  return order.items ?? []
}

export default function OrderOverviewTab({ order }: OrderOverviewTabProps) {
  const items = getItems(order)
  const subtotal = order.subtotal ?? order.totalAmount
  const shippingAmount = order.shippingAmount ?? 0
  const paidAmount = order.paidAmount ?? 0
  const balance = order.balanceDue ?? order.totalAmount - paidAmount

  return (
    <Box>
      <Grid container spacing={3} sx={{ mb: 3, alignItems: 'stretch' }}>
        <Grid size={{ xs: 12, md: 6 }} sx={{ display: 'flex' }}>
          <Card sx={{ flex: 1 }}>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Order Info
              </Typography>
              <Field label="Order Number" value={order.orderNumber} />
              <Field label="Order Date" value={formatDate(order.orderDate)} />
              <Field
                label="Customer"
                value={
                  order.customer ? (
                    <Link component={RouterLink} to={`/sales/customers/${order.customer.slug}/view`}>
                      {order.customer.name}
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
                    <SalesOrderStatusChip status={order.status} />
                    <SalesOrderPaymentStatusChip status={order.paymentStatus} />
                  </Box>
                }
              />
              <Field label="Total Amount" value={formatCurrency(order.totalAmount)} />
              <Field label="Shipping Fee" value={formatCurrency(shippingAmount)} />
              <Field label="Paid Amount" value={formatCurrency(paidAmount)} />
              <Field label="Balance Due" value={formatCurrency(balance)} />
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
              <TableCell align="right">Unit Price</TableCell>
              <TableCell align="right">Discount</TableCell>
              <TableCell align="right">Subtotal</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {items.map((item) => (
              <TableRow key={item.id} hover>
                <TableCell>{item.product?.name ?? '—'}</TableCell>
                <TableCell align="right">{item.quantity}</TableCell>
                <TableCell align="right">{formatCurrency(item.unitPrice)}</TableCell>
                <TableCell align="right">{formatDiscount(item)}</TableCell>
                <TableCell align="right">{formatCurrency(item.totalAmount)}</TableCell>
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
            { label: 'Total', value: formatCurrency(order.totalAmount), bold: true },
            { label: 'Paid', value: formatCurrency(paidAmount) },
            { label: 'Balance', value: formatCurrency(balance), bold: true },
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
