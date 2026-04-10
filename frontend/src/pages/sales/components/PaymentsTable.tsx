import React, { memo } from 'react'
import {
  Box,
  Paper,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material'

import type { PaymentListItem } from '../hooks/usePaymentsPageState'

import { TABLE_STYLES } from '@/constants/tableStyles'

interface PaymentRowProps {
  payment: PaymentListItem
  index: number
  selectedPaymentId?: string
  focusedPaymentIndex: number
  onPaymentSelect: (payment: PaymentListItem) => void
}

const PaymentRow = memo(({ payment, index, selectedPaymentId, focusedPaymentIndex, onPaymentSelect }: PaymentRowProps) => {
  const isSelected = selectedPaymentId === payment.id
  const isFocused = index === focusedPaymentIndex

  return (
    <TableRow
      hover
      onClick={() => onPaymentSelect(payment)}
      data-payment-index={index}
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
          {payment.paymentNumber}
        </Typography>
      </TableCell>
    </TableRow>
  )
})

PaymentRow.displayName = 'PaymentRow'

interface PaymentsTableProps {
  payments: PaymentListItem[]
  loading: boolean
  total: number
  selectedPaymentId?: string
  focusedPaymentIndex: number
  onPaymentSelect: (payment: PaymentListItem) => void
  paymentListRef: React.RefObject<HTMLDivElement | null>
}

const PaymentsTable: React.FC<PaymentsTableProps> = ({
  payments,
  loading,
  total,
  selectedPaymentId,
  focusedPaymentIndex,
  onPaymentSelect,
  paymentListRef,
}) => {
  return (
    <Paper sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ p: TABLE_STYLES.cell.padding.px, borderBottom: TABLE_STYLES.cell.border }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography
            variant="tableHeader"
            sx={{ fontWeight: 600, fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}
          >
            Payment List ({total})
          </Typography>
          {loading && payments.length > 0 && (
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
      <Box sx={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }} ref={paymentListRef}>
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
            <TableHead>
              <TableRow
                sx={{
                  '& .MuiTableCell-head': {
                    fontWeight: 600,
                    backgroundColor: 'grey.50',
                    color: 'text.primary',
                    fontSize: '0.8rem',
                  },
                }}
              />
            </TableHead>
            <TableBody>
              {loading && payments.length === 0
                ? [...Array(10)].map((_, index) => (
                    <TableRow key={`skeleton-${index}`}>
                      <TableCell>
                        <Skeleton height={40} />
                      </TableCell>
                    </TableRow>
                  ))
                : payments.map((payment, index) => (
                    <PaymentRow
                      key={payment.id}
                      payment={payment}
                      index={index}
                      selectedPaymentId={selectedPaymentId}
                      focusedPaymentIndex={focusedPaymentIndex}
                      onPaymentSelect={onPaymentSelect}
                    />
                  ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Box>
    </Paper>
  )
}

export default PaymentsTable
