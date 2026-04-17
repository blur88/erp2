import React from 'react'
import { Chip, Typography } from '@mui/material'
import { default as ProductIcon } from '@mui/icons-material/Inventory2'
import GenericDeletedDialog, { type ColumnDef } from '@/components/common/GenericDeletedDialog'
import {
  useBulkPermanentDeleteProductsMutation,
  useBulkRestoreProductsMutation,
  useGetDeletedProductsQuery,
  usePermanentDeleteProductMutation,
  useRestoreProductMutation,
} from '@/store/api/inventoryApi'
import type { Product } from '@/types'
import { formatCurrency } from '@/utils/currency'
import { formatDate } from '@/utils/formatters'

interface DeletedProductsDialogProps {
  open: boolean
  onClose: () => void
}

const columns: ColumnDef<Product & { deletedAt?: string | Date }>[] = [
  {
    label: 'Product Name',
    width: '40%',
    render: (product) => (
      <Typography variant="body2" sx={{ fontWeight: 600 }}>
        {product.name}
      </Typography>
    ),
  },
  {
    label: 'Category',
    width: '20%',
    render: (product) => (
      <Chip
        label={product.category?.name || 'No Category'}
        size="small"
        variant="outlined"
        color={product.category ? 'primary' : 'default'}
        sx={{ fontSize: '0.7rem', fontWeight: 500, height: 20 }}
      />
    ),
  },
  {
    label: 'Price',
    width: '12%',
    align: 'right',
    hideOnMobile: true,
    render: (product) => (
      <Typography variant="caption" color="primary" sx={{ fontWeight: 500 }}>
        {product.pricingTiers && Object.values(product.pricingTiers).length > 0
          ? formatCurrency(Object.values(product.pricingTiers)[0] as number)
          : '-'}
      </Typography>
    ),
  },
  {
    label: 'Deleted Date',
    width: '15%',
    hideOnMobile: true,
    render: (product) => (
      <Typography variant="caption" sx={{ color: 'text.secondary' }}>
        {product.deletedAt ? formatDate(product.deletedAt) : 'Unknown'}
      </Typography>
    ),
  },
]

const DeletedProductsDialog: React.FC<DeletedProductsDialogProps> = ({ open, onClose }) => (
  <GenericDeletedDialog<Product & { deletedAt?: string | Date }>
    open={open}
    onClose={onClose}
    title="Deleted Products"
    entityLabel="product"
    entityLabelPlural="products"
    icon={<ProductIcon sx={{ color: 'error.main' }} />}
    columns={columns}
    getItemLabel={(product) => product.name}
    searchPlaceholder="Search deleted products..."
    filterItem={(product, term) =>
      product.name?.toLowerCase().includes(term) ||
      (product.barcode?.toLowerCase().includes(term) ?? false)
    }
    useGetDeletedQuery={useGetDeletedProductsQuery}
    useRestoreMutation={useRestoreProductMutation}
    usePermanentDeleteMutation={usePermanentDeleteProductMutation}
    useBulkRestoreMutation={useBulkRestoreProductsMutation}
    useBulkPermanentDeleteMutation={useBulkPermanentDeleteProductsMutation}
  />
)

export default DeletedProductsDialog
