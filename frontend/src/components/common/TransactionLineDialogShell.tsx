import { useEffect, useId, useMemo, useState, type ReactNode } from 'react'
import { DatePicker } from '@mui/x-date-pickers'
import { format, parseISO } from 'date-fns'
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Divider,
  CircularProgress,
} from '@mui/material'
import { toMuiDatePickerFormat } from '@/utils/formatters'

export interface TransactionLineDialogShellProps {
  open: boolean
  title: string
  onRequestClose: () => void
  loading?: boolean
  summary: ReactNode
  children: ReactNode
  totals: ReactNode
  alerts?: ReactNode
  actions: ReactNode
  discardOpen: boolean
  discardTitle: string
  onKeepEditing: () => void
  onDiscard: () => void
}

/**
 * Shared structure for the Payment and Refund line dialogs (#1006).
 *
 * Owns presentation only — width, header, labelling, divider rhythm, the loading
 * region and the discard confirmation. All form state, validation, summary/totals
 * content and payload construction stay in the consuming dialog, which is why
 * `actions` is a slot: PaymentDialog and RefundDialog style their submit buttons
 * differently on purpose (refund is destructive).
 */
export default function TransactionLineDialogShell({
  open,
  title,
  onRequestClose,
  loading = false,
  summary,
  children,
  totals,
  alerts,
  actions,
  discardOpen,
  discardTitle,
  onKeepEditing,
  onDiscard,
}: TransactionLineDialogShellProps) {
  // Generated internally so callers cannot introduce duplicate or mismatched IDs.
  const titleId = useId()

  return (
    <Dialog
      open={open}
      onClose={onRequestClose}
      maxWidth="md"
      fullWidth
      aria-labelledby={titleId}
    >
      <DialogTitle id={titleId}>{title}</DialogTitle>
      <DialogContent>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
            <CircularProgress size={24} />
          </Box>
        ) : (
          <>
            <Box sx={{ mt: 1 }}>{summary}</Box>
            <Divider sx={{ mb: 2 }} />
            {children}
            <Divider sx={{ mb: 2 }} />
            {totals}
            {alerts}
          </>
        )}
      </DialogContent>
      {/* Actions render even while loading so Cancel stays reachable; each dialog
          disables its own submit button. */}
      <DialogActions>{actions}</DialogActions>
      <Dialog open={discardOpen} onClose={onKeepEditing} transitionDuration={0}>
        <DialogTitle>{discardTitle}</DialogTitle>
        <DialogActions>
          <Button onClick={onKeepEditing}>Keep Editing</Button>
          <Button color="error" onClick={onDiscard}>
            Discard
          </Button>
        </DialogActions>
      </Dialog>
    </Dialog>
  )
}

export interface DialogLineRowProps {
  children: ReactNode
  trailing: ReactNode
}

/**
 * One editable line in a transaction dialog.
 *
 * `trailing` (Reference + Delete) is rendered as a SINGLE flex child so the pair
 * wraps together instead of separating — flex siblings do not wrap as a unit
 * unless grouped. 248px ≈ 200px reference minimum (#999) + ~40px button + 8px gap.
 * Established in PR #1000 for PaymentDialog; shared here so it cannot drift.
 */
export function DialogLineRow({ children, trailing }: DialogLineRowProps) {
  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 1.5, alignItems: 'center' }}>
      {children}
      <Box sx={{ flex: 1, minWidth: 248, display: 'flex', gap: 1, alignItems: 'center' }}>
        {trailing}
      </Box>
    </Box>
  )
}

export interface TransactionDateFieldProps {
  value: string
  onChange: (value: string) => void
  /** Complete accessible name, e.g. "Payment date, line 1". */
  label: string
  /** Upper bound, as a YYYY-MM-DD calendar date. */
  max?: string
}

/**
 * The line date input shared by the Payment and Refund dialogs (#1008, #1103).
 *
 * The field sizes itself intrinsically rather than to a fixed pixel width. The
 * space a formatted date needs is not knowable from here: it depends on the
 * user's stored date format, the theme font, and browser zoom. Two successive
 * fixed widths (140px, then 165px) were each confirmed in a browser to clip the
 * value behind the calendar icon, which is why a pixel width must not come back.
 *
 * MUI X v9 renders the value into `.MuiPickersInputBase-sectionContent` spans,
 * NOT an `<input>` — the pre-#1103 rule targeted `.MuiInputBase-input`, which
 * silently stopped matching. `minWidth` is a floor for the empty state, where
 * there is no value to measure.
 *
 * `flexShrink: 0` is deliberate. Inside DialogLineRow's wrapping flex container
 * the field wraps to the next line instead of compressing — a compressed date
 * field is precisely the bug this fixes.
 *
 * `onChange` hands back the raw YYYY-MM-DD string: the emitted value is read
 * from local calendar fields, so the payload cannot pick up a timezone shift.
 *
 * The field keeps an internal draft mirroring every picker commit. MUI X resets
 * all sections whenever a committed candidate is not echoed back into its
 * controlled `value`, and mid-typing commits are complete-but-implausible
 * (the first year keystroke is e.g. 0002-08-15) that callers must not persist.
 * Echoing into the draft keeps typing stable; when `value` changes externally
 * the draft follows it.
 */
export function TransactionDateField({
  value,
  onChange,
  label,
  max = '2099-12-31',
}: TransactionDateFieldProps) {
  const [draft, setDraft] = useState(value)
  useEffect(() => {
    setDraft(value)
  }, [value])

  const storedFormat = useMemo(() => localStorage.getItem('dateFormat') || 'DD/MM/YYYY', [])
  const pickerFormat = useMemo(() => toMuiDatePickerFormat(storedFormat), [storedFormat])

  return (
    <DatePicker
      label={label}
      value={draft ? parseISO(draft) : null}
      format={pickerFormat}
      maxDate={parseISO(max)}
      onChange={(d) => {
        if (d === null) {
          setDraft('')
          onChange('')
          return
        }
        if (Number.isNaN(d.getTime())) return
        const next = format(d, 'yyyy-MM-dd')
        setDraft(next)
        onChange(next)
      }}
      slotProps={{
        textField: {
          size: 'small',
          sx: {
            flexShrink: 0,
            '& .MuiPickersInputBase-sectionContent': { width: 'max-content' },
            '& .MuiPickersInputBase-root': { minWidth: 150 },
          },
        },
        field: { clearable: true },
      }}
    />
  )
}
