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
import type { Supplier } from '@/types'

interface SupplierRowProps {
  supplier: Supplier
  index: number
  selectedSupplierId: string | undefined
  focusedIndex: number
  onSelect: (supplier: Supplier) => void
}

const SupplierRow = memo(({ supplier, index, selectedSupplierId, focusedIndex, onSelect }: SupplierRowProps) => {
  const isSelected = selectedSupplierId === supplier.id
  const isFocused = index === focusedIndex

  return (
    <TableRow
      hover
      onClick={() => onSelect(supplier)}
      data-supplier-index={index}
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
        <Typography
          variant="body2"
          sx={{ fontWeight: 400, fontSize: '0.8rem', lineHeight: 1.2 }}
        >
          {supplier.companyName}
        </Typography>
      </TableCell>
    </TableRow>
  )
})

SupplierRow.displayName = 'SupplierRow'

interface SupplierListProps {
  suppliers: Supplier[]
  loading: boolean
  total: number
  selectedSupplierId: string | undefined
  focusedIndex: number
  onSelect: (supplier: Supplier) => void
  supplierListRef: React.RefObject<HTMLDivElement | null>
}

const SupplierList: React.FC<SupplierListProps> = ({
  suppliers,
  loading,
  total,
  selectedSupplierId,
  focusedIndex,
  onSelect,
  supplierListRef,
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
            Suppliers ({total})
          </Typography>
          {loading && suppliers.length > 0 && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography variant="caption" color="text.secondary">
                Searching...
              </Typography>
              <Box sx={{ width: 16, height: 16 }}>
                <Skeleton variant="circular" width={16} height={16} />
              </Box>
            </Box>
          )}
        </Box>
      </Box>

      <Box sx={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }} ref={supplierListRef}>
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
              {loading && suppliers.length === 0
                ? [...Array(10)].map((_, index) => (
                    <TableRow key={`skeleton-${index}`}>
                      <TableCell>
                        <Skeleton height={40} />
                      </TableCell>
                    </TableRow>
                  ))
                : suppliers.length === 0
                  ? (
                      <TableRow>
                        <TableCell>
                          <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 2 }}>
                            No suppliers found
                          </Typography>
                        </TableCell>
                      </TableRow>
                    )
                  : suppliers.map((supplier, index) => (
                      <SupplierRow
                        key={supplier.id}
                        supplier={supplier}
                        index={index}
                        selectedSupplierId={selectedSupplierId}
                        focusedIndex={focusedIndex}
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

export default SupplierList
