import { FilterSelect } from './FilterSelect'

const SUPPLIER_TYPE_OPTIONS = [
  { value: 'local', label: 'Local' },
  { value: 'international', label: 'International' },
]

interface Props {
  field: string
  value: string | null
  onChange: (value: string | null) => void
}

export function FilterSupplierType({ field, value, onChange }: Props) {
  return (
    <FilterSelect
      field={field}
      label="Supplier Type"
      value={value}
      options={SUPPLIER_TYPE_OPTIONS}
      onChange={onChange}
    />
  )
}
