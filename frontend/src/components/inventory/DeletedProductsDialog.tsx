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
  Divider,
  CircularProgress,
  Checkbox,
  useTheme,
  useMediaQuery,
} from '@mui/material'
import {
  Search as SearchIcon,
  Restore as RestoreIcon,
  Close as CloseIcon,
  DeleteForever as DeleteForeverIcon,
  Inventory2 as ProductIcon,
} from '@mui/icons-material'
import { useDispatch, useSelector } from 'react-redux'
import { 
  fetchDeletedProducts, 
  restoreProduct,
  bulkRestoreProducts,
  permanentDeleteProduct,
  bulkPermanentDeleteProducts, 
  selectDeletedProducts, 
  selectInventoryLoading,
  fetchProducts
} from '@/store/slices/inventorySlice'
import { useNotification } from '@/hooks/useNotification'
import LoadingSpinner from '@/components/common/LoadingSpinner'
import type { Product } from '@/types'
import { formatCurrency } from '@/utils/currency'
import { formatDate as formatDisplayDate } from '@/utils/formatters'

interface DeletedProductsDialogProps {
  open: boolean
  onClose: () => void
}

const DeletedProductsDialog: React.FC<DeletedProductsDialogProps> = ({ open, onClose }) => {
  const dispatch = useDispatch() as any
  const { showSuccess, showError } = useNotification()
  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down('md'))
  const isTablet = useMediaQuery(theme.breakpoints.down('lg'))
  const deletedProducts = useSelector(selectDeletedProducts) || []
  const loading = useSelector(selectInventoryLoading)
  
  const [searchTerm, setSearchTerm] = useState('')
  const [restoringId, setRestoringId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<Product | null>(null)
  const [selectedProducts, setSelectedProducts] = useState<Set<string>>(new Set())
  const [showBulkConfirm, setShowBulkConfirm] = useState(false)
  const [bulkDeleting, setBulkDeleting] = useState(false)
  const [showBulkRestoreConfirm, setShowBulkRestoreConfirm] = useState(false)
  const [bulkRestoring, setBulkRestoring] = useState(false)

  useEffect(() => {
    if (open) {
      dispatch(fetchDeletedProducts({}))
      // Reset selections when dialog opens
      setSelectedProducts(new Set())
    }
  }, [open, dispatch])

  // Filter products based on search term
  const filteredProducts = deletedProducts.filter(product =>
    product.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    product.barcode?.toLowerCase().includes(searchTerm.toLowerCase())
  )

  // Calculate selection state
  const selectedCount = selectedProducts.size
  const allSelected = filteredProducts.length > 0 && selectedProducts.size === filteredProducts.length
  const partiallySelected = selectedProducts.size > 0 && selectedProducts.size < filteredProducts.length

  const handleRestore = async (product: Product) => {
    setRestoringId(product.id)
    try {
      const result = await dispatch(restoreProduct(product.id))
      
      if (restoreProduct.rejected.match(result)) {
        throw new Error(result.payload as string)
      }
      
      showSuccess(`Product "${product.name}" restored successfully`)
      // Refresh both deleted and active products
      dispatch(fetchDeletedProducts({}))
      dispatch(fetchProducts({}))
    } catch (error: any) {
      console.error('Product restore error:', error)
      const errorMessage = error?.response?.data?.message || error?.message || 'Failed to restore product'
      showError(errorMessage)
    } finally {
      setRestoringId(null)
    }
  }

  const handlePermanentDelete = async (product: Product) => {
    setDeletingId(product.id)
    try {
      const result = await dispatch(permanentDeleteProduct(product.id))
      
      if (permanentDeleteProduct.rejected.match(result)) {
        throw new Error(result.payload as string)
      }
      
      showSuccess(`Product "${product.name}" permanently deleted`)
      // Refresh deleted products list
      dispatch(fetchDeletedProducts({}))
    } catch (error: any) {
      console.error('Product permanent delete error:', error)
      const errorMessage = error?.response?.data?.message || error?.message || 'Failed to permanently delete product'
      showError(errorMessage)
    } finally {
      setDeletingId(null)
      setConfirmDelete(null)
    }
  }

  const handleSelectProduct = (productId: string, checked: boolean) => {
    setSelectedProducts(prev => {
      const newSet = new Set(prev)
      if (checked) {
        newSet.add(productId)
      } else {
        newSet.delete(productId)
      }
      return newSet
    })
  }

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedProducts(new Set(filteredProducts.map(p => p.id)))
    } else {
      setSelectedProducts(new Set())
    }
  }

  const handleBulkRestore = async () => {
    setBulkRestoring(true)
    try {
      const productIds = Array.from(selectedProducts)
      console.log('🔄 Starting bulk restore for products:', productIds)
      const result = await dispatch(bulkRestoreProducts(productIds))

      console.log('📦 Bulk restore result:', result)

      if (bulkRestoreProducts.rejected.match(result)) {
        throw new Error(result.payload as string)
      }

      const payload = result.payload as any
      console.log('📋 Extracted payload:', payload)
      const restoredCount = payload?.restoredCount || 0
      const failedIds = payload?.failedIds || []

      console.log(`✅ Restored count: ${restoredCount}, Failed IDs:`, failedIds)

      if (restoredCount > 0) {
        console.log('🎉 Showing success notification for', restoredCount, 'products')
        showSuccess(`Successfully restored ${restoredCount} products`)
      }

      if (failedIds.length > 0) {
        console.log('❌ Showing error notification for', failedIds.length, 'failed products')
        showError(`Failed to restore ${failedIds.length} products`)
      }

      // Refresh both deleted and active products and clear selections
      dispatch(fetchDeletedProducts({}))
      dispatch(fetchProducts({}))
      setSelectedProducts(new Set())
    } catch (error: any) {
      console.error('Bulk restore error:', error)
      const errorMessage = error?.response?.data?.message || error?.message || 'Failed to bulk restore products'
      showError(errorMessage)
    } finally {
      setBulkRestoring(false)
      setShowBulkRestoreConfirm(false)
    }
  }

  const handleBulkPermanentDelete = async () => {
    setBulkDeleting(true)
    try {
      const productIds = Array.from(selectedProducts)
      const result = await dispatch(bulkPermanentDeleteProducts(productIds))
      
      if (bulkPermanentDeleteProducts.rejected.match(result)) {
        throw new Error(result.payload as string)
      }
      
      const payload = result.payload as any
      const deletedCount = payload?.deletedCount || 0
      const failedIds = payload?.failedIds || []
      
      if (deletedCount > 0) {
        showSuccess(`Successfully permanently deleted ${deletedCount} products`)
      }
      
      if (failedIds.length > 0) {
        showError(`Failed to delete ${failedIds.length} products`)
      }
      
      // Refresh deleted products list and clear selections
      dispatch(fetchDeletedProducts({}))
      setSelectedProducts(new Set())
    } catch (error: any) {
      console.error('Bulk permanent delete error:', error)
      const errorMessage = error?.response?.data?.message || error?.message || 'Failed to bulk delete products'
      showError(errorMessage)
    } finally {
      setBulkDeleting(false)
      setShowBulkConfirm(false)
    }
  }

  const formatDate = (dateString: string) => {
    return formatDisplayDate(dateString)
  }


  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="lg"
      fullWidth
      PaperProps={{ sx: { height: '80vh' } }}
    >
      <DialogTitle>
        <Box display="flex" justifyContent="space-between" alignItems="center">
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <ProductIcon sx={{ color: 'error.main' }} />
            <Typography variant={isMobile ? "h6" : "h5"} sx={{ fontWeight: 700 }}>
              Deleted Products
            </Typography>
          </Box>
          <IconButton onClick={onClose} size="small">
            <CloseIcon />
          </IconButton>
        </Box>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          Manage soft-deleted products ({filteredProducts.length} {searchTerm ? 'found' : 'total'})
        </Typography>
      </DialogTitle>

      <DialogContent>
        <Box sx={{ mb: 3 }}>
          <Alert severity="info" sx={{ mb: 2 }}>
            These products have been soft-deleted. You can restore them or permanently delete them from the database.
            <br />
            <strong>Warning:</strong> Permanent deletion cannot be undone!
          </Alert>
          
          <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
            <TextField
              fullWidth
              placeholder="Search deleted products..."
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

        {loading?.deletedProducts ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
            <CircularProgress />
          </Box>
        ) : (
          <TableContainer sx={{ overflowX: 'auto', maxHeight: 400 }}>
            <Table 
              size="small" 
              stickyHeader
              sx={{ 
                minWidth: isMobile ? 650 : 800,
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
                  <TableCell sx={{ width: isMobile ? '35%' : '40%' }}>
                    <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.primary', fontSize: '0.8rem' }}>
                      Product Name
                    </Typography>
                  </TableCell>
                  <TableCell sx={{ width: isMobile ? '20%' : '20%' }}>
                    <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.primary', fontSize: '0.8rem' }}>
                      Category
                    </Typography>
                  </TableCell>
                  {!isMobile && (
                    <TableCell align="right" sx={{ width: '12%' }}>
                      <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.primary', fontSize: '0.8rem' }}>
                        Price
                      </Typography>
                    </TableCell>
                  )}
                  {!isMobile && (
                    <TableCell sx={{ width: '15%' }}>
                      <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.primary', fontSize: '0.8rem' }}>
                        Deleted Date
                      </Typography>
                    </TableCell>
                  )}
                  <TableCell align="right" sx={{ width: isMobile ? '45%' : '13%' }}>
                    <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.primary', fontSize: '0.8rem' }}>
                      Actions
                    </Typography>
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredProducts.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={isMobile ? 5 : 7} align="center" sx={{ py: 4 }}>
                      <Typography variant="body1" color="text.secondary">
                        {searchTerm ? 'No deleted products match your search.' : 'No deleted products found.'}
                      </Typography>
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredProducts.map((product) => (
                    <TableRow 
                      key={product.id} 
                      hover
                      sx={{
                        '&:hover, &:focus-within': {
                          backgroundColor: 'action.hover',
                          '& .product-actions': {
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
                          checked={selectedProducts.has(product.id)}
                          onChange={(e) => handleSelectProduct(product.id, e.target.checked)}
                          size="small"
                        />
                      </TableCell>
                      <TableCell>
                        <Box>
                          <Typography variant="body2" sx={{ fontWeight: 600, lineHeight: 1.2 }}>
                            {product.name}
                          </Typography>
                          {isMobile && product.pricingTiers && Object.keys(product.pricingTiers).length > 0 && (
                            <Typography variant="caption" color="primary.main" sx={{ fontSize: '0.65rem', fontWeight: 500, mt: 0.25, display: 'block' }}>
                              {formatCurrency(Object.values(product.pricingTiers)[0] as number)}
                            </Typography>
                          )}
                        </Box>
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={product.category?.name || 'No Category'}
                          size="small"
                          variant="outlined"
                          color={product.category ? 'primary' : 'default'}
                          sx={{
                            fontSize: '0.7rem',
                            fontWeight: 500,
                            height: 20
                          }}
                        />
                      </TableCell>
                      {!isMobile && (
                        <TableCell align="right">
                          <Typography variant="body2" sx={{ fontWeight: 500, fontSize: '0.75rem' }} color="primary">
                            {product.pricingTiers && Object.keys(product.pricingTiers).length > 0
                              ? formatCurrency(Object.values(product.pricingTiers)[0] as number)
                              : '-'}
                          </Typography>
                        </TableCell>
                      )}
                      {!isMobile && (
                        <TableCell>
                          <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.75rem' }}>
                            {(product as any).deletedAt ? formatDate((product as any).deletedAt) : 'Unknown'}
                          </Typography>
                        </TableCell>
                      )}
                      <TableCell align="right">
                        <Box 
                          className="product-actions"
                          sx={{ 
                            display: 'flex', 
                            justifyContent: 'flex-end',
                            gap: 0.25,
                            opacity: isMobile ? 1 : 0.7,
                            transition: 'opacity 0.2s ease'
                          }}
                        >
                          <Tooltip title="Restore Product">
                            <IconButton
                              onClick={() => handleRestore(product)}
                              disabled={restoringId === product.id || deletingId === product.id}
                              size="small"
                              sx={{
                                color: 'success.main',
                                '&:hover': {
                                  backgroundColor: 'success.light',
                                  color: 'success.dark'
                                },
                                p: 0.5
                              }}
                            >
                              <RestoreIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Permanently Delete (Cannot be undone)">
                            <IconButton
                              onClick={() => setConfirmDelete(product)}
                              disabled={restoringId === product.id || deletingId === product.id}
                              size="small"
                              sx={{
                                color: 'error.main',
                                '&:hover': {
                                  backgroundColor: 'error.light',
                                  color: 'error.dark'
                                },
                                p: 0.5
                              }}
                            >
                              <DeleteForeverIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </Box>
                        {isMobile && (product as any).deletedAt && (
                          <Typography variant="caption" color="text.secondary" sx={{ 
                            display: 'block', 
                            textAlign: 'right', 
                            mt: 0.25,
                            fontSize: '0.65rem'
                          }}>
                            {formatDate((product as any).deletedAt)}
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
        open={Boolean(confirmDelete)}
        onClose={() => setConfirmDelete(null)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle color="error">
          <Box display="flex" alignItems="center" gap={1}>
            <DeleteForeverIcon color="error" />
            Permanently Delete Product
          </Box>
        </DialogTitle>
        <DialogContent>
          <Alert severity="error" sx={{ mb: 2 }}>
            This action cannot be undone! The product will be completely removed from the database.
          </Alert>
          
          {confirmDelete && (
            <Box>
              <Typography variant="body1" gutterBottom>
                Are you sure you want to permanently delete this product?
              </Typography>
              <Box sx={{ mt: 2, p: 2, bgcolor: 'action.hover', borderRadius: 1 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                  {confirmDelete.name}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Category: {confirmDelete.category?.name || 'No Category'}
                </Typography>
              </Box>
              <Typography variant="body2" sx={{ mt: 2 }} color="text.secondary">
                This will permanently remove the product and all its data from the database.
                The barcode "{confirmDelete.barcode}" will become available for reuse.
              </Typography>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button 
            onClick={() => setConfirmDelete(null)} 
            variant="outlined"
            disabled={deletingId === confirmDelete?.id}
          >
            Cancel
          </Button>
          <Button 
            onClick={() => confirmDelete && handlePermanentDelete(confirmDelete)}
            variant="contained"
            color="error"
            disabled={deletingId === confirmDelete?.id}
            startIcon={deletingId === confirmDelete?.id ? undefined : <DeleteForeverIcon />}
          >
            {deletingId === confirmDelete?.id ? 'Deleting...' : 'Permanently Delete'}
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
            Bulk Restore Products
          </Box>
        </DialogTitle>
        <DialogContent>
          <Alert severity="success" sx={{ mb: 2 }}>
            This will restore the selected products back to active status and make them available for use.
          </Alert>
          
          <Typography variant="body1" gutterBottom>
            Are you sure you want to restore <strong>{selectedCount}</strong> selected products?
          </Typography>
          
          {selectedCount <= 5 && (
            <Box sx={{ mt: 2, p: 2, bgcolor: 'action.hover', borderRadius: 1 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
                Products to be restored:
              </Typography>
              {Array.from(selectedProducts).slice(0, 5).map(productId => {
                const product = filteredProducts.find((p: Product) => p.id === productId)
                return product ? (
                  <Box key={productId} sx={{ mb: 0.5 }}>
                    <Typography variant="body2">
                      • {product.name}
                    </Typography>
                  </Box>
                ) : null
              })}
            </Box>
          )}
          
          <Typography variant="body2" sx={{ mt: 2 }} color="text.secondary">
            This will move the selected products back to the active products list and make them available for orders and inventory management.
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
            {bulkRestoring ? 'Restoring...' : `Restore ${selectedCount} Products`}
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
            This action cannot be undone! The selected products will be completely removed from the database.
          </Alert>
          
          <Typography variant="body1" gutterBottom>
            Are you sure you want to permanently delete <strong>{selectedCount}</strong> selected products?
          </Typography>
          
          {selectedCount <= 5 && (
            <Box sx={{ mt: 2, p: 2, bgcolor: 'action.hover', borderRadius: 1 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
                Products to be deleted:
              </Typography>
              {Array.from(selectedProducts).slice(0, 5).map(productId => {
                const product = filteredProducts.find((p: Product) => p.id === productId)
                return product ? (
                  <Box key={productId} sx={{ mb: 0.5 }}>
                    <Typography variant="body2">
                      • {product.name}
                    </Typography>
                  </Box>
                ) : null
              })}
            </Box>
          )}
          
          <Typography variant="body2" sx={{ mt: 2 }} color="text.secondary">
            This will permanently remove all selected products and their data from the database.
            Their barcodes will become available for reuse.
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
            {bulkDeleting ? 'Deleting...' : `Delete ${selectedCount} Products`}
          </Button>
        </DialogActions>
      </Dialog>
    </Dialog>
  )
}

export default DeletedProductsDialog
