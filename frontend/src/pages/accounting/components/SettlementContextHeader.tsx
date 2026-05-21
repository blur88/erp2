import { Paper, Table, TableBody, TableCell, TableContainer, TableRow, Typography } from '@mui/material'
import Grid from '@mui/material/Grid'
import { default as CancelIcon } from '@mui/icons-material/Cancel'
import { default as CheckCircleIcon } from '@mui/icons-material/CheckCircle'
import { default as DeleteIcon } from '@mui/icons-material/Delete'
import { default as EditIcon } from '@mui/icons-material/Edit'
import { default as RestoreIcon } from '@mui/icons-material/Restore'

import { AppButton } from '@/components/common/AppButton'
import { EntityContextHeaderBar } from '@/components/common/EntityContextHeaderBar'
import { EntityStatusChip } from '@/components/common/EntityStatusChip'
import { TABLE_STYLES } from '@/constants/tableStyles'
import { useJournalEntryRef } from '@/hooks/useJournalEntryRef'
import type { Settlement } from '@/types'
import { formatCurrency, formatDate } from '@/utils/formatters'

interface Props {
  selected: Settlement | null
  isAdmin: boolean
  canManage: boolean
  onEdit: () => void
  onPost: () => void
  onReverse: () => void
  onDelete: () => void
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

export function SettlementContextHeader({
  selected,
  isAdmin,
  canManage,
  onEdit,
  onPost,
  onReverse,
  onDelete,
  onRestore,
}: Props) {
  const { journalEntryRef, navigateToJournalEntry } = useJournalEntryRef(
    selected?.status === 'posted' ? [{ sourceType: 'settlement', sourceId: selected.id }] : [],
  )

  if (!selected) {
    return (
      <Paper sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', p: 4 }}>
        <Typography variant="h6" sx={{ color: 'text.secondary' }}>
          Select a settlement to view details
        </Typography>
      </Paper>
    )
  }

  const isDeleted = Boolean(selected.deletedAt)
  const isDraft = selected.status === 'draft'
  const isPosted = selected.status === 'posted'
  const isReversed = selected.status === 'reversed'

  const actions = (() => {
    if (isDeleted && isAdmin) {
      return (
        <AppButton size="small" variant="outlined" startIcon={<RestoreIcon />} onClick={onRestore}>
          Restore
        </AppButton>
      )
    }
    if (isDraft || isReversed) {
      return (
        <>
          {canManage && (
            <AppButton size="small" variant="outlined" startIcon={<EditIcon />} onClick={onEdit}>
              Edit
            </AppButton>
          )}
          {canManage && (
            <AppButton size="small" variant="primary" startIcon={<CheckCircleIcon />} onClick={onPost}>
              Post
            </AppButton>
          )}
          {isAdmin && (
            <AppButton size="small" variant="danger" startIcon={<DeleteIcon />} onClick={onDelete}>
              Delete
            </AppButton>
          )}
        </>
      )
    }
    if (isPosted && isAdmin) {
      return (
        <AppButton size="small" variant="danger" startIcon={<CancelIcon />} onClick={onReverse}>
          Reverse
        </AppButton>
      )
    }
    return null
  })()

  return (
    <Paper sx={{ overflow: 'hidden' }}>
      <EntityContextHeaderBar
        title={selected.settlementNumber}
        statusChip={<EntityStatusChip status={selected.status} />}
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
                      Settlement Information
                    </Typography>
                  </TableCell>
                </TableRow>
                <TableRow sx={{ backgroundColor: 'grey.50' }}>
                  <TableCell sx={labelCellSx}>Date</TableCell>
                  <TableCell sx={valueCellSx}>{formatDate(selected.settlementDate)}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell sx={labelCellSx}>Payment Method</TableCell>
                  <TableCell sx={valueCellSx}>{selected.paymentMethod?.name || '-'}</TableCell>
                </TableRow>
                <TableRow sx={{ backgroundColor: 'grey.50' }}>
                  <TableCell sx={labelCellSx}>Status</TableCell>
                  <TableCell sx={valueCellSx}><EntityStatusChip status={selected.status} /></TableCell>
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
                      Amounts & Details
                    </Typography>
                  </TableCell>
                </TableRow>
                <TableRow sx={{ backgroundColor: 'grey.50' }}>
                  <TableCell sx={labelCellSx}>Total Amount</TableCell>
                  <TableCell sx={valueCellSx}>{formatCurrency(Number(selected.totalAmount || 0))}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell sx={labelCellSx}>Linked Payments</TableCell>
                  <TableCell sx={valueCellSx}>{selected.paymentCount}</TableCell>
                </TableRow>
                <TableRow sx={{ backgroundColor: 'grey.50' }}>
                  <TableCell sx={labelCellSx}>Reference</TableCell>
                  <TableCell sx={valueCellSx}>{selected.reference || '-'}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell sx={labelCellSx}>Notes</TableCell>
                  <TableCell sx={valueCellSx}>{selected.notes || '-'}</TableCell>
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
