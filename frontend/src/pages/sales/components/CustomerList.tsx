import React from 'react'

import EntityTable, { type ColumnConfig } from '@/components/common/EntityTable'
import type { Customer } from '@/types'

const COLUMNS: ColumnConfig<Customer>[] = [
  { key: 'name', render: (customer) => customer.name },
]

interface CustomerListProps {
  customers: Customer[]
  loading: boolean
  total: number
  selectedCustomerId: string | undefined
  focusedIndex: number
  onSelect: (customer: Customer) => void
  customerListRef: React.RefObject<HTMLDivElement | null>
}

const CustomerList: React.FC<CustomerListProps> = ({
  customers,
  loading,
  total,
  selectedCustomerId,
  focusedIndex,
  onSelect,
  customerListRef,
}) => (
  <EntityTable
    rows={customers}
    columns={COLUMNS}
    loading={loading}
    total={total}
    label="Customers"
    selectedId={selectedCustomerId}
    focusedIndex={focusedIndex}
    onSelect={onSelect}
    listRef={customerListRef}
    dataAttr="customer"
  />
)

export default CustomerList
