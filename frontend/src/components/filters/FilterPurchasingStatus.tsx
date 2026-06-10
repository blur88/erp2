import { FilterSelect } from './FilterSelect'

const PURCHASING_STATUS_OPTIONS = [
  { value: 'DRAFT', label: 'Draft' },
  { value: 'READY', label: 'Ready' },
  { value: 'RECEIVED', label: 'Received' },
  { value: 'CANCELLED', label: 'Cancelled' },
]

interface Props {
  field: string
  value: string | null
  onChange: (value: string | null) => void
}

export function FilterPurchasingStatus({ field, value, onChange }: Props) {
  return (
    <FilterSelect
      field={field}
      label="Order Status"
      value={value}
      options={PURCHASING_STATUS_OPTIONS}
      onChange={onChange}
    />
  )
}
