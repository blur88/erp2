import React from 'react'
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

import { TABLE_STYLES } from '@/constants/tableStyles'
import type { VendorPayment } from '@/types'
import { formatDate } from '@/utils/formatters'

interface VendorPaymentWorkspaceCardProps {
  selectedPayment: VendorPayment | null
}

const detailTableSx = {
  tableLayout: 'fixed' as const,
  '& .MuiTableCell-root': {
    borderBottom: TABLE_STYLES.cell.border,
    py: TABLE_STYLES.cell.padding.py,
    px: TABLE_STYLES.cell.padding.px,
    '&:nth-of-type(1)': { width: '35%' },
    '&:nth-of-type(2)': { width: '65%' },
  },
}

const labelCellSx = { fontWeight: 600, color: 'text.secondary', fontSize: '0.8rem' }
const valueCellSx = { fontSize: '0.8rem' }

const VendorPaymentWorkspaceCard: React.FC<VendorPaymentWorkspaceCardProps> = ({ selectedPayment }) => {
  if (!selectedPayment) {
    return <Paper sx={{ flex: 1 }} />
  }

  return (
    <Paper sx={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ p: TABLE_STYLES.cell.padding.px, borderBottom: TABLE_STYLES.cell.border }}>
        <Typography
          variant="tableHeader"
          sx={{ fontWeight: 600, fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}
        >
          Payment Details
        </Typography>
      </Box>

      <Box sx={{ flex: 1, overflow: 'auto', p: TABLE_STYLES.cell.padding.px }}>
        <TableContainer>
          <Table size={TABLE_STYLES.size} sx={detailTableSx}>
            <TableBody>
              <TableRow sx={{ backgroundColor: 'grey.50' }}>
                <TableCell sx={labelCellSx}>Reference Number</TableCell>
                <TableCell sx={valueCellSx}>{selectedPayment.referenceNumber || '—'}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell sx={labelCellSx}>Notes</TableCell>
                <TableCell sx={valueCellSx}>{selectedPayment.notes || '—'}</TableCell>
              </TableRow>
              <TableRow sx={{ backgroundColor: 'grey.50' }}>
                <TableCell sx={labelCellSx}>Created By</TableCell>
                <TableCell sx={valueCellSx}>{selectedPayment.createdBy || '—'}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell sx={labelCellSx}>Created At</TableCell>
                <TableCell sx={valueCellSx}>{formatDate(selectedPayment.createdAt)}</TableCell>
              </TableRow>
              <TableRow sx={{ backgroundColor: 'grey.50' }}>
                <TableCell sx={labelCellSx}>Updated At</TableCell>
                <TableCell sx={valueCellSx}>{formatDate(selectedPayment.updatedAt)}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </TableContainer>
      </Box>
    </Paper>
  )
}

export default VendorPaymentWorkspaceCard
