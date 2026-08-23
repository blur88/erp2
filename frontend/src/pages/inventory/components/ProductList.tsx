import type { ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

import EntityTable, { type ColumnConfig } from '@/components/common/EntityTable'
import { StatusChip } from '@/components/common/StatusChip'
import RowActionMenu from '@/components/common/RowActionMenu'
import { formatCurrency } from '@/utils/currency'
import { withListQuery } from '@/utils/listQuery'
import { formatNumber } from '@/utils/formatters'
import type { Product } from '@/types'

interface ProductListProps {
  products: Product[]
  loading: boolean
  total: number
  onStatusToggle: (product: Product) => void
  getDefaultPrice: (product: Product) => number | null
  paginationSlot?: ReactNode
}

export default function ProductList({
  products,
  loading,
  total,
  onStatusToggle,
  getDefaultPrice,
  paginationSlot,
}: ProductListProps) {
  const navigate = useNavigate()
  // Rendered by the products list page, so location.search IS the list's query.
  const { search } = useLocation()

  const columns: ColumnConfig<Product>[] = [
    { key: 'name', width: '30%', render: (p) => p.name },
    { key: 'category', width: '16%', render: (p) => p.category?.name ?? '—' },
    {
      key: 'baseCost',
      width: '12%',
      // A zero base cost reads as "not costed yet" rather than a real RM 0.00,
      // unlike the selling price below which shows a genuine zero as currency.
      render: (p) => (p.baseCost > 0 ? formatCurrency(p.baseCost) : '—'),
    },
    {
      key: 'price',
      width: '16%',
      render: (p) => {
        const price = getDefaultPrice(p)
        return price != null ? formatCurrency(price) : '—'
      },
    },
    { key: 'stock', width: '12%', render: (p) => formatNumber(p.stockQuantity) },
    {
      key: 'status',
      width: '8%',
      raw: true,
      render: (p) => <StatusChip status={p.isActive ? 'active' : 'inactive'} />,
    },
    {
      key: 'actions',
      width: '6%',
      raw: true,
      render: (p) => (
        <RowActionMenu
          actions={[
            { label: 'View Product', onClick: () => navigate(withListQuery(`/inventory/products/${p.slug}/view`, search)) },
            { label: 'Edit Product', onClick: () => navigate(withListQuery(`/inventory/products/${p.slug}/edit`, search)) },
            p.isActive
              ? { label: 'Set as Inactive', onClick: () => onStatusToggle(p) }
              : { label: 'Reactivate', onClick: () => onStatusToggle(p) },
          ]}
        />
      ),
    },
  ]

  return (
    <EntityTable
      rows={products}
      columns={columns}
      loading={loading}
      total={total}
      label="Products"
      showHeader={false}
      headers={[
        'Name',
        'Category',
        'Base Cost',
        'Default Selling Price',
        'Stock Qty',
        'Active',
        'Actions',
      ]}
      selectedId={undefined}
      focusedIndex={-1}
      onSelect={(p) => navigate(withListQuery(`/inventory/products/${p.slug}/view`, search))}
      listRef={{ current: null }}
      dataAttr="product"
      paginationSlot={paginationSlot}
    />
  )
}
