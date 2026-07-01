import { FilterSelect } from './FilterSelect'

const STOCK_ADJUSTMENT_STATUS_OPTIONS = [
  { value: 'draft', label: 'Draft' },
  { value: 'completed', label: 'Completed' },
]

interface Props {
  field: string
  value: string | null
  onChange: (value: string | null) => void
}

export function FilterStockAdjustmentStatus({ field, value, onChange }: Props) {
  return (
    <FilterSelect
      field={field}
      label="Status"
      value={value}
      options={STOCK_ADJUSTMENT_STATUS_OPTIONS}
      onChange={onChange}
    />
  )
}
