import { Alert, Box, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography } from '@mui/material'

import { WorkspaceCardSectionHeader } from '@/components/common/WorkspaceCardSectionHeader'
import { TABLE_STYLES } from '@/constants/tableStyles'
import { JournalEntry } from '@/types'
import { formatCurrency } from '@/utils/formatters'

interface Props {
  selectedEntry: JournalEntry | null
}

export function JournalEntryWorkspaceCard({ selectedEntry }: Props) {
  if (!selectedEntry) return <Paper sx={{ flex: 1 }} />

  const lines = selectedEntry.lines ?? []
  const isBalanced = Math.abs(selectedEntry.totalDebits - selectedEntry.totalCredits) < 0.01

  return (
    <Paper sx={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <WorkspaceCardSectionHeader title="Ledger Lines" />

      <Box sx={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', p: TABLE_STYLES.cell.padding.px }}>
        {!isBalanced && (
          <Alert severity="warning" sx={{ mb: 1, fontSize: '0.8rem', py: 0.5 }}>
            Entry is not balanced — debits do not equal credits
          </Alert>
        )}
        <TableContainer sx={{ flex: 1, overflow: 'auto' }}>
          <Table size={TABLE_STYLES.size} sx={{ '& .MuiTableCell-root': { borderBottom: TABLE_STYLES.cell.border, py: TABLE_STYLES.cell.padding.py, px: TABLE_STYLES.cell.padding.px } }}>
            <TableHead>
              <TableRow sx={{ '& .MuiTableCell-head': { fontWeight: 600, backgroundColor: 'grey.50', fontSize: '0.8rem' } }}>
                <TableCell sx={{ width: '40%' }}>Account</TableCell>
                <TableCell sx={{ width: '30%' }}>Description</TableCell>
                <TableCell align="right" sx={{ width: '15%' }}>Debit</TableCell>
                <TableCell align="right" sx={{ width: '15%' }}>Credit</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {lines.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} align="center">
                    <Typography variant="body2" color="text.secondary">No ledger lines</Typography>
                  </TableCell>
                </TableRow>
              ) : lines.map((line, index) => (
                <TableRow key={line.id ?? index} hover>
                  <TableCell sx={{ fontSize: '0.8rem' }}>{line.account?.name ?? line.accountId}</TableCell>
                  <TableCell sx={{ fontSize: '0.8rem', color: 'text.secondary' }}>{line.memo ?? '—'}</TableCell>
                  <TableCell align="right" sx={{ fontSize: '0.8rem' }}>{Number(line.debitAmount) > 0 ? formatCurrency(line.debitAmount) : '—'}</TableCell>
                  <TableCell align="right" sx={{ fontSize: '0.8rem' }}>{Number(line.creditAmount) > 0 ? formatCurrency(line.creditAmount) : '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Box>
    </Paper>
  )
}
