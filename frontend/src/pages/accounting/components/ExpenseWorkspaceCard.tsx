import { Box, Paper, Table, TableBody, TableCell, TableRow, Typography } from '@mui/material'

import { TABLE_STYLES } from '@/constants/tableStyles'
import { ExpenseRecord } from '@/types'

interface Props {
  selected: ExpenseRecord | null
}

const cellSx = { border: 'none', py: TABLE_STYLES.cell.padding.py, px: TABLE_STYLES.cell.padding.px }

export function ExpenseWorkspaceCard({ selected }: Props) {
  if (!selected) return <Paper sx={{ flex: 1 }} />

  return (
    <Paper sx={{ flex: 1 }}>
      <Box sx={{ px: 2, py: 1, borderBottom: TABLE_STYLES.cell.border }}>
        <Typography variant="tableHeader" sx={{ fontWeight: 600, fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          Details
        </Typography>
      </Box>
      <Table size={TABLE_STYLES.size} sx={{ '& .MuiTableCell-root': cellSx }}>
        <TableBody>
          <TableRow>
            <TableCell sx={{ ...cellSx, color: 'text.secondary', width: '35%' }}>Expense Account</TableCell>
            <TableCell>{selected.expenseAccount?.name ?? '—'}</TableCell>
          </TableRow>
          <TableRow>
            <TableCell sx={{ ...cellSx, color: 'text.secondary' }}>Payment Method</TableCell>
            <TableCell>{selected.paymentMethod?.name ?? '—'}</TableCell>
          </TableRow>
          <TableRow>
            <TableCell sx={{ ...cellSx, color: 'text.secondary' }}>Description</TableCell>
            <TableCell>{selected.description ?? '—'}</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </Paper>
  )
}
