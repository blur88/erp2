import { FilterSelect } from './FilterSelect'

const ROLE_OPTIONS = [
  { value: 'admin', label: 'Admin' },
  { value: 'manager', label: 'Manager' },
  { value: 'sales_staff', label: 'Sales Staff' },
  { value: 'inventory_staff', label: 'Inventory Staff' },
  { value: 'procurement_staff', label: 'Procurement Staff' },
]

interface Props {
  field: string
  value: string | null
  onChange: (value: string | null) => void
}

export function FilterRole({ field, value, onChange }: Props) {
  return (
    <FilterSelect
      field={field}
      label="Role"
      value={value}
      options={ROLE_OPTIONS}
      onChange={onChange}
    />
  )
}
