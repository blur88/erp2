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

interface PaymentLine {
  paymentMethodId: string
  amount: number | string
  reference: string
}

interface PaymentDialogProps {
  open: boolean
  onClose: () => void
  onSubmit: (payments: { paymentMethodId: string; amount: number; reference?: string }[]) => Promise<void>
  orderNumber: string
  totalAmount: number
  paidAmount: number
  title?: string
}

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('en-MY', { style: 'currency', currency: 'MYR' }).format(amount)
}

export default function PaymentDialog({
  open,
  onClose,
  onSubmit,
  orderNumber,
  totalAmount,
  paidAmount,
  title,
}: PaymentDialogProps) {
  const outstandingBalance = Math.max(0, totalAmount - paidAmount)
  const { data: paymentMethods = [] } = useGetActivePaymentMethodsQuery(undefined, { skip: !open })
  const [lines, setLines] = useState<PaymentLine[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const [userHasEdited, setUserHasEdited] = useState(false)

  // Reset all state when the dialog opens
  useEffect(() => {
    if (!open) return
    setError(null)
    setSubmitting(false)
    setConfirmDiscard(false)
    setUserHasEdited(false)
    setLines([])
  }, [open])

  // Seed the first line once payment methods are available (only when lines are empty)
  useEffect(() => {
    if (!open || lines.length > 0) return
    const cashMethod = paymentMethods.find((m) => m.code === 'CASH')
    setLines([{
      paymentMethodId: cashMethod?.id || paymentMethods[0]?.id || '',
      amount: outstandingBalance > 0 ? outstandingBalance : '',
      reference: '',
    }])
  }, [open, paymentMethods, lines.length])

  const totalEntered = lines.reduce((sum, l) => sum + (typeof l.amount === 'number' ? l.amount : parseFloat(l.amount as string) || 0), 0)
  const remaining = outstandingBalance - totalEntered

  const updateLine = useCallback((index: number, field: keyof PaymentLine, value: any) => {
    setUserHasEdited(true)
    setLines(prev => {
      const updated = [...prev]
      updated[index] = { ...updated[index], [field]: value }
      return updated
    })
  }, [])

  const addLine = useCallback(() => {
    setUserHasEdited(true)
    const cashMethod = paymentMethods.find((m) => m.code === 'CASH')
    setLines(prev => [...prev, {
      paymentMethodId: cashMethod?.id || paymentMethods[0]?.id || '',
      amount: remaining > 0 ? remaining : '',
      reference: '',
    }])
  }, [paymentMethods, remaining])

  const removeLine = useCallback((index: number) => {
    setUserHasEdited(true)
    setLines(prev => prev.length > 1 ? prev.filter((_, i) => i !== index) : prev)
  }, [])

  const handleSubmit = async () => {
    setError(null)
    // Validate
    const validLines = lines.filter(l => {
      const amt = typeof l.amount === 'number' ? l.amount : parseFloat(l.amount as string)
      return l.paymentMethodId && amt > 0
    })
    if (validLines.length === 0) {
      setError('At least one payment line with a valid amount is required.')
      return
    }

    setSubmitting(true)
    try {
      await onSubmit(validLines.map(l => ({
        paymentMethodId: l.paymentMethodId,
        amount: typeof l.amount === 'number' ? l.amount : parseFloat(l.amount as string),
        reference: l.reference || undefined,
      })))
      onClose()
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Failed to record payments.')
    } finally {
      setSubmitting(false)
    }
  }

  const isOverpaying = totalEntered > outstandingBalance && outstandingBalance > 0

  const handleRequestClose = () => {
    if (userHasEdited) {
      setConfirmDiscard(true)
    } else {
      onClose()
    }
  }

  return (
    <Dialog open={open} onClose={handleRequestClose} maxWidth="sm" fullWidth>
      <DialogTitle>{title ?? `Record Payment — ${orderNumber}`}</DialogTitle>
      <DialogContent>
        {/* Order Summary */}
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
          }}>{formatCurrency(outstandingBalance)}</Typography>
        </Box>

        <Divider sx={{ mb: 2 }} />

        {/* Payment Lines */}
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

        {/* Totals */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
          <Typography variant="body2" sx={{
            fontWeight: "bold"
          }}>Total Payment</Typography>
          <Typography variant="body2" sx={{
            fontWeight: "bold"
          }}>{formatCurrency(totalEntered)}</Typography>
        </Box>
        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
          <Typography variant="body2" sx={{
            color: "text.secondary"
          }}>Remaining</Typography>
          <Typography variant="body2" color={remaining < 0 ? 'error.main' : 'text.secondary'}>
            {formatCurrency(Math.abs(remaining))}{remaining < 0 ? ' (overpayment)' : ''}
          </Typography>
        </Box>

        {isOverpaying && (
          <Alert severity="warning" sx={{ mt: 2 }}>
            Total payment exceeds outstanding balance by {formatCurrency(Math.abs(remaining))}.
          </Alert>
        )}

        {error && (
          <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={handleRequestClose} disabled={submitting}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={handleSubmit}
          disabled={submitting || totalEntered <= 0}
          startIcon={submitting ? <CircularProgress size={16} /> : undefined}
        >
          {submitting ? 'Recording...' : 'Record Payment'}
        </Button>
      </DialogActions>
      <Dialog
        open={confirmDiscard}
        onClose={() => setConfirmDiscard(false)}
        transitionDuration={0}
      >
        <DialogTitle>Discard this payment?</DialogTitle>
        <DialogActions>
          <Button onClick={() => setConfirmDiscard(false)}>Keep Editing</Button>
          <Button color="error" onClick={onClose}>Discard</Button>
        </DialogActions>
      </Dialog>
    </Dialog>
  );
}
