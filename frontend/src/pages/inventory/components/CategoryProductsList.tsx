import React from 'react'
import {
  Box,
  CircularProgress,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material'

import { TABLE_STYLES } from '@/constants/tableStyles'
import { useGetProductsQuery } from '@/store/api/inventoryApi'
import { useGetRegionalSettingsQuery } from '@/store/api/settingsApi'
import { StatusChip } from '@/components/common/StatusChip'
import { getStockStatus } from '@/utils/stockUtils'

interface CategoryProductsListProps {
  categoryId: string
}

const CategoryProductsList: React.FC<CategoryProductsListProps> = ({ categoryId }) => {
  const { data: productsResponse, isLoading, isError } = useGetProductsQuery({ categoryId })
  const { data: regionalSettings } = useGetRegionalSettingsQuery()

  const products = productsResponse?.data ?? []
  const lowStockThreshold = regionalSettings?.lowStockThreshold ?? 10

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
        <CircularProgress />
      </Box>
    )
  }

  if (isError) {
    return (
      <Typography sx={{ color: 'error.main', py: 4, textAlign: 'center' }}>
        Failed to load products.
      </Typography>
    )
  }

  if (products.length === 0) {
    return (
      <Typography sx={{ color: 'text.secondary', py: 4, textAlign: 'center' }}>
        No products in this category.
      </Typography>
    )
  }

  return (
    <TableContainer component={Box}>
      <Table size={TABLE_STYLES.size}>
        <TableHead>
          <TableRow sx={{ '& .MuiTableCell-head': { fontWeight: 600, backgroundColor: 'grey.50' } }}>
            <TableCell>Name</TableCell>
            <TableCell>Barcode</TableCell>
            <TableCell>Stock</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {products.map((product) => {
            const stock = product.stockQuantity ?? 0
            const status = getStockStatus(stock, lowStockThreshold)

            return (
              <TableRow key={product.id} hover>
                <TableCell>
                  <Typography variant="body2" color="primary" sx={{ fontWeight: 600, fontSize: '0.8rem' }}>
                    {product.name}
                  </Typography>
                </TableCell>
                <TableCell>
                  <Typography
                    variant="body2"
                    sx={{ fontSize: '0.8rem', color: product.barcode ? 'text.primary' : 'text.secondary' }}
                  >
                    {product.barcode || '—'}
                  </Typography>
                </TableCell>
                <TableCell>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Typography variant="body2" sx={{ fontSize: '0.8rem' }}>
                      {stock}
                    </Typography>
                    <StatusChip status={status}
                      sx={{ fontSize: '0.7rem', fontWeight: 500, height: 20 }}
                    />
                  </Box>
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </TableContainer>
  )
}

export default CategoryProductsList
