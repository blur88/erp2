import { Chip, Stack } from '@mui/material'

import type { ActiveChip } from './filterBar.types'

interface Props<TFilters> {
  chips: ActiveChip<keyof TFilters>[]
  onRemove: (field: keyof TFilters) => void
}

export function ActiveFilterChips<TFilters>({ chips, onRemove }: Props<TFilters>) {
  if (chips.length === 0) return null

  return (
    <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mt: '7px' }}>
      {chips.map((chip) => (
        <Chip
          key={String(chip.field)}
          label={chip.label}
          size="small"
          onDelete={() => onRemove(chip.field)}
        />
      ))}
    </Stack>
  )
}
