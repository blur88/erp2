import { FilterSelect } from './FilterSelect'

const ORDER_STATUS_OPTIONS = [
  { value: 'unfulfilled', label: 'Unfulfilled' },
  { value: 'fulfilled', label: 'Fulfilled' },
]

interface Props {
  field: string
  value: string | null
  onChange: (value: string | null) => void
}

export function FilterOrderStatus({ field, value, onChange }: Props) {
  return (
    <FilterSelect
      field={field}
      label="Order Status"
      value={value}
      options={ORDER_STATUS_OPTIONS}
      onChange={onChange}
    />
  )
}
