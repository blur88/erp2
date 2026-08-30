import { useEffect, useMemo, useState } from 'react'
import { DatePicker } from '@mui/x-date-pickers'
import { format, parseISO } from 'date-fns'

import { isValidIsoDate, toMuiDatePickerFormat } from '@/utils/formatters'

interface Props {
  field: string
  label: string
  value: string | null
  /**
   * The date to DISPLAY when `value` is null — the consumer's own fallback,
   * surfaced so the control cannot sit blank while the query quietly uses it.
   *
   * Presentation only. It is never written to the filter state or the URL: the
   * canonical form for "the default" is an absent param, and echoing today into
   * ?asOfDate= would make every page load write a param that means nothing.
   *
   * A consumer whose query has no meaningful "no date" state — Trial Balance,
   * which always reports as of some date — MUST pass one.
   */
  clearTo?: string | null
  onChange: (value: string | null) => void
  /**
   * Called instead of `onChange` when the user clears the field. Lets the
   * consumer return the filter to its default (`handlers.onClearField`) while
   * this component keeps DISPLAYING `clearTo`. Falls back to `onChange(null)`.
   */
  onClear?: () => void
}

/**
 * Guards the intermediate years a 4-digit year entry commits on its way to the
 * real value. Deliberately loose — a typing-transient filter, not business
 * validation. Mirrors TransactionLineDialogShell's guard; see the note below on
 * why isValidIsoDate cannot do this job alone.
 */
const MIN_PLAUSIBLE_YEAR = 1000
const isPlausibleYear = (isoDate: string): boolean =>
  Number(isoDate.slice(0, 4)) >= MIN_PLAUSIBLE_YEAR

/**
 * A single calendar date filter (ISO `YYYY-MM-DD`).
 *
 * The draft is load-bearing, not a convenience. MUI X resets every section
 * whenever a committed candidate is not echoed back into `value`, and
 * mid-typing commits are complete-but-implausible — typing the year "2026"
 * commits 0002-, 0020-, 0202- in turn. Those must never reach the URL: the read
 * path rejects them, the key is dropped, and the field desyncs mid-edit. So the
 * field mirrors every commit verbatim in local state, emits only plausible
 * dates upward, and follows `value` when it changes externally.
 */
export function FilterDate({
  field,
  label,
  value,
  clearTo = null,
  onChange,
  onClear,
}: Props) {
  // A null filter value displays the consumer's fallback rather than blanking:
  // applied state stays null (the canonical bare-URL form) while the control
  // shows the date actually being queried.
  const displayed = value ?? clearTo
  const [draft, setDraft] = useState<string | null>(displayed)

  useEffect(() => {
    setDraft(displayed)
  }, [displayed])

  const storedFormat = useMemo(() => localStorage.getItem('dateFormat') || 'DD/MM/YYYY', [])
  const pickerFormat = useMemo(() => toMuiDatePickerFormat(storedFormat), [storedFormat])

  return (
    <DatePicker
      label={label}
      value={draft ? parseISO(draft) : null}
      format={pickerFormat}
      onChange={(next) => {
        // Null means cleared (Clear button or keyboard deletion). Show the
        // fallback immediately — a URL round trip cannot do it, because when the
        // URL is already bare (the canonical form for the default) clearing the
        // key changes nothing and no re-render follows.
        //
        // The APPLIED value goes to the default via onClear, not to `clearTo`:
        // writing today into ?asOfDate= would turn the canonical bare URL into a
        // permanently-populated one.
        if (next === null) {
          setDraft(clearTo)
          if (onClear) onClear()
          else onChange(null)
          return
        }
        // Invalid Date is a mid-entry transient — the picker owns the pending
        // sections, so hand off entirely.
        if (Number.isNaN(next.getTime())) return
        const iso = format(next, 'yyyy-MM-dd')
        // Echo every candidate into the draft so MUI X does not reset the
        // sections mid-typing, but notify the parent only for a plausible date.
        setDraft(iso)
        if (isValidIsoDate(iso) && isPlausibleYear(iso)) onChange(iso)
      }}
      slotProps={{ textField: { size: 'small', id: `filter-${field}`, sx: { flex: '0 0 170px' } } }}
    />
  )
}
