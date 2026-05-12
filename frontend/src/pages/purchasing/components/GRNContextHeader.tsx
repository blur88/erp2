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
import { EntityContextHeaderBar } from '@/components/common/EntityContextHeaderBar'
import { EntityStatusChip } from '@/components/common/EntityStatusChip'
import { TABLE_STYLES } from '@/constants/tableStyles'
import type { JournalEntryRef } from '@/hooks/useJournalEntryRef'
import type { GoodsReceivedNote } from '@/types'
import { formatDate } from '@/utils/formatters'

interface GRNContextHeaderProps {
  selectedGRN: GoodsReceivedNote | null
  journalEntryRefs: JournalEntryRef[]
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

const linkButtonSx = {
  fontSize: '0.8rem',
  color: 'primary.main',
  cursor: 'pointer',
  textDecoration: 'none',
  border: 'none',
  background: 'none',
  padding: 0,
  '&:hover': { color: 'primary.dark' },
}

const GRNContextHeader: React.FC<GRNContextHeaderProps> = ({
  selectedGRN,
  journalEntryRefs,
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
      navigate(`/purchasing/orders?poId=${selectedGRN.purchaseOrder.id}`)
    }
  }

  return (
    <Paper sx={{ overflow: 'hidden' }}>
      <EntityContextHeaderBar
        title={`Goods Received Note - ${selectedGRN.grnNumber}`}
        statusChip={<EntityStatusChip status={selectedGRN.status} />}
        actions={
          <AppButton
            size="small"
            variant="secondary"
            startIcon={<PrintIcon />}
            title="Print GRN"
            onClick={onPrint}
          >
            Print
          </AppButton>
        }
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
                      ) : journalEntryRefs.length > 0 ? (
                        <>
                          {journalEntryRefs.map((ref, index) => (
                            <span key={ref.sourceId}>
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
                                {ref.referenceNumber}
                              </Typography>
                              {index < journalEntryRefs.length - 1 && <span style={{ marginRight: 4 }}>,</span>}
                            </span>
                          ))}
                        </>
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
                    <TableCell sx={valueCellSx}>
                      {selectedGRN.supplier?.id ? (
                        <Typography
                          component="button"
                          onClick={() => navigate(`/purchasing/suppliers?highlight=${selectedGRN.supplier!.id}`)}
                          sx={linkButtonSx}
                        >
                          {selectedGRN.supplier.companyName}
                        </Typography>
                      ) : '—'}
                    </TableCell>
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
