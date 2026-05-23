import React from 'react'
import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'

import EntityTable, { type ColumnConfig } from '@/components/common/EntityTable'
import { EntityStatusChip } from '@/components/common/EntityStatusChip'
import RowActionMenu from '@/components/common/RowActionMenu'
import type { Customer } from '@/types'
import { formatCustomerType } from '@/utils/customerUtils'

interface CustomerListProps {
  customers: Customer[]
  loading: boolean
  total: number
  onStatusToggle: (customer: Customer) => void
  paginationSlot?: ReactNode
}

export default function CustomerList({
  customers,
  loading,
  total,
  onStatusToggle,
  paginationSlot,
}: CustomerListProps) {
  const navigate = useNavigate()

  const columns: ColumnConfig<Customer>[] = [
    { key: 'name', render: (customer) => customer.name },
    { key: 'phone', width: 150, render: (customer) => customer.phone ?? '—' },
    { key: 'type', width: 110, render: (customer) => formatCustomerType(customer.type) },
    { key: 'priceList', width: 130, render: (customer) => customer.priceList?.name ?? '—' },
    {
      key: 'status',
      width: 100,
      raw: true,
      render: (customer) => (
        <EntityStatusChip status={customer.isActive ? 'active' : 'inactive'} />
      ),
    },
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
              ? { label: 'Set as Inactive', onClick: () => onStatusToggle(customer) }
              : { label: 'Reactivate', onClick: () => onStatusToggle(customer) },
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
      showHeader={false}
      headers={['Name', 'Phone', 'Type', 'Price List', 'Status', '']}
      selectedId={undefined}
      focusedIndex={-1}
      onSelect={() => {}}
      listRef={{ current: null }}
      dataAttr="customer"
      paginationSlot={paginationSlot}
    />
  )
}
