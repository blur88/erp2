import React from 'react'
import {
  Delete as DeleteIcon,
  Edit as EditIcon,
} from '@mui/icons-material'
import {
  Box,
  IconButton,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableRow,
  Typography,
} from '@mui/material'
import Grid from '@mui/material/GridLegacy'

import { TABLE_STYLES } from '@/constants/tableStyles'
import type { Supplier } from '@/types'
import { SupplierType } from '@/types'
import { formatCurrency, formatDate } from '@/utils/formatters'

interface SupplierContextHeaderProps {
  selectedSupplier: Supplier | null
  onEdit: () => void
  onDelete: () => void
}

const actionIconSx = {
  height: `${TABLE_STYLES.row.height * 0.75}px`,
  width: `${TABLE_STYLES.row.height * 0.75}px`,
  minHeight: 20,
  minWidth: 20,
  p: 0.125,
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

const labelCellSx = { fontWeight: 600, color: 'text.secondary', fontSize: '0.8rem' }
const valueCellSx = { fontSize: '0.8rem' }

const SupplierContextHeader: React.FC<SupplierContextHeaderProps> = ({
  selectedSupplier,
  onEdit,
  onDelete,
}) => {
  if (!selectedSupplier) {
    return (
      <Paper sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', p: 4 }}>
        <Typography variant="h6" color="text.secondary">
          Select a supplier to view details
        </Typography>
      </Paper>
    )
  }

  const addressParts = [
    selectedSupplier.streetAddress,
    selectedSupplier.city,
    selectedSupplier.state,
    selectedSupplier.postalCode,
    selectedSupplier.country,
  ].filter(Boolean)

  return (
    <Paper sx={{ overflow: 'hidden' }}>
      <Box
        sx={{
          p: TABLE_STYLES.cell.padding.px,
          borderBottom: TABLE_STYLES.cell.border,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <Typography
          variant="tableHeader"
          sx={{
            fontWeight: 600,
            fontSize: '0.8rem',
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
          }}
        >
          Supplier - {selectedSupplier.companyName}
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25 }}>
          <IconButton
            size="small"
            title="Edit Supplier"
            onClick={onEdit}
            sx={{ ...actionIconSx, color: 'primary.main' }}
          >
            <EditIcon sx={{ fontSize: `${TABLE_STYLES.row.height * 0.5}px` }} />
          </IconButton>
          <IconButton
            size="small"
            title="Delete Supplier"
            onClick={onDelete}
            sx={{ ...actionIconSx, color: 'error.main' }}
          >
            <DeleteIcon sx={{ fontSize: `${TABLE_STYLES.row.height * 0.5}px` }} />
          </IconButton>
        </Box>
      </Box>

      <Box sx={{ p: TABLE_STYLES.cell.padding.px }}>
        <Grid container spacing={3}>
          <Grid item xs={12} md={6}>
            <TableContainer>
              <Table size={TABLE_STYLES.size} sx={detailTableSx}>
                <TableBody>
                  <TableRow>
                    <TableCell
                      colSpan={2}
                      sx={{ pb: TABLE_STYLES.cell.padding.py * 0.67, py: TABLE_STYLES.cell.padding.py * 0.67, borderTop: TABLE_STYLES.cell.border }}
                    >
                      <Typography variant="h6" sx={{ fontWeight: 600, color: 'primary.main', fontSize: '0.8rem' }}>
                        Supplier Information
                      </Typography>
                    </TableCell>
                  </TableRow>
                  <TableRow sx={{ backgroundColor: 'grey.50' }}>
                    <TableCell sx={labelCellSx}>Type</TableCell>
                    <TableCell sx={valueCellSx}>
                      {selectedSupplier.type === SupplierType.LOCAL ? 'Local' : 'International'}
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell sx={labelCellSx}>Status</TableCell>
                    <TableCell sx={{ ...valueCellSx, color: selectedSupplier.isActive ? 'success.main' : 'text.disabled' }}>
                      {selectedSupplier.isActive ? 'Active' : 'Inactive'}
                    </TableCell>
                  </TableRow>
                  <TableRow sx={{ backgroundColor: 'grey.50' }}>
                    <TableCell sx={labelCellSx}>Contact</TableCell>
                    <TableCell sx={valueCellSx}>{selectedSupplier.contactPerson || '—'}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell sx={labelCellSx}>Phone</TableCell>
                    <TableCell sx={valueCellSx}>{selectedSupplier.phone || '—'}</TableCell>
                  </TableRow>
                  <TableRow sx={{ backgroundColor: 'grey.50' }}>
                    <TableCell sx={labelCellSx}>Address</TableCell>
                    <TableCell sx={valueCellSx}>{addressParts.length > 0 ? addressParts.join(', ') : '—'}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </TableContainer>
          </Grid>

          <Grid item xs={12} md={6}>
            <TableContainer>
              <Table size={TABLE_STYLES.size} sx={detailTableSx}>
                <TableBody>
                  <TableRow>
                    <TableCell
                      colSpan={2}
                      sx={{ pb: TABLE_STYLES.cell.padding.py * 0.67, py: TABLE_STYLES.cell.padding.py * 0.67, borderTop: TABLE_STYLES.cell.border }}
                    >
                      <Typography variant="h6" sx={{ fontWeight: 600, color: 'primary.main', fontSize: '0.8rem' }}>
                        Purchase Statistics
                      </Typography>
                    </TableCell>
                  </TableRow>
                  <TableRow sx={{ backgroundColor: 'grey.50' }}>
                    <TableCell sx={labelCellSx}>Total Orders</TableCell>
                    <TableCell sx={valueCellSx}>{selectedSupplier.totalOrders ?? 0}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell sx={labelCellSx}>Total Purchases</TableCell>
                    <TableCell sx={valueCellSx}>{formatCurrency(selectedSupplier.totalPurchases ?? 0)}</TableCell>
                  </TableRow>
                  <TableRow sx={{ backgroundColor: 'grey.50' }}>
                    <TableCell sx={labelCellSx}>Avg Order Value</TableCell>
                    <TableCell sx={valueCellSx}>{formatCurrency(selectedSupplier.averageOrderValue ?? 0)}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell sx={labelCellSx}>First Purchase</TableCell>
                    <TableCell sx={valueCellSx}>
                      {selectedSupplier.firstPurchaseDate ? formatDate(selectedSupplier.firstPurchaseDate) : '—'}
                    </TableCell>
                  </TableRow>
                  <TableRow sx={{ backgroundColor: 'grey.50' }}>
                    <TableCell sx={labelCellSx}>Last Purchase</TableCell>
                    <TableCell sx={valueCellSx}>
                      {selectedSupplier.lastPurchaseDate ? formatDate(selectedSupplier.lastPurchaseDate) : '—'}
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

export default SupplierContextHeader
