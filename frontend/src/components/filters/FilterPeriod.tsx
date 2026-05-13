import { useEffect, useId, useMemo, useState } from 'react'
import { Divider, FormControl, InputLabel, MenuItem, Select, Stack } from '@mui/material'
import { DatePicker } from '@mui/x-date-pickers'
import { format, parseISO } from 'date-fns'

import { PERIOD_GROUPS, PERIOD_LABELS, type PeriodKey } from '@/constants/periods'
import { toMuiDatePickerFormat } from '@/utils/formatters'

interface FilterPeriodProps {
  value: PeriodKey | null
  customFrom: string | null
  customTo: string | null
  onChange: (key: PeriodKey | null, from?: string, to?: string) => void
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

  const handleKeyChange = (key: PeriodKey | null) => {
    if (key === null || key !== 'custom') {
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
    <Stack
      direction="row"
      spacing={1}
      useFlexGap
      sx={{
        alignItems: "center",
        flexWrap: "wrap"
      }}>
      <FormControl size="xs" sx={{ minWidth: 150 }}>
        <InputLabel id={labelId} size="xs" shrink={value !== null}>Period</InputLabel>
        <Select
          labelId={labelId}
          id={selectId}
          value={value ?? ''}
          label="Period"
          displayEmpty
          notched={value !== null}
          onChange={(event) => handleKeyChange(event.target.value as PeriodKey)}
        >
          {PERIOD_GROUPS.map((group, groupIndex) => [
            ...group.map((key) => (
              <MenuItem key={key} value={key}>
                {PERIOD_LABELS[key]}
              </MenuItem>
            )),
            groupIndex < PERIOD_GROUPS.length - 1 ? (
              <Divider key={`divider-${groupIndex}`} />
            ) : null,
          ])}
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
            slotProps={{
              textField: {
                size: 'small',
                sx: {
                  // DatePicker ignores custom size variants; force xs dimensions explicitly
                  '& .MuiOutlinedInput-root': { height: 32 },
                  '& .MuiOutlinedInput-input': { paddingTop: '4px', paddingBottom: '4px' },
                  '& .MuiInputLabel-outlined:not(.MuiInputLabel-shrink)': { transform: 'translate(14px, 5px) scale(1)' },
                },
              },
            }}
          />
          <DatePicker
            label="To"
            value={internalTo ? parseISO(internalTo) : null}
            format={pickerFormat}
            onChange={(date) => {
              handleToChange(date ? format(date, 'yyyy-MM-dd') : null)
            }}
            slotProps={{
              textField: {
                size: 'small',
                sx: {
                  // DatePicker ignores custom size variants; force xs dimensions explicitly
                  '& .MuiOutlinedInput-root': { height: 32 },
                  '& .MuiOutlinedInput-input': { paddingTop: '4px', paddingBottom: '4px' },
                  '& .MuiInputLabel-outlined:not(.MuiInputLabel-shrink)': { transform: 'translate(14px, 5px) scale(1)' },
                },
              },
            }}
          />
        </>
      )}
    </Stack>
  );
}
