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
import type { Customer } from '@/types'

interface CustomerRowProps {
  customer: Customer
  index: number
  selectedCustomerId: string | undefined
  focusedIndex: number
  onSelect: (customer: Customer) => void
}

const CustomerRow = memo(({ customer, index, selectedCustomerId, focusedIndex, onSelect }: CustomerRowProps) => {
  const isSelected = selectedCustomerId === customer.id
  const isFocused = index === focusedIndex

  return (
    <TableRow
      hover
      onClick={() => onSelect(customer)}
      data-customer-index={index}
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
          sx={{
            fontWeight: 400,
            fontSize: '0.8rem',
            lineHeight: 1.2,
          }}
        >
          {customer.name}
        </Typography>
      </TableCell>
    </TableRow>
  )
})

CustomerRow.displayName = 'CustomerRow'

interface CustomerListProps {
  customers: Customer[]
  loading: boolean
  total: number
  selectedCustomerId: string | undefined
  focusedIndex: number
  onSelect: (customer: Customer) => void
  customerListRef: React.RefObject<HTMLDivElement | null>
}

const CustomerList: React.FC<CustomerListProps> = ({
  customers,
  loading,
  total,
  selectedCustomerId,
  focusedIndex,
  onSelect,
  customerListRef,
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
            Customers ({total})
          </Typography>
          {loading && customers.length > 0 && (
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

      <Box sx={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }} ref={customerListRef}>
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
              {loading && customers.length === 0
                ? [...Array(10)].map((_, index) => (
                    <TableRow key={`skeleton-${index}`}>
                      <TableCell>
                        <Skeleton height={40} />
                      </TableCell>
                    </TableRow>
                  ))
                : customers.length === 0
                  ? (
                      <TableRow>
                        <TableCell>
                          <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 2 }}>
                            No customers found
                          </Typography>
                        </TableCell>
                      </TableRow>
                    )
                  : customers.map((customer, index) => (
                      <CustomerRow
                        key={customer.id}
                        customer={customer}
                        index={index}
                        selectedCustomerId={selectedCustomerId}
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

export default CustomerList
