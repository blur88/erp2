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
  permanentDeleteProduct, 
  selectDeletedProducts, 
  selectInventoryLoading,
  fetchProducts
} from '@/store/slices/inventorySlice'
import { useNotification } from '@/hooks/useNotification'
import LoadingSpinner from '@/components/common/LoadingSpinner'
import type { Product } from '@/types'

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

  useEffect(() => {
    if (open) {
      dispatch(fetchDeletedProducts({}))
    }
  }, [open, dispatch])

  // Filter products based on search term
  const filteredProducts = deletedProducts.filter(product => 
    product.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    product.sku?.toLowerCase().includes(searchTerm.toLowerCase())
  )

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

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    })
  }

  const formatDateTime = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
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
          />
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
                  <TableCell sx={{ width: isMobile ? '35%' : '30%' }}>
                    <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.primary', fontSize: '0.8rem' }}>
                      Product Details
                    </Typography>
                  </TableCell>
                  {!isMobile && (
                    <TableCell sx={{ width: '15%' }}>
                      <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.primary', fontSize: '0.8rem' }}>
                        SKU
                      </Typography>
                    </TableCell>
                  )}
                  <TableCell sx={{ width: isMobile ? '20%' : '15%' }}>
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
                    <TableCell colSpan={isMobile ? 4 : 6} align="center" sx={{ py: 4 }}>
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
                      <TableCell>
                        <Box>
                          <Typography variant="body2" sx={{ fontWeight: 600, lineHeight: 1.2 }}>
                            {product.name}
                          </Typography>
                          {product.description && (
                            <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem' }}>
                              {product.description}
                            </Typography>
                          )}
                          {isMobile && (
                            <Box sx={{ mt: 0.25, display: 'flex', gap: 0.5, alignItems: 'center' }}>
                              <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace', fontSize: '0.65rem' }}>
                                {product.sku}
                              </Typography>
                              {product.retailPrice && (
                                <Typography variant="caption" color="primary.main" sx={{ fontSize: '0.65rem', fontWeight: 500 }}>
                                  • ${(product.retailPrice || 0).toFixed(2)}
                                </Typography>
                              )}
                            </Box>
                          )}
                        </Box>
                      </TableCell>
                      {!isMobile && (
                        <TableCell>
                          <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>
                            {product.sku}
                          </Typography>
                        </TableCell>
                      )}
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
                            ${(product.retailPrice || 0).toFixed(2)}
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
                          <Tooltip title="Permanently Delete (Cannot be undone)">
                            <IconButton 
                              onClick={() => setConfirmDelete(product)}
                              disabled={restoringId === product.id || deletingId === product.id}
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
                        {isMobile && (product as any).deletedAt && (
                          <Typography variant="caption" color="text.secondary" sx={{ 
                            display: 'block', 
                            textAlign: 'right', 
                            mt: 0.25,
                            fontSize: '0.65rem'
                          }}>
                            {new Date((product as any).deletedAt).toLocaleDateString('en-US', {
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
              <Box sx={{ mt: 2, p: 2, bgcolor: 'grey.100', borderRadius: 1 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                  {confirmDelete.name}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  SKU: {confirmDelete.sku}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Category: {confirmDelete.category?.name || 'No Category'}
                </Typography>
              </Box>
              <Typography variant="body2" sx={{ mt: 2 }} color="text.secondary">
                This will permanently remove the product and all its data from the database.
                The SKU "{confirmDelete.sku}" will become available for reuse.
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
    </Dialog>
  )
}

export default DeletedProductsDialog