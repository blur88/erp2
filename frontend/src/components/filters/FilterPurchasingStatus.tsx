import { FilterSelect } from './FilterSelect'

const PURCHASING_STATUS_OPTIONS = [
  { value: 'draft', label: 'Draft' },
  { value: 'received', label: 'Received' },
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
