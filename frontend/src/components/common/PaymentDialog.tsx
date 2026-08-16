import { useState, useEffect, useCallback } from 'react'
import {
  Button,
  Box,
  Typography,
  TextField,
  Select,
  MenuItem,
  FormControl,
  IconButton,
  Alert,
  CircularProgress,
} from '@mui/material'
import { default as DeleteIcon } from '@mui/icons-material/Delete'
import { default as AddIcon } from '@mui/icons-material/Add'
import { getCurrentDate } from '@/utils/formatters'
import { rtkErrorMessage } from '@/utils/errorMessage'
import {
  formatCurrency,
  toAmountInputValue,
  toScaledAmount,
  fromScaledAmount,
  sumScaledAmounts,
} from '@/utils/currency'
import TransactionLineDialogShell, {
  DialogLineRow,
  TransactionDateField,
} from './TransactionLineDialogShell'

export interface PaymentLineInput {
  paymentMethodId: string
  amount: string
  paymentDate: string
  reference?: string
}

export interface PaymentMethodOption {
  id: string
  code: string
  name: string
}

export interface PaymentDialogTerminology {
  noun?: string
  verbPast?: string
  submitLabel?: string
  lineNoun?: string
}

export interface PaymentDialogProps {
  open: boolean
  documentNumber: string
  totalAmount: string
  paidAmount: string
  paymentMethods: PaymentMethodOption[]
  loading: boolean
  onClose: () => void
  onSubmit: (payments: PaymentLineInput[]) => Promise<void>
  terminology?: PaymentDialogTerminology
}

const DEFAULT_TERMINOLOGY: Required<PaymentDialogTerminology> = {
  noun: 'Payment',
  verbPast: 'Paid',
  submitLabel: 'Record Payment',
  lineNoun: 'Payment',
}

interface PaymentLine extends PaymentLineInput {
  id: string
  reference: string
}

const newId = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2)

