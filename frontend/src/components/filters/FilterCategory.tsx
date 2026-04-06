import { useId } from 'react'

import { useGetCategoriesQuery } from '@/store/api/inventoryApi'

import { FilterSelect } from './FilterSelect'

interface Props {
  value: string | null
  onChange: (value: string | null) => void
}

export function FilterCategory({ value, onChange }: Props) {
  const uid = useId()
  const { data } = useGetCategoriesQuery({})
  const options = [...(data ?? [])]
    .sort((left, right) => left.name.localeCompare(right.name))
    .map((category) => ({ value: category.id, label: category.name }))

  return (
    <FilterSelect
      field={uid}
      label="Category"
      type="select"
      value={value}
      options={options}
      onChange={onChange as (value: string | null | string[]) => void}
    />
  )
}
