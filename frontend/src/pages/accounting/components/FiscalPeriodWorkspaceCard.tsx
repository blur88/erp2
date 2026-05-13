import { Paper, Table, TableBody, TableCell, TableRow } from '@mui/material'
import { format } from 'date-fns'

import { WorkspaceCardSectionHeader } from '@/components/common/WorkspaceCardSectionHeader'
import { TABLE_STYLES } from '@/constants/tableStyles'
import { FiscalPeriod } from '@/types'

interface Props { selected: FiscalPeriod | null }
const cellSx = { border: 'none', py: TABLE_STYLES.cell.padding.py, px: TABLE_STYLES.cell.padding.px }

export function FiscalPeriodWorkspaceCard({ selected }: Props) {
  if (!selected) return <Paper sx={{ flex: 1 }} />
  return (
    <Paper sx={{ flex: 1 }}>
      <WorkspaceCardSectionHeader title="Details" />
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
