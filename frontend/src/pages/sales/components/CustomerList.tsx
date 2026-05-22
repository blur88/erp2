import React from 'react'
import { useNavigate } from 'react-router-dom'

import EntityTable, { type ColumnConfig } from '@/components/common/EntityTable'
import RowActionMenu from '@/components/common/RowActionMenu'
import type { Customer } from '@/types'

interface CustomerListProps {
  customers: Customer[]
  loading: boolean
  total: number
  onStatusToggle: (customer: Customer) => void
}

export default function CustomerList({
  customers,
  loading,
  total,
  onStatusToggle,
}: CustomerListProps) {
  const navigate = useNavigate()

  const columns: ColumnConfig<Customer>[] = [
    { key: 'name', render: (customer) => customer.name },
    {
      key: 'actions',
      width: 48,
      raw: true,
      render: (customer) => (
        <RowActionMenu
          actions={[
            {
              label: 'Edit Customer',
              onClick: () => navigate(`/sales/customers/${customer.slug}/edit`),
            },
            customer.isActive
              ? {
                  label: 'Set as Inactive',
                  onClick: () => onStatusToggle(customer),
                }
              : {
                  label: 'Reactivate',
                  onClick: () => onStatusToggle(customer),
                },
          ]}
        />
      ),
    },
  ]

  return (
    <EntityTable
      rows={customers}
      columns={columns}
      loading={loading}
      total={total}
      label="Customers"
      selectedId={undefined}
      focusedIndex={-1}
      onSelect={() => {}}
      listRef={{ current: null }}
      dataAttr="customer"
    />
  )
}
