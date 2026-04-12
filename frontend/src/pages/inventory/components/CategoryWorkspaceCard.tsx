import React, { useEffect, useState } from 'react'
import { Box, Grid, Paper, Tab, Tabs, Typography } from '@mui/material'

import { TABLE_STYLES } from '@/constants/tableStyles'
import { useGetProductsQuery } from '@/store/api/inventoryApi'
import type { Category } from '@/types'
import { formatDate } from '@/utils/formatters'

interface CategoryWorkspaceCardProps {
  selectedCategory: Category | null
}

const CategoryWorkspaceCard: React.FC<CategoryWorkspaceCardProps> = ({ selectedCategory }) => {
  const [tabValue, setTabValue] = useState(0)
  const categoryId = selectedCategory?.id ?? ''

  useEffect(() => {
    setTabValue(0)
  }, [categoryId])

  const { data: productsResponse } = useGetProductsQuery(
    { categoryId },
    { skip: !categoryId || tabValue !== 1 },
  )
  const products = productsResponse?.data ?? []

  if (!selectedCategory) {
    return <Paper sx={{ flex: 1 }} />
  }

  const levelLabel = selectedCategory.level === 0 ? 'Root' : `Level ${selectedCategory.level}`
  const parentLabel = selectedCategory.parent?.name ?? (selectedCategory.isRoot ? 'None' : '-')

  return (
    <Paper sx={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
        <Tabs
          value={tabValue}
          onChange={(_, value) => setTabValue(value)}
          sx={{
            minHeight: 40,
            '& .MuiTab-root': { minHeight: 40, fontSize: '0.8rem', textTransform: 'none', fontWeight: 600 },
          }}
        >
          <Tab label="Details" />
          <Tab label="Products" />
        </Tabs>
      </Box>

      <Box
        role="tabpanel"
        sx={{ flex: 1, overflow: 'auto', display: tabValue === 0 ? 'block' : 'none', p: TABLE_STYLES.cell.padding.px }}
      >
        {tabValue === 0 && (
          <Grid container spacing={2} sx={{ mt: 0.5 }}>
            {[
              { label: 'Full Path', value: selectedCategory.fullPath },
              { label: 'Level', value: levelLabel },
              { label: 'Parent', value: parentLabel },
              { label: 'Products', value: String(selectedCategory.productCount ?? 0) },
              { label: 'Created', value: formatDate(selectedCategory.createdAt) },
            ].map(({ label, value }) => (
              <Grid key={label} size={{ xs: 12, sm: 6 }}>
                <Typography
                  variant="caption"
                  sx={{ color: 'text.secondary', fontWeight: 600, fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}
                >
                  {label}
                </Typography>
                <Typography variant="body2" sx={{ fontSize: '0.85rem', mt: 0.25 }}>
                  {value}
                </Typography>
              </Grid>
            ))}
          </Grid>
        )}
      </Box>

      <Box
        role="tabpanel"
        sx={{ flex: 1, overflow: 'auto', display: tabValue === 1 ? 'flex' : 'none', flexDirection: 'column' }}
      >
        {tabValue === 1 && (
          <Box sx={{ p: TABLE_STYLES.cell.padding.px }}>
            {products.length === 0 ? (
              <Typography variant="body2" sx={{ color: 'text.secondary', textAlign: 'center', py: 2 }}>
                No products in this category
              </Typography>
            ) : (
              products.map((product) => (
                <Box
                  key={product.id}
                  sx={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    py: 0.75,
                    borderBottom: TABLE_STYLES.cell.border,
                    '&:last-child': { borderBottom: 'none' },
                  }}
                >
                  <Typography variant="body2" sx={{ fontSize: '0.8rem' }}>
                    {product.name}
                  </Typography>
                  <Typography variant="body2" sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>
                    {product.stockQuantity} in stock
                  </Typography>
                </Box>
              ))
            )}
          </Box>
        )}
      </Box>
    </Paper>
  )
}

export default CategoryWorkspaceCard
