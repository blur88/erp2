import { FilterSelect } from './FilterSelect'

const STOCK_STATUS_OPTIONS = [
  { value: 'low_stock', label: 'Low Stock' },
  { value: 'out_of_stock', label: 'Out of Stock' },
]

interface Props {
  field: string
  value: string | null
  onChange: (value: string | null) => void
}

export function FilterStockStatus({ field, value, onChange }: Props) {
  return (
    <FilterSelect
      field={field}
      label="Stock Status"
      value={value}
      options={STOCK_STATUS_OPTIONS}
      onChange={onChange}
    />
  )
}
