import React, { memo } from 'react'
import {
  Box,
  Chip,
  Paper,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableRow,
  Typography,
} from '@mui/material'

import { TABLE_STYLES } from '@/constants/tableStyles'
import type { GoodsReceivedNote } from '@/types'
import { formatDate } from '@/utils/formatters'

interface GRNRowProps {
  grn: GoodsReceivedNote
  index: number
  selectedGRNId?: string
  focusedGRNIndex: number
  onGRNSelect: (grn: GoodsReceivedNote) => void
}

const GRNRow = memo(({ grn, index, selectedGRNId, focusedGRNIndex, onGRNSelect }: GRNRowProps) => {
  const isSelected = selectedGRNId === grn.id
  const isFocused = index === focusedGRNIndex

  return (
    <TableRow
      hover
      onClick={() => onGRNSelect(grn)}
      data-grn-index={index}
      sx={{
        cursor: 'pointer',
        backgroundColor: isSelected ? 'action.selected' : isFocused ? 'action.focus' : 'inherit',
        '&:hover': { backgroundColor: isSelected ? 'action.selected' : 'action.hover' },
        transition: 'background-color 0.2s ease',
        height: TABLE_STYLES.row.height,
        ...(isFocused && {
          outline: '2px solid',
          outlineColor: 'primary.main',
          outlineOffset: '-2px',
        }),
      }}
    >
      <TableCell>
        <Typography variant="body2" sx={{ fontWeight: 400, fontSize: '0.8rem', lineHeight: 1.2 }}>
          {grn.grnNumber}
        </Typography>
        <Typography variant="body2" sx={{ fontSize: '0.72rem', color: 'text.secondary', lineHeight: 1.2 }}>
          {grn.supplier?.companyName || '—'}
        </Typography>
      </TableCell>
      <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
        <Typography variant="body2" sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>
          {formatDate(grn.receivedDate)}
        </Typography>
        <Box sx={{ mt: 0.25 }}>
          <Chip
            label={grn.status}
            size="small"
            color={grn.status === 'received' ? 'success' : 'default'}
            sx={{ fontSize: '0.68rem', height: 16 }}
          />
        </Box>
      </TableCell>
    </TableRow>
  )
})

GRNRow.displayName = 'GRNRow'

interface GRNTableProps {
  grns: GoodsReceivedNote[]
  loading: boolean
  total: number
  selectedGRNId?: string
  focusedGRNIndex: number
  onGRNSelect: (grn: GoodsReceivedNote) => void
  grnListRef: React.RefObject<HTMLDivElement | null>
}

const GRNTable: React.FC<GRNTableProps> = ({
  grns,
  loading,
  total,
  selectedGRNId,
  focusedGRNIndex,
  onGRNSelect,
  grnListRef,
}) => {
  return (
    <Paper sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ p: TABLE_STYLES.cell.padding.px, borderBottom: TABLE_STYLES.cell.border }}>
        <Typography
          variant="tableHeader"
          sx={{ fontWeight: 600, fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}
        >
          GRN List ({total})
        </Typography>
      </Box>
      <Box sx={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }} ref={grnListRef}>
        <TableContainer sx={{ flex: 1, overflow: 'auto' }}>
          <Table size={TABLE_STYLES.size}>
            <TableBody>
              {loading && grns.length === 0
                ? [...Array(10)].map((_, index) => (
                    <TableRow key={`skeleton-${index}`}>
                      <TableCell colSpan={2}>
                        <Skeleton height={40} />
                      </TableCell>
                    </TableRow>
                  ))
                : grns.map((grn, index) => (
                    <GRNRow
                      key={grn.id}
                      grn={grn}
                      index={index}
                      selectedGRNId={selectedGRNId}
                      focusedGRNIndex={focusedGRNIndex}
                      onGRNSelect={onGRNSelect}
                    />
                  ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Box>
    </Paper>
  )
}

export default GRNTable
