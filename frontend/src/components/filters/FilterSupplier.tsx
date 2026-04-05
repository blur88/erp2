import { useId } from 'react'
import { useGetSuppliersQuery } from '@/store/api/purchasingApi'

import { FilterSelect } from './FilterSelect'

interface Props {
  value: string | null
  onChange: (value: string | null) => void
}

export function FilterSupplier({ value, onChange }: Props) {
  const uid = useId()
  // isLoading kept intentionally — options will be empty until data arrives (acceptable UX)
  const { data } = useGetSuppliersQuery({ limit: 999999 })
  const options = (data?.data ?? []).map((supplier) => ({
    value: supplier.id,
    label: supplier.companyName,
  }))

  return (
    <FilterSelect
      field={uid}
      label="Supplier"
      type="select"
      value={value}
      options={options}
      onChange={onChange as (value: string | null | string[]) => void}
    />
  )
}
