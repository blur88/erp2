import { FilterSelect } from './FilterSelect'

const USER_STATUS_OPTIONS = [
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
  { value: 'suspended', label: 'Suspended' },
]

interface Props {
  field: string
  value: string | null
  onChange: (value: string | null) => void
}

export function FilterUserStatus({ field, value, onChange }: Props) {
  return (
    <FilterSelect
      field={field}
      label="Status"
      value={value}
      options={USER_STATUS_OPTIONS}
      onChange={onChange}
    />
  )
}
