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
  Avatar,
  Stack,
  Checkbox,
  useTheme,
  useMediaQuery,
} from '@mui/material'
import {
  Search as SearchIcon,
  Restore as RestoreIcon,
  Close as CloseIcon,
  Person as PersonIcon,
  Business as BusinessIcon,
  Email as EmailIcon,
  Phone as PhoneIcon,
  DeleteForever as DeleteForeverIcon,
} from '@mui/icons-material'
import { useDispatch, useSelector } from 'react-redux'
import { 
  fetchDeletedCustomers, 
  restoreCustomer,
  bulkRestoreCustomers,
  permanentDeleteCustomer,
  bulkPermanentDeleteCustomers,
  selectDeletedCustomers, 
  selectSalesLoading,
  fetchCustomers
} from '@/store/slices/salesSlice'
import { useNotification } from '@/hooks/useNotification'
import type { Customer } from '@/types'
import { CustomerType, CustomerStatus } from '@/types'
import { formatCurrency } from '@/utils/currency'

interface DeletedCustomersDialogProps {
  open: boolean
  onClose: () => void
}

const DeletedCustomersDialog: React.FC<DeletedCustomersDialogProps> = ({ open, onClose }) => {
  const dispatch = useDispatch() as any
  const { showSuccess, showError } = useNotification()
  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down('md'))
  const isTablet = useMediaQuery(theme.breakpoints.down('lg'))
  const deletedCustomers = useSelector(selectDeletedCustomers) || []
  const loading = useSelector(selectSalesLoading)
  
  const [searchTerm, setSearchTerm] = useState('')
  const [restoringId, setRestoringId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<Customer | null>(null)
  const [selectedCustomers, setSelectedCustomers] = useState<Set<string>>(new Set())
  const [showBulkConfirm, setShowBulkConfirm] = useState(false)
  const [bulkDeleting, setBulkDeleting] = useState(false)
  const [showBulkRestoreConfirm, setShowBulkRestoreConfirm] = useState(false)
  const [bulkRestoring, setBulkRestoring] = useState(false)

  useEffect(() => {
    if (open) {
      dispatch(fetchDeletedCustomers({}))
      // Reset selections when dialog opens
      setSelectedCustomers(new Set())
    }
  }, [open, dispatch])

  // Filter customers based on search term
  const filteredCustomers = deletedCustomers.filter(customer => 
    customer.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    customer.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    customer.phone?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    customer.customerCode?.toLowerCase().includes(searchTerm.toLowerCase())
  )

  // Calculate selection state
  const selectedCount = selectedCustomers.size
  const allSelected = filteredCustomers.length > 0 && selectedCustomers.size === filteredCustomers.length
  const partiallySelected = selectedCustomers.size > 0 && selectedCustomers.size < filteredCustomers.length

  const handleRestore = async (customer: Customer) => {
    setRestoringId(customer.id)
    try {
      const result = await dispatch(restoreCustomer(customer.id))
      
      if (restoreCustomer.rejected.match(result)) {
        throw new Error(result.payload as string)
      }
      
      showSuccess(`Customer "${customer.name}" restored successfully`)
      
      // Refresh both deleted and active customers
      dispatch(fetchDeletedCustomers({}))
      dispatch(fetchCustomers({}))
    } catch (error: any) {
      console.error('Customer restore error:', error)
      const errorMessage = error?.response?.data?.message || error?.message || 'Failed to restore customer'
      showError(errorMessage)
    } finally {
      setRestoringId(null)
    }
  }

  const handlePermanentDelete = async (customer: Customer) => {
    setDeletingId(customer.id)
    try {
      const result = await dispatch(permanentDeleteCustomer(customer.id))
      
      if (permanentDeleteCustomer.rejected.match(result)) {
        throw new Error(result.payload as string)
      }
      
      showSuccess(`Customer "${customer.name}" permanently deleted`)
      // Refresh deleted customers list
      dispatch(fetchDeletedCustomers({}))
    } catch (error: any) {
      console.error('Customer permanent delete error:', error)
      const errorMessage = error?.response?.data?.message || error?.message || 'Failed to permanently delete customer'
      showError(errorMessage)
    } finally {
      setDeletingId(null)
      setConfirmDelete(null)
    }
  }

  const handleSelectCustomer = (customerId: string, checked: boolean) => {
    setSelectedCustomers(prev => {
      const newSet = new Set(prev)
      if (checked) {
        newSet.add(customerId)
      } else {
        newSet.delete(customerId)
      }
      return newSet
    })
  }

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedCustomers(new Set(filteredCustomers.map(c => c.id)))
    } else {
      setSelectedCustomers(new Set())
    }
  }

  const handleBulkRestore = async () => {
    setBulkRestoring(true)
    try {
      const customerIds = Array.from(selectedCustomers)
      const result = await dispatch(bulkRestoreCustomers(customerIds))
      
      if (bulkRestoreCustomers.rejected.match(result)) {
        throw new Error(result.payload as string)
      }
      
      const payload = result.payload as any
      const restoredCount = payload?.restoredCount || 0
      const failedIds = payload?.failedIds || []
      
      if (restoredCount > 0) {
        showSuccess(`Successfully restored ${restoredCount} customers`)
      }
      
      if (failedIds.length > 0) {
        showError(`Failed to restore ${failedIds.length} customers`)
      }
      
      // Refresh both deleted and active customers and clear selections
      dispatch(fetchDeletedCustomers({}))
      dispatch(fetchCustomers({}))
      setSelectedCustomers(new Set())
    } catch (error: any) {
      console.error('Bulk restore error:', error)
      const errorMessage = error?.response?.data?.message || error?.message || 'Failed to bulk restore customers'
      showError(errorMessage)
    } finally {
      setBulkRestoring(false)
      setShowBulkRestoreConfirm(false)
    }
  }

  const handleBulkPermanentDelete = async () => {
    setBulkDeleting(true)
    try {
      const customerIds = Array.from(selectedCustomers)
      const result = await dispatch(bulkPermanentDeleteCustomers(customerIds))
      
      if (bulkPermanentDeleteCustomers.rejected.match(result)) {
        throw new Error(result.payload as string)
      }
      
      const payload = result.payload as any
      const deletedCount = payload?.deletedCount || 0
      const failedIds = payload?.failedIds || []
      
      if (deletedCount > 0) {
        showSuccess(`Successfully permanently deleted ${deletedCount} customers`)
      }
      
      if (failedIds.length > 0) {
        showError(`Failed to delete ${failedIds.length} customers`)
      }
      
      // Refresh deleted customers list and clear selections
      dispatch(fetchDeletedCustomers({}))
      setSelectedCustomers(new Set())
    } catch (error: any) {
      console.error('Bulk permanent delete error:', error)
      const errorMessage = error?.response?.data?.message || error?.message || 'Failed to bulk delete customers'
      showError(errorMessage)
    } finally {
      setBulkDeleting(false)
      setShowBulkConfirm(false)
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    })
  }

  const getCustomerTypeIcon = (type: CustomerType) => {
    return type === CustomerType.BUSINESS ? <BusinessIcon /> : <PersonIcon />
  }

  const getStatusChip = (status: CustomerStatus, isActive: boolean) => {
    if (!isActive) {
      return <Chip label="Inactive" size="small" color="default" />
    }
    
    switch (status) {
      case CustomerStatus.ACTIVE:
        return <Chip label="Active" size="small" color="success" />
      case CustomerStatus.SUSPENDED:
        return <Chip label="Suspended" size="small" color="warning" />
      case CustomerStatus.BLACKLISTED:
        return <Chip label="Blacklisted" size="small" color="error" />
      default:
        return <Chip label="Inactive" size="small" color="default" />
    }
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
            <PersonIcon sx={{ color: 'error.main' }} />
            <Typography variant={isMobile ? "h6" : "h5"} sx={{ fontWeight: 700 }}>
              Deleted Customers
            </Typography>
          </Box>
          <IconButton onClick={onClose} size="small">
            <CloseIcon />
          </IconButton>
        </Box>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          Manage soft-deleted customers ({filteredCustomers.length} {searchTerm ? 'found' : 'total'})
        </Typography>
      </DialogTitle>

      <DialogContent>
        <Box sx={{ mb: 3 }}>
          <Alert severity="info" sx={{ mb: 2 }}>
            These customers have been soft-deleted. You can restore them or permanently delete them from the database.
            <br />
            <strong>Warning:</strong> Permanent deletion cannot be undone!
          </Alert>
          
          <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
            <TextField
              fullWidth
              placeholder="Search deleted customers..."
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

        {loading?.deletedCustomers ? (
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
                  <TableCell sx={{ width: isMobile ? '35%' : '30%' }}>
                    <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.primary', fontSize: '0.8rem' }}>
                      Customer Details
                    </Typography>
                  </TableCell>
                  <TableCell sx={{ width: isMobile ? '20%' : '15%' }}>
                    <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.primary', fontSize: '0.8rem' }}>
                      Type
                    </Typography>
                  </TableCell>
                  {!isMobile && (
                    <TableCell sx={{ width: '20%' }}>
                      <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.primary', fontSize: '0.8rem' }}>
                        Contact
                      </Typography>
                    </TableCell>
                  )}
                  <TableCell sx={{ width: isMobile ? '20%' : '15%' }}>
                    <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.primary', fontSize: '0.8rem' }}>
                      Status
                    </Typography>
                  </TableCell>
                  {!isMobile && (
                    <TableCell sx={{ width: '15%' }}>
                      <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.primary', fontSize: '0.8rem' }}>
                        Deleted Date
                      </Typography>
                    </TableCell>
                  )}
                  <TableCell align="right" sx={{ width: isMobile ? '25%' : '13%' }}>
                    <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.primary', fontSize: '0.8rem' }}>
                      Actions
                    </Typography>
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredCustomers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={isMobile ? 6 : 7} align="center" sx={{ py: 4 }}>
                      <Typography variant="body1" color="text.secondary">
                        {searchTerm ? 'No deleted customers match your search.' : 'No deleted customers found.'}
                      </Typography>
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredCustomers.map((customer) => (
                    <TableRow 
                      key={customer.id} 
                      hover
                      sx={{
                        '&:hover, &:focus-within': {
                          backgroundColor: 'action.hover',
                          '& .customer-actions': {
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
                          checked={selectedCustomers.has(customer.id)}
                          onChange={(e) => handleSelectCustomer(customer.id, e.target.checked)}
                          size="small"
                        />
                      </TableCell>
                      <TableCell>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                          <Avatar sx={{ bgcolor: 'primary.main', width: 32, height: 32 }}>
                            {getCustomerTypeIcon(customer.type)}
                          </Avatar>
                          <Box>
                            <Typography variant="body2" sx={{ fontWeight: 600, lineHeight: 1.2 }}>
                              {customer.name}
                            </Typography>
                            <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem' }}>
                              {customer.customerCode}
                            </Typography>
                            {isMobile && (
                              <Box sx={{ mt: 0.25, display: 'flex', gap: 0.5, alignItems: 'center' }}>
                                {customer.email && (
                                  <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem' }}>
                                    {customer.email}
                                  </Typography>
                                )}
                              </Box>
                            )}
                          </Box>
                        </Box>
                      </TableCell>
                      <TableCell>
                        <Chip 
                          label={customer.type === CustomerType.BUSINESS ? 'Business' : 'Individual'}
                          size="small"
                          variant="outlined"
                          sx={{
                            fontSize: '0.7rem',
                            fontWeight: 500,
                            height: 20
                          }}
                        />
                      </TableCell>
                      {!isMobile && (
                        <TableCell>
                          <Stack spacing={0.5}>
                            {customer.email && (
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                <EmailIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
                                <Typography variant="caption" sx={{ fontSize: '0.7rem' }}>{customer.email}</Typography>
                              </Box>
                            )}
                            {customer.phone && (
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                <PhoneIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
                                <Typography variant="caption" sx={{ fontSize: '0.7rem' }}>{customer.phone}</Typography>
                              </Box>
                            )}
                          </Stack>
                        </TableCell>
                      )}
                      <TableCell>
                        {getStatusChip(customer.status, customer.isActive)}
                      </TableCell>
                      {!isMobile && (
                        <TableCell>
                          <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.75rem' }}>
                            {(customer as any).deletedAt ? formatDate((customer as any).deletedAt) : 'Unknown'}
                          </Typography>
                        </TableCell>
                      )}
                      <TableCell align="right">
                        <Box 
                          className="customer-actions"
                          sx={{ 
                            display: 'flex', 
                            justifyContent: 'flex-end',
                            gap: 0.25,
                            opacity: isMobile ? 1 : 0.7,
                            transition: 'opacity 0.2s ease'
                          }}
                        >
                          <Tooltip title="Restore Customer">
                            <IconButton 
                              onClick={() => handleRestore(customer)}
                              disabled={restoringId === customer.id || deletingId === customer.id}
                              size="small"
                              sx={{
                                '&:hover': {
                                  backgroundColor: 'success.light',
                                  color: 'success.main'
                                },
                                p: 0.5
                              }}
                            >
                              {restoringId === customer.id ? (
                                <CircularProgress size={16} />
                              ) : (
                                <RestoreIcon fontSize="small" />
                              )}
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Permanently Delete (Cannot be undone)">
                            <IconButton 
                              onClick={() => setConfirmDelete(customer)}
                              disabled={restoringId === customer.id || deletingId === customer.id}
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
                        {isMobile && (customer as any).deletedAt && (
                          <Typography variant="caption" color="text.secondary" sx={{ 
                            display: 'block', 
                            textAlign: 'right', 
                            mt: 0.25,
                            fontSize: '0.65rem'
                          }}>
                            {new Date((customer as any).deletedAt).toLocaleDateString('en-US', {
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
            Permanently Delete Customer
          </Box>
        </DialogTitle>
        <DialogContent>
          <Alert severity="error" sx={{ mb: 2 }}>
            This action cannot be undone! The customer will be completely removed from the database.
          </Alert>
          
          {confirmDelete && (
            <Box>
              <Typography variant="body1" gutterBottom>
                Are you sure you want to permanently delete this customer?
              </Typography>
              <Box sx={{ mt: 2, p: 2, bgcolor: 'grey.100', borderRadius: 1 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                  {confirmDelete.name}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Customer Code: {confirmDelete.customerCode}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Email: {confirmDelete.email || 'N/A'}
                </Typography>
              </Box>
              <Typography variant="body2" sx={{ mt: 2 }} color="text.secondary">
                This will permanently remove the customer and all related data from the database.
                The customer code "{confirmDelete.customerCode}" will become available for reuse.
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
            Bulk Restore Customers
          </Box>
        </DialogTitle>
        <DialogContent>
          <Alert severity="success" sx={{ mb: 2 }}>
            This will restore the selected customers back to active status and make them available for use.
          </Alert>
          
          <Typography variant="body1" gutterBottom>
            Are you sure you want to restore <strong>{selectedCount}</strong> selected customers?
          </Typography>
          
          {selectedCount <= 5 && (
            <Box sx={{ mt: 2, p: 2, bgcolor: 'grey.100', borderRadius: 1 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
                Customers to be restored:
              </Typography>
              {Array.from(selectedCustomers).slice(0, 5).map(customerId => {
                const customer = filteredCustomers.find((c: Customer) => c.id === customerId)
                return customer ? (
                  <Box key={customerId} sx={{ mb: 0.5 }}>
                    <Typography variant="body2">
                      • {customer.name} ({customer.customerCode})
                    </Typography>
                  </Box>
                ) : null
              })}
            </Box>
          )}
          
          <Typography variant="body2" sx={{ mt: 2 }} color="text.secondary">
            This will move the selected customers back to the active customers list and make them available for orders and sales.
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
            {bulkRestoring ? 'Restoring...' : `Restore ${selectedCount} Customers`}
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
            This action cannot be undone! The selected customers will be completely removed from the database.
          </Alert>
          
          <Typography variant="body1" gutterBottom>
            Are you sure you want to permanently delete <strong>{selectedCount}</strong> selected customers?
          </Typography>
          
          {selectedCount <= 5 && (
            <Box sx={{ mt: 2, p: 2, bgcolor: 'grey.100', borderRadius: 1 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
                Customers to be deleted:
              </Typography>
              {Array.from(selectedCustomers).slice(0, 5).map(customerId => {
                const customer = filteredCustomers.find((c: Customer) => c.id === customerId)
                return customer ? (
                  <Box key={customerId} sx={{ mb: 0.5 }}>
                    <Typography variant="body2">
                      • {customer.name} ({customer.customerCode})
                    </Typography>
                  </Box>
                ) : null
              })}
            </Box>
          )}
          
          <Typography variant="body2" sx={{ mt: 2 }} color="text.secondary">
            This will permanently remove all selected customers and their data from the database.
            Their customer codes will become available for reuse.
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
            {bulkDeleting ? 'Deleting...' : `Delete ${selectedCount} Customers`}
          </Button>
        </DialogActions>
      </Dialog>
    </Dialog>
  )
}

export default DeletedCustomersDialog