import React from 'react'
import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'

import EntityTable, { type ColumnConfig } from '@/components/common/EntityTable'
import { StatusChip } from '@/components/common/StatusChip'
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
    { key: 'name', width: '30%', render: (customer) => customer.name },
    { key: 'phone', width: '18%', render: (customer) => customer.phone ?? '—' },
    { key: 'type', width: '13%', render: (customer) => formatCustomerType(customer.type) },
    { key: 'priceList', width: '16%', render: (customer) => customer.priceList?.name ?? '—' },
    {
      key: 'status',
      width: '12%',
      raw: true,
      render: (customer) => (
        <StatusChip status={customer.isActive ? 'active' : 'inactive'} />
      ),
    },
    {
      key: 'actions',
      width: '6%',
      raw: true,
      render: (customer) => (
        <RowActionMenu
          actions={[
            {
              label: 'View Customer',
              onClick: () => navigate(`/sales/customers/${customer.slug}/view`),
            },
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
      headers={['Name', 'Phone', 'Type', 'Price List', 'Status', 'Actions']}
      selectedId={undefined}
      focusedIndex={-1}
      onSelect={() => {}}
      listRef={{ current: null }}
      dataAttr="customer"
      paginationSlot={paginationSlot}
    />
  )
}
