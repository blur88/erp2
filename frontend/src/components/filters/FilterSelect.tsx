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
  optionsReady?: boolean
  optionsLoading?: boolean
  showEmptyOption?: boolean
}

export function FilterSelect({
  field,
  label,
  value,
  options,
  onChange,
  emptyLabel,
  minWidth,
  optionsReady = true,
  optionsLoading = false,
  showEmptyOption = true,
}: Props) {
  const labelId = `filter-${field}-label`

  // A value preserved past an unresolved options query (#1017) has no matching
  // MenuItem, and MUI renders blank for an unmatched value. Supply a stand-in so
  // the control does not silently contradict the filtered list beside it.
  //
  // Only while the set is NOT authoritative. Once it is ready, an unmatched value
  // is stale and useFilterBar's effect is about to clear it — rendering a stand-in
  // for it would flash a dead id on the way out.
  const hasUnresolvedValue =
    !optionsReady && value !== null && !options.some((option) => option.value === value)

  // Disabled tracks loading ONLY. Gating on `optionsReady` would also catch the
  // errored case and leave the control permanently dead — the user must stay able
  // to clear a filter whose options failed to load.
  const disabled = optionsLoading

  return (
    <FormControl size="xs" sx={{ minWidth: minWidth ?? 160 }}>
      <InputLabel id={labelId} size="xs" shrink>{label}</InputLabel>
      <Select
        labelId={labelId}
        value={value ?? ''}
        displayEmpty
        disabled={disabled}
        input={<OutlinedInput size="xs" label={label} notched />}
        onChange={(event) => onChange(event.target.value === '' ? null : event.target.value)}
      >
        {/*
          Omitted for a field with no meaningful empty state (Profit & Loss's
          Year): selecting it would store null, and the query would fall back to
          a default the control does not display.
        */}
        {showEmptyOption && <MenuItem value="">{emptyLabel ?? 'All'}</MenuItem>}
        {/*
          Only needed for a non-null unresolved value — with no value the emptyLabel
          above already reads correctly. While loading, the stand-in says so; after a
          failed load (`!optionsReady`, not loading) fall back to the raw id, which is
          at least honest about what is being filtered on.
        */}
        {hasUnresolvedValue && (
          <MenuItem value={value as string}>
            {optionsLoading ? 'Loading…' : value}
          </MenuItem>
        )}
        {options.map((option) => (
          <MenuItem key={option.value} value={option.value}>
            {option.label}
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  )
}
