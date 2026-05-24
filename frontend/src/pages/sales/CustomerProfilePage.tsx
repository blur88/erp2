import { useCallback, useState } from 'react'
import { Box, CircularProgress, Tab, Tabs, Typography } from '@mui/material'
import AccountBalanceIcon from '@mui/icons-material/AccountBalance'
import PaymentIcon from '@mui/icons-material/Payment'
import PersonIcon from '@mui/icons-material/Person'
import ShoppingCartIcon from '@mui/icons-material/ShoppingCart'
import { skipToken } from '@reduxjs/toolkit/query'
import { useNavigate, useParams } from 'react-router-dom'

import { EntityStatusChip } from '@/components/common/EntityStatusChip'
import PageHeader from '@/components/common/PageHeader'
import { TABLE_STYLES } from '@/constants/tableStyles'
import { useNotification } from '@/hooks/useNotification'
import {
  useGetCustomerBySlugQuery,
  useUpdateCustomerMutation,
} from '@/store/api/salesApi'

import CustomerInvoicesTab from './components/CustomerInvoicesTab'
import CustomerOrdersTab from './components/CustomerOrdersTab'
import CustomerOverviewTab from './components/CustomerOverviewTab'
import CustomerPaymentsTab from './components/CustomerPaymentsTab'

interface TabPanelProps {
  children?: React.ReactNode
  index: number
  value: number
}

function TabPanel({ children, value, index }: TabPanelProps) {
  return (
    <Box
      role="tabpanel"
      sx={{
        flex: 1,
        overflow: 'auto',
        display: value === index ? 'flex' : 'none',
        flexDirection: 'column',
      }}
    >
      {value === index && (
        <Box sx={{ p: TABLE_STYLES.cell.padding.px, flex: 1 }}>
          {children}
        </Box>
      )}
    </Box>
  )
}

export default function CustomerProfilePage() {
  const { slug } = useParams<{ slug: string }>()
  const navigate = useNavigate()
  const { showSuccess, showError } = useNotification()
  const [tabValue, setTabValue] = useState(0)

  const { data: customer, isLoading, isError } = useGetCustomerBySlugQuery(slug ?? skipToken)
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

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 6 }}>
        <CircularProgress />
      </Box>
    )
  }

  if (isError || !customer) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 6 }}>
        <Typography color="text.secondary">Customer not found.</Typography>
      </Box>
    )
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
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
          sx={{ minHeight: 36 }}
        >
          <Tab icon={<PersonIcon sx={{ fontSize: 16 }} />} iconPosition="start" label="Overview" sx={{ minHeight: 36 }} />
          <Tab icon={<ShoppingCartIcon sx={{ fontSize: 16 }} />} iconPosition="start" label="Orders" sx={{ minHeight: 36 }} />
          <Tab icon={<AccountBalanceIcon sx={{ fontSize: 16 }} />} iconPosition="start" label="Invoices" sx={{ minHeight: 36 }} />
          <Tab icon={<PaymentIcon sx={{ fontSize: 16 }} />} iconPosition="start" label="Payments" sx={{ minHeight: 36 }} />
        </Tabs>
      </Box>

      <TabPanel value={tabValue} index={0}>
        <CustomerOverviewTab customer={customer} />
      </TabPanel>
      <TabPanel value={tabValue} index={1}>
        <CustomerOrdersTab customerId={customer.id} />
      </TabPanel>
      <TabPanel value={tabValue} index={2}>
        <CustomerInvoicesTab customerId={customer.id} />
      </TabPanel>
      <TabPanel value={tabValue} index={3}>
        <CustomerPaymentsTab customerId={customer.id} />
      </TabPanel>
    </Box>
  )
}
