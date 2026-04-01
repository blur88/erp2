import {
  Checkbox,
  FormControl,
  InputLabel,
  ListItemText,
  MenuItem,
  OutlinedInput,
  Select,
} from '@mui/material'

import type { FilterOption } from '@/types/filterBar.types'

interface Props {
  field: string
  label: string
  type: 'select' | 'multi-select'
  value: string | null | string[]
  options: FilterOption[]
  onChange: (value: string | null | string[]) => void
}

export function FilterSelect({ field, label, type, value, options, onChange }: Props) {
  const labelId = `filter-${field}-label`

  if (type === 'multi-select') {
    const selected = (value as string[]) ?? []
    return (
      <FormControl size="small" sx={{ minWidth: 140 }}>
        <InputLabel id={labelId}>{label}</InputLabel>
        <Select
          labelId={labelId}
          multiple
          value={selected}
          input={<OutlinedInput label={label} />}
          renderValue={(selectedValues) => `${label}: ${selectedValues.length}`}
          onChange={(event) => onChange(event.target.value as string[])}
        >
          {options.map((option) => (
            <MenuItem key={option.value} value={option.value}>
              <Checkbox checked={selected.includes(option.value)} />
              <ListItemText primary={option.label} />
            </MenuItem>
          ))}
        </Select>
      </FormControl>
    )
  }

  return (
    <FormControl size="small" sx={{ minWidth: 140 }}>
      <InputLabel id={labelId}>{label}</InputLabel>
      <Select
        labelId={labelId}
        value={value ?? ''}
        label={label}
        onChange={(event) => onChange(event.target.value === '' ? null : event.target.value)}
      >
        <MenuItem value="">
          <em>All</em>
        </MenuItem>
        {options.map((option) => (
          <MenuItem key={option.value} value={option.value}>
            {option.label}
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  )
}
