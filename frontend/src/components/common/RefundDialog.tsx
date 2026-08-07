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
  allocateByLargestRemainder,
} from '@/utils/currency'
import TransactionLineDialogShell, { DialogLineRow } from './TransactionLineDialogShell'

const newId = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2)

export interface RefundSource {
  id: string
  label: string
  paidAmount: string
  alreadyRefunded: string
}

interface RefundLine {
  id: string
  sourceId: string
  amount: string
  reference: string
  date: string
}

interface RefundDialogProps {
  open: boolean
  onClose: () => void
  onSubmit: (lines: { sourceId: string; amount: string; reference?: string; date?: string }[]) => Promise<void>
  sources: RefundSource[]
  orderNumber: string
  totalAmount: string
  title?: string
  showDateField?: boolean
  /** Optional: no consumer needs it today (sources come from the already-loaded
   *  parent entity), but the shared spinner presentation is ready if refund
   *  sources ever become async. */
  loading?: boolean
}

export default function RefundDialog({
  open,
  onClose,
  onSubmit,
  sources,
  orderNumber,
  totalAmount,
  title,
  showDateField,
  loading = false,
}: RefundDialogProps) {
  const totalPaidMinor = sumScaledAmounts(sources.map((s) => s.paidAmount)) ?? 0n
  const alreadyRefundedMinor = sumScaledAmounts(sources.map((s) => s.alreadyRefunded)) ?? 0n

  const netPaidMinor = totalPaidMinor - alreadyRefundedMinor
  const availableMinor = netPaidMinor > 0n ? netPaidMinor : 0n
  const surplusMinor = netPaidMinor - (toScaledAmount(totalAmount) ?? 0n)
  const hasSurplus = surplusMinor > 0n

  // Per-source amount still available to refund (paid minus what was already refunded).
  const sourceAvailableMinor = useCallback(
    (sourceId: string): bigint => {
      const source = sources.find((s) => s.id === sourceId)
      if (!source) return 0n
      const available =
        (toScaledAmount(source.paidAmount) ?? 0n) - (toScaledAmount(source.alreadyRefunded) ?? 0n)
      return available > 0n ? available : 0n
    },
    [sources],
  )

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
    if (!open || lines.length > 0) return
    if (sources.length === 0) return
    // Default one line per source with availableForRefund > 0
    const positiveSources = sources.filter((s) => sourceAvailableMinor(s.id) > 0n)
    if (positiveSources.length > 0) {
      const refundTargetMinor = hasSurplus ? surplusMinor : availableMinor
      // Largest-remainder so the seeded lines sum to exactly the target: half-up
      // per line would overshoot a surplus (three equal sources sharing 50.0000
      // seed 16.6667 each = 50.0001) and silently pre-fill an over-refund.
      const allocations = allocateByLargestRemainder(
        positiveSources.map((s) => sourceAvailableMinor(s.id)),
        refundTargetMinor,
      )
      setLines(
        positiveSources.map((s, index) => {
          const scaledMinor = allocations[index]
          const defaultDate = showDateField ? getCurrentDate() : ''
          return {
            id: newId(),
            sourceId: s.id,
            amount: scaledMinor > 0n ? toAmountInputValue(fromScaledAmount(scaledMinor)) : '',
            reference: '',
            date: defaultDate,
          }
        }),
      )
    } else {
      const defaultDate = showDateField ? getCurrentDate() : ''
      // Default a single line for the first source
      setLines([
        {
          id: newId(),
          sourceId: sources[0].id,
          amount: availableMinor > 0n ? toAmountInputValue(fromScaledAmount(availableMinor)) : '',
          reference: '',
          date: defaultDate,
        },
      ])
    }
  }, [open, sources, lines.length, availableMinor, surplusMinor, hasSurplus])

  const enteredMinor = sumScaledAmounts(lines.map((l) => l.amount))
  const hasInvalidAmount = enteredMinor === null
  const totalEnteredMinor = enteredMinor ?? 0n
  const remainingAfterRefundMinor = availableMinor - totalEnteredMinor
  const exceedsAvailable = totalEnteredMinor > availableMinor

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
    const defaultDate = showDateField ? getCurrentDate() : ''
    setLines((prev) => [
      ...prev,
      {
        id: newId(),
        sourceId: sources[0]?.id || '',
        amount: remainingAfterRefundMinor > 0n ? toAmountInputValue(fromScaledAmount(remainingAfterRefundMinor)) : '',
        reference: '',
        date: defaultDate,
      },
    ])
  }, [sources, remainingAfterRefundMinor, showDateField])

  const removeLine = useCallback((index: number) => {
    setUserHasEdited(true)
    setLines((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== index) : prev))
  }, [])

  const handleSubmit = async () => {
    setError(null)
    if (hasInvalidAmount) {
      setError('Every refund amount must be a number with at most 4 decimal places.')
      return
    }
    const validLines = lines.filter((l) => {
      const units = toScaledAmount(l.amount)
      return l.sourceId && units !== null && units > 0n
    })
    if (validLines.length === 0) {
      setError('At least one refund line with a valid amount is required.')
      return
    }
    if (showDateField && validLines.some((l) => !l.date)) {
      setError('Refund date is required on every line.')
      return
    }
    if (totalEnteredMinor > availableMinor) {
      setError(
        `Total refund (${formatCurrency(fromScaledAmount(totalEnteredMinor))}) exceeds available for refund (${formatCurrency(fromScaledAmount(availableMinor))}).`,
      )
      return
    }
    // Per-source guard: each source can only be refunded up to its own available
    // amount. The aggregate check above can pass while a single source is
    // over-refunded (offset by surplus on another), which the backend rejects.
    const enteredBySource = validLines.reduce<Record<string, bigint>>((acc, l) => {
      acc[l.sourceId] = (acc[l.sourceId] ?? 0n) + (toScaledAmount(l.amount) ?? 0n)
      return acc
    }, {})
    for (const [sourceId, entered] of Object.entries(enteredBySource)) {
      const available = sourceAvailableMinor(sourceId)
      if (entered > available) {
        const label = sources.find((s) => s.id === sourceId)?.label || 'source'
        setError(
          `Refund for ${label} (${formatCurrency(fromScaledAmount(entered))}) exceeds its available amount (${formatCurrency(fromScaledAmount(available))}).`,
        )
        return
      }
    }
    setSubmitting(true)
    try {
      await onSubmit(
        validLines.map((l) => ({
          sourceId: l.sourceId,
          amount: l.amount,
          reference: l.reference || undefined,
          ...(showDateField && l.date ? { date: l.date } : {}),
        })),
      )
      onClose()
    } catch (err: any) {
      setError(rtkErrorMessage(err, 'Failed to record refund.'))
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
      title={title || `Refund — ${orderNumber}`}
      onRequestClose={handleRequestClose}
      loading={loading}
      discardOpen={confirmDiscard}
      discardTitle="Discard this refund?"
      onKeepEditing={() => setConfirmDiscard(false)}
      onDiscard={onClose}
      summary={
        <>
          {hasSurplus && (
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
              <Typography variant="body2" sx={{ fontWeight: 'bold' }}>Surplus over total</Typography>
              <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
                {formatCurrency(fromScaledAmount(surplusMinor))}
              </Typography>
            </Box>
          )}
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
            <Typography variant="body2" sx={{ fontWeight: 'bold' }}>Available for Refund</Typography>
            <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
              {formatCurrency(fromScaledAmount(availableMinor))}
            </Typography>
          </Box>
        </>
      }
      totals={
        <>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
            <Typography variant="body2" sx={{ fontWeight: 'bold' }}>Total Refund</Typography>
            <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
              {formatCurrency(fromScaledAmount(totalEnteredMinor))}
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>Remaining After Refund</Typography>
            <Typography variant="body2" color={exceedsAvailable ? 'error.main' : 'text.secondary'}>
              {exceedsAvailable
                ? `${formatCurrency(fromScaledAmount(remainingAfterRefundMinor < 0n ? -remainingAfterRefundMinor : remainingAfterRefundMinor))} (exceeds available)`
                : formatCurrency(fromScaledAmount(remainingAfterRefundMinor))}
            </Typography>
          </Box>
        </>
      }
      alerts={
        <>
          {exceedsAvailable && (
            <Alert severity="error" sx={{ mt: 2 }}>
              Total refund exceeds available for refund by {formatCurrency(fromScaledAmount(remainingAfterRefundMinor < 0n ? -remainingAfterRefundMinor : remainingAfterRefundMinor))}.
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
            color="error"
            onClick={handleSubmit}
            disabled={submitting || loading || hasInvalidAmount || totalEnteredMinor <= 0n || exceedsAvailable}
            startIcon={submitting ? <CircularProgress size={16} /> : undefined}
          >
            {submitting ? 'Refunding...' : 'Refund'}
          </Button>
        </>
      }
    >
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
              value={line.sourceId}
              onChange={(e) => updateLine(index, 'sourceId', e.target.value)}
              displayEmpty
              inputProps={{ 'aria-label': `Refund source, line ${index + 1}` }}
              sx={{ fontSize: '0.85rem' }}
            >
              <MenuItem value="" disabled>Source</MenuItem>
              {sources
                // Only offer sources with something left to refund, but always keep
                // the line's current selection renderable (avoids an out-of-range value).
                .filter((s) => sourceAvailableMinor(s.id) > 0n || s.id === line.sourceId)
                .map((s) => (
                  <MenuItem key={s.id} value={s.id} sx={{ fontSize: '0.85rem' }}>
                    {s.label}
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

          {showDateField && (
            <TextField
              size="small"
              type="date"
              value={line.date}
              onChange={(e) => updateLine(index, 'date', e.target.value)}
              sx={{ width: 140 }}
              slotProps={{
                htmlInput: { max: '2099-12-31', 'aria-label': `Refund date, line ${index + 1}` },
              }}
            />
          )}
        </DialogLineRow>
      ))}

      <Button startIcon={<AddIcon />} size="small" onClick={addLine} sx={{ mt: 0.5, mb: 2 }}>
        Add Refund Row
      </Button>
    </TransactionLineDialogShell>
  )
}
