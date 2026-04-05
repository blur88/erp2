import { useId } from 'react'
import { FilterSelect } from './FilterSelect'

const ORDER_STATUS_OPTIONS = [
  { value: 'unfulfilled', label: 'Unfulfilled' },
  { value: 'fulfilled', label: 'Fulfilled' },
]

interface Props {
  value: string | null
  onChange: (value: string | null) => void
}

export function FilterOrderStatus({ value, onChange }: Props) {
  const uid = useId()
  return (
    <FilterSelect
      field={uid}
      label="Order Status"
      type="select"
      value={value}
      options={ORDER_STATUS_OPTIONS}
      onChange={onChange as (value: string | null | string[]) => void}
    />
  )
}
