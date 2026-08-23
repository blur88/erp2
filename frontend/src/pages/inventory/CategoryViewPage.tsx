import type { ReactNode } from 'react'
import { Box, Card, CardContent, CircularProgress, Grid, Link, Tab, Tabs, Typography } from '@mui/material'
import InfoIcon from '@mui/icons-material/Info'
import Inventory2Icon from '@mui/icons-material/Inventory2'
import { skipToken } from '@reduxjs/toolkit/query'
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'

import PageHeader from '@/components/common/PageHeader'
import { StatusChip } from '@/components/common/StatusChip'
import { TABLE_STYLES } from '@/constants/tableStyles'
import { formatDate } from '@/utils/formatters'
import { listPathWithQuery } from '@/utils/listQuery'
import { useGetCategoryBySlugQuery } from '@/store/api/inventoryApi'

import CategoryProductsList from './components/CategoryProductsList'

interface TabPanelProps {
  children?: ReactNode
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

function Field({ label, value }: { label: string; value?: ReactNode }) {
  const hasValue = value !== null && value !== undefined && value !== ''
  return (
    <Box sx={{ mb: 1.5 }}>
      <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: 0.25 }}>
        {label}
      </Typography>
      <Typography variant="body2" component="div" sx={{ color: 'text.primary' }}>
        {hasValue ? value : '—'}
      </Typography>
    </Box>
  )
}

export default function CategoryViewPage() {
  const { slug } = useParams<{ slug: string }>()
  const navigate = useNavigate()
  const location = useLocation()
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
        backAction={() => navigate(listPathWithQuery('/inventory/categories', location.search))}
        primaryAction={{
          label: 'Edit Category',
          onClick: () => navigate(`/inventory/categories/${category.slug}/edit`),
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
          <Tab icon={<InfoIcon sx={{ fontSize: 16 }} />} iconPosition="start" label="Overview" sx={{ minHeight: 36 }} />
          <Tab icon={<Inventory2Icon sx={{ fontSize: 16 }} />} iconPosition="start" label="Products" sx={{ minHeight: 36 }} />
        </Tabs>
      </Box>

      <TabPanel value={tabValue} index={0}>
        <Grid container spacing={3}>
          <Grid size={{ xs: 12, md: 6 }} sx={{ display: 'flex', flexDirection: 'column' }}>
            <Card sx={{ flex: 1 }}>
              <CardContent>
                <Typography variant="h6" gutterBottom>Hierarchy</Typography>
                <Field label="Full Path" value={category.fullPath} />
                <Field label="Level" value={category.level === 0 ? 'Root' : `Level ${category.level}`} />
                {category.parent && (
                  <Field
                    label="Parent"
                    value={
                      <Link
                        component="button"
                        variant="body2"
                        onClick={() => navigate(`/inventory/categories/${category.parent!.slug}/view`)}
                        sx={{ textAlign: 'left' }}
                      >
                        {category.parent.name}
                      </Link>
                    }
                  />
                )}
              </CardContent>
            </Card>
          </Grid>

          <Grid size={{ xs: 12, md: 6 }} sx={{ display: 'flex', flexDirection: 'column' }}>
            <Card sx={{ flex: 1 }}>
              <CardContent>
                <Typography variant="h6" gutterBottom>Details</Typography>
                <Field label="Description" value={category.description} />
                <Field
                  label="Product Count"
                  value={category.productCount != null ? String(category.productCount) : undefined}
                />
              </CardContent>
            </Card>
          </Grid>

          <Grid size={{ xs: 12, md: 6 }} sx={{ display: 'flex', flexDirection: 'column' }}>
            <Card sx={{ flex: 1 }}>
              <CardContent>
                <Typography variant="h6" gutterBottom>Metadata</Typography>
                <Field label="Created" value={formatDate(category.createdAt)} />
                <Field label="Updated" value={formatDate(category.updatedAt)} />
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      </TabPanel>

      <TabPanel value={tabValue} index={1}>
        <CategoryProductsList categoryId={category.id} />
      </TabPanel>
    </Box>
  )
}
