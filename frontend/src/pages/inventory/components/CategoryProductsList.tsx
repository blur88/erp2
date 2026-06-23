import React from 'react'
import { Box, Typography } from '@mui/material'
import { useNavigate } from 'react-router-dom'

import EntityTable, { type ColumnConfig } from '@/components/common/EntityTable'
import { StatusChip } from '@/components/common/StatusChip'
import { useGetProductsQuery } from '@/store/api/inventoryApi'
import { useGetRegionalSettingsQuery } from '@/store/api/settingsApi'
import { getStockStatus } from '@/utils/stockUtils'
import type { Product } from '@/types'

interface CategoryProductsListProps {
  categoryId: string
}

const CategoryProductsList: React.FC<CategoryProductsListProps> = ({ categoryId }) => {
  const navigate = useNavigate()
  const { data: productsResponse, isLoading, isError } = useGetProductsQuery({ categoryId })
  const { data: regionalSettings } = useGetRegionalSettingsQuery()

  const products = productsResponse?.data ?? []
  const lowStockThreshold = regionalSettings?.lowStockThreshold ?? 10

  if (isError) {
    return (
      <Typography sx={{ color: 'error.main', py: 4, textAlign: 'center' }}>
        Failed to load products.
      </Typography>
    )
  }

  const columns: ColumnConfig<Product>[] = [
    {
      key: 'name',
      width: '50%',
      raw: true,
      render: (p) => (
        <Typography variant="body2" color="primary" sx={{ fontWeight: 600, fontSize: '0.8rem' }}>
          {p.name}
        </Typography>
      ),
    },
    {
      key: 'barcode',
      width: '25%',
      raw: true,
      render: (p) => (
        <Typography
          variant="body2"
          sx={{ fontSize: '0.8rem', color: p.barcode ? 'text.primary' : 'text.secondary' }}
        >
          {p.barcode || '—'}
        </Typography>
      ),
    },
    {
      key: 'stock',
      width: '25%',
      raw: true,
      render: (p) => {
        const stock = p.stockQuantity ?? 0
        const status = getStockStatus(stock, lowStockThreshold)
        return (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography variant="body2" sx={{ fontSize: '0.8rem' }}>
              {stock}
            </Typography>
            <StatusChip
              status={status}
              variant="outlined"
              sx={{ fontSize: '0.7rem', fontWeight: 500, height: 20 }}
            />
          </Box>
        )
      },
    },
  ]

  return (
    <EntityTable
      rows={products}
      columns={columns}
      loading={isLoading}
      total={products.length}
      label="Products"
      headers={['Name', 'Barcode', 'Stock']}
      selectedId={undefined}
      focusedIndex={-1}
      onSelect={(p) => navigate(`/inventory/products/${p.slug}/view`)}
      listRef={{ current: null }}
      dataAttr="product"
    />
  )
}

export default CategoryProductsList
