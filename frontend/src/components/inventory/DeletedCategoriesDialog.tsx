import React from 'react'
import { Chip, Typography } from '@mui/material'
import { default as CategoryIcon } from '@mui/icons-material/Category'
import GenericDeletedDialog, { type ColumnDef } from '@/components/common/GenericDeletedDialog'
import {
  useBulkPermanentDeleteCategoriesMutation,
  useBulkRestoreCategoriesMutation,
  useGetDeletedCategoriesQuery,
  usePermanentDeleteCategoryMutation,
  useRestoreCategoryMutation,
} from '@/store/api/inventoryApi'
import type { Category } from '@/types'
import { formatDate } from '@/utils/formatters'

interface DeletedCategoriesDialogProps {
  open: boolean
  onClose: () => void
  onCategoryRestored?: () => void
}

const columns: ColumnDef<Category>[] = [
  {
    label: 'Category Name',
    width: '35%',
    render: (category) => (
      <Typography variant="body2" sx={{ fontWeight: 600 }}>
        {category.name}
      </Typography>
    ),
  },
  {
    label: 'Path',
    width: '25%',
    hideOnMobile: true,
    render: (category) => (
      <Typography variant="caption" sx={{ color: 'text.secondary' }}>
        {category.fullPath || category.path || '-'}
      </Typography>
    ),
  },
  {
    label: 'Level',
    width: '12%',
    align: 'center',
    render: (category) => (
      <Chip
        label={`L${category.level}`}
        size="small"
        variant="outlined"
        sx={{ fontSize: '0.7rem', fontWeight: 500, height: 20 }}
      />
    ),
  },
  {
    label: 'Deleted Date',
    width: '15%',
    hideOnMobile: true,
    render: (category) => (
      <Typography variant="caption" sx={{ color: 'text.secondary' }}>
        {category.deletedAt ? formatDate(category.deletedAt) : 'Unknown'}
      </Typography>
    ),
  },
]

const DeletedCategoriesDialog: React.FC<DeletedCategoriesDialogProps> = ({
  open,
  onClose,
  onCategoryRestored,
}) => (
  <GenericDeletedDialog<Category>
    open={open}
    onClose={onClose}
    title="Deleted Categories"
    entityLabel="category"
    entityLabelPlural="categories"
    icon={<CategoryIcon sx={{ color: 'error.main' }} />}
    columns={columns}
    getItemLabel={(category) => category.name}
    searchPlaceholder="Search deleted categories..."
    filterItem={(category, term) =>
      category.name?.toLowerCase().includes(term) ||
      (category.fullPath?.toLowerCase().includes(term) ?? false)
    }
    useGetDeletedQuery={useGetDeletedCategoriesQuery}
    useRestoreMutation={useRestoreCategoryMutation}
    usePermanentDeleteMutation={usePermanentDeleteCategoryMutation}
    useBulkRestoreMutation={useBulkRestoreCategoriesMutation}
    useBulkPermanentDeleteMutation={useBulkPermanentDeleteCategoriesMutation}
    onChanged={onCategoryRestored}
  />
)

export default DeletedCategoriesDialog
