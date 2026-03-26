import { Stack, TextField } from '@mui/material'

import type { DateRangeValue } from './filterBar.types'

interface Props {
  label: string
  value: DateRangeValue
  onChange: (value: DateRangeValue) => void
}

export function FilterDateRange({ label, value, onChange }: Props) {
  return (
    <Stack direction="row" spacing={1} alignItems="center">
      <TextField
        size="small"
        label={`${label} from`}
        type="date"
        value={value.from ?? ''}
        onChange={(event) => onChange({ ...value, from: event.target.value || null })}
        slotProps={{ inputLabel: { shrink: true } }}
        sx={{ minWidth: 150 }}
      />
      <TextField
        size="small"
        label={`${label} to`}
        type="date"
        value={value.to ?? ''}
        onChange={(event) => onChange({ ...value, to: event.target.value || null })}
        slotProps={{ inputLabel: { shrink: true } }}
        sx={{ minWidth: 150 }}
      />
    </Stack>
  )
}
