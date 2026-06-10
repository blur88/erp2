import { Chip, Paper, Stack, Table, TableBody, TableCell, TableContainer, TableRow, Typography } from '@mui/material'
import Grid from '@mui/material/Grid'
import { default as CheckCircleIcon } from '@mui/icons-material/CheckCircle'
import { default as DeleteIcon } from '@mui/icons-material/Delete'
import { default as EditIcon } from '@mui/icons-material/Edit'
import { default as UndoIcon } from '@mui/icons-material/Undo'

import { AppButton } from '@/components/common/AppButton'
import { EntityContextHeaderBar } from '@/components/common/EntityContextHeaderBar'
import { StatusChip } from '@/components/common/StatusChip'
import { useJournalEntryRefs } from '@/hooks/useJournalEntryRefs'
import { TABLE_STYLES } from '@/constants/tableStyles'
import type { OwnerEquityTransaction } from '@/types'
import { formatCurrency, formatDate } from '@/utils/formatters'

interface Props {
  selected: OwnerEquityTransaction | null
  onEdit: () => void
  onPost: () => void
  onDelete: () => void
  onReverse: () => void
}

const typeLabel: Record<OwnerEquityTransaction['type'], string> = {
  capital_injection: 'Capital Injection',
  owner_drawing: 'Owner Drawing',
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

export function OwnerEquityContextHeader({ selected, onEdit, onPost, onDelete, onReverse }: Props) {
  const { journalEntryRefs, navigateToJournalEntries } = useJournalEntryRefs([
    { sourceType: 'owner_equity_transaction', sourceId: selected?.id },
  ])

  if (!selected) {
    return (
      <Paper sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', p: 4 }}>
        <Typography variant="h6" sx={{ color: 'text.secondary' }}>
          Select a transaction to view details
        </Typography>
      </Paper>
    )
  }

  const jeRef = journalEntryRefs[0]

  return (
    <Paper sx={{ overflow: 'hidden' }}>
      <EntityContextHeaderBar
        title={selected.referenceNumber}
        statusChip={(
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
            <Chip
              size="small"
              label={typeLabel[selected.type]}
              color={selected.type === 'capital_injection' ? 'primary' : 'warning'}
            />
            <StatusChip status={selected.status} />
          </Stack>
        )}
        actions={(
          <Stack direction="row" spacing={0.5}>
            {selected.status === 'draft' && (
              <>
                <AppButton size="small" variant="secondary" startIcon={<EditIcon />} onClick={onEdit}>
                  Edit
                </AppButton>
                <AppButton size="small" variant="success" startIcon={<CheckCircleIcon />} onClick={onPost}>
                  Post
                </AppButton>
                <AppButton size="small" variant="danger" startIcon={<DeleteIcon />} onClick={onDelete}>
                  Delete
                </AppButton>
              </>
            )}
            {selected.status === 'posted' && (
              <AppButton size="small" variant="warning" startIcon={<UndoIcon />} onClick={onReverse}>
                Reverse
              </AppButton>
            )}
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
                      Transaction Information
                    </Typography>
                  </TableCell>
                </TableRow>
                <TableRow sx={{ backgroundColor: 'grey.50' }}>
                  <TableCell sx={labelCellSx}>Date</TableCell>
                  <TableCell sx={valueCellSx}>{formatDate(selected.transactionDate)}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell sx={labelCellSx}>Type</TableCell>
                  <TableCell sx={valueCellSx}>{typeLabel[selected.type]}</TableCell>
                </TableRow>
                <TableRow sx={{ backgroundColor: 'grey.50' }}>
                  <TableCell sx={labelCellSx}>Description</TableCell>
                  <TableCell sx={valueCellSx}>{selected.description || '—'}</TableCell>
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
                      Financials & Links
                    </Typography>
                  </TableCell>
                </TableRow>
                <TableRow sx={{ backgroundColor: 'grey.50' }}>
                  <TableCell sx={labelCellSx}>Amount</TableCell>
                  <TableCell sx={valueCellSx}>{formatCurrency(Number(selected.amount || 0))}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell sx={labelCellSx}>Payment Method</TableCell>
                  <TableCell sx={valueCellSx}>{selected.paymentMethod?.name || '—'}</TableCell>
                </TableRow>
                <TableRow sx={{ backgroundColor: 'grey.50' }}>
                  <TableCell sx={labelCellSx}>Journal Entry</TableCell>
                  <TableCell sx={valueCellSx}>
                    {jeRef ? (
                      <Typography
                        component="button"
                        onClick={navigateToJournalEntries}
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
                        {jeRef.referenceNumber}
                      </Typography>
                    ) : '—'}
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
