import { useId } from 'react'

import { FilterSelect } from './FilterSelect'

const PURCHASING_STATUS_OPTIONS = [
  { value: 'pending', label: 'Pending' },
  { value: 'received', label: 'Received' },
]

interface Props {
  value: string | null
  onChange: (value: string | null) => void
}

export function FilterPurchasingStatus({ value, onChange }: Props) {
  const uid = useId()

  return (
    <FilterSelect
      field={uid}
      label="Order Status"
      type="select"
      value={value}
      options={PURCHASING_STATUS_OPTIONS}
      onChange={onChange as (value: string | null | string[]) => void}
    />
  )
}
