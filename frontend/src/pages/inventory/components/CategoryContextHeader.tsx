import React from 'react'
import { default as DeleteIcon } from '@mui/icons-material/Delete'
import { default as EditIcon } from '@mui/icons-material/Edit'
import { Box, IconButton, Paper, Typography } from '@mui/material'

import { TABLE_STYLES } from '@/constants/tableStyles'
import type { Category } from '@/types'

interface CategoryContextHeaderProps {
  selectedCategory: Category | null
  onEdit: () => void
  onDelete: () => void
}

const actionIconSx = {
  height: `${TABLE_STYLES.row.height * 0.75}px`,
  width: `${TABLE_STYLES.row.height * 0.75}px`,
  minHeight: 20,
  minWidth: 20,
  p: 0.125,
}

const CategoryContextHeader: React.FC<CategoryContextHeaderProps> = ({
  selectedCategory,
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
        <Box>
          <Typography
            variant="tableHeader"
            sx={{ fontWeight: 600, fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}
          >
            Category - {selectedCategory.name}
          </Typography>
          {selectedCategory.fullPath && selectedCategory.fullPath !== selectedCategory.name && (
            <Typography variant="body2" sx={{ color: 'text.secondary', fontSize: '0.75rem', mt: 0.25 }}>
              {selectedCategory.fullPath}
            </Typography>
          )}
        </Box>
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
    </Paper>
  )
}

export default CategoryContextHeader
