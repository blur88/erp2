import { Paper, Stack, Table, TableBody, TableCell, TableContainer, TableRow, Typography } from '@mui/material'
import Grid from '@mui/material/Grid'
import { default as CheckCircleIcon } from '@mui/icons-material/CheckCircle'
import { default as DeleteIcon } from '@mui/icons-material/Delete'
import { default as EditIcon } from '@mui/icons-material/Edit'
import { default as ReopenIcon } from '@mui/icons-material/LockOpen'
import { format } from 'date-fns'

import { AppButton } from '@/components/common/AppButton'
import { EntityContextHeaderBar } from '@/components/common/EntityContextHeaderBar'
import { StatusChip } from '@/components/common/StatusChip'
import { TABLE_STYLES } from '@/constants/tableStyles'
import { BankReconciliation, BankReconciliationStatus } from '@/types'
import { formatCurrency } from '@/utils/formatters'

interface Props {
  selected: BankReconciliation | null
  onEdit: () => void
  onComplete: () => void
  onReopen: () => void
  onDelete: () => void
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

const labelCellSx = {
  fontWeight: 600,
  color: 'text.secondary',
  fontSize: '0.8rem',
}

const valueCellSx = {
  fontSize: '0.8rem',
}

const sectionHeaderCellSx = {
  pb: TABLE_STYLES.cell.padding.py * 0.67,
  py: TABLE_STYLES.cell.padding.py * 0.67,
  borderTop: TABLE_STYLES.cell.border,
}

export function BankReconciliationContextHeader({ selected, onEdit, onComplete, onReopen, onDelete }: Props) {
  if (!selected) {
    return (
      <Paper sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', p: 4 }}>
        <Typography variant="h6" sx={{ color: 'text.secondary' }}>
          Select a reconciliation to view details
        </Typography>
      </Paper>
    )
  }

  const isInProgress = selected.status === BankReconciliationStatus.IN_PROGRESS
  const isCompleted = selected.status === BankReconciliationStatus.COMPLETED

  return (
    <Paper sx={{ overflow: 'hidden' }}>
      <EntityContextHeaderBar
        title={selected.account?.name ?? 'Bank Account'}
        statusChip={<StatusChip status={selected.status} />}
        actions={(
          <Stack direction="row" spacing={0.5}>
            {isInProgress && (
              <AppButton size="small" variant="outlined" startIcon={<EditIcon />} onClick={onEdit}>
                Edit
              </AppButton>
            )}
            {isInProgress && (
              <AppButton size="small" variant="success" startIcon={<CheckCircleIcon />} onClick={onComplete}>
                Complete
              </AppButton>
            )}
            {isCompleted && (
              <AppButton size="small" variant="outlined" startIcon={<ReopenIcon />} onClick={onReopen}>
                Reopen
              </AppButton>
            )}
            <AppButton size="small" variant="danger" startIcon={<DeleteIcon />} onClick={onDelete}>
              Delete
            </AppButton>
          </Stack>
        )}
      />
      <Grid container spacing={3} sx={{ p: TABLE_STYLES.cell.padding.px }}>
        <Grid size={{ xs: 12, md: 6 }}>
          <TableContainer>
            <Table size={TABLE_STYLES.size} sx={detailTableSx}>
              <TableBody>
                <TableRow>
                  <TableCell colSpan={2} sx={sectionHeaderCellSx}>
                    <Typography variant="h6" sx={{ fontWeight: 600, color: 'primary.main', fontSize: '0.8rem' }}>
                      Reconciliation Details
                    </Typography>
                  </TableCell>
                </TableRow>
                <TableRow sx={{ backgroundColor: 'grey.50' }}>
                  <TableCell sx={labelCellSx}>Statement Date</TableCell>
                  <TableCell sx={valueCellSx}>{format(new Date(selected.reconciliationDate), 'MMMM yyyy')}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell sx={labelCellSx}>Account</TableCell>
                  <TableCell sx={valueCellSx}>
                    {selected.account ? `${selected.account.code} — ${selected.account.name}` : '—'}
                  </TableCell>
                </TableRow>
                <TableRow sx={{ backgroundColor: 'grey.50' }}>
                  <TableCell sx={labelCellSx}>Fiscal Period</TableCell>
                  <TableCell sx={valueCellSx}>{selected.fiscalPeriod?.name ?? '-'}</TableCell>
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
                      Financial Summary
                    </Typography>
                  </TableCell>
                </TableRow>
                <TableRow sx={{ backgroundColor: 'grey.50' }}>
                  <TableCell sx={labelCellSx}>Statement Balance</TableCell>
                  <TableCell sx={valueCellSx}>{formatCurrency(selected.statementBalance)}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell sx={labelCellSx}>Book Balance</TableCell>
                  <TableCell sx={valueCellSx}>{formatCurrency(selected.bookBalance)}</TableCell>
                </TableRow>
                <TableRow sx={{ backgroundColor: 'grey.50' }}>
                  <TableCell sx={labelCellSx}>Difference</TableCell>
                  <TableCell sx={{ ...valueCellSx, color: selected.isBalanced ? 'success.main' : 'error.main', fontWeight: 600 }}>
                    {formatCurrency(selected.difference)}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </TableContainer>
        </Grid>
      </Grid>
    </Paper>
  )
}
