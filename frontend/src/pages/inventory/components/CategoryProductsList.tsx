import React from 'react'

import { DataTable, type Column, bold } from '@/components/common/DataTable'
import { StatusChip } from '@/components/common/StatusChip'
import { useGetCategoryProductsQuery, type CategoryProduct } from '@/store/api/inventoryApi'
import { useGetRegionalSettingsQuery } from '@/store/api/settingsApi'
import { getStockStatus } from '@/utils/stockUtils'
import { formatWholeQuantity } from '@/utils/formatters'

interface CategoryProductsListProps {
  categoryId: string
}

const CategoryProductsList: React.FC<CategoryProductsListProps> = ({ categoryId }) => {
  const { data: productsResponse, isLoading, isError } = useGetCategoryProductsQuery(categoryId)
  const { data: regionalSettings } = useGetRegionalSettingsQuery()

  const products = productsResponse?.data ?? []
  const lowStockThreshold = regionalSettings?.lowStockThreshold ?? 10

  const columns: Column<CategoryProduct>[] = [
    { header: 'Name', width: '55%', render: (p) => bold(p.name) },
    {
      header: 'Qty',
      width: '15%',
      align: 'right',
      render: (p) => formatWholeQuantity(p.stockQuantity ?? 0),
    },
    {
      header: 'Status',
      width: '30%',
      render: (p) => {
        const status = getStockStatus(p.stockQuantity ?? 0, lowStockThreshold)
        return (
          <StatusChip
            status={status}
            variant="outlined"
            sx={{ fontSize: '0.7rem', fontWeight: 500, height: 20 }}
          />
        )
      },
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
