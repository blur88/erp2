import React from 'react'
import { Box, Typography } from '@mui/material'
import { useNavigate } from 'react-router-dom'

import { DataTable, type Column, bold, viewAction } from '@/components/common/DataTable'
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

  const columns: Column<Product>[] = [
    { header: 'Name', width: '45%', render: (p) => bold(p.name) },
    { header: 'Barcode', width: '25%', render: (p) => p.barcode || '—' },
    {
      header: 'Stock',
      width: '20%',
      render: (p) => {
        const stock = p.stockQuantity ?? 0
        const status = getStockStatus(stock, lowStockThreshold)
        return (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography variant="body2">{stock}</Typography>
            <StatusChip status={status} variant="outlined" sx={{ fontSize: '0.7rem', fontWeight: 500, height: 20 }} />
          </Box>
        )
      },
    },
    {
      header: 'Action',
      align: 'right',
      width: '10%',
      render: (p) => viewAction(() => navigate(`/inventory/products/${p.slug}/view`)),
    },
  ]

  return (
    <DataTable
      columns={columns}
      rows={products}
      getRowKey={(p) => p.id}
      emptyText="No products in this category."
      errorText="Failed to load products."
      isLoading={isLoading}
      isError={isError}
    />
  )
}

export default CategoryProductsList
