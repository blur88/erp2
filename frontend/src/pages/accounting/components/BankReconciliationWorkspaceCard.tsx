import { Alert, Box, Checkbox, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography } from '@mui/material'
import { format } from 'date-fns'

import { WorkspaceCardSectionHeader } from '@/components/common/WorkspaceCardSectionHeader'
import { TABLE_STYLES } from '@/constants/tableStyles'
import { BankReconciliation, BankReconciliationStatus, ReconciledTransaction } from '@/types'
import { formatCurrency } from '@/utils/formatters'

interface Props {
  selected: BankReconciliation | null
  onToggleCleared: (txn: ReconciledTransaction) => void
}

export function BankReconciliationWorkspaceCard({ selected, onToggleCleared }: Props) {
  if (!selected) return <Paper sx={{ flex: 1 }} />

  const isCompleted = selected.status === BankReconciliationStatus.COMPLETED
  const transactions = selected.reconciledTransactions ?? []
  const clearedTotal = transactions.reduce((sum, txn) => {
    if (!txn.cleared || !txn.journalEntryLine) return sum
    return sum + Number(txn.journalEntryLine.debitAmount) - Number(txn.journalEntryLine.creditAmount)
  }, 0)
  const diff = Number(selected.statementBalance) - clearedTotal
  const isBalanced = Math.abs(diff) < 0.01

  return (
    <Paper sx={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <WorkspaceCardSectionHeader title="Transactions" />

      <Box sx={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', p: TABLE_STYLES.cell.padding.px }}>
        {isCompleted && (
          <Alert severity="info" sx={{ mb: 1, fontSize: '0.8rem', py: 0.5 }}>
            This reconciliation is completed. Reopen it to make changes.
          </Alert>
        )}
        {!isCompleted && !isBalanced && (
          <Alert severity="warning" sx={{ mb: 1, fontSize: '0.8rem', py: 0.5 }}>
            Cleared balance does not match statement balance - Difference: {formatCurrency(diff)}
          </Alert>
        )}
        <TableContainer sx={{ flex: 1, overflow: 'auto' }}>
          <Table
            size={TABLE_STYLES.size}
            sx={{
              '& .MuiTableCell-root': {
                borderBottom: TABLE_STYLES.cell.border,
                py: TABLE_STYLES.cell.padding.py,
                px: TABLE_STYLES.cell.padding.px,
              },
            }}
          >
            <TableHead>
              <TableRow sx={{ '& .MuiTableCell-head': { fontWeight: 600, backgroundColor: 'grey.50', fontSize: '0.8rem' } }}>
                <TableCell padding="checkbox">Cleared</TableCell>
                <TableCell>Date</TableCell>
                <TableCell>Description</TableCell>
                <TableCell align="right">Amount</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {transactions.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} align="center">
                    <Typography variant="body2" color="text.secondary">No transactions</Typography>
                  </TableCell>
                </TableRow>
              ) : transactions.map((txn) => {
                const line = txn.journalEntryLine
                const amount = line ? Number(line.debitAmount) - Number(line.creditAmount) : 0
                return (
                  <TableRow key={txn.id} hover>
                    <TableCell padding="checkbox">
                      <Checkbox
                        size="small"
                        checked={txn.cleared}
                        disabled={isCompleted}
                        onChange={() => onToggleCleared(txn)}
                      />
                    </TableCell>
                    <TableCell sx={{ fontSize: '0.8rem' }}>
                      {line?.journalEntry?.entryDate ? format(new Date(line.journalEntry.entryDate), 'dd MMM yyyy') : '-'}
                    </TableCell>
                    <TableCell sx={{ fontSize: '0.8rem' }}>{line?.memo || line?.journalEntry?.description || '-'}</TableCell>
                    <TableCell align="right" sx={{ fontSize: '0.8rem', color: amount < 0 ? 'error.main' : 'inherit' }}>
                      {formatCurrency(Math.abs(amount))}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </TableContainer>
      </Box>
    </Paper>
  )
}
