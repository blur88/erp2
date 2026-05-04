import { Box, Paper, Table, TableBody, TableCell, TableRow, Typography } from '@mui/material'

import { TABLE_STYLES } from '@/constants/tableStyles'
import type { Settlement } from '@/types'

interface Props { selected: Settlement | null }

const cellSx = { border: 'none', py: TABLE_STYLES.cell.padding.py, px: TABLE_STYLES.cell.padding.px }
const labelCellSx = { ...cellSx, color: 'text.secondary', width: '35%' }
const sectionHeaderCellSx = {
  pb: TABLE_STYLES.cell.padding.py * 0.67,
  py: TABLE_STYLES.cell.padding.py * 0.67,
  borderTop: TABLE_STYLES.cell.border,
}

export function SettlementWorkspaceCard({ selected }: Props) {
  if (!selected) return <Paper sx={{ flex: 1 }} />
  return (
    <Paper sx={{ flex: 1 }}>
      <Box sx={{ px: 2, py: 1, borderBottom: TABLE_STYLES.cell.border }}>
        <Typography variant="tableHeader" sx={{ fontWeight: 600, fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Details</Typography>
      </Box>
      <Table size={TABLE_STYLES.size} sx={{ '& .MuiTableCell-root': cellSx }}>
        <TableBody>
          <TableRow>
            <TableCell colSpan={2} sx={sectionHeaderCellSx}>
              <Typography variant="h6" sx={{ fontWeight: 600, color: 'primary.main', fontSize: '0.8rem' }}>
                Payment Details
              </Typography>
            </TableCell>
          </TableRow>
          <TableRow><TableCell sx={labelCellSx}>Payment Method</TableCell><TableCell>{selected.paymentMethod?.name || '-'}</TableCell></TableRow>
          <TableRow><TableCell sx={labelCellSx}>Linked Payments</TableCell><TableCell>{selected.paymentCount}</TableCell></TableRow>
          <TableRow><TableCell sx={labelCellSx}>Reference</TableCell><TableCell>{selected.reference || '—'}</TableCell></TableRow>
          <TableRow><TableCell sx={labelCellSx}>Notes</TableCell><TableCell>{selected.notes || '—'}</TableCell></TableRow>
        </TableBody>
      </Table>
    </Paper>
  )
}
