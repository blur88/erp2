import { FilterSelect } from './FilterSelect'

const PRODUCT_TYPE_OPTIONS = [
  { value: 'goods', label: 'Goods' },
  { value: 'service', label: 'Service' },
]

interface Props {
  field: string
  value: string | null
  onChange: (value: string | null) => void
}

export function FilterProductType({ field, value, onChange }: Props) {
  return (
    <FilterSelect
      field={field}
      label="Product Type"
      value={value}
      options={PRODUCT_TYPE_OPTIONS}
      onChange={onChange}
    />
  )
}
