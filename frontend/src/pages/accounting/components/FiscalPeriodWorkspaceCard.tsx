import { Box, Paper, Table, TableBody, TableCell, TableRow, Typography } from '@mui/material'
import { format } from 'date-fns'

import { TABLE_STYLES } from '@/constants/tableStyles'
import { FiscalPeriod } from '@/types'

interface Props { selected: FiscalPeriod | null }
const cellSx = { border: 'none', py: TABLE_STYLES.cell.padding.py, px: TABLE_STYLES.cell.padding.px }

export function FiscalPeriodWorkspaceCard({ selected }: Props) {
  if (!selected) return <Paper sx={{ flex: 1 }} />
  return (
    <Paper sx={{ flex: 1 }}>
      <Box sx={{ px: 2, py: 1, borderBottom: TABLE_STYLES.cell.border }}>
        <Typography variant="tableHeader" sx={{ fontWeight: 600, fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Details</Typography>
      </Box>
      <Table size={TABLE_STYLES.size} sx={{ '& .MuiTableCell-root': cellSx }}>
        <TableBody>
          <TableRow><TableCell sx={{ ...cellSx, color: 'text.secondary', width: '35%' }}>Start Date</TableCell><TableCell>{format(new Date(selected.startDate), 'yyyy-MM-dd')}</TableCell></TableRow>
          <TableRow><TableCell sx={{ ...cellSx, color: 'text.secondary' }}>End Date</TableCell><TableCell>{format(new Date(selected.endDate), 'yyyy-MM-dd')}</TableCell></TableRow>
          <TableRow><TableCell sx={{ ...cellSx, color: 'text.secondary' }}>Fiscal Year</TableCell><TableCell>{new Date(selected.startDate).getFullYear()}</TableCell></TableRow>
          <TableRow><TableCell sx={{ ...cellSx, color: 'text.secondary' }}>Duration</TableCell><TableCell>{selected.durationDays} days</TableCell></TableRow>
        </TableBody>
      </Table>
    </Paper>
  )
}
