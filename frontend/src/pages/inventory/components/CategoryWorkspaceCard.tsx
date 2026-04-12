import React, { useEffect, useState } from 'react'
import { Box, Paper, Tab, Tabs, Typography } from '@mui/material'

import { TABLE_STYLES } from '@/constants/tableStyles'
import type { Category } from '@/types'

import CategoryProductsList from './CategoryProductsList'

interface CategoryWorkspaceCardProps {
  selectedCategory: Category | null
}

const CategoryWorkspaceCard: React.FC<CategoryWorkspaceCardProps> = ({ selectedCategory }) => {
  const [tabValue, setTabValue] = useState(0)
  const categoryId = selectedCategory?.id ?? ''

  useEffect(() => {
    setTabValue(0)
  }, [categoryId])

  if (!selectedCategory) {
    return <Paper sx={{ flex: 1 }} />
  }

  return (
    <Paper sx={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
        <Tabs
          value={tabValue}
          onChange={(_, value) => setTabValue(value)}
          sx={{
            minHeight: 40,
            '& .MuiTab-root': { minHeight: 40, fontSize: '0.8rem', textTransform: 'none', fontWeight: 600 },
          }}
        >
          <Tab label="Details" />
          <Tab label="Products" />
        </Tabs>
      </Box>

      <Box
        role="tabpanel"
        sx={{ flex: 1, overflow: 'auto', display: tabValue === 0 ? 'block' : 'none', p: TABLE_STYLES.cell.padding.px }}
      >
        {tabValue === 0 && (
          <Box>
            <Typography
              variant="caption"
              sx={{ color: 'text.secondary', fontWeight: 600, fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}
            >
              Full Path
            </Typography>
            <Typography variant="body2" sx={{ fontSize: '0.85rem', mt: 0.25 }}>
              {selectedCategory.fullPath}
            </Typography>
          </Box>
        )}
      </Box>

      <Box
        role="tabpanel"
        sx={{ flex: 1, overflow: 'auto', display: tabValue === 1 ? 'flex' : 'none', flexDirection: 'column', p: TABLE_STYLES.cell.padding.px }}
      >
        {tabValue === 1 && <CategoryProductsList categoryId={selectedCategory.id} />}
      </Box>
    </Paper>
  )
}

export default CategoryWorkspaceCard
