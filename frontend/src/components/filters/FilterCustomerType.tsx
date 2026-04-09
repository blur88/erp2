import { FilterSelect } from './FilterSelect'

const CUSTOMER_TYPE_OPTIONS = [
  { value: 'individual', label: 'Individual' },
  { value: 'business', label: 'Business' },
]

interface Props {
  field: string
  value: string | null
  onChange: (value: string | null) => void
}

export function FilterCustomerType({ field, value, onChange }: Props) {
  return (
    <FilterSelect
      field={field}
      label="Customer Type"
      value={value}
      options={CUSTOMER_TYPE_OPTIONS}
      onChange={onChange}
    />
  )
}
