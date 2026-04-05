import { useId } from 'react'
import { useGetCustomersQuery } from '@/store/api/salesApi'

import { FilterSelect } from './FilterSelect'

interface Props {
  value: string | null
  onChange: (value: string | null) => void
}

export function FilterCustomer({ value, onChange }: Props) {
  const uid = useId()
  // isLoading kept intentionally — options will be empty until data arrives (acceptable UX)
  const { data } = useGetCustomersQuery({ limit: 999999 })
  const options = (data?.data ?? []).map((customer) => ({
    value: customer.id,
    label: customer.name,
  }))

  return (
    <FilterSelect
      field={uid}
      label="Customer"
      type="select"
      value={value}
      options={options}
      onChange={onChange as (value: string | null | string[]) => void}
    />
  )
}
