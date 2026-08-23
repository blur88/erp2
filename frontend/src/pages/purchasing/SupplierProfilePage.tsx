import React from 'react'
import { Box, CircularProgress, Tab, Tabs, Typography } from '@mui/material'
import LocalShippingIcon from '@mui/icons-material/LocalShipping'
import PaymentIcon from '@mui/icons-material/Payment'
import StoreIcon from '@mui/icons-material/Store'
import { skipToken } from '@reduxjs/toolkit/query'
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'

import { StatusChip } from '@/components/common/StatusChip'
import PageHeader from '@/components/common/PageHeader'
import { TABLE_STYLES } from '@/constants/tableStyles'
import { useNotification } from '@/hooks/useNotification'
import {
  useGetSupplierBySlugQuery,
  useUpdateSupplierMutation,
} from '@/store/api/purchasingApi'
import { listPathWithQuery } from '@/utils/listQuery'

import SupplierOverviewTab from './components/SupplierOverviewTab'
import SupplierPaymentsTab from './components/SupplierPaymentsTab'
import SupplierPurchaseOrdersTab from './components/SupplierPurchaseOrdersTab'

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

/**
 * Single source of truth for the tab strip. The `?tab=` clamp derives its upper
 * bound from this array's length, so adding or removing a tab cannot drift out
 * of sync with the bound the way a hardcoded literal did (issue #1125).
 */
const TABS = [
  { label: 'Overview', icon: <StoreIcon sx={{ fontSize: 16 }} /> },
  { label: 'Purchase Orders', icon: <LocalShippingIcon sx={{ fontSize: 16 }} /> },
  { label: 'Vendor Payments', icon: <PaymentIcon sx={{ fontSize: 16 }} /> },
]

export default function SupplierProfilePage() {
  const { slug } = useParams<{ slug: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const { showSuccess, showError } = useNotification()
  const tabValue = Math.min(Math.max(Number(searchParams.get('tab') ?? 0), 0), TABS.length - 1)

  const { data: supplier, isLoading, isError } = useGetSupplierBySlugQuery(slug ?? skipToken)
  const [updateSupplier] = useUpdateSupplierMutation()

  const handleStatusToggle = async () => {
    if (!supplier) return
    try {
      await updateSupplier({ id: supplier.id, data: { isActive: !supplier.isActive } }).unwrap()
      showSuccess(
        supplier.isActive
          ? `${supplier.companyName} set as inactive`
          : `${supplier.companyName} reactivated`,
      )
    } catch {
      showError(`Failed to update ${supplier.companyName}`)
    }
  }

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 6 }}>
        <CircularProgress />
      </Box>
    )
  }

  if (isError || !supplier) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 6 }}>
        <Typography color="text.secondary">Supplier not found.</Typography>
      </Box>
    )
  }

  const profilePath = `/purchasing/suppliers/${supplier.slug}/view`

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      <PageHeader
        title={supplier.companyName}
        titleBadge={<StatusChip status={supplier.isActive ? 'active' : 'inactive'} />}
        backAction={() => navigate(listPathWithQuery('/purchasing/suppliers', location.search))}
        primaryAction={{
          label: 'Edit Supplier',
          onClick: () => navigate(`/purchasing/suppliers/${supplier.slug}/edit`, {
            state: { returnTo: 'profile', profilePath, breadcrumbTitle: supplier.companyName },
          }),
        }}
        secondaryAction={{
          label: supplier.isActive ? 'Set as Inactive' : 'Reactivate',
          onClick: handleStatusToggle,
        }}
      />

      <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
        <Tabs
          value={tabValue}
          onChange={(_, value: number) =>
            setSearchParams(
              (prev) => {
                const next = new URLSearchParams(prev)
                next.set('tab', String(value))
                return next
              },
              { replace: true },
            )}
          sx={{ minHeight: 36 }}
        >
          {TABS.map((tab) => (
            <Tab
              key={tab.label}
              icon={tab.icon}
              iconPosition="start"
              label={tab.label}
              sx={{ minHeight: 36 }}
            />
          ))}
        </Tabs>
      </Box>

      <TabPanel value={tabValue} index={0}>
        <SupplierOverviewTab supplier={supplier} />
      </TabPanel>
      <TabPanel value={tabValue} index={1}>
        <SupplierPurchaseOrdersTab supplierId={supplier.id} />
      </TabPanel>
      <TabPanel value={tabValue} index={2}>
        <SupplierPaymentsTab supplierId={supplier.id} />
      </TabPanel>
    </Box>
  )
}
