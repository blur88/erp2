import { FormControlLabel, Switch } from '@mui/material'

interface Props {
  label: string
  value: boolean | null
  onChange: (value: boolean | null) => void
}

export function FilterToggle({ label, value, onChange }: Props) {
  return (
    <FormControlLabel
      control={
        <Switch
          size="small"
          checked={value === true}
          onChange={(event) => onChange(event.target.checked ? true : null)}
        />
      }
      label={label}
    />
  )
}
