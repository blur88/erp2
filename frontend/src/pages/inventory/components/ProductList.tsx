import React from 'react'

import EntityTable, { type ColumnConfig } from '@/components/common/EntityTable'
import type { Product } from '@/types'

const COLUMNS: ColumnConfig<Product>[] = [
  { key: 'name', render: (product) => product.name },
]

interface ProductListProps {
  products: Product[]
  loading: boolean
  selectedProductId?: string
  focusedIndex: number
  onSelect: (product: Product) => void
  productListRef: React.RefObject<HTMLDivElement | null>
}

const ProductList: React.FC<ProductListProps> = ({
  products,
  loading,
  selectedProductId,
  focusedIndex,
  onSelect,
  productListRef,
}) => (
  <EntityTable
    rows={products}
    columns={COLUMNS}
    loading={loading}
    total={products.length}
    label="Products"
    selectedId={selectedProductId}
    focusedIndex={focusedIndex}
    onSelect={onSelect}
    listRef={productListRef}
    dataAttr="product"
  />
)

export default ProductList
