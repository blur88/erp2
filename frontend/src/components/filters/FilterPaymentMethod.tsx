import { useMemo } from 'react'

import { useGetActivePaymentMethodsQuery } from '@/store/api/paymentMethodsApi'

import { FilterSelect } from './FilterSelect'

interface Props {
  field: string
  value: string | null
  onChange: (value: string | null) => void
}

export function FilterPaymentMethod({ field, value, onChange }: Props) {
  const { data: methods = [] } = useGetActivePaymentMethodsQuery()

  const options = useMemo(
    () => methods.map((method) => ({ value: method.id, label: method.name })),
    [methods],
  )

  return (
    <FilterSelect
      field={field}
      label="Payment Method"
      value={value}
      options={options}
      onChange={onChange}
    />
  )
}
