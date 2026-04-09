import { FilterSelect } from './FilterSelect'

const STATUS_OPTIONS = [
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
]

interface Props {
  field: string
  value: string | null
  onChange: (value: string | null) => void
}

export function FilterStatus({ field, value, onChange }: Props) {
  return (
    <FilterSelect
      field={field}
      label="Status"
      value={value}
      options={STATUS_OPTIONS}
      onChange={onChange}
    />
  )
}
