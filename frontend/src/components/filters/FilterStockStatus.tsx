import { useId } from 'react'

import { FilterSelect } from './FilterSelect'

const STOCK_STATUS_OPTIONS = [
  { value: 'low_stock', label: 'Low Stock' },
  { value: 'out_of_stock', label: 'Out of Stock' },
]

interface Props {
  value: string | null
  onChange: (value: string | null) => void
}

export function FilterStockStatus({ value, onChange }: Props) {
  const uid = useId()

  return (
    <FilterSelect
      field={uid}
      label="Stock Status"
      type="select"
      value={value}
      options={STOCK_STATUS_OPTIONS}
      onChange={onChange as (value: string | null | string[]) => void}
    />
  )
}
