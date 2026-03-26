import { Stack, TextField } from '@mui/material'

import type { NumberRangeValue } from './filterBar.types'

interface Props {
  label: string
  value: NumberRangeValue
  onChange: (value: NumberRangeValue) => void
}

export function FilterNumberRange({ label, value, onChange }: Props) {
  return (
    <Stack direction="row" spacing={1} alignItems="center">
      <TextField
        size="small"
        label={`${label} min`}
        type="number"
        value={value.min ?? ''}
        onChange={(event) => onChange({ ...value, min: event.target.value === '' ? null : Number(event.target.value) })}
        sx={{ minWidth: 120 }}
      />
      <TextField
        size="small"
        label={`${label} max`}
        type="number"
        value={value.max ?? ''}
        onChange={(event) => onChange({ ...value, max: event.target.value === '' ? null : Number(event.target.value) })}
        sx={{ minWidth: 120 }}
      />
    </Stack>
  )
}
