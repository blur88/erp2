import React from 'react'

import EntityTable, { type ColumnConfig } from '@/components/common/EntityTable'
import type { Supplier } from '@/types'

const COLUMNS: ColumnConfig<Supplier>[] = [
  { key: 'companyName', render: (supplier) => supplier.companyName },
]

interface SupplierListProps {
  suppliers: Supplier[]
  loading: boolean
  total: number
  selectedSupplierId: string | undefined
  focusedIndex: number
  onSelect: (supplier: Supplier) => void
  supplierListRef: React.RefObject<HTMLDivElement | null>
}

const SupplierList: React.FC<SupplierListProps> = ({
  suppliers,
  loading,
  total,
  selectedSupplierId,
  focusedIndex,
  onSelect,
  supplierListRef,
}) => (
  <EntityTable
    rows={suppliers}
    columns={COLUMNS}
    loading={loading}
    total={total}
    label="Suppliers"
    selectedId={selectedSupplierId}
    focusedIndex={focusedIndex}
    onSelect={onSelect}
    listRef={supplierListRef}
    dataAttr="supplier"
  />
)

export default SupplierList
