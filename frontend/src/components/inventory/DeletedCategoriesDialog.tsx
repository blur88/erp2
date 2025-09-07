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
  Checkbox,
  Divider,
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
  bulkRestoreCategories,
  bulkPermanentDeleteCategories,
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
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(new Set())
  const [showBulkConfirm, setShowBulkConfirm] = useState(false)
  const [bulkDeleting, setBulkDeleting] = useState(false)
  const [showBulkRestoreConfirm, setShowBulkRestoreConfirm] = useState(false)
  const [bulkRestoring, setBulkRestoring] = useState(false)

  useEffect(() => {
    if (open) {
      dispatch(fetchDeletedCategories({}))
      // Reset selections when dialog opens
      setSelectedCategories(new Set())
    }
  }, [open, dispatch])

  // Filter categories based on search term
  const filteredCategories = deletedCategories.filter(category => 
    category.name?.toLowerCase().includes(searchTerm.toLowerCase())
  )

  // Calculate selection state
  const selectedCount = selectedCategories.size
  const allSelected = filteredCategories.length > 0 && selectedCategories.size === filteredCategories.length
  const partiallySelected = selectedCategories.size > 0 && selectedCategories.size < filteredCategories.length

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

  const handleSelectCategory = (categoryId: string, checked: boolean) => {
    setSelectedCategories(prev => {
      const newSet = new Set(prev)
      if (checked) {
        newSet.add(categoryId)
      } else {
        newSet.delete(categoryId)
      }
      return newSet
    })
  }

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedCategories(new Set(filteredCategories.map(c => c.id)))
    } else {
      setSelectedCategories(new Set())
    }
  }

  const handleBulkRestore = async () => {
    setBulkRestoring(true)
    try {
      const categoryIds = Array.from(selectedCategories)
      const result = await dispatch(bulkRestoreCategories(categoryIds))
      
      if (bulkRestoreCategories.rejected.match(result)) {
        throw new Error(result.payload as string)
      }
      
      const payload = result.payload as any
      const restoredCount = payload?.restoredCount || 0
      const failedIds = payload?.failedIds || []
      
      if (restoredCount > 0) {
        showSuccess(`Successfully restored ${restoredCount} categories`)
      }
      
      if (failedIds.length > 0) {
        showError(`Failed to restore ${failedIds.length} categories`)
      }
      
      // Refresh data and clear selections
      dispatch(fetchDeletedCategories({}))
      setSelectedCategories(new Set())
      onCategoryRestored?.()
    } catch (error: any) {
      console.error('Bulk restore error:', error)
      const errorMessage = error?.response?.data?.message || error?.message || 'Failed to bulk restore categories'
      showError(errorMessage)
    } finally {
      setBulkRestoring(false)
      setShowBulkRestoreConfirm(false)
    }
  }

  const handleBulkPermanentDelete = async () => {
    setBulkDeleting(true)
    try {
      const categoryIds = Array.from(selectedCategories)
      const result = await dispatch(bulkPermanentDeleteCategories(categoryIds))
      
      if (bulkPermanentDeleteCategories.rejected.match(result)) {
        throw new Error(result.payload as string)
      }
      
      const payload = result.payload as any
      const deletedCount = payload?.deletedCount || 0
      const failedIds = payload?.failedIds || []
      
      if (deletedCount > 0) {
        showSuccess(`Successfully permanently deleted ${deletedCount} categories`)
      }
      
      if (failedIds.length > 0) {
        showError(`Failed to delete ${failedIds.length} categories`)
      }
      
      // Refresh data and clear selections
      dispatch(fetchDeletedCategories({}))
      setSelectedCategories(new Set())
      onCategoryRestored?.()
    } catch (error: any) {
      console.error('Bulk permanent delete error:', error)
      const errorMessage = error?.response?.data?.message || error?.message || 'Failed to bulk delete categories'
      showError(errorMessage)
    } finally {
      setBulkDeleting(false)
      setShowBulkConfirm(false)
    }
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
            <br />
            <strong>Warning:</strong> Permanent deletion cannot be undone!
          </Alert>
          
          <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
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
              sx={{ flex: 1, minWidth: '300px' }}
            />
            
            {selectedCount > 0 && (
              <>
                <Button
                  variant="contained"
                  color="success"
                  startIcon={<RestoreIcon />}
                  onClick={() => setShowBulkRestoreConfirm(true)}
                  disabled={bulkRestoring || bulkDeleting}
                  sx={{ whiteSpace: 'nowrap' }}
                >
                  Restore Selected ({selectedCount})
                </Button>
                <Button
                  variant="contained"
                  color="error"
                  startIcon={<DeleteForeverIcon />}
                  onClick={() => setShowBulkConfirm(true)}
                  disabled={bulkDeleting || bulkRestoring}
                  sx={{ whiteSpace: 'nowrap' }}
                >
                  Delete Selected ({selectedCount})
                </Button>
              </>
            )}
          </Box>
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
                  <TableCell sx={{ width: '48px', padding: '8px' }}>
                    <Checkbox
                      checked={allSelected}
                      indeterminate={partiallySelected}
                      onChange={(e) => handleSelectAll(e.target.checked)}
                      size="small"
                    />
                  </TableCell>
                  <TableCell sx={{ width: isMobile ? '35%' : '30%' }}>
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
                  <TableCell align="right" sx={{ width: isMobile ? '30%' : '25%' }}>
                    <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.primary', fontSize: '0.8rem' }}>
                      Actions
                    </Typography>
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredCategories.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={isMobile ? 4 : 5} align="center" sx={{ py: 4 }}>
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
                      <TableCell sx={{ padding: '8px' }}>
                        <Checkbox
                          checked={selectedCategories.has(category.id)}
                          onChange={(e) => handleSelectCategory(category.id, e.target.checked)}
                          size="small"
                        />
                      </TableCell>
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

      {/* Bulk Restore Confirmation Dialog */}
      <Dialog
        open={showBulkRestoreConfirm}
        onClose={() => !bulkRestoring && setShowBulkRestoreConfirm(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle color="success">
          <Box display="flex" alignItems="center" gap={1}>
            <RestoreIcon color="success" />
            Bulk Restore Categories
          </Box>
        </DialogTitle>
        <DialogContent>
          <Alert severity="success" sx={{ mb: 2 }}>
            This will restore the selected categories back to active status and make them available for use.
          </Alert>
          
          <Typography variant="body1" gutterBottom>
            Are you sure you want to restore <strong>{selectedCount}</strong> selected categories?
          </Typography>
          
          {selectedCount <= 5 && (
            <Box sx={{ mt: 2, p: 2, bgcolor: 'grey.100', borderRadius: 1 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
                Categories to be restored:
              </Typography>
              {Array.from(selectedCategories).slice(0, 5).map(categoryId => {
                const category = filteredCategories.find((c: Category) => c.id === categoryId)
                return category ? (
                  <Box key={categoryId} sx={{ mb: 0.5 }}>
                    <Typography variant="body2">
                      • {category.name} (Level {category.level || 0})
                    </Typography>
                  </Box>
                ) : null
              })}
            </Box>
          )}
          
          <Typography variant="body2" sx={{ mt: 2 }} color="text.secondary">
            This will move the selected categories back to the active categories list.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button 
            onClick={() => setShowBulkRestoreConfirm(false)} 
            variant="outlined"
            disabled={bulkRestoring}
          >
            Cancel
          </Button>
          <Button 
            onClick={handleBulkRestore}
            variant="contained"
            color="success"
            disabled={bulkRestoring}
            startIcon={bulkRestoring ? <CircularProgress size={16} /> : <RestoreIcon />}
          >
            {bulkRestoring ? 'Restoring...' : `Restore ${selectedCount} Categories`}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Bulk Delete Confirmation Dialog */}
      <Dialog
        open={showBulkConfirm}
        onClose={() => !bulkDeleting && setShowBulkConfirm(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle color="error">
          <Box display="flex" alignItems="center" gap={1}>
            <DeleteForeverIcon color="error" />
            Bulk Permanent Delete
          </Box>
        </DialogTitle>
        <DialogContent>
          <Alert severity="error" sx={{ mb: 2 }}>
            This action cannot be undone! The selected categories will be completely removed from the database.
          </Alert>
          
          <Typography variant="body1" gutterBottom>
            Are you sure you want to permanently delete <strong>{selectedCount}</strong> selected categories?
          </Typography>
          
          {selectedCount <= 5 && (
            <Box sx={{ mt: 2, p: 2, bgcolor: 'grey.100', borderRadius: 1 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
                Categories to be deleted:
              </Typography>
              {Array.from(selectedCategories).slice(0, 5).map(categoryId => {
                const category = filteredCategories.find((c: Category) => c.id === categoryId)
                return category ? (
                  <Box key={categoryId} sx={{ mb: 0.5 }}>
                    <Typography variant="body2">
                      • {category.name} (Level {category.level || 0})
                    </Typography>
                  </Box>
                ) : null
              })}
            </Box>
          )}
          
          <Typography variant="body2" sx={{ mt: 2 }} color="text.secondary">
            This will permanently remove all selected categories and their data from the database.
            Categories must not have any subcategories or products assigned.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button 
            onClick={() => setShowBulkConfirm(false)} 
            variant="outlined"
            disabled={bulkDeleting}
          >
            Cancel
          </Button>
          <Button 
            onClick={handleBulkPermanentDelete}
            variant="contained"
            color="error"
            disabled={bulkDeleting}
            startIcon={bulkDeleting ? <CircularProgress size={16} /> : <DeleteForeverIcon />}
          >
            {bulkDeleting ? 'Deleting...' : `Delete ${selectedCount} Categories`}
          </Button>
        </DialogActions>
      </Dialog>
    </Dialog>
  )
}

export default DeletedCategoriesDialog