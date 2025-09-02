import React from 'react'
import { Breadcrumbs, Link, Typography, Box, Chip } from '@mui/material'
import { NavigateNext, Home, ArrowForwardIos } from '@mui/icons-material'
import { Category } from '@/types'

interface CategoryBreadcrumbProps {
  category?: Category | null
  ancestors?: Category[]
  breadcrumbs?: string[]
  showHome?: boolean
  showLevel?: boolean
  onCategoryClick?: (category: Category) => void
  onHomeClick?: () => void
}

const CategoryBreadcrumb: React.FC<CategoryBreadcrumbProps> = ({
  category,
  ancestors = [],
  breadcrumbs = [],
  showHome = true,
  showLevel = false,
  onCategoryClick,
  onHomeClick
}) => {
  const handleCategoryClick = (clickedCategory: Category) => (event: React.MouseEvent) => {
    event.preventDefault()
    onCategoryClick?.(clickedCategory)
  }

  const handleHomeClick = (event: React.MouseEvent) => {
    event.preventDefault()
    onHomeClick?.()
  }

  // Build breadcrumb items
  const breadcrumbItems: React.ReactNode[] = []

  // Add home link if requested
  if (showHome) {
    breadcrumbItems.push(
      <Link
        key="home"
        color="inherit"
        href="#"
        onClick={handleHomeClick}
        sx={{ 
          display: 'flex', 
          alignItems: 'center',
          textDecoration: 'none',
          '&:hover': {
            textDecoration: 'underline'
          }
        }}
      >
        <Home sx={{ mr: 0.5, fontSize: 16 }} />
        All Categories
      </Link>
    )
  }

  // Add ancestor categories
  ancestors.forEach((ancestor) => {
    breadcrumbItems.push(
      <Link
        key={ancestor.id}
        color="inherit"
        href="#"
        onClick={handleCategoryClick(ancestor)}
        sx={{
          display: 'flex',
          alignItems: 'center',
          textDecoration: 'none',
          '&:hover': {
            textDecoration: 'underline'
          }
        }}
      >
        {ancestor.name}
        {showLevel && (
          <Chip 
            label={`L${ancestor.level}`}
            size="small"
            variant="outlined"
            sx={{ ml: 0.5, height: 16, fontSize: '0.6rem' }}
          />
        )}
      </Link>
    )
  })

  // Add current category (non-clickable)
  if (category) {
    breadcrumbItems.push(
      <Box key={category.id} sx={{ display: 'flex', alignItems: 'center' }}>
        <Typography 
          color="text.primary" 
          variant="inherit"
          sx={{ fontWeight: 600 }}
        >
          {category.name}
        </Typography>
        {showLevel && (
          <Chip 
            label={`L${category.level}`}
            size="small"
            color="primary"
            sx={{ ml: 0.5, height: 16, fontSize: '0.6rem' }}
          />
        )}
      </Box>
    )
  }

  // Fallback: use breadcrumbs string array if no category/ancestors provided
  if (breadcrumbItems.length === 0 && breadcrumbs.length > 0) {
    breadcrumbs.forEach((crumb, index) => {
      if (index === breadcrumbs.length - 1) {
        // Last item is current (non-clickable)
        breadcrumbItems.push(
          <Typography key={index} color="text.primary" variant="inherit" sx={{ fontWeight: 600 }}>
            {crumb}
          </Typography>
        )
      } else {
        // Previous items are clickable
        breadcrumbItems.push(
          <Link
            key={index}
            color="inherit"
            href="#"
            onClick={(e) => e.preventDefault()}
            sx={{
              textDecoration: 'none',
              '&:hover': {
                textDecoration: 'underline'
              }
            }}
          >
            {crumb}
          </Link>
        )
      }
    })
  }

  if (breadcrumbItems.length === 0) {
    return null
  }

  return (
    <Box sx={{ mb: 2 }}>
      <Breadcrumbs
        separator={<ArrowForwardIos fontSize="small" />}
        aria-label="category breadcrumb"
        sx={{
          '& .MuiBreadcrumbs-ol': {
            flexWrap: 'nowrap'
          },
          '& .MuiBreadcrumbs-li': {
            whiteSpace: 'nowrap'
          }
        }}
      >
        {breadcrumbItems}
      </Breadcrumbs>
    </Box>
  )
}

export default CategoryBreadcrumb