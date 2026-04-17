import React from 'react'
import { Box, Chip, Stack, Typography } from '@mui/material'
import { default as BusinessIcon } from '@mui/icons-material/Business'
import { default as PhoneIcon } from '@mui/icons-material/Phone'
import GenericDeletedDialog, { type ColumnDef } from '@/components/common/GenericDeletedDialog'
import {
  useBulkPermanentDeleteSuppliersMutation,
  useBulkRestoreSuppliersMutation,
  useGetDeletedSuppliersQuery,
  usePermanentDeleteSupplierMutation,
  useRestoreSupplierMutation,
} from '@/store/api/purchasingApi'
import type { Supplier } from '@/types'
import { SupplierType } from '@/types'
import { formatDate } from '@/utils/formatters'

interface DeletedSuppliersDialogProps {
  open: boolean
  onClose: () => void
  onRefresh?: () => void
}

const columns: ColumnDef<Supplier>[] = [
  {
    label: 'Supplier',
    width: '30%',
    render: (supplier) => (
      <Typography variant="body2" sx={{ fontWeight: 600 }}>
        {supplier.companyName}
      </Typography>
    ),
  },
  {
    label: 'Type',
    width: '15%',
    render: (supplier) => (
      <Chip
        label={supplier.type === SupplierType.INTERNATIONAL ? 'International' : 'Local'}
        size="small"
        variant="outlined"
        sx={{ fontSize: '0.7rem', fontWeight: 500, height: 20 }}
      />
    ),
  },
  {
    label: 'Contact',
    width: '20%',
    hideOnMobile: true,
    render: (supplier) => (
      <Stack spacing={0.5}>
        {supplier.contactPerson && (
          <Typography variant="caption" sx={{ fontSize: '0.7rem' }}>
            {supplier.contactPerson}
          </Typography>
        )}
        {supplier.phone && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <PhoneIcon sx={{ color: 'text.secondary', fontSize: 16 }} />
            <Typography variant="caption" sx={{ fontSize: '0.7rem' }}>
              {supplier.phone}
            </Typography>
          </Box>
        )}
      </Stack>
    ),
  },
  {
    label: 'Deleted Date',
    width: '15%',
    hideOnMobile: true,
    render: (supplier) => (
      <Typography variant="caption" sx={{ color: 'text.secondary' }}>
        {supplier.deletedAt ? formatDate(supplier.deletedAt) : 'Unknown'}
      </Typography>
    ),
  },
]

const DeletedSuppliersDialog: React.FC<DeletedSuppliersDialogProps> = ({ open, onClose, onRefresh }) => (
  <GenericDeletedDialog<Supplier>
    open={open}
    onClose={onClose}
    title="Deleted Suppliers"
    entityLabel="supplier"
    entityLabelPlural="suppliers"
    icon={<BusinessIcon sx={{ color: 'error.main' }} />}
    columns={columns}
    getItemLabel={(supplier) => supplier.companyName}
    searchPlaceholder="Search deleted suppliers..."
    filterItem={(supplier, term) =>
      supplier.companyName?.toLowerCase().includes(term) ||
      (supplier.contactPerson?.toLowerCase().includes(term) ?? false) ||
      (supplier.phone?.toLowerCase().includes(term) ?? false)
    }
    useGetDeletedQuery={useGetDeletedSuppliersQuery}
    useRestoreMutation={useRestoreSupplierMutation}
    usePermanentDeleteMutation={usePermanentDeleteSupplierMutation}
    useBulkRestoreMutation={useBulkRestoreSuppliersMutation}
    useBulkPermanentDeleteMutation={useBulkPermanentDeleteSuppliersMutation}
    onChanged={onRefresh}
  />
)

export default DeletedSuppliersDialog
