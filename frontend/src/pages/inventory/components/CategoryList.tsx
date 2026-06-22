import { useNavigate } from 'react-router-dom'
import { Typography } from '@mui/material'

import EntityTable, { type ColumnConfig } from '@/components/common/EntityTable'
import RowActionMenu from '@/components/common/RowActionMenu'
import { StatusChip } from '@/components/common/StatusChip'
import { useSetCategoryEnabledMutation } from '@/store/api/inventoryApi'
import type { Category } from '@/types'

interface CategoryListProps {
  categories: Category[]
  sortBy: string
  sortOrder: 'asc' | 'desc'
  onSort: (field: string) => void
}

function flattenTree(cats: Category[], sortBy: string, order: 'asc' | 'desc'): Category[] {
  const byParent = new Map<string | null, Category[]>()
  for (const c of cats) {
    const key = c.parentId ?? null
    if (!byParent.has(key)) byParent.set(key, [])
    byParent.get(key)!.push(c)
  }
  const cmp = (a: Category, b: Category) => {
    const v = sortBy === 'productCount'
      ? (a.productCount ?? 0) - (b.productCount ?? 0)
      : a.name.localeCompare(b.name)
    return order === 'asc' ? v : -v
  }
  const out: Category[] = []
  const walk = (parentId: string | null) => {
    const kids = (byParent.get(parentId) ?? []).slice().sort(cmp)
    for (const k of kids) { out.push(k); walk(k.id) }
  }
  walk(null)
  return out
}

export default function CategoryList({ categories, sortBy, sortOrder }: CategoryListProps) {
  const navigate = useNavigate()
  const [setCategoryEnabled] = useSetCategoryEnabledMutation()
  const flat = flattenTree(categories, sortBy, sortOrder)

  const columns: ColumnConfig<Category>[] = [
    {
      key: 'name',
      raw: true,
      render: (c) => (
        <Typography
          variant="body2"
          sx={{
            pl: c.level * 3,
            fontWeight: 400,
            fontSize: '0.8rem',
            lineHeight: 1.2,
            ...(!c.isEnabled && { color: 'text.secondary' }),
          }}
        >
          {c.name}
        </Typography>
      ),
    },
    {
      key: 'productCount',
      width: '20%',
      render: (c) => `${c.productCount ?? 0} items`,
    },
    {
      key: 'status',
      width: '12%',
      raw: true,
      render: (c) => <StatusChip status={c.isEnabled ? 'active' : 'inactive'} />,
    },
    {
      key: 'actions',
      width: '10%',
      raw: true,
      render: (c) => (
        <RowActionMenu
          actions={[
            { label: 'View', onClick: () => navigate(`/inventory/categories/${c.slug}/view`) },
            { label: 'Edit', onClick: () => navigate(`/inventory/categories/${c.slug}/edit`) },
            { label: 'Add Subcategory', onClick: () => navigate(`/inventory/categories/create?parentId=${c.id}`) },
            c.isEnabled
              ? { label: 'Set as Inactive', onClick: () => { setCategoryEnabled({ id: c.id, enabled: false }).unwrap() } }
              : { label: 'Reactivate', onClick: () => { setCategoryEnabled({ id: c.id, enabled: true }).unwrap() } },
          ]}
        />
      ),
    },
  ]

  return (
    <EntityTable
      rows={flat}
      columns={columns}
      loading={false}
      total={flat.length}
      label="Categories"
      showHeader={false}
      headers={['Name', 'Product Count', 'Status', 'Actions']}
      selectedId={undefined}
      focusedIndex={-1}
      onSelect={() => {}}
      listRef={{ current: null }}
      dataAttr="category"
    />
  )
}