export default function PaymentDialog({
  open,
  documentNumber,
  totalAmount,
  paidAmount,
  paymentMethods,
  loading,
  onClose,
  onSubmit,
  terminology = DEFAULT_TERMINOLOGY,
}: PaymentDialogProps) {
  const terms: Required<PaymentDialogTerminology> = {
    ...DEFAULT_TERMINOLOGY,
    ...terminology,
  }
  const totalMinor = toScaledAmount(totalAmount) ?? 0n
  const paidMinor = toScaledAmount(paidAmount) ?? 0n
  const outstandingMinor = totalMinor - paidMinor > 0n ? totalMinor - paidMinor : 0n

  const [lines, setLines] = useState<PaymentLine[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const [userHasEdited, setUserHasEdited] = useState(false)

  const noMethods = !loading && paymentMethods.length === 0

  // Reset every time the dialog opens.
  useEffect(() => {
    if (!open) return
    setError(null)
    setSubmitting(false)
    setConfirmDiscard(false)
    setUserHasEdited(false)
    setLines([])
  }, [open])

  // Seed the first line only once loading has settled AND methods exist, so no
  // line is ever prefilled from a not-yet-loaded amount.
  useEffect(() => {
    if (!open || loading || lines.length > 0 || paymentMethods.length === 0) return
    const cashMethod = paymentMethods.find((m) => m.code === 'CASH')
    setLines([{
      id: newId(),
      paymentMethodId: cashMethod?.id || paymentMethods[0]?.id || '',
      amount: outstandingMinor > 0n ? toAmountInputValue(fromScaledAmount(outstandingMinor)) : '',
      paymentDate: getCurrentDate(),
      reference: '',
    }])
  }, [open, loading, paymentMethods, lines.length, outstandingMinor])

  const enteredMinor = sumScaledAmounts(lines.map((l) => l.amount))
  const hasInvalidAmount = enteredMinor === null
  const totalEnteredMinor = enteredMinor ?? 0n
  const remainingMinor = outstandingMinor - totalEnteredMinor
  const isOverpaying = totalEnteredMinor > outstandingMinor && outstandingMinor > 0n
  const absRemaining = remainingMinor < 0n ? -remainingMinor : remainingMinor

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
    setLines((prev) => [...prev, {
      id: newId(),
      paymentMethodId: cashMethod?.id || paymentMethods[0]?.id || '',
      amount: remainingMinor > 0n ? toAmountInputValue(fromScaledAmount(remainingMinor)) : '',
      paymentDate: getCurrentDate(),
      reference: '',
    }])
  }, [paymentMethods, remainingMinor])

  const removeLine = useCallback((index: number) => {
    setUserHasEdited(true)
    setLines((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== index) : prev))
  }, [])

  const handleSubmit = async () => {
    setError(null)
    if (hasInvalidAmount) {
      setError('Every payment amount must be a number with at most 4 decimal places.')
      return
    }
    const validLines = lines.filter((l) => {
      const units = toScaledAmount(l.amount)
      return l.paymentMethodId && units !== null && units > 0n
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
          amount: l.amount,
          paymentDate: l.paymentDate,
          reference: l.reference || undefined,
        })),
      )
      onClose()
    } catch (err: any) {
      setError(rtkErrorMessage(err, 'Failed to record payments.'))
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
    <TransactionLineDialogShell
      open={open}
      title={`Record ${terms.noun} — ${documentNumber}`}
      onRequestClose={handleRequestClose}
      loading={loading}
      discardOpen={confirmDiscard}
      discardTitle="Discard this payment?"
      onKeepEditing={() => setConfirmDiscard(false)}
      onDiscard={onClose}
      summary={
        <>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>Total</Typography>
            <Typography variant="body2">{formatCurrency(totalAmount)}</Typography>
          </Box>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>Previously {terms.verbPast}</Typography>
            <Typography variant="body2">{formatCurrency(paidAmount)}</Typography>
          </Box>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
            <Typography variant="body2" sx={{ fontWeight: 'bold' }}>Outstanding Balance</Typography>
            <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
              {formatCurrency(fromScaledAmount(outstandingMinor))}
            </Typography>
          </Box>
        </>
      }
      totals={
        <>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
            <Typography variant="body2" sx={{ fontWeight: 'bold' }}>Total {terms.noun}</Typography>
            <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
              {formatCurrency(fromScaledAmount(totalEnteredMinor))}
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>Remaining</Typography>
            <Typography variant="body2" color={remainingMinor < 0n ? 'error.main' : 'text.secondary'}>
              {formatCurrency(fromScaledAmount(absRemaining))}
              {remainingMinor < 0n ? ' (overpayment)' : ''}
            </Typography>
          </Box>
        </>
      }
      alerts={
        <>
          {isOverpaying && (
            <Alert severity="warning" sx={{ mt: 2 }}>
              Total payment exceeds outstanding balance by {formatCurrency(fromScaledAmount(absRemaining))}.
            </Alert>
          )}
          {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
        </>
      }
      actions={
        <>
          <Button onClick={handleRequestClose} disabled={submitting}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleSubmit}
            disabled={submitting || loading || noMethods || hasInvalidAmount || totalEnteredMinor <= 0n}
            startIcon={submitting ? <CircularProgress size={16} /> : undefined}
          >
            {submitting ? 'Recording...' : terms.submitLabel}
          </Button>
        </>
      }
    >
      {noMethods && (
        <Alert severity="error" sx={{ mb: 2 }}>
          No active payment methods are available.
        </Alert>
      )}

      {lines.map((line, index) => (
        <DialogLineRow
          key={line.id}
          trailing={
            <>
              <TextField
                size="small"
                placeholder="Reference"
                value={line.reference}
                onChange={(e) => updateLine(index, 'reference', e.target.value)}
                slotProps={{ htmlInput: { 'aria-label': `Reference, line ${index + 1}` } }}
                sx={{ flex: 1 }}
              />
              <IconButton
                size="small"
                aria-label={`Remove line ${index + 1}`}
                onClick={() => removeLine(index)}
                disabled={lines.length <= 1}
                color="error"
              >
                <DeleteIcon fontSize="small" />
              </IconButton>
            </>
          }
        >
          <FormControl size="small" sx={{ minWidth: 130 }}>
            <Select
              value={line.paymentMethodId}
              onChange={(e) => updateLine(index, 'paymentMethodId', e.target.value)}
              displayEmpty
              inputProps={{ 'aria-label': `${terms.lineNoun} method, line ${index + 1}` }}
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
            slotProps={{
              htmlInput: { min: 0, step: 0.01, 'aria-label': `Amount, line ${index + 1}` },
            }}
            sx={{
              width: 120,
              '& input[type=number]': { MozAppearance: 'textfield' },
              '& input[type=number]::-webkit-outer-spin-button, & input[type=number]::-webkit-inner-spin-button':
                { WebkitAppearance: 'none', margin: 0 },
            }}
          />

          <TransactionDateField
            value={line.paymentDate}
            onChange={(value) => updateLine(index, 'paymentDate', value)}
            label={`${terms.lineNoun} date, line ${index + 1}`}
          />
        </DialogLineRow>
      ))}

      <Button
        startIcon={<AddIcon />}
        size="small"
        onClick={addLine}
        disabled={noMethods}
        sx={{ mt: 0.5, mb: 2 }}
      >
        Add {terms.lineNoun} Line
      </Button>
    </TransactionLineDialogShell>
  )
}
