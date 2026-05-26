import { FilterSelect } from './FilterSelect'

const ORDER_STATUS_OPTIONS = [
  { value: 'DRAFT', label: 'Draft' },
  { value: 'FULFILLED', label: 'Fulfill' },
  { value: 'CANCELLED', label: 'Cancelled' },
]

const LEGACY_FULFILLMENT_STATUS_OPTIONS = [
  { value: 'unfulfilled', label: 'Unfulfilled' },
  { value: 'fulfilled', label: 'Fulfilled' },
]

interface Props {
  field: string
  value: string | null
  onChange: (value: string | null) => void
}

export function FilterOrderStatus({ field, value, onChange }: Props) {
  const options = field === 'status' ? ORDER_STATUS_OPTIONS : LEGACY_FULFILLMENT_STATUS_OPTIONS

  return (
    <FilterSelect
      field={field}
      label="Order Status"
      value={value}
      options={options}
      onChange={onChange}
    />
  )
}
