import { Box, Card, CardContent, Grid, Link, Typography } from '@mui/material'
import type { ReactNode } from 'react'
import { Link as RouterLink } from 'react-router-dom'

import type { SalesOrder } from '@/types'
import { formatCurrency, formatDate } from '@/utils/formatters'
import { toScaledAmount, fromScaledAmount } from '@/utils/currency'

import { StatusChip } from '@/components/common/StatusChip'
import { DataTable, type Column } from '@/components/common/DataTable'

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
  const paidMinor = toScaledAmount(order.paidAmount) ?? 0n
  const balanceMinor = order.balanceDue
    ? (toScaledAmount(order.balanceDue) ?? 0n)
    : (toScaledAmount(order.totalAmount) ?? 0n) - paidMinor
  const isSurplus = balanceMinor < 0n
  const balanceLabel = isSurplus ? 'Surplus' : 'Balance Due'
  const balanceValue = formatCurrency(fromScaledAmount(isSurplus ? -balanceMinor : balanceMinor))

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
                    <StatusChip status={order.status} />
                    <StatusChip status={order.paymentStatus} />
                  </Box>
                }
              />
              <Field label="Total Amount" value={formatCurrency(order.totalAmount)} />
              <Field label="Shipping Fee" value={formatCurrency(shippingAmount)} />
              <Field label="Paid Amount" value={formatCurrency(fromScaledAmount(paidMinor))} />
              <Field label={balanceLabel} value={balanceValue} />
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <DataTable
        columns={
          [
            { header: 'Product', render: (item) => item.product?.name ?? '—' },
            { header: 'Quantity', align: 'right', render: (item) => item.quantity },
            { header: 'Unit Price', align: 'right', render: (item) => formatCurrency(item.unitPrice) },
            { header: 'Discount', align: 'right', render: (item) => formatDiscount(item) },
            { header: 'Subtotal', align: 'right', render: (item) => formatCurrency(item.totalAmount) },
          ] as Column<(typeof items)[number]>[]
        }
        rows={items}
        getRowKey={(item) => item.id}
        emptyText="No items on this sales order."
      />

      <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 2 }}>
        <Box sx={{ minWidth: 240 }}>
          {[
            { label: 'Subtotal', value: formatCurrency(subtotal) },
            { label: 'Shipping', value: formatCurrency(shippingAmount) },
            { label: 'Total', value: formatCurrency(order.totalAmount), bold: true },
            { label: 'Paid', value: formatCurrency(fromScaledAmount(paidMinor)) },
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
