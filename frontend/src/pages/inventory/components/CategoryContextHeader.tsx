import React from 'react'
import { default as DeleteIcon } from '@mui/icons-material/Delete'
import { default as EditIcon } from '@mui/icons-material/Edit'
import {
  Box,
  Grid,
  IconButton,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableRow,
  Tooltip,
  Typography,
} from '@mui/material'

import { TABLE_STYLES } from '@/constants/tableStyles'
import type { Category } from '@/types'
import { formatDate } from '@/utils/formatters'

interface CategoryContextHeaderProps {
  selectedCategory: Category | null
  allCategories: Category[]
  onEdit: () => void
  onDelete: () => void
}

function buildCategoryHierarchy(categoryId: string, allCategories: Category[]): string {
  const names: string[] = []
  const visited = new Set<string>()
  let current = allCategories.find(c => c.id === categoryId)

  while (current && !visited.has(current.id)) {
    visited.add(current.id)
    names.unshift(current.name)
    current = current.parentId
      ? allCategories.find(c => c.id === current.parentId)
      : undefined
  }

  return names.length > 0 ? names.join(' > ') : '—'
}

const actionIconSx = {
  height: `${TABLE_STYLES.row.height * 0.75}px`,
  width: `${TABLE_STYLES.row.height * 0.75}px`,
  minHeight: 20,
  minWidth: 20,
  p: 0.125,
}

const detailTableSx = {
  tableLayout: 'fixed',
  '& .MuiTableCell-root': {
    border: 'none',
    py: TABLE_STYLES.cell.padding.py,
    px: TABLE_STYLES.cell.padding.px,
    '&:nth-of-type(1)': { width: '40%' },
    '&:nth-of-type(2)': { width: '60%' },
  },
}

const labelCellSx = {
  fontWeight: 600,
  color: 'text.secondary',
  fontSize: '0.8rem',
}

const valueCellSx = {
  fontSize: '0.8rem',
}

const CategoryContextHeader: React.FC<CategoryContextHeaderProps> = ({
  selectedCategory,
  allCategories,
  onEdit,
  onDelete,
}) => {
  if (!selectedCategory) {
    return (
      <Paper sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', p: 4 }}>
        <Typography variant="h6" sx={{ color: 'text.secondary' }}>
          Select a category to view details
        </Typography>
      </Paper>
    )
  }

  const levelLabel = selectedCategory.level === 0 ? 'Root' : `Level ${selectedCategory.level}`
  const parentName = selectedCategory.parentId
    ? allCategories.find(c => c.id === selectedCategory.parentId)?.name ?? '—'
    : 'None'
  const productCount = selectedCategory.productCount ?? 0
  const fullHierarchy = buildCategoryHierarchy(selectedCategory.id, allCategories)

  return (
    <Paper sx={{ overflow: 'hidden' }}>
      <Box
        sx={{
          p: TABLE_STYLES.cell.padding.px,
          borderBottom: TABLE_STYLES.cell.border,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <Typography
          variant="tableHeader"
          sx={{ fontWeight: 600, fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}
        >
          Category - {selectedCategory.name}
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25 }}>
          <IconButton
            size="small"
            title={`Edit ${selectedCategory.name}`}
            aria-label={`Edit category ${selectedCategory.name}`}
            onClick={onEdit}
            sx={{ ...actionIconSx, color: 'primary.main' }}
          >
            <EditIcon sx={{ fontSize: `${TABLE_STYLES.row.height * 0.5}px` }} />
          </IconButton>
          <IconButton
            size="small"
            title={`Delete ${selectedCategory.name}`}
            aria-label={`Delete category ${selectedCategory.name}`}
            onClick={onDelete}
            sx={{ ...actionIconSx, color: 'error.main' }}
          >
            <DeleteIcon sx={{ fontSize: `${TABLE_STYLES.row.height * 0.5}px` }} />
          </IconButton>
        </Box>
      </Box>

      <Box sx={{ p: TABLE_STYLES.cell.padding.px }}>
        <Grid container spacing={3}>
          <Grid size={{ xs: 12, md: 6 }}>
            <TableContainer>
              <Table size={TABLE_STYLES.size} sx={detailTableSx}>
                <TableBody>
                  <TableRow>
                    <TableCell
                      colSpan={2}
                      sx={{
                        pb: TABLE_STYLES.cell.padding.py * 0.67,
                        py: TABLE_STYLES.cell.padding.py * 0.67,
                        borderTop: TABLE_STYLES.cell.border,
                      }}
                    >
                      <Typography variant="h6" sx={{ fontWeight: 600, color: 'primary.main', fontSize: '0.8rem' }}>
                        Category Info
                      </Typography>
                    </TableCell>
                  </TableRow>
                  <TableRow sx={{ backgroundColor: 'grey.50' }}>
                    <TableCell sx={labelCellSx}>Category Path</TableCell>
                    <TableCell sx={{ ...valueCellSx, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      <Tooltip title={fullHierarchy} placement="top">
                        <span>{fullHierarchy}</span>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell sx={labelCellSx}>Level</TableCell>
                    <TableCell sx={valueCellSx}>{levelLabel}</TableCell>
                  </TableRow>
                  <TableRow sx={{ backgroundColor: 'grey.50' }}>
                    <TableCell sx={labelCellSx}>Parent Category</TableCell>
                    <TableCell sx={valueCellSx}>{parentName}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </TableContainer>
          </Grid>

          <Grid size={{ xs: 12, md: 6 }}>
            <TableContainer>
              <Table size={TABLE_STYLES.size} sx={detailTableSx}>
                <TableBody>
                  <TableRow>
                    <TableCell
                      colSpan={2}
                      sx={{
                        pb: TABLE_STYLES.cell.padding.py * 0.67,
                        py: TABLE_STYLES.cell.padding.py * 0.67,
                        borderTop: TABLE_STYLES.cell.border,
                      }}
                    >
                      <Typography variant="h6" sx={{ fontWeight: 600, color: 'primary.main', fontSize: '0.8rem' }}>
                        Summary
                      </Typography>
                    </TableCell>
                  </TableRow>
                  <TableRow sx={{ backgroundColor: 'grey.50' }}>
                    <TableCell sx={labelCellSx}>Product Count</TableCell>
                    <TableCell sx={valueCellSx}>
                      {productCount} {productCount === 1 ? 'item' : 'items'}
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell sx={labelCellSx}>Created</TableCell>
                    <TableCell sx={valueCellSx}>{formatDate(selectedCategory.createdAt)}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </TableContainer>
          </Grid>
        </Grid>
      </Box>
    </Paper>
  )
}

export default CategoryContextHeader
