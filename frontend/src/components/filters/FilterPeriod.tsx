import { useEffect, useMemo, useState } from 'react'
import {
  Divider,
  FormControl,
  InputLabel,
  ListSubheader,
  MenuList,
  MenuItem,
  OutlinedInput,
  Popover,
  Select,
  Stack,
} from '@mui/material'
import { DatePicker } from '@mui/x-date-pickers'
import { format, parseISO } from 'date-fns'

import { AppButton } from '@/components/common/AppButton'
import { PERIOD_GROUPS, PERIOD_LABELS, type PeriodKey } from '@/constants/periods'
import { toMuiDatePickerFormat } from '@/utils/formatters'

interface FilterPeriodProps {
  value: PeriodKey | null
  customFrom: string | null
  customTo: string | null
  onChange: (key: PeriodKey | null, from?: string, to?: string) => void
}

function buildTriggerLabel(
  value: PeriodKey | null,
  customFrom: string | null,
  customTo: string | null,
  displayFormat: string,
): string {
  if (value === 'custom' && customFrom && customTo) {
    const from = format(parseISO(customFrom), displayFormat)
    const to = format(parseISO(customTo), displayFormat)
    return `${from} - ${to}`
  }

  if (value && value !== 'custom') {
    return PERIOD_LABELS[value]
  }

  return 'All'
}

function toDisplayFormat(storedFormat: string): string {
  return storedFormat.replace(/DD/g, 'dd').replace(/YYYY/g, 'yyyy')
}

const datePickerSx = {
  '& .MuiPickersOutlinedInput-root': { height: 32, boxSizing: 'border-box' },
  '& .MuiPickersOutlinedInput-input': { paddingTop: '4.5px', paddingBottom: '4.5px' },
  '& .MuiPickersInputBase-sectionsContainer': { paddingTop: '4.5px', paddingBottom: '4.5px' },
  '& .MuiInputAdornment-root': { height: 32, maxHeight: 32 },
  '& .MuiInputAdornment-root .MuiIconButton-root': { padding: '4px' },
  '& .MuiInputLabel-outlined:not(.MuiInputLabel-shrink)': { transform: 'translate(14px, 5px) scale(1)' },
}

export function FilterPeriod({ value, customFrom, customTo, onChange }: FilterPeriodProps) {
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null)
  const [internalFrom, setInternalFrom] = useState<string | null>(customFrom)
  const [internalTo, setInternalTo] = useState<string | null>(customTo)

  // Memoised once — dateFormat only changes via Settings page, which triggers a full re-render
  const storedFormat = useMemo(() => localStorage.getItem('dateFormat') || 'DD/MM/YYYY', [])
  const pickerFormat = useMemo(() => toMuiDatePickerFormat(storedFormat), [storedFormat])
  const displayFormat = useMemo(() => toDisplayFormat(storedFormat), [storedFormat])

  useEffect(() => {
    setInternalFrom(customFrom)
    setInternalTo(customTo)
  }, [customFrom, customTo])

  const open = Boolean(anchorEl)
  const triggerLabel = buildTriggerLabel(value, customFrom, customTo, displayFormat)
  const applyEnabled = Boolean(internalFrom) && Boolean(internalTo) && internalFrom! <= internalTo!

  const handleOpen = (event: React.SyntheticEvent) => {
    setAnchorEl(event.currentTarget as HTMLElement)
  }

  const handleClose = () => {
    setAnchorEl(null)
    setInternalFrom(customFrom)
    setInternalTo(customTo)
  }

  const handleAllClick = () => {
    setInternalFrom(null)
    setInternalTo(null)
    onChange(null)
    setAnchorEl(null)
  }

  const handlePresetClick = (key: PeriodKey) => {
    setInternalFrom(null)
    setInternalTo(null)
    onChange(key)
    setAnchorEl(null)
  }

  const handleApply = () => {
    if (!applyEnabled) return

    onChange('custom', internalFrom!, internalTo!)
    setAnchorEl(null)
  }

  return (
    <>
      <FormControl size="xs" sx={{ minWidth: 160 }}>
        <InputLabel size="xs" shrink>Period</InputLabel>
        <Select
          displayEmpty
          open={false}
          value=""
          input={<OutlinedInput size="xs" label="Period" notched />}
          onOpen={handleOpen}
          renderValue={() => triggerLabel}
          aria-controls={open ? 'period-listbox' : undefined}
        >
          <MenuItem value="" />
        </Select>
      </FormControl>

      <Popover
        open={open}
        anchorEl={anchorEl}
        onClose={handleClose}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
      >
        <MenuList id="period-listbox" disablePadding sx={{ minWidth: 260 }}>
          <MenuItem selected={value === null} onClick={handleAllClick}>
            All
          </MenuItem>
          <Divider />

          {/* 'custom' is always the last item in the last PERIOD_GROUPS group — rendered below as a subheader + pickers */}
          {PERIOD_GROUPS.flatMap((group, groupIndex) => [
            ...group.filter((key) => key !== 'custom').map((key) => (
              <MenuItem
                key={key}
                selected={value === key}
                onClick={() => handlePresetClick(key)}
              >
                {PERIOD_LABELS[key]}
              </MenuItem>
            )),
            groupIndex < PERIOD_GROUPS.length - 1 ? <Divider key={`divider-${groupIndex}`} /> : null,
          ])}

          <ListSubheader sx={{ lineHeight: '32px' }}>Custom Range</ListSubheader>

          <MenuItem disableRipple disableTouchRipple sx={{ cursor: 'default', '&:hover': { bgcolor: 'transparent' } }}>
            <Stack spacing={1.5} sx={{ width: '100%' }}>
              <DatePicker
                label="From"
                value={internalFrom ? parseISO(internalFrom) : null}
                format={pickerFormat}
                onChange={(date) => setInternalFrom(date ? format(date, 'yyyy-MM-dd') : null)}
                slotProps={{ textField: { size: 'small', sx: datePickerSx } }}
              />
              <DatePicker
                label="To"
                value={internalTo ? parseISO(internalTo) : null}
                format={pickerFormat}
                onChange={(date) => setInternalTo(date ? format(date, 'yyyy-MM-dd') : null)}
                slotProps={{ textField: { size: 'small', sx: datePickerSx } }}
              />
              <AppButton
                size="filter"
                variant="primary"
                disabled={!applyEnabled}
                onClick={handleApply}
                sx={{ alignSelf: 'flex-end' }}
              >
                Apply
              </AppButton>
            </Stack>
          </MenuItem>
        </MenuList>
      </Popover>
    </>
  )
}
