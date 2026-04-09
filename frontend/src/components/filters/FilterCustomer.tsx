import { useGetCustomersQuery } from '@/store/api/salesApi'

import { FilterSelect } from './FilterSelect'

interface Props {
  field: string
  value: string | null
  onChange: (value: string | null) => void
}

export function FilterCustomer({ field, value, onChange }: Props) {
  // isLoading kept intentionally — options will be empty until data arrives (acceptable UX)
  const { data } = useGetCustomersQuery({})
  const options = (data?.data ?? []).map((customer) => ({
    value: customer.id,
    label: customer.name,
  }))

  return (
    <FilterSelect
      field={field}
      label="Customer"
      value={value}
      options={options}
      onChange={onChange}
    />
  )
}
