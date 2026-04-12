import React, { memo } from 'react'
import {
  Box,
  Paper,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableRow,
  Typography,
} from '@mui/material'
import { default as DragIndicatorIcon } from '@mui/icons-material/DragIndicator'

import { TABLE_STYLES } from '@/constants/tableStyles'
import type { Category } from '@/types'

interface CategoryRowProps {
  category: Category
  index: number
  selectedCategoryId: string | undefined
  focusedIndex: number
  onSelect: (category: Category) => void
}

const CategoryRow = memo(({
  category,
  index,
  selectedCategoryId,
  focusedIndex,
  onSelect,
}: CategoryRowProps) => {
  const isSelected = selectedCategoryId === category.id
  const isFocused = index === focusedIndex

  return (
    <TableRow
      hover
      onClick={() => onSelect(category)}
      data-category-index={index}
      sx={{
        cursor: 'pointer',
        backgroundColor: isSelected ? 'action.selected' : isFocused ? 'action.focus' : 'inherit',
        '&:hover': {
          backgroundColor: isSelected ? 'action.selected' : 'action.hover',
        },
        transition: 'background-color 0.2s ease',
        height: TABLE_STYLES.row.height,
        ...(isFocused && {
          outline: '2px solid',
          outlineColor: 'primary.main',
          outlineOffset: '-2px',
        }),
      }}
    >
      <TableCell>
        <Box
          sx={{ display: 'flex', alignItems: 'center', ml: category.level * 1.5, gap: 0.5 }}
          aria-level={category.level + 1}
          role="treeitem"
          aria-label={`${category.name} ${category.level === 0 ? 'root category' : `level ${category.level} category`}`}
        >
          <DragIndicatorIcon sx={{ color: 'text.secondary', fontSize: '0.875rem' }} />
          <Typography variant="body2" sx={{ fontSize: '0.8rem', lineHeight: 1.2, fontWeight: 400 }}>
            {category.name}
          </Typography>
        </Box>
      </TableCell>
    </TableRow>
  )
})

CategoryRow.displayName = 'CategoryRow'

interface CategoryListProps {
  categories: Category[]
  loading: boolean
  selectedCategoryId?: string
  focusedIndex: number
  onSelect: (category: Category) => void
  categoryListRef: React.RefObject<HTMLDivElement | null>
}

const CategoryList: React.FC<CategoryListProps> = ({
  categories,
  loading,
  selectedCategoryId,
  focusedIndex,
  onSelect,
  categoryListRef,
}) => {
  return (
    <Paper sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ p: TABLE_STYLES.cell.padding.px, borderBottom: TABLE_STYLES.cell.border }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography
            variant="tableHeader"
            sx={{
              fontWeight: 600,
              fontSize: '0.8rem',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
            }}
          >
            Categories ({categories.length})
          </Typography>
          {loading && categories.length > 0 && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                Searching...
              </Typography>
              <Box sx={{ width: 16, height: 16 }}>
                <Skeleton variant="circular" width={16} height={16} />
              </Box>
            </Box>
          )}
        </Box>
      </Box>
      <Box sx={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }} ref={categoryListRef}>
        <TableContainer sx={{ flex: 1, overflow: 'auto' }}>
          <Table
            size={TABLE_STYLES.size}
            sx={{
              '& .MuiTableCell-root': {
                borderBottom: TABLE_STYLES.cell.border,
                py: TABLE_STYLES.cell.padding.py * 0.75,
                px: TABLE_STYLES.cell.padding.px * 0.75,
              },
            }}
          >
            <TableBody>
              {loading && categories.length === 0
                ? [...Array(10)].map((_, index) => (
                    <TableRow key={`skeleton-${index}`}>
                      <TableCell colSpan={1}>
                        <Skeleton height={40} />
                      </TableCell>
                    </TableRow>
                  ))
                : categories.length === 0
                  ? (
                      <TableRow>
                        <TableCell colSpan={1}>
                          <Typography variant="body2" sx={{ color: 'text.secondary', textAlign: 'center', py: 2 }}>
                            No categories found
                          </Typography>
                        </TableCell>
                      </TableRow>
                    )
                  : categories.map((category, index) => (
                      <CategoryRow
                        key={category.id}
                        category={category}
                        index={index}
                        selectedCategoryId={selectedCategoryId}
                        focusedIndex={focusedIndex}
                        onSelect={onSelect}
                      />
                    ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Box>
    </Paper>
  )
}

export default CategoryList
