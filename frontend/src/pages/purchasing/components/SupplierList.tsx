import React from 'react'
import type { ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

import EntityTable, { type ColumnConfig } from '@/components/common/EntityTable'
import { StatusChip } from '@/components/common/StatusChip'
import RowActionMenu from '@/components/common/RowActionMenu'
import type { Supplier } from '@/types'
import { withCurrentListQuery } from '@/utils/listQuery'

function formatSupplierType(type: string): string {
  return type === 'local' ? 'Local' : 'International'
}

interface SupplierListProps {
  suppliers: Supplier[]
  loading: boolean
  total: number
  onStatusToggle: (supplier: Supplier) => void
  paginationSlot?: ReactNode
}

export default function SupplierList({
  suppliers,
  loading,
  total,
  onStatusToggle,
  paginationSlot,
}: SupplierListProps) {
  const navigate = useNavigate()
  // Rendered by the suppliers list page, so location.search IS the list's query.
  const { search } = useLocation()

  const columns: ColumnConfig<Supplier>[] = [
    { key: 'companyName', width: '30%', render: (supplier) => supplier.companyName },
    { key: 'contactPerson', width: '20%', render: (supplier) => supplier.contactPerson ?? '-' },
    { key: 'type', width: '13%', render: (supplier) => formatSupplierType(supplier.type) },
    {
      key: 'status',
      width: '12%',
      raw: true,
      render: (supplier) => (
        <StatusChip status={supplier.isActive ? 'active' : 'inactive'} />
      ),
    },
    {
      key: 'actions',
      width: '6%',
      raw: true,
      render: (supplier) => (
        <RowActionMenu
          actions={[
            {
              label: 'View Supplier',
              onClick: () => navigate(withCurrentListQuery(`/purchasing/suppliers/${supplier.slug}/view`)),
            },
            {
              label: 'Edit Supplier',
              onClick: () => navigate(withCurrentListQuery(`/purchasing/suppliers/${supplier.slug}/edit`)),
            },
            supplier.isActive
              ? { label: 'Set as Inactive', onClick: () => onStatusToggle(supplier) }
              : { label: 'Reactivate', onClick: () => onStatusToggle(supplier) },
          ]}
        />
      ),
    },
  ]

  return (
    <EntityTable
      rows={suppliers}
      columns={columns}
      loading={loading}
      total={total}
      label="Suppliers"
      showHeader={false}
      headers={['Company Name', 'Contact Person', 'Type', 'Status', 'Actions']}
      selectedId={undefined}
      focusedIndex={-1}
      onSelect={(supplier) => navigate(withCurrentListQuery(`/purchasing/suppliers/${supplier.slug}/view`))}
      listRef={{ current: null }}
      dataAttr="supplier"
      paginationSlot={paginationSlot}
    />
  )
}
