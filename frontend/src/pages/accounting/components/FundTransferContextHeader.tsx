import { Paper, Stack, Table, TableBody, TableCell, TableContainer, TableRow, Typography } from '@mui/material'
import Grid from '@mui/material/Grid'
import { default as CancelIcon } from '@mui/icons-material/Cancel'

import { AppButton } from '@/components/common/AppButton'
import { EntityContextHeaderBar } from '@/components/common/EntityContextHeaderBar'
import { EntityStatusChip } from '@/components/common/EntityStatusChip'
import { TABLE_STYLES } from '@/constants/tableStyles'
import { useJournalEntryRef } from '@/hooks/useJournalEntryRef'
import type { FundTransfer } from '@/types'
import { formatCurrency, formatDate } from '@/utils/formatters'

interface Props {
  selected: FundTransfer | null
  onCancel: () => void
  canManageTransfers: boolean
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
const sectionHeaderCellSx = {
  pb: TABLE_STYLES.cell.padding.py * 0.67,
  py: TABLE_STYLES.cell.padding.py * 0.67,
  borderTop: TABLE_STYLES.cell.border,
}

export function FundTransferContextHeader({ selected, onCancel, canManageTransfers }: Props) {
  const { journalEntryRef, navigateToJournalEntry } = useJournalEntryRef(
    selected?.journalEntryId
      ? [{ sourceType: 'fund_transfer', sourceId: selected.id }]
      : [],
  )

  if (!selected) {
    return (
      <Paper sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', p: 4 }}>
        <Typography variant="h6" sx={{ color: 'text.secondary' }}>
          Select a fund transfer to view details
        </Typography>
      </Paper>
    )
  }

  return (
    <Paper sx={{ overflow: 'hidden' }}>
      <EntityContextHeaderBar
        title={selected.referenceNumber}
        statusChip={<EntityStatusChip status={selected.status} />}
        actions={
          canManageTransfers && selected.status === 'ACTIVE' ? (
            <Stack direction="row" spacing={0.5}>
              <AppButton size="small" variant="danger" startIcon={<CancelIcon />} onClick={onCancel}>
                Cancel
              </AppButton>
            </Stack>
          ) : null
        }
      />
      <Grid container spacing={3} sx={{ p: TABLE_STYLES.cell.padding.px }}>
        <Grid size={{ xs: 12, md: 6 }}>
          <TableContainer>
            <Table size={TABLE_STYLES.size} sx={detailTableSx}>
              <TableBody>
                <TableRow>
                  <TableCell colSpan={2} sx={sectionHeaderCellSx}>
                    <Typography variant="h6" sx={{ fontWeight: 600, color: 'primary.main', fontSize: '0.8rem' }}>
                      Transfer Info
                    </Typography>
                  </TableCell>
                </TableRow>
                <TableRow sx={{ backgroundColor: 'grey.50' }}>
                  <TableCell sx={labelCellSx}>Date</TableCell>
                  <TableCell sx={valueCellSx}>{formatDate(selected.transferDate)}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell sx={labelCellSx}>Source Account</TableCell>
                  <TableCell sx={valueCellSx}>{selected.sourceAccount.code} - {selected.sourceAccount.name}</TableCell>
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
                  <TableCell colSpan={2} sx={sectionHeaderCellSx}>
                    <Typography variant="h6" sx={{ fontWeight: 600, color: 'primary.main', fontSize: '0.8rem' }}>
                      Amount & Accounts
                    </Typography>
                  </TableCell>
                </TableRow>
                <TableRow sx={{ backgroundColor: 'grey.50' }}>
                  <TableCell sx={labelCellSx}>Total Amount</TableCell>
                  <TableCell sx={{ ...valueCellSx, fontWeight: 600 }}>{formatCurrency(selected.amount)}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell sx={labelCellSx}>Destination Account</TableCell>
                  <TableCell sx={valueCellSx}>{selected.destinationAccount.code} - {selected.destinationAccount.name}</TableCell>
                </TableRow>
                {journalEntryRef && (
                  <TableRow sx={{ backgroundColor: 'grey.50' }}>
                    <TableCell sx={labelCellSx}>Journal Entry</TableCell>
                    <TableCell sx={valueCellSx}>
                      <Typography
                        component="button"
                        onClick={navigateToJournalEntry}
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
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Grid>
      </Grid>
    </Paper>
  )
}
