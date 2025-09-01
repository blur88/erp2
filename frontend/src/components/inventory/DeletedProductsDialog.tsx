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
} from '@mui/material'
import {
  Search as SearchIcon,
  Restore as RestoreIcon,
  Close as CloseIcon,
  DeleteForever as DeleteForeverIcon,
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
          <Typography variant="h6">Deleted Products</Typography>
          <IconButton onClick={onClose}>
            <CloseIcon />
          </IconButton>
        </Box>
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
          <LoadingSpinner message="Loading deleted products..." />
        ) : (
          <TableContainer component={Paper} sx={{ maxHeight: 400 }}>
            <Table stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell>Name</TableCell>
                  <TableCell>SKU</TableCell>
                  <TableCell>Category</TableCell>
                  <TableCell align="right">Price</TableCell>
                  <TableCell>Deleted At</TableCell>
                  <TableCell align="center">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredProducts.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} align="center">
                      <Typography variant="body2" color="text.secondary">
                        {searchTerm ? 'No deleted products match your search.' : 'No deleted products found.'}
                      </Typography>
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredProducts.map((product) => (
                    <TableRow key={product.id} hover>
                      <TableCell>
                        <Box>
                          <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                            {product.name}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {product.description}
                          </Typography>
                        </Box>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                          {product.sku}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Chip 
                          label={product.category?.name || 'No Category'} 
                          size="small" 
                          variant="outlined"
                        />
                      </TableCell>
                      <TableCell align="right">
                        <Typography variant="subtitle2" color="primary">
                          ${(product.retailPrice || 0).toFixed(2)}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2">
                          {(product as any).deletedAt ? formatDate((product as any).deletedAt) : 'Unknown'}
                        </Typography>
                      </TableCell>
                      <TableCell align="center">
                        <Box display="flex" gap={1} justifyContent="center">
                          <Tooltip title="Restore Product">
                            <IconButton 
                              onClick={() => handleRestore(product)}
                              disabled={restoringId === product.id || deletingId === product.id}
                              color="primary"
                              size="small"
                            >
                              <RestoreIcon />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Permanently Delete (Cannot be undone)">
                            <IconButton 
                              onClick={() => setConfirmDelete(product)}
                              disabled={restoringId === product.id || deletingId === product.id}
                              color="error"
                              size="small"
                            >
                              <DeleteForeverIcon />
                            </IconButton>
                          </Tooltip>
                        </Box>
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