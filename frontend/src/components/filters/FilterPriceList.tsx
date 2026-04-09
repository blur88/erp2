import { useGetPriceListsQuery } from '@/store/api/priceListApi'

import { FilterSelect } from './FilterSelect'

interface Props {
  field: string
  value: string | null
  onChange: (value: string | null) => void
}

export function FilterPriceList({ field, value, onChange }: Props) {
  const { data } = useGetPriceListsQuery({ page: 1, limit: 200, isActive: true })
  const options = (data?.data ?? []).map((pl) => ({
    value: pl.id,
    label: pl.name,
  }))

  return (
    <FilterSelect
      field={field}
      label="Price List"
      value={value}
      options={options}
      onChange={onChange}
    />
  )
}
