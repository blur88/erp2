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

const newId = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2)

export interface RefundSource {
  id: string
  label: string
  paidAmount: number
  alreadyRefunded: number
}

interface RefundLine {
  id: string
  sourceId: string
  amount: number | string
  reference: string
}

interface RefundDialogProps {
  open: boolean
  onClose: () => void
  onSubmit: (lines: { sourceId: string; amount: number; reference?: string }[]) => Promise<void>
  sources: RefundSource[]
  orderNumber: string
  totalAmount: number
  title?: string
}

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat('en-MY', { style: 'currency', currency: 'MYR' }).format(amount)

export default function RefundDialog({
  open,
  onClose,
  onSubmit,
  sources,
  orderNumber,
  totalAmount,
  title,
}: RefundDialogProps) {
  const totalPaid = sources.reduce((sum, s) => sum + s.paidAmount, 0)
  const alreadyRefunded = sources.reduce((sum, s) => sum + s.alreadyRefunded, 0)

  const availableForRefund = Math.max(0, totalPaid - alreadyRefunded)
  const netPaid = totalPaid - alreadyRefunded
  const surplus = Math.max(0, netPaid - Number(totalAmount))
  const hasSurplus = surplus > 0

  // Per-source amount still available to refund (paid minus what was already refunded).
  const sourceAvailable = useCallback(
    (sourceId: string) => {
      const s = sources.find((src) => src.id === sourceId)
      return s ? Math.max(0, s.paidAmount - s.alreadyRefunded) : 0
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
    const positiveSources = sources.filter((s) => s.paidAmount - s.alreadyRefunded > 0)
    if (positiveSources.length > 0) {
      const refundTarget = hasSurplus ? surplus : availableForRefund
      const netTotal = positiveSources.reduce((sum, s) => sum + (s.paidAmount - s.alreadyRefunded), 0)
      setLines(
        positiveSources.map((s) => {
          const net = s.paidAmount - s.alreadyRefunded
          const scaledAmount =
            netTotal > 0 ? Math.round((net / netTotal) * refundTarget * 100) / 100 : 0
          return {
            id: newId(),
            sourceId: s.id,
            amount: scaledAmount > 0 ? scaledAmount : '',
            reference: '',
          }
        }),
      )
    } else {
      // Default a single line for the first source
      setLines([
        {
          id: newId(),
          sourceId: sources[0].id,
          amount: availableForRefund > 0 ? availableForRefund : '',
          reference: '',
        },
      ])
    }
  }, [open, sources, lines.length, availableForRefund, surplus, hasSurplus])

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
    setLines((prev) => [
      ...prev,
      {
        id: newId(),
        sourceId: sources[0]?.id || '',
        amount: remainingAfterRefund > 0 ? remainingAfterRefund : '',
        reference: '',
      },
    ])
  }, [sources, remainingAfterRefund])

  const removeLine = useCallback((index: number) => {
    setUserHasEdited(true)
    setLines((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== index) : prev))
  }, [])

  const handleSubmit = async () => {
    setError(null)
    const validLines = lines.filter((l) => {
      const amt = typeof l.amount === 'number' ? l.amount : parseFloat(l.amount as string)
      return l.sourceId && amt > 0
    })
    if (validLines.length === 0) {
      setError('At least one refund line with a valid amount is required.')
      return
    }
    if (totalEntered > availableForRefund) {
      setError(
        `Total refund (${formatCurrency(totalEntered)}) exceeds available for refund (${formatCurrency(availableForRefund)}).`,
      )
      return
    }
    // Per-source guard: each source can only be refunded up to its own available
    // amount. The aggregate check above can pass while a single source is
    // over-refunded (offset by surplus on another), which the backend rejects.
    const enteredBySource = validLines.reduce<Record<string, number>>((acc, l) => {
      const amt = typeof l.amount === 'number' ? l.amount : parseFloat(l.amount as string)
      acc[l.sourceId] = (acc[l.sourceId] ?? 0) + amt
      return acc
    }, {})
    for (const [sourceId, entered] of Object.entries(enteredBySource)) {
      const available = sourceAvailable(sourceId)
      if (entered > available) {
        const label = sources.find((s) => s.id === sourceId)?.label || 'source'
        setError(
          `Refund for ${label} (${formatCurrency(entered)}) exceeds its available amount (${formatCurrency(available)}).`,
        )
        return
      }
    }
    setSubmitting(true)
    try {
      await onSubmit(
        validLines.map((l) => ({
          sourceId: l.sourceId,
          amount: typeof l.amount === 'number' ? l.amount : parseFloat(l.amount as string),
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

  const findSourceLabel = (sourceId: string) =>
    sources.find((s) => s.id === sourceId)?.label || 'Unknown'

  return (
    <Dialog open={open} onClose={handleRequestClose} maxWidth="sm" fullWidth>
      <DialogTitle>{title || `Refund — ${orderNumber}`}</DialogTitle>
      <DialogContent>
        <>
          {/* Refund Summary */}
          {hasSurplus && (
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1, mt: 1 }}>
              <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
                Surplus over total
              </Typography>
              <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
                {formatCurrency(surplus)}
              </Typography>
            </Box>
          )}
          <Box
            sx={{
              display: 'flex',
              justifyContent: 'space-between',
              mb: 2,
              mt: hasSurplus ? 0 : 1,
            }}
          >
            <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
              Available for Refund
            </Typography>
            <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
              {formatCurrency(availableForRefund)}
            </Typography>
          </Box>

          <Divider sx={{ mb: 2 }} />

          {/* Refund Lines */}
          {lines.map((line, index) => (
            <Box key={line.id} sx={{ display: 'flex', gap: 1, mb: 1.5, alignItems: 'center' }}>
              <FormControl size="small" sx={{ minWidth: 130 }}>
                <Select
                  value={line.sourceId}
                  onChange={(e) => updateLine(index, 'sourceId', e.target.value)}
                  displayEmpty
                  sx={{ fontSize: '0.85rem' }}
                >
                  <MenuItem value="" disabled>
                    Source
                  </MenuItem>
                  {sources
                    // Only offer sources with something left to refund, but always
                    // keep the line's current selection renderable (avoids an
                    // out-of-range Select value).
                    .filter((s) => s.paidAmount - s.alreadyRefunded > 0 || s.id === line.sourceId)
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
                slotProps={{ htmlInput: { min: 0, step: 0.01 } }}
                sx={{
                  width: 120,
                  '& input[type=number]': { MozAppearance: 'textfield' },
                  '& input[type=number]::-webkit-outer-spin-button, & input[type=number]::-webkit-inner-spin-button':
                    {
                      WebkitAppearance: 'none',
                      margin: 0,
                    },
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
            Add Refund Row
          </Button>

          <Divider sx={{ mb: 2 }} />

          {/* Totals */}
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
            <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
              Total Refund
            </Typography>
            <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
              {formatCurrency(totalEntered)}
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
              Remaining After Refund
            </Typography>
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
            <Alert severity="error" sx={{ mt: 2 }}>
              {error}
            </Alert>
          )}
        </>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleRequestClose} disabled={submitting}>
          Cancel
        </Button>
        <Button
          variant="contained"
          color="error"
          onClick={handleSubmit}
          disabled={submitting || totalEntered <= 0 || exceedsAvailable}
          startIcon={submitting ? <CircularProgress size={16} /> : undefined}
        >
          {submitting ? 'Refunding...' : 'Refund'}
        </Button>
      </DialogActions>
      <Dialog open={confirmDiscard} onClose={() => setConfirmDiscard(false)} transitionDuration={0}>
        <DialogTitle>Discard this refund?</DialogTitle>
        <DialogActions>
          <Button onClick={() => setConfirmDiscard(false)}>Keep Editing</Button>
          <Button color="error" onClick={onClose}>
            Discard
          </Button>
        </DialogActions>
      </Dialog>
    </Dialog>
  )
}
