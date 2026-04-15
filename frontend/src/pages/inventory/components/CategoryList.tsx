import React from 'react'

import EntityTable, { type ColumnConfig } from '@/components/common/EntityTable'
import type { Category } from '@/types'

const COLUMNS: ColumnConfig<Category>[] = [
  { key: 'name', render: (category) => category.name },
]

interface CategoryListProps {
  categories: Category[]
  loading: boolean
  selectedCategoryId?: string
  focusedIndex: number
  onSelect: (category: Category) => void
  categoryListRef: React.RefObject<HTMLDivElement | null>
}

const CategoryList: React.FC<CategoryListProps> = ({
  categories,
  loading,
  selectedCategoryId,
  focusedIndex,
  onSelect,
  categoryListRef,
}) => (
  <EntityTable
    rows={categories}
    columns={COLUMNS}
    loading={loading}
    total={categories.length}
    label="Categories"
    selectedId={selectedCategoryId}
    focusedIndex={focusedIndex}
    onSelect={onSelect}
    listRef={categoryListRef}
    dataAttr="category"
  />
)

export default CategoryList
