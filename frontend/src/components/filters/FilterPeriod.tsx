import { useEffect, useId, useMemo, useState } from 'react'
import { FormControl, InputLabel, MenuItem, Select, Stack } from '@mui/material'
import { DatePicker } from '@mui/x-date-pickers'
import { format, parseISO } from 'date-fns'

import { PERIOD_KEYS, PERIOD_LABELS, type PeriodKey } from '@/constants/periods'
import { toMuiDatePickerFormat } from '@/utils/formatters'

interface FilterPeriodProps {
  value: PeriodKey
  customFrom: string | null
  customTo: string | null
  onChange: (key: PeriodKey, from?: string, to?: string) => void
}

export function FilterPeriod({ value, customFrom, customTo, onChange }: FilterPeriodProps) {
  const [internalFrom, setInternalFrom] = useState<string | null>(customFrom)
  const [internalTo, setInternalTo] = useState<string | null>(customTo)
  // Memoised once — dateFormat is only updated by the settings page which triggers a full re-render anyway
  const pickerFormat = useMemo(
    () => toMuiDatePickerFormat(localStorage.getItem('dateFormat') || 'DD/MM/YYYY'),
    [],
  )
  const uid = useId()
  const labelId = `${uid}-period-label`
  const selectId = `${uid}-period`

  // Sync internal date state when the parent resets or overrides custom dates externally
  useEffect(() => {
    setInternalFrom(customFrom)
    setInternalTo(customTo)
  }, [customFrom, customTo])

  const handleKeyChange = (key: PeriodKey) => {
    if (key !== 'custom') {
      setInternalFrom(null)
      setInternalTo(null)
      onChange(key)
      return
    }

    onChange('custom')
  }

  const handleFromChange = (newFrom: string | null) => {
    setInternalFrom(newFrom)

    if (newFrom && internalTo && newFrom <= internalTo) {
      onChange('custom', newFrom, internalTo)
    }
  }

  const handleToChange = (newTo: string | null) => {
    setInternalTo(newTo)

    if (internalFrom && newTo && internalFrom <= newTo) {
      onChange('custom', internalFrom, newTo)
    }
  }

  return (
    <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
      <FormControl size="small" sx={{ minWidth: 150 }}>
        <InputLabel id={labelId}>Period</InputLabel>
        <Select
          labelId={labelId}
          id={selectId}
          value={value}
          label="Period"
          onChange={(event) => handleKeyChange(event.target.value as PeriodKey)}
        >
          {PERIOD_KEYS.map((key) => (
            <MenuItem key={key} value={key}>
              {PERIOD_LABELS[key]}
            </MenuItem>
          ))}
        </Select>
      </FormControl>

      {value === 'custom' && (
        <>
          <DatePicker
            label="From"
            value={internalFrom ? parseISO(internalFrom) : null}
            format={pickerFormat}
            onChange={(date) => {
              handleFromChange(date ? format(date, 'yyyy-MM-dd') : null)
            }}
            slotProps={{ textField: { size: 'small' } }}
          />
          <DatePicker
            label="To"
            value={internalTo ? parseISO(internalTo) : null}
            format={pickerFormat}
            onChange={(date) => {
              handleToChange(date ? format(date, 'yyyy-MM-dd') : null)
            }}
            slotProps={{ textField: { size: 'small' } }}
          />
        </>
      )}
    </Stack>
  )
}
