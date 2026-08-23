import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Box, Typography } from '@mui/material'

import ConfirmationDialog from '@/components/common/ConfirmationDialog'
import EntityTable, { type ColumnConfig } from '@/components/common/EntityTable'
import { TABLE_STYLES } from '@/constants/tableStyles'
import RowActionMenu from '@/components/common/RowActionMenu'
import { StatusChip } from '@/components/common/StatusChip'
import { useNotification } from '@/hooks/useNotification'
import { useSetCategoryEnabledMutation } from '@/store/api/inventoryApi'
import { withListQuery } from '@/utils/listQuery'
import type { Category } from '@/types'

interface CategoryListProps {
  categories: Category[]
  sortBy: string
  sortOrder: 'asc' | 'desc'
  onSort: (field: string) => void
  flat?: boolean
}

function compareCategories(a: Category, b: Category, sortBy: string, order: 'asc' | 'desc'): number {
  const v = sortBy === 'productCount'
    ? (a.productCount ?? 0) - (b.productCount ?? 0)
    : a.name.localeCompare(b.name)
  return order === 'asc' ? v : -v
}

function flattenTree(cats: Category[], sortBy: string, order: 'asc' | 'desc'): Category[] {
  const byParent = new Map<string | null, Category[]>()
  for (const c of cats) {
    const key = c.parentId ?? null
    if (!byParent.has(key)) byParent.set(key, [])
    byParent.get(key)!.push(c)
  }
  const out: Category[] = []
  const walk = (parentId: string | null) => {
    const kids = (byParent.get(parentId) ?? []).slice().sort((a, b) => compareCategories(a, b, sortBy, order))
    for (const k of kids) { out.push(k); walk(k.id) }
  }
  walk(null)
  return out
}

export default function CategoryList({ categories, sortBy, sortOrder, flat = false }: CategoryListProps) {
  const navigate = useNavigate()
  // Rendered by the categories list page, so location.search IS the list's query.
  const { search } = useLocation()
  const { showSuccess, showError } = useNotification()
  const [setCategoryEnabled, { isLoading: toggling }] = useSetCategoryEnabledMutation()
  const [pendingToggle, setPendingToggle] = useState<Category | null>(null)
  const rows = flat
    ? categories.slice().sort((a, b) => compareCategories(a, b, sortBy, sortOrder))
    : flattenTree(categories, sortBy, sortOrder)

  const confirmToggle = async () => {
    if (!pendingToggle) return
    const target = pendingToggle
    const nextEnabled = !target.isEnabled
    try {
      await setCategoryEnabled({ id: target.id, enabled: nextEnabled }).unwrap()
      showSuccess(nextEnabled ? `${target.name} reactivated` : `${target.name} set as inactive`)
      setPendingToggle(null)
    } catch (e: any) {
      const msg = e?.data?.message
        ?? `Failed to ${nextEnabled ? 'reactivate' : 'deactivate'} ${target.name}`
      showError(msg)
      setPendingToggle(null)
    }
  }

  const columns: ColumnConfig<Category>[] = [
    {
      key: 'name',
      width: '48%',
      raw: true,
      render: (c) => (
        <Typography
          variant="body2"
          sx={{
            pl: flat ? 0 : c.level * 3,
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
      width: '22%',
      render: (c) => `${c.productCount ?? 0} items`,
    },
    {
      key: 'status',
      width: '15%',
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
            { label: 'View', onClick: () => navigate(withListQuery(`/inventory/categories/${c.slug}/view`, search)) },
            { label: 'Edit', onClick: () => navigate(withListQuery(`/inventory/categories/${c.slug}/edit`, search)) },
            { label: 'Add Subcategory', onClick: () => navigate(withListQuery(`/inventory/categories/create?parentId=${c.id}`, search)) },
            c.isEnabled
              ? { label: 'Set as Inactive', onClick: () => setPendingToggle(c) }
              : { label: 'Reactivate', onClick: () => setPendingToggle(c) },
          ]}
        />
      ),
    },
  ]

  return (
    <>
      <EntityTable
        rows={rows}
        columns={columns}
        loading={false}
        total={rows.length}
        label="Categories"
        showHeader={false}
        headers={['Name', 'Product Count', 'Status', 'Actions']}
        selectedId={undefined}
        focusedIndex={-1}
        onSelect={(c) => navigate(withListQuery(`/inventory/categories/${c.slug}/view`, search))}
        listRef={{ current: null }}
        dataAttr="category"
        paginationSlot={<Box sx={{ borderTop: TABLE_STYLES.cell.border }} />}
      />
      <ConfirmationDialog
        open={pendingToggle !== null}
        title={pendingToggle?.isEnabled ? 'Set Category Inactive' : 'Reactivate Category'}
        message={
          pendingToggle?.isEnabled
            ? `Set "${pendingToggle?.name}" as inactive? It can no longer be assigned to new products.`
            : `Reactivate "${pendingToggle?.name}"?`
        }
        confirmText={pendingToggle?.isEnabled ? 'Set Inactive' : 'Reactivate'}
        severity={pendingToggle?.isEnabled ? 'warning' : 'info'}
        loading={toggling}
        onConfirm={confirmToggle}
        onCancel={() => setPendingToggle(null)}
      />
    </>
  )
}
