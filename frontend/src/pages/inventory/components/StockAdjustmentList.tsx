import React, { memo } from 'react'
import {
  Box,
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
import type { StockAdjustment } from '@/types'

interface AdjustmentRowProps {
  adjustment: StockAdjustment
  index: number
  selectedAdjustmentId: string | undefined
  focusedAdjustmentIndex: number
  onSelect: (adjustment: StockAdjustment) => void
}

const AdjustmentRow = memo(({
  adjustment,
  index,
  selectedAdjustmentId,
  focusedAdjustmentIndex,
  onSelect,
}: AdjustmentRowProps) => {
  const isSelected = selectedAdjustmentId === adjustment.id
  const isFocused = index === focusedAdjustmentIndex

  return (
    <TableRow
      hover
      onClick={() => onSelect(adjustment)}
      data-adjustment-index={index}
      sx={{
        cursor: 'pointer',
        backgroundColor: isSelected ? 'action.selected' : isFocused ? 'action.focus' : 'inherit',
        '&:hover': {
          backgroundColor: isSelected ? 'action.selected' : 'action.hover',
        },
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
          {adjustment.adjustmentNumber}
        </Typography>
      </TableCell>
    </TableRow>
  )
})

AdjustmentRow.displayName = 'AdjustmentRow'

interface StockAdjustmentListProps {
  adjustments: StockAdjustment[]
  loading: boolean
  total: number
  selectedAdjustmentId?: string
  focusedAdjustmentIndex: number
  onSelect: (adjustment: StockAdjustment) => void
  adjustmentListRef: React.RefObject<HTMLDivElement | null>
}

const StockAdjustmentList: React.FC<StockAdjustmentListProps> = ({
  adjustments,
  loading,
  total,
  selectedAdjustmentId,
  focusedAdjustmentIndex,
  onSelect,
  adjustmentListRef,
}) => {
  return (
    <Paper sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ p: TABLE_STYLES.cell.padding.px, borderBottom: TABLE_STYLES.cell.border }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography
            variant="tableHeader"
            sx={{
              fontWeight: 600,
              fontSize: '0.8rem',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
            }}
          >
            Adjustments ({total})
          </Typography>
          {loading && adjustments.length > 0 && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                Searching...
              </Typography>
              <Box sx={{ width: 16, height: 16 }}>
                <Skeleton variant="circular" width={16} height={16} />
              </Box>
            </Box>
          )}
        </Box>
      </Box>
      <Box
        sx={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
        ref={adjustmentListRef}
      >
        <TableContainer sx={{ flex: 1, overflow: 'auto' }}>
          <Table
            size={TABLE_STYLES.size}
            sx={{
              '& .MuiTableCell-root': {
                borderBottom: TABLE_STYLES.cell.border,
                py: TABLE_STYLES.cell.padding.py * 0.75,
                px: TABLE_STYLES.cell.padding.px * 0.75,
              },
            }}
          >
            <TableBody>
              {loading && adjustments.length === 0
                ? [...Array(10)].map((_, i) => (
                    <TableRow key={`skeleton-${i}`}>
                      <TableCell>
                        <Skeleton height={40} />
                      </TableCell>
                    </TableRow>
                  ))
                : adjustments.length === 0
                  ? (
                      <TableRow>
                        <TableCell>
                          <Typography variant="body2" sx={{ color: 'text.secondary', textAlign: 'center', py: 2 }}>
                            No adjustments found
                          </Typography>
                        </TableCell>
                      </TableRow>
                    )
                  : adjustments.map((adjustment, index) => (
                      <AdjustmentRow
                        key={adjustment.id}
                        adjustment={adjustment}
                        index={index}
                        selectedAdjustmentId={selectedAdjustmentId}
                        focusedAdjustmentIndex={focusedAdjustmentIndex}
                        onSelect={onSelect}
                      />
                    ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Box>
    </Paper>
  )
}

export default StockAdjustmentList
