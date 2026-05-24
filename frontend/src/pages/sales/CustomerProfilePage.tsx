import { useCallback, useState } from 'react'
import { Box, CircularProgress, Tab, Tabs } from '@mui/material'
import { useNavigate, useParams } from 'react-router-dom'

import { EntityStatusChip } from '@/components/common/EntityStatusChip'
import PageHeader from '@/components/common/PageHeader'
import { useNotification } from '@/hooks/useNotification'
import {
  useGetCustomerBySlugQuery,
  useUpdateCustomerMutation,
} from '@/store/api/salesApi'

import CustomerInvoicesTab from './components/CustomerInvoicesTab'
import CustomerOrdersTab from './components/CustomerOrdersTab'
import CustomerOverviewTab from './components/CustomerOverviewTab'
import CustomerPaymentsTab from './components/CustomerPaymentsTab'

export default function CustomerProfilePage() {
  const { slug } = useParams<{ slug: string }>()
  const navigate = useNavigate()
  const { showSuccess, showError } = useNotification()
  const [tabValue, setTabValue] = useState(0)

  const { data: customer, isLoading } = useGetCustomerBySlugQuery(slug ?? '')
  const [updateCustomer] = useUpdateCustomerMutation()

  const handleStatusToggle = useCallback(async () => {
    if (!customer) return

    try {
      await updateCustomer({ id: customer.id, data: { isActive: !customer.isActive } }).unwrap()
      showSuccess(customer.isActive ? `${customer.name} set as inactive` : `${customer.name} reactivated`)
    } catch {
      showError(customer.isActive ? `Failed to deactivate ${customer.name}` : `Failed to reactivate ${customer.name}`)
    }
  }, [customer, updateCustomer, showSuccess, showError])

  if (isLoading || !customer) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 6 }}>
        <CircularProgress />
      </Box>
    )
  }

  return (
    <Box>
      <PageHeader
        title={customer.name}
        titleBadge={<EntityStatusChip status={customer.isActive ? 'active' : 'inactive'} />}
        backAction={() => navigate('/sales/customers')}
        primaryAction={{
          label: 'Edit Customer',
          onClick: () => navigate(`/sales/customers/${customer.slug}/edit`),
        }}
        secondaryAction={{
          label: customer.isActive ? 'Set as Inactive' : 'Reactivate',
          onClick: handleStatusToggle,
        }}
      />

      <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
        <Tabs
          value={tabValue}
          onChange={(_, value) => setTabValue(value)}
          sx={{
            minHeight: 40,
            '& .MuiTab-root': {
              minHeight: 40,
              fontSize: '0.875rem',
              textTransform: 'none',
              fontWeight: 600,
            },
          }}
        >
          <Tab label="Overview" />
          <Tab label="Orders" />
          <Tab label="Invoices" />
          <Tab label="Payments" />
        </Tabs>
      </Box>

      {tabValue === 0 && <CustomerOverviewTab customer={customer} />}
      {tabValue === 1 && <CustomerOrdersTab customerId={customer.id} />}
      {tabValue === 2 && <CustomerInvoicesTab customerId={customer.id} />}
      {tabValue === 3 && <CustomerPaymentsTab customerId={customer.id} />}
    </Box>
  )
}
