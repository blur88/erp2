import { Box, CircularProgress, Tab, Tabs, Typography } from '@mui/material'
import HistoryIcon from '@mui/icons-material/History'
import InfoIcon from '@mui/icons-material/Info'
import SwapVertIcon from '@mui/icons-material/SwapVert'
import { skipToken } from '@reduxjs/toolkit/query'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'

import PageHeader from '@/components/common/PageHeader'
import { StatusChip } from '@/components/common/StatusChip'
import { TABLE_STYLES } from '@/constants/tableStyles'
import { useGetProductBySlugQuery } from '@/store/api/inventoryApi'

import ProductOverviewTab from './components/ProductOverviewTab'
import OrderHistoryTab from './components/OrderHistoryTab'
import StockMovementsTab from './components/StockMovementsTab'

interface TabPanelProps {
  children?: React.ReactNode
  index: number
  value: number
}

function TabPanel({ children, value, index }: TabPanelProps) {
  return (
    <Box
      role="tabpanel"
      sx={{ flex: 1, overflow: 'auto', display: value === index ? 'flex' : 'none', flexDirection: 'column' }}
    >
      {value === index && <Box sx={{ p: TABLE_STYLES.cell.padding.px, flex: 1 }}>{children}</Box>}
    </Box>
  )
}

export default function ProductViewPage() {
  const { slug } = useParams<{ slug: string }>()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const tabValue = Math.min(Math.max(Number(searchParams.get('tab') ?? 0), 0), 2)

  const { data: product, isLoading, isError } = useGetProductBySlugQuery(slug ?? skipToken)

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 6 }}>
        <CircularProgress />
      </Box>
    )
  }

  if (isError || !product) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 6 }}>
        <Typography color="text.secondary">Product not found.</Typography>
      </Box>
    )
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      <PageHeader
        title={product.name}
        titleBadge={<StatusChip status={product.isActive ? 'active' : 'inactive'} />}
        backAction={() => navigate('/inventory/products')}
        primaryAction={{
          label: 'Edit Product',
          onClick: () => navigate(`/inventory/products/${product.slug}/edit`),
        }}
      />

      <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
        <Tabs
          value={tabValue}
          onChange={(_, value: number) => setSearchParams({ tab: String(value) }, { replace: true })}
          sx={{ minHeight: 36 }}
        >
          <Tab icon={<InfoIcon sx={{ fontSize: 16 }} />} iconPosition="start" label="Overview" sx={{ minHeight: 36 }} />
          <Tab icon={<SwapVertIcon sx={{ fontSize: 16 }} />} iconPosition="start" label="Stock Movements" sx={{ minHeight: 36 }} />
          <Tab icon={<HistoryIcon sx={{ fontSize: 16 }} />} iconPosition="start" label="Order History" sx={{ minHeight: 36 }} />
        </Tabs>
      </Box>

      <TabPanel value={tabValue} index={0}>
        <ProductOverviewTab product={product} />
      </TabPanel>
      <TabPanel value={tabValue} index={1}>
        <StockMovementsTab productId={product.id} />
      </TabPanel>
      <TabPanel value={tabValue} index={2}>
        <OrderHistoryTab productId={product.id} />
      </TabPanel>
    </Box>
  )
}
