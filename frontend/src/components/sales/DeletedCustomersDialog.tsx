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
} from '@mui/icons-material'
import { useDispatch, useSelector } from 'react-redux'
import { 
  fetchDeletedCustomers, 
  restoreCustomer,
  selectDeletedCustomers, 
  selectCustomersLoading,
  fetchCustomers
} from '@/store/slices/customerSlice'
import { addNotification } from '@/store/slices/notificationSlice'
import type { Customer } from '@/types'
import { CustomerType, CustomerStatus } from '@/types'
import { formatCurrency } from '@/utils/currency'

interface DeletedCustomersDialogProps {
  open: boolean
  onClose: () => void
}

const DeletedCustomersDialog: React.FC<DeletedCustomersDialogProps> = ({ open, onClose }) => {
  const dispatch = useDispatch() as any
  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down('md'))
  const isTablet = useMediaQuery(theme.breakpoints.down('lg'))
  const deletedCustomers = useSelector(selectDeletedCustomers) || []
  const loading = useSelector(selectCustomersLoading)
  
  const [searchTerm, setSearchTerm] = useState('')
  const [restoringId, setRestoringId] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      dispatch(fetchDeletedCustomers({}))
    }
  }, [open, dispatch])

  // Filter customers based on search term
  const filteredCustomers = deletedCustomers.filter(customer => 
    customer.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    customer.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    customer.phone?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    customer.customerCode?.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const handleRestore = async (customer: Customer) => {
    setRestoringId(customer.id)
    try {
      const result = await dispatch(restoreCustomer(customer.id))
      
      if (restoreCustomer.rejected.match(result)) {
        throw new Error(result.payload as string)
      }
      
      dispatch(addNotification({
        message: `Customer "${customer.name}" restored successfully`,
        type: 'success',
        title: 'Success'
      }))
      
      // Refresh both deleted and active customers
      dispatch(fetchDeletedCustomers({}))
      dispatch(fetchCustomers({}))
    } catch (error: any) {
      console.error('Customer restore error:', error)
      const errorMessage = error?.response?.data?.message || error?.message || 'Failed to restore customer'
      dispatch(addNotification({
        message: errorMessage,
        type: 'error',
        title: 'Error'
      }))
    } finally {
      setRestoringId(null)
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
            These customers have been soft-deleted. You can restore them to make them active again.
          </Alert>
          
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
            sx={{ mb: 2 }}
          />
        </Box>

        {loading ? (
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
                    <TableCell colSpan={isMobile ? 5 : 6} align="center" sx={{ py: 4 }}>
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
                              disabled={restoringId === customer.id}
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
    </Dialog>
  )
}

export default DeletedCustomersDialog