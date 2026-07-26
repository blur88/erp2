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
import { getCurrentDate } from '@/utils/formatters'
import { rtkErrorMessage } from '@/utils/errorMessage'
import type { Expense } from '@/types'

interface PaymentLine {
  id: string
  paymentMethodId: string
  amount: number | string
  paymentDate: string
  reference: string
}

interface ExpensePayDialogProps {
  open: boolean
  onClose: () => void
  onSubmit: (payments: { paymentMethodId: string; amount: number; paymentDate: string; reference?: string }[]) => Promise<void>
  expense: Pick<Expense, 'id' | 'expenseNumber' | 'totalAmount' | 'paidAmount' | 'balance'>
}

const newId = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2)

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat('en-MY', { style: 'currency', currency: 'MYR' }).format(amount)

export default function ExpensePayDialog({
  open,
  onClose,
  onSubmit,
  expense,
}: ExpensePayDialogProps) {
  const { data: paymentMethods = [] } = useGetActivePaymentMethodsForPurchasesQuery(undefined, { skip: !open })

  const totalAmount = Number(expense.totalAmount)
  const paidAmount = Number(expense.paidAmount)
  const balance = Number(expense.balance)

  const [lines, setLines] = useState<PaymentLine[]>([])
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
    if (!open || lines.length > 0 || paymentMethods.length === 0) return
    const cashMethod = paymentMethods.find((m) => m.code === 'CASH')
    setLines([{
      id: newId(),
      paymentMethodId: cashMethod?.id || paymentMethods[0]?.id || '',
      amount: balance > 0 ? balance : '',
      paymentDate: getCurrentDate(),
      reference: '',
    }])
  }, [open, paymentMethods, lines.length, balance])

  const totalEntered = lines.reduce(
    (sum, l) => sum + (typeof l.amount === 'number' ? l.amount : parseFloat(l.amount as string) || 0),
    0,
  )
  const exceedsBalance = totalEntered > balance

  const updateLine = useCallback((index: number, field: keyof PaymentLine, value: any) => {
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
        amount: '',
        paymentDate: getCurrentDate(),
        reference: '',
      },
    ])
  }, [paymentMethods])

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
      setError('At least one payment line with a valid amount is required.')
      return
    }
    if (validLines.some((l) => !l.paymentDate)) {
      setError('Payment date is required on every line.')
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
      setError(rtkErrorMessage(err, 'Failed to record payment.'))
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
      <DialogTitle>Record Payment — {expense.expenseNumber}</DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1, mt: 1 }}>
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>Total</Typography>
          <Typography variant="body2">{formatCurrency(totalAmount)}</Typography>
        </Box>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>Paid</Typography>
          <Typography variant="body2">{formatCurrency(paidAmount)}</Typography>
        </Box>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
          <Typography variant="body2" sx={{ fontWeight: 'bold' }}>Balance</Typography>
          <Typography variant="body2" sx={{ fontWeight: 'bold' }}>{formatCurrency(balance)}</Typography>
        </Box>

        <Divider sx={{ mb: 2 }} />

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
                '& input[type=number]::-webkit-outer-spin-button, & input[type=number]::-webkit-inner-spin-button':
                  { WebkitAppearance: 'none', margin: 0 },
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
          Add Payment Line
        </Button>

        <Divider sx={{ mb: 2 }} />

        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
          <Typography variant="body2" sx={{ fontWeight: 'bold' }}>Total Payment</Typography>
          <Typography variant="body2" sx={{ fontWeight: 'bold' }}>{formatCurrency(totalEntered)}</Typography>
        </Box>
        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>Remaining After Payment</Typography>
          <Typography variant="body2" color={exceedsBalance ? 'error.main' : 'text.secondary'}>
            {exceedsBalance
              ? `${formatCurrency(Math.abs(balance - totalEntered))} (exceeds balance)`
              : formatCurrency(balance - totalEntered)}
          </Typography>
        </Box>

        {exceedsBalance && (
          <Alert severity="error" sx={{ mt: 2 }}>
            Total payment exceeds balance by {formatCurrency(Math.abs(balance - totalEntered))}.
          </Alert>
        )}

        {error && (
          <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={handleRequestClose} disabled={submitting}>Cancel</Button>
        <Button
          variant="contained"
          onClick={handleSubmit}
          disabled={submitting || totalEntered <= 0 || exceedsBalance}
          startIcon={submitting ? <CircularProgress size={16} /> : undefined}
        >
          {submitting ? 'Recording...' : 'Record Payment'}
        </Button>
      </DialogActions>
      <Dialog open={confirmDiscard} onClose={() => setConfirmDiscard(false)} transitionDuration={0}>
        <DialogTitle>Discard this payment?</DialogTitle>
        <DialogActions>
          <Button onClick={() => setConfirmDiscard(false)}>Keep Editing</Button>
          <Button color="error" onClick={onClose}>Discard</Button>
        </DialogActions>
      </Dialog>
    </Dialog>
  )
}
