import { Box, Link, Paper, Table, TableBody, TableCell, TableRow, Typography } from '@mui/material'

import { TABLE_STYLES } from '@/constants/tableStyles'
import type { FundTransfer } from '@/types'
import { formatDate } from '@/utils/formatters'

interface Props {
  selected: FundTransfer | null
}

const cellSx = { border: 'none', py: TABLE_STYLES.cell.padding.py, px: TABLE_STYLES.cell.padding.px }

export function FundTransferWorkspaceCard({ selected }: Props) {
  if (!selected) return <Paper sx={{ flex: 1 }} />

  return (
    <Paper sx={{ flex: 1 }}>
      <Box sx={{ px: 2, py: 1, borderBottom: TABLE_STYLES.cell.border }}>
        <Typography variant="tableHeader" sx={{ fontWeight: 600, fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Details</Typography>
      </Box>
      <Table size={TABLE_STYLES.size} sx={{ '& .MuiTableCell-root': cellSx }}>
        <TableBody>
          <TableRow><TableCell sx={{ ...cellSx, color: 'text.secondary', width: '35%' }}>From Account</TableCell><TableCell>{selected.sourceAccount.code} - {selected.sourceAccount.name}</TableCell></TableRow>
          <TableRow><TableCell sx={{ ...cellSx, color: 'text.secondary' }}>To Account</TableCell><TableCell>{selected.destinationAccount.code} - {selected.destinationAccount.name}</TableCell></TableRow>
          <TableRow><TableCell sx={{ ...cellSx, color: 'text.secondary' }}>Transfer Date</TableCell><TableCell>{formatDate(selected.transferDate)}</TableCell></TableRow>
          <TableRow><TableCell sx={{ ...cellSx, color: 'text.secondary' }}>Description</TableCell><TableCell>{selected.description || '—'}</TableCell></TableRow>
          <TableRow><TableCell sx={{ ...cellSx, color: 'text.secondary' }}>Journal Entry</TableCell><TableCell>{selected.journalEntry ? <Link underline="hover">{selected.journalEntry.referenceNumber}</Link> : '—'}</TableCell></TableRow>
        </TableBody>
      </Table>
    </Paper>
  )
}
