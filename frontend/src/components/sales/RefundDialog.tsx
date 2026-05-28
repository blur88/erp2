import React, { useState, useEffect, useCallback } from 'react'
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  TextField,
  Select,
  MenuItem,
  FormControl,
  IconButton,
  Divider,
  Alert,
  CircularProgress,
} from '@mui/material'
import { default as DeleteIcon } from '@mui/icons-material/Delete'
import { default as AddIcon } from '@mui/icons-material/Add'
import { useGetActivePaymentMethodsQuery } from '@/store/api/paymentMethodsApi'
import { useGetSalesOrderPaymentsQuery } from '@/store/api/salesApi'
import { getCurrentDate } from '@/utils/formatters'

const newId = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2)

interface RefundLine {
  id: string
  paymentMethodId: string
  amount: number | string
  paymentDate: string
  reference: string
}

interface RefundDialogProps {
  open: boolean
  onClose: () => void
  onSubmit: (refunds: { paymentMethodId: string; amount: number; paymentDate: string; reference?: string }[]) => Promise<void>
  orderId: string
  orderNumber: string
}

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat('en-MY', { style: 'currency', currency: 'MYR' }).format(amount)

export default function RefundDialog({
  open,
  onClose,
  onSubmit,
  orderId,
  orderNumber,
}: RefundDialogProps) {
  const { data: paymentMethods = [] } = useGetActivePaymentMethodsQuery(undefined, { skip: !open })
  const { data: paymentRecords = [], isLoading: loadingPayments } = useGetSalesOrderPaymentsQuery(
    orderId,
    { skip: !open },
  )

  const totalPaid = paymentRecords
    .filter((r) => Number(r.amount) > 0)
    .reduce((sum, r) => sum + Number(r.amount), 0)

  const alreadyRefunded = paymentRecords
    .filter((r) => Number(r.amount) < 0)
    .reduce((sum, r) => sum + Math.abs(Number(r.amount)), 0)

  const availableForRefund = Math.max(0, totalPaid - alreadyRefunded)

  const [lines, setLines] = useState<RefundLine[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const [userHasEdited, setUserHasEdited] = useState(false)

  useEffect(() => {
    if (!open) return
    setError(null)
    setSubmitting(false)
    setConfirmDiscard(false)
    setUserHasEdited(false)
    setLines([])
  }, [open])

  useEffect(() => {
    if (!open || lines.length > 0 || loadingPayments) return
    const positivePayments = paymentRecords.filter((r) => Number(r.amount) > 0)
    if (positivePayments.length > 0) {
      setLines(positivePayments.map((payment) => {
        const resolvedMethodId = paymentMethods.find((m) => m.id === payment.paymentMethodId)?.id
          ?? paymentMethods.find((m) => m.code === 'CASH')?.id
          ?? paymentMethods[0]?.id
          ?? ''
        const scaledAmount = totalPaid > 0
          ? Math.round((Number(payment.amount) / totalPaid) * availableForRefund * 100) / 100
          : 0
        return {
          id: newId(),
          paymentMethodId: resolvedMethodId,
          amount: scaledAmount > 0 ? scaledAmount : '',
          paymentDate: getCurrentDate(),
          reference: '',
        }
      }))
    } else {
      if (paymentMethods.length === 0) return
      const cashMethod = paymentMethods.find((m) => m.code === 'CASH')
      setLines([{
        id: newId(),
        paymentMethodId: cashMethod?.id || paymentMethods[0]?.id || '',
        amount: availableForRefund > 0 ? availableForRefund : '',
        paymentDate: getCurrentDate(),
        reference: '',
      }])
    }
  }, [open, paymentMethods, lines.length, availableForRefund, loadingPayments, paymentRecords, totalPaid])

  const totalEntered = lines.reduce(
    (sum, l) => sum + (typeof l.amount === 'number' ? l.amount : parseFloat(l.amount as string) || 0),
    0,
  )
  const remainingAfterRefund = availableForRefund - totalEntered
  const exceedsAvailable = totalEntered > availableForRefund

  const updateLine = useCallback((index: number, field: keyof RefundLine, value: string | number) => {
    setUserHasEdited(true)
    setLines((prev) => {
      const updated = [...prev]
      updated[index] = { ...updated[index], [field]: value }
      return updated
    })
  }, [])

  const addLine = useCallback(() => {
    setUserHasEdited(true)
    const cashMethod = paymentMethods.find((m) => m.code === 'CASH')
    setLines((prev) => [
      ...prev,
      {
        id: newId(),
        paymentMethodId: cashMethod?.id || paymentMethods[0]?.id || '',
        amount: remainingAfterRefund > 0 ? remainingAfterRefund : '',
        paymentDate: getCurrentDate(),
        reference: '',
      },
    ])
  }, [paymentMethods, remainingAfterRefund])

  const removeLine = useCallback((index: number) => {
    setUserHasEdited(true)
    setLines((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== index) : prev))
  }, [])

  const handleSubmit = async () => {
    setError(null)
    const validLines = lines.filter((l) => {
      const amt = typeof l.amount === 'number' ? l.amount : parseFloat(l.amount as string)
      return l.paymentMethodId && amt > 0
    })
    if (validLines.length === 0) {
      setError('At least one refund line with a valid amount is required.')
      return
    }
    if (totalEntered > availableForRefund) {
      setError(`Total refund (${formatCurrency(totalEntered)}) exceeds available for refund (${formatCurrency(availableForRefund)}).`)
      return
    }
    setSubmitting(true)
    try {
      await onSubmit(
        validLines.map((l) => ({
          paymentMethodId: l.paymentMethodId,
          amount: typeof l.amount === 'number' ? l.amount : parseFloat(l.amount as string),
          paymentDate: l.paymentDate,
          reference: l.reference || undefined,
        })),
      )
      onClose()
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Failed to record refund.')
    } finally {
      setSubmitting(false)
    }
  }

  const handleRequestClose = () => {
    if (userHasEdited) {
      setConfirmDiscard(true)
    } else {
      onClose()
    }
  }

  return (
    <Dialog open={open} onClose={handleRequestClose} maxWidth="sm" fullWidth>
      <DialogTitle>Refund — {orderNumber}</DialogTitle>
      <DialogContent>
        {loadingPayments ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
            <CircularProgress size={24} />
          </Box>
        ) : (
          <>
            {/* Refund Summary */}
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1, mt: 1 }}>
              <Typography variant="body2" sx={{ color: 'text.secondary' }}>Total Paid</Typography>
              <Typography variant="body2">{formatCurrency(totalPaid)}</Typography>
            </Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
              <Typography variant="body2" sx={{ color: 'text.secondary' }}>Already Refunded</Typography>
              <Typography variant="body2">{formatCurrency(alreadyRefunded)}</Typography>
            </Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
              <Typography variant="body2" sx={{ fontWeight: 'bold' }}>Available for Refund</Typography>
              <Typography variant="body2" sx={{ fontWeight: 'bold' }}>{formatCurrency(availableForRefund)}</Typography>
            </Box>

            <Divider sx={{ mb: 2 }} />

            {/* Refund Lines */}
            {lines.map((line, index) => (
              <Box key={line.id} sx={{ display: 'flex', gap: 1, mb: 1.5, alignItems: 'center' }}>
                <FormControl size="small" sx={{ minWidth: 130 }}>
                  <Select
                    value={line.paymentMethodId}
                    onChange={(e) => updateLine(index, 'paymentMethodId', e.target.value)}
                    displayEmpty
                    sx={{ fontSize: '0.85rem' }}
                  >
                    <MenuItem value="" disabled>Method</MenuItem>
                    {paymentMethods.map((pm) => (
                      <MenuItem key={pm.id} value={pm.id} sx={{ fontSize: '0.85rem' }}>
                        {pm.name}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>

                <TextField
                  size="small"
                  type="number"
                  placeholder="Amount"
                  value={line.amount}
                  onChange={(e) => updateLine(index, 'amount', e.target.value)}
                  slotProps={{ htmlInput: { min: 0, step: 0.01 } }}
                  sx={{
                    width: 120,
                    '& input[type=number]': { MozAppearance: 'textfield' },
                    '& input[type=number]::-webkit-outer-spin-button, & input[type=number]::-webkit-inner-spin-button': {
                      WebkitAppearance: 'none',
                      margin: 0,
                    },
                  }}
                />

                <TextField
                  size="small"
                  type="date"
                  value={line.paymentDate}
                  onChange={(e) => updateLine(index, 'paymentDate', e.target.value)}
                  sx={{ width: 140 }}
                  slotProps={{ htmlInput: { max: '2099-12-31' } }}
                />

                <TextField
                  size="small"
                  placeholder="Reference"
                  value={line.reference}
                  onChange={(e) => updateLine(index, 'reference', e.target.value)}
                  sx={{ flex: 1 }}
                />

                <IconButton
                  size="small"
                  onClick={() => removeLine(index)}
                  disabled={lines.length <= 1}
                  color="error"
                >
                  <DeleteIcon fontSize="small" />
                </IconButton>
              </Box>
            ))}

            <Button
              startIcon={<AddIcon />}
              size="small"
              onClick={addLine}
              sx={{ mt: 0.5, mb: 2 }}
            >
              Add Refund Row
            </Button>

            <Divider sx={{ mb: 2 }} />

            {/* Totals */}
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
              <Typography variant="body2" sx={{ fontWeight: 'bold' }}>Total Refund</Typography>
              <Typography variant="body2" sx={{ fontWeight: 'bold' }}>{formatCurrency(totalEntered)}</Typography>
            </Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
              <Typography variant="body2" sx={{ color: 'text.secondary' }}>Remaining After Refund</Typography>
              <Typography
                variant="body2"
                color={exceedsAvailable ? 'error.main' : 'text.secondary'}
              >
                {exceedsAvailable
                  ? `${formatCurrency(Math.abs(remainingAfterRefund))} (exceeds available)`
                  : formatCurrency(remainingAfterRefund)}
              </Typography>
            </Box>

            {exceedsAvailable && (
              <Alert severity="error" sx={{ mt: 2 }}>
                Total refund exceeds available for refund by {formatCurrency(Math.abs(remainingAfterRefund))}.
              </Alert>
            )}

            {error && (
              <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>
            )}
          </>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={handleRequestClose} disabled={submitting}>
          Cancel
        </Button>
        <Button
          variant="contained"
          color="error"
          onClick={handleSubmit}
          disabled={submitting || totalEntered <= 0 || exceedsAvailable || loadingPayments}
          startIcon={submitting ? <CircularProgress size={16} /> : undefined}
        >
          {submitting ? 'Refunding...' : 'Refund'}
        </Button>
      </DialogActions>
      <Dialog
        open={confirmDiscard}
        onClose={() => setConfirmDiscard(false)}
        transitionDuration={0}
      >
        <DialogTitle>Discard this refund?</DialogTitle>
        <DialogActions>
          <Button onClick={() => setConfirmDiscard(false)}>Keep Editing</Button>
          <Button color="error" onClick={onClose}>Discard</Button>
        </DialogActions>
      </Dialog>
    </Dialog>
  )
}
