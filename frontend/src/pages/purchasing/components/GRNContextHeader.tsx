import React from 'react'
import { default as PrintIcon } from '@mui/icons-material/Print'
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
import { useNavigate } from 'react-router-dom'

import { AppButton } from '@/components/common/AppButton'
import { TABLE_STYLES } from '@/constants/tableStyles'
import type { GoodsReceivedNote } from '@/types'
import { formatDate } from '@/utils/formatters'

import type { GRNJournalEntryRef } from '../hooks/grnPageState'

interface GRNContextHeaderProps {
  selectedGRN: GoodsReceivedNote | null
  journalEntryRef: GRNJournalEntryRef | null
  journalEntryRefLoading: boolean
  onPrint: () => void
  onNavigateToJournalEntry: () => void
}

const detailTableSx = {
  tableLayout: 'fixed' as const,
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

const GRNContextHeader: React.FC<GRNContextHeaderProps> = ({
  selectedGRN,
  journalEntryRef,
  journalEntryRefLoading,
  onPrint,
  onNavigateToJournalEntry,
}) => {
  const navigate = useNavigate()

  if (!selectedGRN) {
    return (
      <Paper sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', p: 4 }}>
        <Typography variant="h6" sx={{ color: 'text.secondary' }}>
          Select a goods received note to view details
        </Typography>
      </Paper>
    )
  }

  const handleNavigateToPO = () => {
    if (selectedGRN.purchaseOrder?.id) {
      navigate(`/purchasing/purchase-orders?poId=${selectedGRN.purchaseOrder.id}`)
    }
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
          sx={{ fontWeight: 600, fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}
        >
          GRN Details - {selectedGRN.grnNumber}
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <AppButton
            size="small"
            variant="secondary"
            startIcon={<PrintIcon />}
            title="Print GRN"
            onClick={onPrint}
          >
            Print
          </AppButton>
        </Box>
      </Box>

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
                      <Typography variant="h6" sx={{ fontWeight: 600, color: 'primary.main', fontSize: '0.8rem' }}>
                        GRN Information
                      </Typography>
                    </TableCell>
                  </TableRow>
                  <TableRow sx={{ backgroundColor: 'grey.50' }}>
                    <TableCell sx={labelCellSx}>GRN Number</TableCell>
                    <TableCell sx={valueCellSx}>{selectedGRN.grnNumber}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell sx={labelCellSx}>Status</TableCell>
                    <TableCell sx={valueCellSx} style={{ textTransform: 'capitalize' }}>
                      {selectedGRN.status}
                    </TableCell>
                  </TableRow>
                  <TableRow sx={{ backgroundColor: 'grey.50' }}>
                    <TableCell sx={labelCellSx}>Received Date</TableCell>
                    <TableCell sx={valueCellSx}>{formatDate(selectedGRN.receivedDate)}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell sx={labelCellSx}>Journal Entry</TableCell>
                    <TableCell sx={valueCellSx}>
                      {journalEntryRefLoading ? (
                        <Typography sx={{ fontSize: '0.8rem', color: 'text.secondary', fontStyle: 'italic' }}>
                          Loading...
                        </Typography>
                      ) : journalEntryRef ? (
                        <Typography
                          component="button"
                          onClick={onNavigateToJournalEntry}
                          sx={{
                            fontSize: '0.8rem',
                            color: 'primary.main',
                            cursor: 'pointer',
                            textDecoration: 'none',
                            border: 'none',
                            background: 'none',
                            padding: 0,
                          }}
                        >
                          {journalEntryRef.referenceNumber}
                        </Typography>
                      ) : (
                        <Typography sx={{ fontSize: '0.8rem', color: 'text.secondary', fontStyle: 'italic' }}>
                          Pending
                        </Typography>
                      )}
                    </TableCell>
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
                      <Typography variant="h6" sx={{ fontWeight: 600, color: 'primary.main', fontSize: '0.8rem' }}>
                        Supplier & Order
                      </Typography>
                    </TableCell>
                  </TableRow>
                  <TableRow sx={{ backgroundColor: 'grey.50' }}>
                    <TableCell sx={labelCellSx}>Supplier</TableCell>
                    <TableCell sx={valueCellSx}>{selectedGRN.supplier?.companyName || '—'}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell sx={labelCellSx}>Purchase Order</TableCell>
                    <TableCell sx={valueCellSx}>
                      {selectedGRN.purchaseOrder ? (
                        <Typography
                          component="button"
                          onClick={handleNavigateToPO}
                          sx={{
                            fontSize: '0.8rem',
                            color: 'primary.main',
                            cursor: 'pointer',
                            textDecoration: 'none',
                            border: 'none',
                            background: 'none',
                            padding: 0,
                          }}
                        >
                          {selectedGRN.purchaseOrder.orderNumber}
                        </Typography>
                      ) : '—'}
                    </TableCell>
                  </TableRow>
                  <TableRow sx={{ backgroundColor: 'grey.50' }}>
                    <TableCell sx={labelCellSx}>Qty Received</TableCell>
                    <TableCell sx={valueCellSx}>{selectedGRN.totalQuantityReceived ?? '—'}</TableCell>
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

export default GRNContextHeader
