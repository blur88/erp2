import { FormControl, InputLabel, MenuItem, Select, Tooltip } from '@mui/material'
import { useId } from 'react'

import { COMPARE_OPTIONS } from '@/constants/filterOptions'
import type { PeriodValue } from '@/types/filterBar.types'

interface Props {
  value: string | null
  onChange: (value: string | null) => void
  periodValue: PeriodValue | null
}

export function FilterCompare({ value, onChange, periodValue }: Props) {
  const uid = useId()
  const selectId = `${uid}-compare`
  const labelId = `${uid}-compare-label`
  const compareDisabled = periodValue?.key === 'today'

  return (
    <Tooltip
      title={compareDisabled ? 'Comparison is not available for Today' : ''}
      placement="top"
    >
      <span>
        <FormControl size="xs" sx={{ minWidth: 210 }} disabled={compareDisabled}>
          <InputLabel id={labelId} size="xs">Compare</InputLabel>
          <Select
            id={selectId}
            labelId={labelId}
            disabled={compareDisabled}
            value={value ?? ''}
            label="Compare"
            onChange={(event) => onChange((event.target.value || null) as string | null)}
          >
            <MenuItem value="">No Comparison</MenuItem>
            {COMPARE_OPTIONS.map((option) => (
              <MenuItem key={option.value} value={option.value}>
                {option.label}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </span>
    </Tooltip>
  )
}
