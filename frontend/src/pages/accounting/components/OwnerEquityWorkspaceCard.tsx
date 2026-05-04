import { Box, Paper, Table, TableBody, TableCell, TableRow, Typography } from '@mui/material'

import { TABLE_STYLES } from '@/constants/tableStyles'
import type { OwnerEquityTransaction } from '@/types'
import { formatDate } from '@/utils/formatters'

interface Props { selected: OwnerEquityTransaction | null }

const cellSx = { border: 'none', py: TABLE_STYLES.cell.padding.py, px: TABLE_STYLES.cell.padding.px }
const labelCellSx = { ...cellSx, color: 'text.secondary', width: '35%', fontSize: '0.8rem' }
const valueCellSx = { ...cellSx, fontSize: '0.8rem' }
const sectionHeaderCellSx = {
  pb: TABLE_STYLES.cell.padding.py * 0.67,
  py: TABLE_STYLES.cell.padding.py * 0.67,
  borderTop: TABLE_STYLES.cell.border,
}

export function OwnerEquityWorkspaceCard({ selected }: Props) {
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
            <TableCell colSpan={2} sx={sectionHeaderCellSx}>
              <Typography variant="h6" sx={{ fontWeight: 600, color: 'primary.main', fontSize: '0.8rem' }}>
                Audit Info
              </Typography>
            </TableCell>
          </TableRow>
          <TableRow sx={{ backgroundColor: 'grey.50' }}>
            <TableCell sx={labelCellSx}>Created</TableCell>
            <TableCell sx={valueCellSx}>{formatDate(selected.createdAt)}</TableCell>
          </TableRow>
          <TableRow>
            <TableCell sx={labelCellSx}>Updated</TableCell>
            <TableCell sx={valueCellSx}>{formatDate(selected.updatedAt)}</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </Paper>
  )
}
