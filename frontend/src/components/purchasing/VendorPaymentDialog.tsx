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
import { useGetActivePaymentMethodsForPurchasesQuery } from '@/store/api/paymentMethodsApi'
import {
  formatCurrency,
  toAmountInputValue,
  toScaledAmount,
  fromScaledAmount,
  sumScaledAmounts,
} from '@/utils/currency'

interface PaymentLine {
  paymentMethodId: string
  amount: string
  reference: string
}

interface VendorPaymentDialogProps {
  open: boolean
  onClose: () => void
  onSubmit: (payments: { paymentMethodId: string; amount: string; reference?: string }[]) => Promise<void>
  orderNumber: string
  totalAmount: string
  paidAmount: string
}

export default function VendorPaymentDialog({
  open,
  onClose,
  onSubmit,
  orderNumber,
  totalAmount,
  paidAmount,
}: VendorPaymentDialogProps) {
  const totalMinor = toScaledAmount(totalAmount) ?? 0n
  const paidMinor = toScaledAmount(paidAmount) ?? 0n
  const outstandingMinor = totalMinor - paidMinor > 0n ? totalMinor - paidMinor : 0n
  const { data: paymentMethods = [] } = useGetActivePaymentMethodsForPurchasesQuery(undefined, { skip: !open })
  const [lines, setLines] = useState<PaymentLine[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setError(null)
    setSubmitting(false)
    const cashMethod = paymentMethods.find((m) => m.code === 'CASH')
    setLines([{
      paymentMethodId: cashMethod?.id || paymentMethods[0]?.id || '',
      amount: outstandingMinor > 0n ? toAmountInputValue(fromScaledAmount(outstandingMinor)) : '',
      reference: '',
    }])
  }, [open, paymentMethods, outstandingMinor])

  const enteredMinor = sumScaledAmounts(lines.map((l) => l.amount))
  const hasInvalidAmount = enteredMinor === null
  const totalEnteredMinor = enteredMinor ?? 0n
  const remainingMinor = outstandingMinor - totalEnteredMinor

  const updateLine = useCallback((index: number, field: keyof PaymentLine, value: any) => {
    setLines(prev => {
      const updated = [...prev]
      updated[index] = { ...updated[index], [field]: value }
      return updated
    })
  }, [])

  const addLine = useCallback(() => {
    const cashMethod = paymentMethods.find((m) => m.code === 'CASH')
    setLines(prev => [...prev, {
      paymentMethodId: cashMethod?.id || paymentMethods[0]?.id || '',
      amount: remainingMinor > 0n ? toAmountInputValue(fromScaledAmount(remainingMinor)) : '',
      reference: '',
    }])
  }, [paymentMethods, remainingMinor])

  const removeLine = useCallback((index: number) => {
    setLines(prev => prev.length > 1 ? prev.filter((_, i) => i !== index) : prev)
  }, [])

  const handleSubmit = async () => {
    setError(null)
    if (hasInvalidAmount) {
      setError('Every payment amount must be a number with at most 4 decimal places.')
      return
    }
    const validLines = lines.filter(l => {
      const units = toScaledAmount(l.amount)
      return l.paymentMethodId && units !== null && units > 0n
    })
    if (validLines.length === 0) {
      setError('At least one payment line with a valid amount is required.')
      return
    }

    setSubmitting(true)
    try {
      await onSubmit(validLines.map(l => ({
        paymentMethodId: l.paymentMethodId,
        amount: l.amount,
        reference: l.reference || undefined,
      })))
      onClose()
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Failed to record payments.')
    } finally {
      setSubmitting(false)
    }
  }

  const isOverpaying = totalEnteredMinor > outstandingMinor && outstandingMinor > 0n

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Record Payment &mdash; {orderNumber}</DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1, mt: 1 }}>
          <Typography variant="body2" sx={{
            color: "text.secondary"
          }}>Order Total</Typography>
          <Typography variant="body2">{formatCurrency(totalAmount)}</Typography>
        </Box>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
          <Typography variant="body2" sx={{
            color: "text.secondary"
          }}>Previously Paid</Typography>
          <Typography variant="body2">{formatCurrency(paidAmount)}</Typography>
        </Box>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
          <Typography variant="body2" sx={{
            fontWeight: "bold"
          }}>Outstanding Balance</Typography>
          <Typography variant="body2" sx={{
            fontWeight: "bold"
          }}>{formatCurrency(fromScaledAmount(outstandingMinor))}</Typography>
        </Box>

        <Divider sx={{ mb: 2 }} />

        {lines.map((line, index) => (
          <Box key={index} sx={{ display: 'flex', gap: 1, mb: 1.5, alignItems: 'center' }}>
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
                '& input[type=number]::-webkit-outer-spin-button, & input[type=number]::-webkit-inner-spin-button': { WebkitAppearance: 'none', margin: 0 },
              }}
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
          Add Payment Line
        </Button>

        <Divider sx={{ mb: 2 }} />

        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
          <Typography variant="body2" sx={{
            fontWeight: "bold"
          }}>Total Payment</Typography>
          <Typography variant="body2" sx={{
            fontWeight: "bold"
          }}>{formatCurrency(fromScaledAmount(totalEnteredMinor))}</Typography>
        </Box>
        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
          <Typography variant="body2" sx={{
            color: "text.secondary"
          }}>Remaining</Typography>
          <Typography variant="body2" color={remainingMinor < 0n ? 'error.main' : 'text.secondary'}>
            {formatCurrency(fromScaledAmount(remainingMinor < 0n ? -remainingMinor : remainingMinor))}{remainingMinor < 0n ? ' (overpayment)' : ''}
          </Typography>
        </Box>

        {isOverpaying && (
          <Alert severity="warning" sx={{ mt: 2 }}>
            Total payment exceeds outstanding balance by {formatCurrency(fromScaledAmount(remainingMinor < 0n ? -remainingMinor : remainingMinor))}.
          </Alert>
        )}

        {error && (
          <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={submitting}>Cancel</Button>
        <Button
          variant="contained"
          onClick={handleSubmit}
          disabled={submitting || hasInvalidAmount || totalEnteredMinor <= 0n}
          startIcon={submitting ? <CircularProgress size={16} /> : undefined}
        >
          {submitting ? 'Recording...' : 'Record Payment'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
