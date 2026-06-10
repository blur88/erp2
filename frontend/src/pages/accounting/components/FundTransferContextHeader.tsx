import { Paper, Stack, Table, TableBody, TableCell, TableContainer, TableRow, Typography } from '@mui/material'
import Grid from '@mui/material/Grid'
import { default as CheckCircleIcon } from '@mui/icons-material/CheckCircle'
import { default as DeleteIcon } from '@mui/icons-material/Delete'
import { default as EditIcon } from '@mui/icons-material/Edit'
import { default as RestoreIcon } from '@mui/icons-material/Restore'
import { default as UndoIcon } from '@mui/icons-material/Undo'

import { AppButton } from '@/components/common/AppButton'
import { EntityContextHeaderBar } from '@/components/common/EntityContextHeaderBar'
import { StatusChip } from '@/components/common/StatusChip'
import { TABLE_STYLES } from '@/constants/tableStyles'
import { useJournalEntryRef } from '@/hooks/useJournalEntryRef'
import type { FundTransfer } from '@/types'
import { formatCurrency, formatDate } from '@/utils/formatters'

interface Props {
  selected: FundTransfer | null
  isAdmin: boolean
  onEdit: () => void
  onPost: () => void
  onDelete: () => void
  onUnpost: () => void
  onRestore: () => void
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

export function FundTransferContextHeader({
  selected,
  isAdmin,
  onEdit,
  onPost,
  onDelete,
  onUnpost,
  onRestore,
}: Props) {
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

  const isDraft = selected.status === 'draft'
  const isPosted = selected.status === 'posted'
  const isReversed = selected.status === 'reversed'
  const isDeleted = !!selected.deletedAt

  const actions = isDeleted ? (
    isAdmin ? (
      <AppButton size="small" variant="secondary" startIcon={<RestoreIcon />} onClick={onRestore}>
        Restore
      </AppButton>
    ) : null
  ) : (isDraft || isReversed) ? (
    <Stack direction="row" spacing={0.5}>
      <AppButton size="small" variant="secondary" startIcon={<EditIcon />} onClick={onEdit}>
        Edit
      </AppButton>
      <AppButton size="small" variant="success" startIcon={<CheckCircleIcon />} onClick={onPost}>
        Post
      </AppButton>
      <AppButton size="small" variant="danger" startIcon={<DeleteIcon />} onClick={onDelete}>
        Delete
      </AppButton>
    </Stack>
  ) : isPosted && isAdmin ? (
    <AppButton size="small" variant="danger" startIcon={<UndoIcon />} onClick={onUnpost}>
      Unpost
    </AppButton>
  ) : null

  return (
    <Paper sx={{ overflow: 'hidden' }}>
      <EntityContextHeaderBar
        title={selected.referenceNumber}
        statusChip={<StatusChip status={selected.status} />}
        actions={actions}
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
