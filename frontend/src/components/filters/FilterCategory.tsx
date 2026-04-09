import { useGetCategoriesQuery } from '@/store/api/inventoryApi'

import { FilterSelect } from './FilterSelect'

interface Props {
  field: string
  value: string | null
  onChange: (value: string | null) => void
}

export function FilterCategory({ field, value, onChange }: Props) {
  const { data } = useGetCategoriesQuery({})
  const options = [...(data ?? [])]
    .sort((left, right) => left.name.localeCompare(right.name))
    .map((category) => ({ value: category.id, label: category.name }))

  return (
    <FilterSelect
      field={field}
      label="Category"
      value={value}
      options={options}
      onChange={onChange}
    />
  )
}
