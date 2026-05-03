import { Box, Divider, Paper, Table, TableBody, TableCell, TableHead, TableRow, Typography } from '@mui/material'

import { TABLE_STYLES } from '@/constants/tableStyles'
import type { FundTransfer } from '@/types'
import { formatCurrency } from '@/utils/formatters'

interface Props {
  selected: FundTransfer | null
}

const cellSx = { border: 'none', py: TABLE_STYLES.cell.padding.py, px: TABLE_STYLES.cell.padding.px }
const headerCellSx = { ...cellSx, fontWeight: 600, color: 'text.secondary', fontSize: '0.75rem', textTransform: 'uppercase' as const }

export function FundTransferWorkspaceCard({ selected }: Props) {
  if (!selected) return <Paper sx={{ flex: 1 }} />

  const lines = selected.journalEntry?.lines ?? []

  return (
    <Paper sx={{ flex: 1 }}>
      <Box sx={{ px: 2, py: 1, borderBottom: TABLE_STYLES.cell.border }}>
        <Typography variant="tableHeader" sx={{ fontWeight: 600, fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          Ledger Preview
        </Typography>
      </Box>

      {!selected.journalEntry ? (
        <Box sx={{ px: 2, py: 2 }}>
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>No journal entry linked</Typography>
        </Box>
      ) : (
        <Table size={TABLE_STYLES.size} sx={{ '& .MuiTableCell-root': { ...cellSx, borderBottom: TABLE_STYLES.cell.border }, '& tr:last-child .MuiTableCell-root': { borderBottom: 'none' } }}>
          <TableHead>
            <TableRow>
              <TableCell sx={headerCellSx}>Account</TableCell>
              <TableCell sx={headerCellSx}>Type</TableCell>
              <TableCell sx={{ ...headerCellSx, textAlign: 'right' }}>Debit</TableCell>
              <TableCell sx={{ ...headerCellSx, textAlign: 'right' }}>Credit</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {lines.map((line, index) => (
              <TableRow key={index}>
                <TableCell sx={cellSx}>
                  <Typography variant="body2" sx={{ fontSize: '0.8rem' }}>
                    {line.accountCode} - {line.accountName}
                  </Typography>
                </TableCell>
                <TableCell sx={cellSx}>
                  <Typography variant="body2" sx={{ fontSize: '0.8rem', color: line.debitAmount > 0 ? 'success.main' : 'error.main' }}>
                    {line.debitAmount > 0 ? 'Dr' : 'Cr'}
                  </Typography>
                </TableCell>
                <TableCell sx={{ ...cellSx, textAlign: 'right' }}>
                  <Typography variant="body2" sx={{ fontSize: '0.8rem' }}>
                    {line.debitAmount > 0 ? formatCurrency(line.debitAmount) : '—'}
                  </Typography>
                </TableCell>
                <TableCell sx={{ ...cellSx, textAlign: 'right' }}>
                  <Typography variant="body2" sx={{ fontSize: '0.8rem' }}>
                    {line.creditAmount > 0 ? formatCurrency(line.creditAmount) : '—'}
                  </Typography>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Divider />

      <Box sx={{ px: 2, py: 1 }}>
        <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.secondary', fontSize: '0.8rem', mb: 0.5 }}>
          Notes
        </Typography>
        <Typography variant="body2" sx={{ fontSize: '0.8rem' }}>
          {selected.description ?? '—'}
        </Typography>
      </Box>
    </Paper>
  )
}
