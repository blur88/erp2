import React, { useState, useEffect } from 'react'
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  TextField,
  InputAdornment,
  Box,
  Typography,
  Chip,
  IconButton,
  Tooltip,
  Alert,
  CircularProgress,
  useTheme,
  useMediaQuery,
  DialogContentText,
} from '@mui/material'
import {
  Search as SearchIcon,
  Restore as RestoreIcon,
  Close as CloseIcon,
  Category as CategoryIcon,
  DeleteForever as DeleteForeverIcon,
} from '@mui/icons-material'
import { useDispatch, useSelector } from 'react-redux'
import { useNotification } from '@/hooks/useNotification'
import type { Category } from '@/types'
import {
  fetchDeletedCategories,
  restoreCategory,
  permanentDeleteCategory,
  selectDeletedCategories,
  selectInventoryLoading,
} from '@/store/slices/inventorySlice'

interface DeletedCategoriesDialogProps {
  open: boolean
  onClose: () => void
  onCategoryRestored?: () => void
}

const DeletedCategoriesDialog: React.FC<DeletedCategoriesDialogProps> = ({ 
  open, 
  onClose, 
  onCategoryRestored 
}) => {
  const dispatch = useDispatch() as any
  const { showSuccess, showError } = useNotification()
  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down('md'))
  
  const deletedCategories = useSelector(selectDeletedCategories) || []
  const loading = useSelector(selectInventoryLoading)
  const [searchTerm, setSearchTerm] = useState('')
  const [restoringId, setRestoringId] = useState<string | null>(null)
  const [permanentDeletingId, setPermanentDeletingId] = useState<string | null>(null)
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false)
  const [categoryToDelete, setCategoryToDelete] = useState<Category | null>(null)

  useEffect(() => {
    if (open) {
      dispatch(fetchDeletedCategories({}))
    }
  }, [open, dispatch])

  // Filter categories based on search term
  const filteredCategories = deletedCategories.filter(category => 
    category.name?.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const handleRestore = async (category: Category) => {
    setRestoringId(category.id)
    try {
      await dispatch(restoreCategory(category.id))
      showSuccess(`Category "${category.name}" restored successfully`)
      
      // Notify parent component that a category was restored
      onCategoryRestored?.()
      
    } catch (error: any) {
      console.error('Category restore error:', error)
      const errorMessage = error?.response?.data?.message || error?.message || 'Failed to restore category'
      showError(errorMessage)
    } finally {
      setRestoringId(null)
    }
  }

  const handlePermanentDeleteClick = (category: Category) => {
    setCategoryToDelete(category)
    setConfirmDialogOpen(true)
  }

  const handlePermanentDeleteConfirm = async () => {
    if (!categoryToDelete) return

    setPermanentDeletingId(categoryToDelete.id)
    try {
      await dispatch(permanentDeleteCategory(categoryToDelete.id))
      showSuccess(`Category "${categoryToDelete.name}" permanently deleted`)
      
      // Notify parent component that a category was restored (in case they want to refresh main list)
      onCategoryRestored?.()
      
    } catch (error: any) {
      console.error('Category permanent delete error:', error)
      const errorMessage = error?.response?.data?.message || error?.message || 'Failed to permanently delete category'
      showError(errorMessage)
    } finally {
      setPermanentDeletingId(null)
      setConfirmDialogOpen(false)
      setCategoryToDelete(null)
    }
  }

  const handlePermanentDeleteCancel = () => {
    setConfirmDialogOpen(false)
    setCategoryToDelete(null)
  }

  const formatDate = (date: string | Date) => {
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    })
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      PaperProps={{ sx: { height: '70vh' } }}
    >
      <DialogTitle>
        <Box display="flex" justifyContent="space-between" alignItems="center">
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <CategoryIcon sx={{ color: 'warning.main' }} />
            <Typography variant={isMobile ? "h6" : "h5"} sx={{ fontWeight: 700 }}>
              Deleted Categories
            </Typography>
          </Box>
          <IconButton onClick={onClose} size="small">
            <CloseIcon />
          </IconButton>
        </Box>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          Restore soft-deleted categories ({filteredCategories.length} {searchTerm ? 'found' : 'total'})
        </Typography>
      </DialogTitle>

      <DialogContent>
        <Box sx={{ mb: 3 }}>
          <Alert severity="info" sx={{ mb: 2 }}>
            These categories have been soft-deleted. You can restore them to make them active again.
          </Alert>
          
          <TextField
            fullWidth
            placeholder="Search deleted categories..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon />
                </InputAdornment>
              ),
            }}
          />
        </Box>

        {loading?.deletedCategories ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
            <CircularProgress />
          </Box>
        ) : (
          <TableContainer sx={{ overflowX: 'auto', maxHeight: 400 }}>
            <Table 
              size="small" 
              stickyHeader
              sx={{ 
                minWidth: isMobile ? 500 : 600,
                '& .MuiTableCell-root': { 
                  borderBottom: '1px solid rgba(224, 224, 224, 0.4)',
                  py: 0.75,
                  px: 1.5
                }
              }}
            >
              <TableHead>
                <TableRow sx={{ '& .MuiTableCell-head': { fontWeight: 600, backgroundColor: 'grey.50', py: 1 } }}>
                  <TableCell sx={{ width: isMobile ? '40%' : '35%' }}>
                    <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.primary', fontSize: '0.8rem' }}>
                      Category Name
                    </Typography>
                  </TableCell>
                  <TableCell sx={{ width: isMobile ? '25%' : '20%' }}>
                    <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.primary', fontSize: '0.8rem' }}>
                      Level
                    </Typography>
                  </TableCell>
                  {!isMobile && (
                    <TableCell sx={{ width: '20%' }}>
                      <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.primary', fontSize: '0.8rem' }}>
                        Deleted Date
                      </Typography>
                    </TableCell>
                  )}
                  <TableCell align="right" sx={{ width: isMobile ? '35%' : '25%' }}>
                    <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.primary', fontSize: '0.8rem' }}>
                      Actions
                    </Typography>
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredCategories.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={isMobile ? 3 : 4} align="center" sx={{ py: 4 }}>
                      <Typography variant="body1" color="text.secondary">
                        {searchTerm ? 'No deleted categories match your search.' : 'No deleted categories found.'}
                      </Typography>
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredCategories.map((category) => (
                    <TableRow 
                      key={category.id} 
                      hover
                      sx={{
                        '&:hover, &:focus-within': {
                          backgroundColor: 'action.hover',
                          '& .category-actions': {
                            opacity: 1
                          }
                        },
                        transition: 'background-color 0.2s ease',
                        cursor: 'default',
                        height: 48
                      }}
                    >
                      <TableCell>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                          <CategoryIcon 
                            sx={{ 
                              fontSize: 16, 
                              color: 'text.secondary'
                            }} 
                          />
                          <Typography variant="body2" sx={{ fontWeight: 600, lineHeight: 1.2 }}>
                            {category.name}
                          </Typography>
                        </Box>
                      </TableCell>
                      <TableCell>
                        <Chip 
                          label={`Level ${category.level || 0}`} 
                          size="small" 
                          variant="outlined"
                          color="default"
                          sx={{
                            fontSize: '0.7rem',
                            fontWeight: 500,
                            height: 20
                          }}
                        />
                      </TableCell>
                      {!isMobile && (
                        <TableCell>
                          <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.75rem' }}>
                            {category.deletedAt ? formatDate(category.deletedAt) : 'Unknown'}
                          </Typography>
                        </TableCell>
                      )}
                      <TableCell align="right">
                        <Box 
                          className="category-actions"
                          sx={{ 
                            display: 'flex', 
                            justifyContent: 'flex-end',
                            gap: 0.25,
                            opacity: isMobile ? 1 : 0.7,
                            transition: 'opacity 0.2s ease'
                          }}
                        >
                          <Tooltip title="Restore Category">
                            <IconButton 
                              onClick={() => handleRestore(category)}
                              disabled={restoringId === category.id}
                              size="small"
                              sx={{
                                '&:hover': {
                                  backgroundColor: 'success.light',
                                  color: 'success.main'
                                },
                                p: 0.5
                              }}
                            >
                              <RestoreIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Permanently Delete Category">
                            <IconButton 
                              onClick={() => handlePermanentDeleteClick(category)}
                              disabled={permanentDeletingId === category.id}
                              size="small"
                              sx={{
                                '&:hover': {
                                  backgroundColor: 'error.light',
                                  color: 'error.main'
                                },
                                p: 0.5
                              }}
                            >
                              <DeleteForeverIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </Box>
                        {isMobile && category.deletedAt && (
                          <Typography variant="caption" color="text.secondary" sx={{ 
                            display: 'block', 
                            textAlign: 'right', 
                            mt: 0.25,
                            fontSize: '0.65rem'
                          }}>
                            {new Date(category.deletedAt).toLocaleDateString('en-US', {
                              month: 'short',
                              day: 'numeric',
                              year: '2-digit'
                            })}
                          </Typography>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose} variant="outlined">
          Close
        </Button>
      </DialogActions>

      {/* Permanent Delete Confirmation Dialog */}
      <Dialog
        open={confirmDialogOpen}
        onClose={handlePermanentDeleteCancel}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>
          <Typography variant="h6" sx={{ display: 'flex', alignItems: 'center', gap: 1, color: 'error.main' }}>
            <DeleteForeverIcon />
            Permanently Delete Category
          </Typography>
        </DialogTitle>
        <DialogContent>
          <DialogContentText>
            Are you sure you want to permanently delete the category "{categoryToDelete?.name}"?
          </DialogContentText>
          <Alert severity="warning" sx={{ mt: 2 }}>
            <Typography variant="body2" sx={{ fontWeight: 600, mb: 1 }}>
              This action cannot be undone!
            </Typography>
            <Typography variant="body2">
              • The category will be completely removed from the database
              <br />
              • This category must not have any subcategories or products
            </Typography>
          </Alert>
        </DialogContent>
        <DialogActions sx={{ p: 2, gap: 1 }}>
          <Button 
            onClick={handlePermanentDeleteCancel} 
            variant="outlined"
            disabled={permanentDeletingId === categoryToDelete?.id}
          >
            Cancel
          </Button>
          <Button 
            onClick={handlePermanentDeleteConfirm} 
            variant="contained" 
            color="error"
            disabled={permanentDeletingId === categoryToDelete?.id}
            startIcon={permanentDeletingId === categoryToDelete?.id ? <CircularProgress size={16} /> : <DeleteForeverIcon />}
          >
            {permanentDeletingId === categoryToDelete?.id ? 'Deleting...' : 'Permanently Delete'}
          </Button>
        </DialogActions>
      </Dialog>
    </Dialog>
  )
}

export default DeletedCategoriesDialog