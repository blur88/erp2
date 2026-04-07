import React from 'react'
import {
  Delete as DeleteIcon,
  Edit as EditIcon,
} from '@mui/icons-material'
import {
  Box,
  Chip,
  IconButton,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableRow,
  Typography,
} from '@mui/material'

import { TABLE_STYLES } from '@/constants/tableStyles'
import type { Customer } from '@/types'
import { CustomerType } from '@/types'

interface CustomerContextHeaderProps {
  selectedCustomer: Customer | null
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
        <Typography variant="h6" color="text.secondary">
          Select a customer to view details
        </Typography>
      </Paper>
    )
  }

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
          Customer - {selectedCustomer.name}
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25 }}>
          <IconButton size="small" title="Edit Customer" onClick={onEdit} sx={{ ...actionIconSx, color: 'primary.main' }}>
            <EditIcon sx={{ fontSize: `${TABLE_STYLES.row.height * 0.5}px` }} />
          </IconButton>
          <IconButton size="small" title="Delete Customer" onClick={onDelete} sx={{ ...actionIconSx, color: 'error.main' }}>
            <DeleteIcon sx={{ fontSize: `${TABLE_STYLES.row.height * 0.5}px` }} />
          </IconButton>
        </Box>
      </Box>

      <Box sx={{ p: TABLE_STYLES.cell.padding.px }}>
        <TableContainer>
          <Table size={TABLE_STYLES.size} sx={detailTableSx}>
            <TableBody>
              <TableRow>
                <TableCell colSpan={2} sx={{ pb: TABLE_STYLES.cell.padding.py * 0.67, py: TABLE_STYLES.cell.padding.py * 0.67, borderTop: TABLE_STYLES.cell.border }}>
                  <Typography variant="h6" sx={{ fontWeight: 600, color: 'primary.main', fontSize: '0.8rem' }}>
                    Customer Information
                  </Typography>
                </TableCell>
              </TableRow>
              <TableRow sx={{ backgroundColor: 'grey.50' }}>
                <TableCell sx={labelCellSx}>Type</TableCell>
                <TableCell sx={valueCellSx}>
                  <Chip
                    label={selectedCustomer.type === CustomerType.BUSINESS ? 'Business' : 'Individual'}
                    size="small"
                    variant="outlined"
                    sx={{ fontSize: '0.75rem' }}
                  />
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell sx={labelCellSx}>Status</TableCell>
                <TableCell sx={valueCellSx}>
                  <Chip
                    label={selectedCustomer.isActive ? 'Active' : 'Inactive'}
                    size="small"
                    color={selectedCustomer.isActive ? 'success' : 'default'}
                    sx={{ fontSize: '0.75rem' }}
                  />
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
                <TableCell sx={valueCellSx}>
                  {selectedCustomer.priceList
                    ? <Chip label={selectedCustomer.priceList.name} size="small" sx={{ fontSize: '0.75rem' }} />
                    : '—'}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </TableContainer>
      </Box>
    </Paper>
  )
}

export default CustomerContextHeader
