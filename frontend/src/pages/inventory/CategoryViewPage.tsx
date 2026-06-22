import { Box, CircularProgress, Link, Tab, Tabs, Typography } from '@mui/material'
import { skipToken } from '@reduxjs/toolkit/query'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'

import PageHeader from '@/components/common/PageHeader'
import { StatusChip } from '@/components/common/StatusChip'
import { TABLE_STYLES } from '@/constants/tableStyles'
import { useGetCategoryBySlugQuery } from '@/store/api/inventoryApi'

import CategoryProductsList from './components/CategoryProductsList'

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

export default function CategoryViewPage() {
  const { slug } = useParams<{ slug: string }>()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const tabValue = Math.min(Math.max(Number(searchParams.get('tab') ?? 0), 0), 1)

  const { data: category, isLoading, isError } = useGetCategoryBySlugQuery(slug ?? skipToken)

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 6 }}>
        <CircularProgress />
      </Box>
    )
  }

  if (isError || !category) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 6 }}>
        <Typography color="text.secondary">Category not found.</Typography>
      </Box>
    )
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      <PageHeader
        title={category.name}
        titleBadge={<StatusChip status={category.isEnabled ? 'active' : 'inactive'} />}
        backAction={() => navigate('/inventory/categories')}
        primaryAction={{
          label: 'Edit Category',
          onClick: () => navigate(`/inventory/categories/${category.slug}/edit`),
        }}
      />

      <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
        <Tabs
          value={tabValue}
          onChange={(_, value: number) => setSearchParams({ tab: String(value) }, { replace: true })}
          sx={{ minHeight: 36 }}
        >
          <Tab label="Overview" sx={{ minHeight: 36 }} />
          <Tab label="Products" sx={{ minHeight: 36 }} />
        </Tabs>
      </Box>

      <TabPanel value={tabValue} index={0}>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Box>
            <Typography variant="overline" color="text.secondary">Full Path</Typography>
            <Typography variant="body2">{category.fullPath}</Typography>
          </Box>
          <Box>
            <Typography variant="overline" color="text.secondary">Level</Typography>
            <Typography variant="body2">{category.level === 0 ? 'Root' : `Level ${category.level}`}</Typography>
          </Box>
          {category.parent && (
            <Box>
              <Typography variant="overline" color="text.secondary">Parent</Typography>
              <Typography variant="body2">
                <Link
                  component="button"
                  variant="body2"
                  onClick={() => navigate(`/inventory/categories/${category.parent!.slug}/view`)}
                  sx={{ textAlign: 'left' }}
                >
                  {category.parent.name}
                </Link>
              </Typography>
            </Box>
          )}
          {category.description && (
            <Box>
              <Typography variant="overline" color="text.secondary">Description</Typography>
              <Typography variant="body2">{category.description}</Typography>
            </Box>
          )}
          <Box>
            <Typography variant="overline" color="text.secondary">Product Count</Typography>
            <Typography variant="body2">{category.productCount}</Typography>
          </Box>
          <Box>
            <Typography variant="overline" color="text.secondary">Created</Typography>
            <Typography variant="body2">{new Date(category.createdAt).toLocaleDateString()}</Typography>
          </Box>
          <Box>
            <Typography variant="overline" color="text.secondary">Updated</Typography>
            <Typography variant="body2">{new Date(category.updatedAt).toLocaleDateString()}</Typography>
          </Box>
        </Box>
      </TabPanel>

      <TabPanel value={tabValue} index={1}>
        <CategoryProductsList categoryId={category.id} />
      </TabPanel>
    </Box>
  )
}
