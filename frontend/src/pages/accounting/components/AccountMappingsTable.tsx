import type { RefObject } from 'react'
import { Chip, CircularProgress, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography } from '@mui/material'
import type { AccountMapping } from '@/types/accountMapping'
import { TABLE_STYLES } from '@/constants/tableStyles'

interface Props {
  mappings: Array<{ category: string; label: string; description: string; mapping: AccountMapping | undefined; mappingType: string }>
  loading: boolean
  selectedId: string | null
  onSelect: (item: AccountMapping) => void
  listRef?: RefObject<HTMLDivElement | null>
}

export function AccountMappingsTable({ mappings, loading, selectedId, onSelect, listRef }: Props) {
  return (
    <Paper ref={listRef} sx={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <TableContainer sx={{ flex: 1, overflow: 'auto' }}>
        <Table size={TABLE_STYLES.size} stickyHeader>
          <TableHead>
            <TableRow>
              <TableCell sx={{ fontWeight: 600 }}>Category</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>Mapping Type</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>Assigned Account</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={3} align="center" sx={{ py: 4 }}><CircularProgress /></TableCell></TableRow>
            ) : mappings.length === 0 ? (
              <TableRow><TableCell colSpan={3} align="center" sx={{ py: 4 }}><Typography variant="body2" color="text.secondary">No account mappings found</Typography></TableCell></TableRow>
            ) : mappings.map((item) => (
              <TableRow key={item.mappingType} hover selected={item.mapping?.id === selectedId} onClick={() => item.mapping && onSelect(item.mapping)} sx={{ cursor: item.mapping ? 'pointer' : 'default', height: TABLE_STYLES.row.height }}>
                <TableCell><Chip size="small" label={item.category} color="primary" variant="outlined" /></TableCell>
                <TableCell>{item.label}</TableCell>
                <TableCell>{item.mapping ? `${item.mapping.account?.code} - ${item.mapping.account?.name}` : 'Not configured'}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Paper>
  )
}
