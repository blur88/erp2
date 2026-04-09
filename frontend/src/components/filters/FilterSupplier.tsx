import { useGetSuppliersQuery } from '@/store/api/purchasingApi'

import { FilterSelect } from './FilterSelect'

interface Props {
  field: string
  value: string | null
  onChange: (value: string | null) => void
}

export function FilterSupplier({ field, value, onChange }: Props) {
  // isLoading kept intentionally — options will be empty until data arrives (acceptable UX)
  const { data } = useGetSuppliersQuery({})
  const options = (data?.data ?? []).map((supplier) => ({
    value: supplier.id,
    label: supplier.companyName,
  }))

  return (
    <FilterSelect
      field={field}
      label="Supplier"
      value={value}
      options={options}
      onChange={onChange}
    />
  )
}
