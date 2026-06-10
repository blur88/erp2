import React from 'react'
import {
  Alert,
  Box,
  CircularProgress,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material'

import { WorkspaceCardSectionHeader } from '@/components/common/WorkspaceCardSectionHeader'
import { TABLE_STYLES } from '@/constants/tableStyles'
import { useGetCategoryProductsQuery } from '@/store/api/inventoryApi'
import { useGetRegionalSettingsQuery } from '@/store/api/settingsApi'
import type { Category } from '@/types'
import { StatusChip } from '@/components/common/StatusChip'
import { getStockStatus } from '@/utils/stockUtils'

interface CategoryWorkspaceCardProps {
  selectedCategory: Category | null
}

const CategoryWorkspaceCard: React.FC<CategoryWorkspaceCardProps> = ({ selectedCategory }) => {
  const categoryId = selectedCategory?.id ?? ''
  const { data: productsResponse, isLoading, isError } = useGetCategoryProductsQuery(
    categoryId,
    { skip: !categoryId },
  )
  const { data: regionalSettings } = useGetRegionalSettingsQuery()

  const products = productsResponse?.data ?? []
  const lowStockThreshold = regionalSettings?.lowStockThreshold ?? 10

  if (!selectedCategory) {
    return <Paper sx={{ flex: 1 }} />
  }

  return (
    <Paper sx={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <WorkspaceCardSectionHeader title="Category Products" />

      <Box sx={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', p: TABLE_STYLES.cell.padding.px }}>
        <Box sx={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {isLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
              <CircularProgress />
            </Box>
          ) : isError ? (
            <Alert severity="error">Failed to load products.</Alert>
          ) : products.length === 0 ? (
            <Alert severity="info">No products in this category.</Alert>
          ) : (
            <TableContainer sx={{ flex: 1, overflow: 'auto' }}>
              <Table
                size={TABLE_STYLES.size}
                sx={{
                  '& .MuiTableCell-root': {
                    borderBottom: TABLE_STYLES.cell.border,
                    py: TABLE_STYLES.cell.padding.py,
                    px: TABLE_STYLES.cell.padding.px,
                  },
                }}
              >
                <TableHead>
                  <TableRow
                    sx={{
                      '& .MuiTableCell-head': {
                        fontWeight: 600,
                        backgroundColor: 'grey.50',
                        color: 'text.primary',
                        fontSize: '0.8rem',
                      },
                    }}
                  >
                    <TableCell>Name</TableCell>
                    <TableCell align="right" sx={{ width: '15%' }}>
                      Stock
                    </TableCell>
                    <TableCell align="center" sx={{ width: '25%' }}>
                      Status
                    </TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {products.map((product) => {
                    const stock = product.stockQuantity ?? 0
                    const status = getStockStatus(stock, lowStockThreshold)

                    return (
                      <TableRow key={product.id} hover sx={{ height: TABLE_STYLES.row.height }}>
                        <TableCell sx={{ fontSize: '0.8rem', fontWeight: 600, color: 'primary.main' }}>
                          {product.name}
                        </TableCell>
                        <TableCell align="right" sx={{ fontSize: '0.8rem' }}>
                          {stock}
                        </TableCell>
                        <TableCell align="center">
                          <StatusChip status={status}
                            sx={{ fontSize: '0.7rem', fontWeight: 500, height: 20 }}
                          />
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </Box>

        {selectedCategory.description && (
          <Box sx={{ mt: 1 }}>
            <Typography
              variant="tableHeader"
              sx={{ fontWeight: 600, fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.5px', mb: 1 }}
            >
              Notes
            </Typography>
            <Box
              sx={{
                p: 2,
                backgroundColor: 'grey.50',
                borderRadius: 1,
                fontSize: '0.8rem',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}
            >
              {selectedCategory.description}
            </Box>
          </Box>
        )}
      </Box>
    </Paper>
  )
}

export default CategoryWorkspaceCard
