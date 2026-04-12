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
import type { VendorPayment } from '@/types'

interface VendorPaymentRowProps {
  payment: VendorPayment
  index: number
  selectedPaymentId?: string
  focusedPaymentIndex: number
  onPaymentSelect: (payment: VendorPayment) => void
}

const VendorPaymentRow = memo(({
  payment,
  index,
  selectedPaymentId,
  focusedPaymentIndex,
  onPaymentSelect,
}: VendorPaymentRowProps) => {
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

VendorPaymentRow.displayName = 'VendorPaymentRow'

interface VendorPaymentTableProps {
  payments: VendorPayment[]
  loading: boolean
  total: number
  selectedPaymentId?: string
  focusedPaymentIndex: number
  onPaymentSelect: (payment: VendorPayment) => void
  paymentListRef: React.RefObject<HTMLDivElement | null>
}

const VendorPaymentTable: React.FC<VendorPaymentTableProps> = ({
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
        <Typography
          variant="tableHeader"
          sx={{ fontWeight: 600, fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}
        >
          Vendor Payments ({total})
        </Typography>
      </Box>
      <Box sx={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }} ref={paymentListRef}>
        <TableContainer sx={{ flex: 1, overflow: 'auto' }}>
          <Table size={TABLE_STYLES.size}>
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
                    <VendorPaymentRow
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

export default VendorPaymentTable
