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
import type { VendorPayment } from '@/types'
import { formatCurrency, formatDate } from '@/utils/formatters'

interface VendorPaymentContextHeaderProps {
  selectedPayment: VendorPayment | null
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

const VendorPaymentContextHeader: React.FC<VendorPaymentContextHeaderProps> = ({
  selectedPayment,
  journalEntryRefs,
  journalEntryRefLoading,
  onPrint,
  onNavigateToJournalEntry,
}) => {
  const navigate = useNavigate()

  if (!selectedPayment) {
    return (
      <Paper sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', p: 4 }}>
        <Typography variant="h6" sx={{ color: 'text.secondary' }}>
          Select a vendor payment to view details
        </Typography>
      </Paper>
    )
  }

  const handleNavigateToPO = () => {
    if (selectedPayment.purchaseOrder?.id) {
      navigate(`/purchasing/orders?poId=${selectedPayment.purchaseOrder.id}`)
    }
  }

  return (
    <Paper sx={{ overflow: 'hidden' }}>
      <EntityContextHeaderBar
        title={`Vendor Payment Details - ${selectedPayment.paymentNumber}`}
        statusChip={<EntityStatusChip status={selectedPayment.status} />}
        actions={
          <AppButton
            size="small"
            variant="secondary"
            startIcon={<PrintIcon />}
            title="Print Payment"
            onClick={onPrint}
          >
            Print
          </AppButton>
        }
        journalEntryRefs={journalEntryRefs}
        journalEntryRefLoading={journalEntryRefLoading}
        onNavigateToJournalEntry={onNavigateToJournalEntry}
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
                        Payment Information
                      </Typography>
                    </TableCell>
                  </TableRow>
                  <TableRow sx={{ backgroundColor: 'grey.50' }}>
                    <TableCell sx={labelCellSx}>Payment Number</TableCell>
                    <TableCell sx={valueCellSx}>{selectedPayment.paymentNumber}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell sx={labelCellSx}>Status</TableCell>
                    <TableCell sx={valueCellSx} style={{ textTransform: 'capitalize' }}>
                      {selectedPayment.status}
                    </TableCell>
                  </TableRow>
                  <TableRow sx={{ backgroundColor: 'grey.50' }}>
                    <TableCell sx={labelCellSx}>Payment Date</TableCell>
                    <TableCell sx={valueCellSx}>{formatDate(selectedPayment.paymentDate)}</TableCell>
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
                    <TableCell sx={valueCellSx}>{selectedPayment.supplier?.companyName || '—'}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell sx={labelCellSx}>Purchase Order</TableCell>
                    <TableCell sx={valueCellSx}>
                      {selectedPayment.purchaseOrder ? (
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
                          {selectedPayment.purchaseOrder.orderNumber}
                        </Typography>
                      ) : '—'}
                    </TableCell>
                  </TableRow>
                  <TableRow sx={{ backgroundColor: 'grey.50' }}>
                    <TableCell sx={labelCellSx}>Amount</TableCell>
                    <TableCell sx={valueCellSx}>{formatCurrency(selectedPayment.amount)}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell sx={labelCellSx}>Payment Method</TableCell>
                    <TableCell sx={valueCellSx}>
                      {selectedPayment.paymentMethodEntity?.name ?? selectedPayment.paymentMethodId ?? '—'}
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

export default VendorPaymentContextHeader
