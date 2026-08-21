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

const newId = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2)

export interface RefundMethodOption {
  id: string
  label: string
}

/** One method's *preferred net capacity* for the auto-fill preset: gross
 *  payments through that method minus prior refunds through it, clamped at zero
 *  by the caller. It shapes the preset only — it is not an enforced cap. A
 *  remainder the capacities cannot absorb spills past one (see the seeding
 *  effect), and manual edits are limited only by the aggregate
 *  `availableForRefund` (#1096, #1107). */
export interface RefundSeed {
  methodId: string
  amount: string
}

interface RefundLine {
  id: string
  paymentMethodId: string
  amount: string
  reference: string
  date: string
}

interface RefundDialogProps {
  open: boolean
  onClose: () => void
  onSubmit: (lines: { paymentMethodId: string; amount: string; reference?: string; date?: string }[]) => Promise<void>
  methods: RefundMethodOption[]
  seedAllocations: RefundSeed[]
  availableForRefund: string
  seedTarget: string
  orderNumber: string
  title?: string
  showDateField?: boolean
  loading?: boolean
}

export default function RefundDialog({
  open,
  onClose,
  onSubmit,
  methods,
  seedAllocations,
  availableForRefund,
  seedTarget,
  orderNumber,
  title,
  showDateField,
  loading = false,
}: RefundDialogProps) {
  const availableMinor0 = toScaledAmount(availableForRefund) ?? 0n
  const availableMinor = availableMinor0 > 0n ? availableMinor0 : 0n

  // seedTarget is the amount the preset sums to: the surplus on an overpaid
  // document, otherwise the full available. Callers compute it because they hold
  // the document total. Clamped defensively — a caller passing more than the cap
  // must not pre-fill an over-refund.
  const seedTargetRaw = toScaledAmount(seedTarget) ?? availableMinor
  const seedTargetMinor =
    seedTargetRaw < 0n ? 0n : seedTargetRaw > availableMinor ? availableMinor : seedTargetRaw
  // The surplus IS the seed target on an overpaid document — callers compute it
  // from the document total, which the dialog no longer receives. Deriving it as
  // (available - target) yields the complement instead: a 300 document paid 400
  // has a 100 surplus, not 300.
  const hasSurplus = seedTargetMinor < availableMinor
  const surplusMinor = seedTargetMinor

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
    // Seeding is one-shot (guarded by lines.length above), so seeding before the
    // payment records arrive locks in a blank line forever. Methods are cached
    // across rows and resolve first, so this is the common path, not a rare race.
    if (loading) return
    if (seedAllocations.length === 0 && methods.length === 0) return

    const defaultDate = showDateField ? getCurrentDate() : ''

    // A method used historically may since have been deactivated or deleted, and
    // the picker only lists active ones. Seeding its id would preselect an
    // out-of-range value and submit an id the backend rejects as inactive, so
    // fold that weight onto the first active method instead.
    const activeIds = new Set(methods.map((m) => m.id))
    const fallbackId = methods[0]?.id ?? ''
    const mergedWeights = new Map<string, bigint>()
    for (const s of seedAllocations) {
      const amount = toScaledAmount(s.amount) ?? 0n
      if (amount <= 0n) continue
      const methodId = activeIds.has(s.methodId) ? s.methodId : fallbackId
      if (!methodId) continue
      mergedWeights.set(methodId, (mergedWeights.get(methodId) ?? 0n) + amount)
    }
    const reconciled = [...mergedWeights].map(([methodId, amount]) => ({ methodId, amount }))

    // Seeds are per-method NET capacity (gross minus prior refunds through that
    // method), so fill them in order rather than splitting the target by gross
    // ratio (#1107). Proportional splitting ignored prior refunds and produced
    // repeating decimals: Cash 100 / Bank 200 with Cash 50 already refunded
    // presented 83.3333 / 166.6667 for a 250 refund instead of 50 / 200.
    // Because both the capacities and the target are whole scale-4 units, taking
    // min(remaining, capacity) can never land between units — there is no
    // sub-unit remainder, hence no largest-remainder tie-break.
    let remaining = seedTargetMinor
    const allocations = reconciled.map(({ amount }) => {
      if (remaining <= 0n) return 0n
      const take = amount < remaining ? amount : remaining
      remaining -= take
      return take
    })

    // Defensive: with complete payment data sum(max(net, 0)) >= aggregate net
    // >= seedTargetMinor, so the capacities cover the target. Incomplete data
    // must still preset the exact requested total, so any shortfall goes to the
    // first active method — merged into its existing line when it has one, to
    // avoid presenting two rows for the same method.
    let spillMinor = remaining > 0n ? remaining : 0n
    if (spillMinor > 0n && fallbackId) {
      const existing = reconciled.findIndex((s) => s.methodId === fallbackId)
      if (existing >= 0) {
        allocations[existing] += spillMinor
        spillMinor = 0n
      }
    }

    const seeded = reconciled
      .map((s, index) => ({ methodId: s.methodId, amount: allocations[index] }))
      .filter((s) => s.amount > 0n)

    if (spillMinor > 0n && fallbackId) {
      seeded.push({ methodId: fallbackId, amount: spillMinor })
    }

    if (seeded.length > 0) {
      setLines(
        seeded.map((s) => ({
          id: newId(),
          paymentMethodId: s.methodId,
          amount: toAmountInputValue(fromScaledAmount(s.amount)),
          reference: '',
          date: defaultDate,
        })),
      )
    } else {
      setLines([{
        id: newId(),
        paymentMethodId: methods[0]?.id ?? '',
        amount: seedTargetMinor > 0n ? toAmountInputValue(fromScaledAmount(seedTargetMinor)) : '',
        reference: '',
        date: defaultDate,
      }])
    }
  }, [open, seedAllocations, methods, lines.length, seedTargetMinor, showDateField, loading])

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
        paymentMethodId: methods[0]?.id || '',
        amount: remainingAfterRefundMinor > 0n ? toAmountInputValue(fromScaledAmount(remainingAfterRefundMinor)) : '',
        reference: '',
        date: defaultDate,
      },
    ])
  }, [methods, remainingAfterRefundMinor, showDateField])

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
      return l.paymentMethodId && units !== null && units > 0n
    })
    if (validLines.length === 0) {
      setError('At least one refund line with a valid amount is required.')
      return
    }
    if (showDateField && validLines.some((l) => !l.date)) {
      setError('Refund date is required on every line.')
      return
    }
    // Guard the id itself, not just the amount: a method deactivated while the
    // dialog is open would otherwise submit an id the backend rejects as
    // inactive, surfacing as an opaque server error.
    const activeMethodIds = new Set(methods.map((m) => m.id))
    if (validLines.some((l) => !activeMethodIds.has(l.paymentMethodId))) {
      setError('Every refund line must use an active payment method.')
      return
    }
    if (totalEnteredMinor > availableMinor) {
      setError(
        `Total refund (${formatCurrency(fromScaledAmount(totalEnteredMinor))}) exceeds available for refund (${formatCurrency(fromScaledAmount(availableMinor))}).`,
      )
      return
    }
    // The aggregate check above is the only monetary validation: refunds may
    // exceed any single method's paid amount as long as the total fits (#1096).
    setSubmitting(true)
    try {
      await onSubmit(
        validLines.map((l) => ({
          paymentMethodId: l.paymentMethodId,
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
              value={line.paymentMethodId}
              onChange={(e) => updateLine(index, 'paymentMethodId', e.target.value)}
              displayEmpty
              inputProps={{ 'aria-label': `Refund method, line ${index + 1}` }}
            >
              <MenuItem value="" disabled>Method</MenuItem>
              {methods.map((m) => (
                <MenuItem key={m.id} value={m.id}>
                  {m.label}
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
            <TransactionDateField
              value={line.date}
              onChange={(value) => updateLine(index, 'date', value)}
              label={`Refund date, line ${index + 1}`}
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
