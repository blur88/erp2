import { useEffect, useMemo, useState } from 'react'
import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown'
import { Box, Divider, List, ListItemButton, Popover, Stack, Typography } from '@mui/material'
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
    return `Period: ${from} - ${to}`
  }

  if (value && value !== 'custom') {
    return `Period: ${PERIOD_LABELS[value]}`
  }

  return 'Period'
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

  const handleOpen = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget)
  }

  const handleClose = () => {
    setAnchorEl(null)
    setInternalFrom(customFrom)
    setInternalTo(customTo)
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
      <AppButton
        size="filter"
        variant="neutral"
        endIcon={<ArrowDropDownIcon />}
        onClick={handleOpen}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? 'period-listbox' : undefined}
      >
        {triggerLabel}
      </AppButton>

      <Popover
        open={open}
        anchorEl={anchorEl}
        onClose={handleClose}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
      >
        <Box sx={{ minWidth: 260, maxHeight: 480, display: 'flex', flexDirection: 'column' }}>
          <List id="period-listbox" role="listbox" dense disablePadding sx={{ overflowY: 'auto', flexShrink: 1 }}>
            {/* 'custom' is always the last item in the last PERIOD_GROUPS group and renders as a non-interactive heading */}
            {PERIOD_GROUPS.map((group, groupIndex) => [
              ...group.map((key) => {
                if (key === 'custom') {
                  return (
                    <Typography
                      key="custom-heading"
                      variant="caption"
                      sx={{
                        px: 2,
                        pt: 1,
                        pb: 0.5,
                        display: 'block',
                        color: 'text.secondary',
                        fontWeight: 600,
                        textTransform: 'uppercase',
                        letterSpacing: 0.5,
                      }}
                    >
                      Custom Range
                    </Typography>
                  )
                }

                return (
                  <ListItemButton
                    key={key}
                    role="option"
                    aria-selected={value === key}
                    selected={value === key}
                    onClick={() => handlePresetClick(key)}
                    sx={{ py: 0.5, px: 2 }}
                  >
                    <Typography variant="body2">{PERIOD_LABELS[key]}</Typography>
                  </ListItemButton>
                )
              }),
              groupIndex < PERIOD_GROUPS.length - 1 ? <Divider key={`divider-${groupIndex}`} /> : null,
            ])}
          </List>

          <Box sx={{ px: 2, pb: 2, pt: 1, borderTop: 1, borderColor: 'divider' }}>
            <Stack spacing={1.5}>
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
          </Box>
        </Box>
      </Popover>
    </>
  )
}
