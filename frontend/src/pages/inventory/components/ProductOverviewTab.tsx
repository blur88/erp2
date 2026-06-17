import { Box, Card, CardContent, Grid, Typography } from '@mui/material'

import MarginChip from '@/components/common/MarginChip'
import { StatusChip } from '@/components/common/StatusChip'
import { useGetRegionalSettingsQuery } from '@/store/api/settingsApi'
import { formatCurrency } from '@/utils/currency'
import { formatNumber } from '@/utils/formatters'
import { getStockStatus } from '@/utils/stockUtils'
import type { Product } from '@/types'

function Field({ label, value }: { label: string; value?: string | null }) {
  return (
    <Box sx={{ mb: 1.5 }}>
      <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: 0.25 }}>
        {label}
      </Typography>
      <Typography variant="body2" sx={{ color: 'text.primary' }}>
        {value != null && value !== '' ? value : '—'}
      </Typography>
    </Box>
  )
}

export default function ProductOverviewTab({ product }: { product: Product }) {
  const priceListItems = [...(product.priceListItems ?? [])].sort(
    (a, b) => (a.priceList?.priority ?? 0) - (b.priceList?.priority ?? 0),
  )
  const { data: regionalSettings } = useGetRegionalSettingsQuery()
  const lowStockThreshold = regionalSettings?.lowStockThreshold ?? 10
  const stockStatus = getStockStatus(product.stockQuantity, lowStockThreshold)

  return (
    <Box>
      <Grid container spacing={3}>
        <Grid size={{ xs: 12, md: 6 }} sx={{ display: 'flex', flexDirection: 'column' }}>
          <Card sx={{ flex: 1 }}>
            <CardContent>
              <Typography variant="h6" gutterBottom>Basic Info</Typography>
              <Field label="Barcode" value={product.barcode} />
              <Field label="Type" value={product.type} />
              <Field label="Category" value={product.category?.name} />
              <Field label="Description" value={product.description} />
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, md: 6 }} sx={{ display: 'flex', flexDirection: 'column' }}>
          <Card sx={{ flex: 1 }}>
            <CardContent>
              <Typography variant="h6" gutterBottom>Pricing</Typography>
              <Field label="Cost Price" value={formatCurrency(product.baseCost)} />
              {priceListItems.length === 0 ? (
                <Typography variant="body2" sx={{ color: 'text.secondary' }}>—</Typography>
              ) : (
                priceListItems.map((item) => (
                  <Box key={item.priceListId} sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                    <Typography variant="body2" sx={{ minWidth: 140 }}>
                      {item.priceList?.name ?? 'Price'}
                    </Typography>
                    <Typography variant="body2">{formatCurrency(item.price)}</Typography>
                    <MarginChip price={item.price} cost={product.baseCost} />
                  </Box>
                ))
              )}
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, md: 6 }} sx={{ display: 'flex', flexDirection: 'column' }}>
          <Card sx={{ flex: 1 }}>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                <Typography variant="h6">Stock</Typography>
                <StatusChip status={stockStatus} />
              </Box>
              <Field label="Stock Qty" value={formatNumber(product.stockQuantity)} />
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, md: 6 }} sx={{ display: 'flex', flexDirection: 'column' }}>
          <Card sx={{ flex: 1 }}>
            <CardContent>
              <Typography variant="h6" gutterBottom>Notes</Typography>
              <Field label="Notes" value={product.notes} />
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  )
}
