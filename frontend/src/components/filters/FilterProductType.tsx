import { useId } from 'react'

import { FilterSelect } from './FilterSelect'

const PRODUCT_TYPE_OPTIONS = [
  { value: 'goods', label: 'Goods' },
  { value: 'service', label: 'Service' },
]

interface Props {
  value: string | null
  onChange: (value: string | null) => void
}

export function FilterProductType({ value, onChange }: Props) {
  const uid = useId()

  return (
    <FilterSelect
      field={uid}
      label="Product Type"
      type="select"
      value={value}
      options={PRODUCT_TYPE_OPTIONS}
      onChange={onChange as (value: string | null | string[]) => void}
    />
  )
}
