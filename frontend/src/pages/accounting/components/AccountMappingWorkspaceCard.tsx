import { Box, Paper, Table, TableBody, TableCell, TableRow, Typography } from '@mui/material'

import { TABLE_STYLES } from '@/constants/tableStyles'
import type { AccountMapping } from '@/types/accountMapping'

interface Props { mapping: AccountMapping | undefined }
const cellSx = { border: 'none', py: TABLE_STYLES.cell.padding.py, px: TABLE_STYLES.cell.padding.px }

export function AccountMappingWorkspaceCard({ mapping }: Props) {
  if (!mapping) return <Paper sx={{ flex: 1 }} />
  return (
    <Paper sx={{ flex: 1 }}>
      <Box sx={{ px: 2, py: 1, borderBottom: TABLE_STYLES.cell.border }}>
        <Typography variant="tableHeader" sx={{ fontWeight: 600, fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Details</Typography>
      </Box>
      <Table size={TABLE_STYLES.size} sx={{ '& .MuiTableCell-root': cellSx }}>
        <TableBody>
          <TableRow><TableCell sx={{ ...cellSx, color: 'text.secondary', width: '35%' }}>Mapped Account</TableCell><TableCell>{mapping.account?.code} - {mapping.account?.name}</TableCell></TableRow>
          <TableRow><TableCell sx={{ ...cellSx, color: 'text.secondary' }}>Account Type</TableCell><TableCell>{mapping.account?.accountType || '-'}</TableCell></TableRow>
          <TableRow><TableCell sx={{ ...cellSx, color: 'text.secondary' }}>Description</TableCell><TableCell>{mapping.description || '-'}</TableCell></TableRow>
        </TableBody>
      </Table>
    </Paper>
  )
}
