import { useMemo } from 'react'

import type { Category } from '@/types'
import type { FilterOption } from '@/types/filterBar.types'

import { FilterSelect } from './FilterSelect'

interface Props {
  categories: Category[]
  value: string | null
  onChange: (value: string | null) => void
}

export function FilterCategoryLevel({ categories, value, onChange }: Props) {
  const options = useMemo<FilterOption[]>(() => {
    const levels = [...new Set(categories.map((category) => category.level))].sort((a, b) => a - b)

    return levels.map((level) => ({
      value: String(level),
      label: level === 0 ? 'Root' : `Level ${level}`,
    }))
  }, [categories])

  return (
    <FilterSelect
      field="level"
      label="Level"
      value={value}
      options={options}
      onChange={onChange}
      minWidth={120}
    />
  )
}
