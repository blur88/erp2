import React from 'react'
import { default as DeleteIcon } from '@mui/icons-material/Delete'
import { default as EditIcon } from '@mui/icons-material/Edit'
import {
  Box,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableRow,
  Typography,
} from '@mui/material'
import Grid from '@mui/material/Grid'

import { AppButton } from '@/components/common/AppButton'
import { EntityContextHeaderBar } from '@/components/common/EntityContextHeaderBar'
import { TABLE_STYLES } from '@/constants/tableStyles'
import type { Customer } from '@/types'
import { formatCurrency, formatDate } from '@/utils/formatters'
import { formatCustomerType } from '@/utils/customerUtils'

interface CustomerContextHeaderProps {
  selectedCustomer: Customer | null
  onEdit: () => void
  onDelete: () => void
}

const detailTableSx = {
  tableLayout: 'fixed',
  '& .MuiTableCell-root': {
    border: 'none',
    py: TABLE_STYLES.cell.padding.py,
    px: TABLE_STYLES.cell.padding.px,
    '&:nth-of-type(1)': { width: '40%' },
    '&:nth-of-type(2)': { width: '60%' },
  },
}

const labelCellSx = {
  fontWeight: 600,
  color: 'text.secondary',
  fontSize: '0.8rem',
}

const valueCellSx = {
  fontSize: '0.8rem',
}

const CustomerContextHeader: React.FC<CustomerContextHeaderProps> = ({
  selectedCustomer,
  onEdit,
  onDelete,
}) => {
  if (!selectedCustomer) {
    return (
      <Paper sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', p: 4 }}>
        <Typography variant="h6" sx={{ color: 'text.secondary' }}>
          Select a customer to view details
        </Typography>
      </Paper>
    )
  }

  return (
    <Paper sx={{ overflow: 'hidden' }}>
      <EntityContextHeaderBar
        title={`Customer Details - ${selectedCustomer.name}`}
        actions={(
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <AppButton
              size="small"
              variant="secondary"
              startIcon={<EditIcon />}
              title="Edit Customer"
              onClick={onEdit}
            >
              Edit
            </AppButton>
            <AppButton
              size="small"
              variant="danger"
              startIcon={<DeleteIcon />}
              title="Delete Customer"
              onClick={onDelete}
            >
              Delete
            </AppButton>
          </Box>
        )}
      />

      <Box sx={{ p: TABLE_STYLES.cell.padding.px }}>
        <Grid container spacing={3}>
          <Grid size={{ xs: 12, md: 6 }}>
            <TableContainer>
              <Table size={TABLE_STYLES.size} sx={detailTableSx}>
                <TableBody>
                  <TableRow>
                    <TableCell
                      colSpan={2}
                      sx={{
                        pb: TABLE_STYLES.cell.padding.py * 0.67,
                        py: TABLE_STYLES.cell.padding.py * 0.67,
                        borderTop: TABLE_STYLES.cell.border,
                      }}
                    >
                      <Typography
                        variant="h6"
                        sx={{ fontWeight: 600, color: 'primary.main', fontSize: '0.8rem' }}
                      >
                        Customer Information
                      </Typography>
                    </TableCell>
                  </TableRow>
                  <TableRow sx={{ backgroundColor: 'grey.50' }}>
                    <TableCell sx={labelCellSx}>Type</TableCell>
                    <TableCell sx={valueCellSx}>
                      {formatCustomerType(selectedCustomer.type)}
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell sx={labelCellSx}>Status</TableCell>
                    <TableCell
                      sx={{
                        ...valueCellSx,
                        color: selectedCustomer.isActive ? 'success.main' : 'text.disabled',
                      }}
                    >
                      {selectedCustomer.isActive ? 'Active' : 'Inactive'}
                    </TableCell>
                  </TableRow>
                  <TableRow sx={{ backgroundColor: 'grey.50' }}>
                    <TableCell sx={labelCellSx}>Phone</TableCell>
                    <TableCell sx={valueCellSx}>{selectedCustomer.phone || '—'}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell sx={labelCellSx}>Email</TableCell>
                    <TableCell sx={valueCellSx}>{selectedCustomer.email || '—'}</TableCell>
                  </TableRow>
                  <TableRow sx={{ backgroundColor: 'grey.50' }}>
                    <TableCell sx={labelCellSx}>Price List</TableCell>
                    <TableCell sx={valueCellSx}>{selectedCustomer.priceList?.name || '—'}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </TableContainer>
          </Grid>

          <Grid size={{ xs: 12, md: 6 }}>
            <TableContainer>
              <Table size={TABLE_STYLES.size} sx={detailTableSx}>
                <TableBody>
                  <TableRow>
                    <TableCell
                      colSpan={2}
                      sx={{
                        pb: TABLE_STYLES.cell.padding.py * 0.67,
                        py: TABLE_STYLES.cell.padding.py * 0.67,
                        borderTop: TABLE_STYLES.cell.border,
                      }}
                    >
                      <Typography
                        variant="h6"
                        sx={{ fontWeight: 600, color: 'primary.main', fontSize: '0.8rem' }}
                      >
                        Account Summary
                      </Typography>
                    </TableCell>
                  </TableRow>
                  <TableRow sx={{ backgroundColor: 'grey.50' }}>
                    <TableCell sx={labelCellSx}>Total Orders</TableCell>
                    <TableCell sx={valueCellSx}>{selectedCustomer.totalOrders ?? 0}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell sx={labelCellSx}>Total Sales</TableCell>
                    <TableCell sx={valueCellSx}>
                      {formatCurrency(selectedCustomer.totalSales ?? 0)}
                    </TableCell>
                  </TableRow>
                  <TableRow sx={{ backgroundColor: 'grey.50' }}>
                    <TableCell sx={labelCellSx}>Avg Order Value</TableCell>
                    <TableCell sx={valueCellSx}>
                      {formatCurrency(selectedCustomer.averageOrderValue ?? 0)}
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell sx={labelCellSx}>First Purchase</TableCell>
                    <TableCell sx={valueCellSx}>
                      {selectedCustomer.firstPurchaseDate
                        ? formatDate(selectedCustomer.firstPurchaseDate)
                        : '—'}
                    </TableCell>
                  </TableRow>
                  <TableRow sx={{ backgroundColor: 'grey.50' }}>
                    <TableCell sx={labelCellSx}>Last Purchase</TableCell>
                    <TableCell sx={valueCellSx}>
                      {selectedCustomer.lastPurchaseDate
                        ? formatDate(selectedCustomer.lastPurchaseDate)
                        : '—'}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </TableContainer>
          </Grid>
        </Grid>
      </Box>
    </Paper>
  )
}

export default CustomerContextHeader
