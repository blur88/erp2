import { useId } from 'react'
import { useGetPriceListsQuery } from '@/store/api/priceListApi'

import { FilterSelect } from './FilterSelect'

interface Props {
  value: string | null
  onChange: (value: string | null) => void
}

export function FilterPriceList({ value, onChange }: Props) {
  const uid = useId()
  const { data } = useGetPriceListsQuery({ page: 1, limit: 200, isActive: true })
  const options = (data?.data ?? []).map((pl) => ({
    value: pl.id,
    label: pl.name,
  }))

  return (
    <FilterSelect
      field={uid}
      label="Price List"
      type="select"
      value={value}
      options={options}
      onChange={onChange as (value: string | null | string[]) => void}
    />
  )
}
