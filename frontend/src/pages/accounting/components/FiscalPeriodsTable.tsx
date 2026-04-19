import type { RefObject } from 'react'
import { Chip, CircularProgress, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography } from '@mui/material'
import { format } from 'date-fns'

import { TABLE_STYLES } from '@/constants/tableStyles'
import { FiscalPeriod, FiscalPeriodStatus } from '@/types'

interface Props {
  periods: FiscalPeriod[]
  loading: boolean
  selectedId: string | null
  onSelect: (item: FiscalPeriod) => void
  listRef?: RefObject<HTMLDivElement | null>
}

export function FiscalPeriodsTable({ periods, loading, selectedId, onSelect, listRef }: Props) {
  return (
    <Paper ref={listRef} sx={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <TableContainer sx={{ flex: 1, overflow: 'auto' }}>
        <Table size={TABLE_STYLES.size} stickyHeader>
          <TableHead>
            <TableRow>
              <TableCell sx={{ fontWeight: 600 }}>Code</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>Name</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>Range</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>Status</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={4} align="center" sx={{ py: 4 }}><CircularProgress /></TableCell></TableRow>
            ) : periods.length === 0 ? (
              <TableRow><TableCell colSpan={4} align="center" sx={{ py: 4 }}><Typography variant="body2" color="text.secondary">No fiscal periods found</Typography></TableCell></TableRow>
            ) : periods.map((period) => (
              <TableRow key={period.id} hover selected={period.id === selectedId} onClick={() => onSelect(period)} sx={{ cursor: 'pointer', height: TABLE_STYLES.row.height }}>
                <TableCell>{period.code}</TableCell>
                <TableCell>{period.name}</TableCell>
                <TableCell>{format(new Date(period.startDate), 'yyyy-MM-dd')} - {format(new Date(period.endDate), 'yyyy-MM-dd')}</TableCell>
                <TableCell><Chip size="small" label={period.status} color={period.status === FiscalPeriodStatus.OPEN ? 'success' : 'error'} /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Paper>
  )
}
