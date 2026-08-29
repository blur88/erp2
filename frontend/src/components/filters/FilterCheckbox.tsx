import { Checkbox, FormControlLabel } from '@mui/material'

interface Props {
  field: string
  label: string
  value: boolean
  onChange: (value: boolean) => void
}

/** A boolean filter rendered as a checkbox in the filter bar. */
export function FilterCheckbox({ field, label, value, onChange }: Props) {
  return (
    <FormControlLabel
      control={
        <Checkbox
          size="small"
          id={`filter-${field}`}
          checked={value}
          onChange={(event) => onChange(event.target.checked)}
        />
      }
      label={label}
      slotProps={{ typography: { variant: 'body2' } }}
    />
  )
}
