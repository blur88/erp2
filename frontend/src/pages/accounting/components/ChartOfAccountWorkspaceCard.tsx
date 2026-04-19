import { Box, Paper, Table, TableBody, TableCell, TableRow, Typography } from '@mui/material'

import { TABLE_STYLES } from '@/constants/tableStyles'
import type { ChartOfAccount } from '@/types'

interface Props {
  selected: ChartOfAccount | null
  allAccounts: ChartOfAccount[]
}

const cellSx = { border: 'none', py: TABLE_STYLES.cell.padding.py, px: TABLE_STYLES.cell.padding.px }

export function ChartOfAccountWorkspaceCard({ selected, allAccounts }: Props) {
  if (!selected) return <Paper sx={{ flex: 1 }} />
  const parentName = selected.parentId ? allAccounts.find((account) => account.id === selected.parentId)?.name ?? '—' : '—'
  return (
    <Paper sx={{ flex: 1 }}>
      <Box sx={{ px: 2, py: 1, borderBottom: TABLE_STYLES.cell.border }}>
        <Typography variant="tableHeader" sx={{ fontWeight: 600, fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Details</Typography>
      </Box>
      <Table size={TABLE_STYLES.size} sx={{ '& .MuiTableCell-root': cellSx }}>
        <TableBody>
          <TableRow><TableCell sx={{ ...cellSx, color: 'text.secondary', width: '35%' }}>Account Type</TableCell><TableCell>{selected.type}</TableCell></TableRow>
          <TableRow><TableCell sx={{ ...cellSx, color: 'text.secondary' }}>Parent Account</TableCell><TableCell>{parentName}</TableCell></TableRow>
          <TableRow><TableCell sx={{ ...cellSx, color: 'text.secondary' }}>Description</TableCell><TableCell>{selected.description || '—'}</TableCell></TableRow>
          <TableRow><TableCell sx={{ ...cellSx, color: 'text.secondary' }}>Balance</TableCell><TableCell>{selected.currentBalance != null ? String(selected.currentBalance) : '—'}</TableCell></TableRow>
        </TableBody>
      </Table>
    </Paper>
  )
}
