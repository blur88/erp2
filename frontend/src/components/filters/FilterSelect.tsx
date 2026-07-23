import {
  FormControl,
  InputLabel,
  MenuItem,
  OutlinedInput,
  Select,
} from '@mui/material'

import type { FilterOption } from '@/types/filterBar.types'

interface Props {
  field: string
  label: string
  value: string | null
  options: ReadonlyArray<Readonly<FilterOption>>
  onChange: (value: string | null) => void
  emptyLabel?: string
  minWidth?: number
}

export function FilterSelect({ field, label, value, options, onChange, emptyLabel, minWidth }: Props) {
  const labelId = `filter-${field}-label`

  return (
    <FormControl size="xs" sx={{ minWidth: minWidth ?? 160 }}>
      <InputLabel id={labelId} size="xs" shrink>{label}</InputLabel>
      <Select
        labelId={labelId}
        value={value ?? ''}
        displayEmpty
        input={<OutlinedInput size="xs" label={label} notched />}
        onChange={(event) => onChange(event.target.value === '' ? null : event.target.value)}
      >
        <MenuItem value="">{emptyLabel ?? 'All'}</MenuItem>
        {options.map((option) => (
          <MenuItem key={option.value} value={option.value}>
            {option.label}
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  )
}
