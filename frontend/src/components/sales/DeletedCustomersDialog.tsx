import React from 'react'
import { Box, Chip, Stack, Typography } from '@mui/material'
import { default as EmailIcon } from '@mui/icons-material/Email'
import { default as PersonIcon } from '@mui/icons-material/Person'
import { default as PhoneIcon } from '@mui/icons-material/Phone'
import GenericDeletedDialog, { type ColumnDef } from '@/components/common/GenericDeletedDialog'
import {
  useBulkPermanentDeleteCustomersMutation,
  useBulkRestoreCustomersMutation,
  useGetDeletedCustomersQuery,
  usePermanentDeleteCustomerMutation,
  useRestoreCustomerMutation,
} from '@/store/api/salesApi'
import type { Customer } from '@/types'
import { formatDate } from '@/utils/formatters'
import { formatCustomerType } from '@/utils/customerUtils'

type DeletedCustomer = Customer & { deletedAt?: string | Date }

interface DeletedCustomersDialogProps {
  open: boolean
  onClose: () => void
}

const columns: ColumnDef<DeletedCustomer>[] = [
  {
    label: 'Customer Details',
    width: '30%',
    render: (customer) => (
      <Typography variant="body2" sx={{ fontWeight: 600 }}>
        {customer.name}
      </Typography>
    ),
  },
  {
    label: 'Type',
    width: '15%',
    render: (customer) => (
      <Chip
        label={formatCustomerType(customer.type)}
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
    render: (customer) => (
      <Stack spacing={0.5}>
        {customer.email && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <EmailIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
            <Typography variant="caption" sx={{ fontSize: '0.7rem' }}>
              {customer.email}
            </Typography>
          </Box>
        )}
        {customer.phone && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <PhoneIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
            <Typography variant="caption" sx={{ fontSize: '0.7rem' }}>
              {customer.phone}
            </Typography>
          </Box>
        )}
      </Stack>
    ),
  },
  {
    label: 'Deleted Date',
    width: '20%',
    hideOnMobile: true,
    render: (customer) => (
      <Typography variant="caption" sx={{ color: 'text.secondary' }}>
        {customer.deletedAt ? formatDate(customer.deletedAt) : 'Unknown'}
      </Typography>
    ),
  },
]

const DeletedCustomersDialog: React.FC<DeletedCustomersDialogProps> = ({ open, onClose }) => (
  <GenericDeletedDialog<DeletedCustomer>
    open={open}
    onClose={onClose}
    title="Deleted Customers"
    entityLabel="customer"
    entityLabelPlural="customers"
    icon={<PersonIcon sx={{ color: 'error.main' }} />}
    columns={columns}
    getItemLabel={(customer) => customer.name}
    searchPlaceholder="Search deleted customers..."
    filterItem={(customer, term) =>
      customer.name?.toLowerCase().includes(term) ||
      (customer.email?.toLowerCase().includes(term) ?? false) ||
      (customer.phone?.toLowerCase().includes(term) ?? false)
    }
    useGetDeletedQuery={useGetDeletedCustomersQuery}
    useRestoreMutation={useRestoreCustomerMutation}
    usePermanentDeleteMutation={usePermanentDeleteCustomerMutation}
    useBulkRestoreMutation={useBulkRestoreCustomersMutation}
    useBulkPermanentDeleteMutation={useBulkPermanentDeleteCustomersMutation}
  />
)

export default DeletedCustomersDialog
