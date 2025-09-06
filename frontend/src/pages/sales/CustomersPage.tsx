import React, { useState, useEffect, useCallback } from 'react'
import {
  Box,
  Typography,
  Paper,
  Button,
  TextField,
  Grid,
  Chip,
  IconButton,
  Menu,
  MenuItem,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  FormControl,
  InputLabel,
  Select,
  InputAdornment,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  Alert,
  CircularProgress,
  useTheme,
  useMediaQuery,
  Avatar,
  Tooltip,
  Divider,
  Stack,
} from '@mui/material'
import {
  Add as AddIcon,
  Search as SearchIcon,
  MoreVert as MoreIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Visibility as ViewIcon,
  Person as PersonIcon,
  Business as BusinessIcon,
  AccountBalance as CreditIcon,
  Phone as PhoneIcon,
  Email as EmailIcon,
  LocationOn as LocationIcon,
  TrendingUp as SalesIcon,
  Block as SuspendIcon,
  CheckCircle as ActivateIcon,
  Cancel as DeactivateIcon,
  Refresh as RefreshIcon,
} from '@mui/icons-material'
import { useForm, Controller } from 'react-hook-form'
import { yupResolver } from '@hookform/resolvers/yup'
import * as yup from 'yup'
import { useAppDispatch, useAppSelector } from '@/hooks/useRedux'
import {
  fetchCustomers,
  createCustomer,
  updateCustomer,
  deleteCustomer,
  activateCustomer,
  deactivateCustomer,
  suspendCustomer,
  selectCustomers,
  selectCustomersLoading,
  selectCustomersError,
  selectCustomersPagination,
  selectCustomersFilters,
  setFilters,
  clearError,
} from '@/store/slices/customerSlice'
import { addNotification } from '@/store/slices/notificationSlice'
import type { Customer } from '@/types'
import { CustomerType, CustomerStatus, PriceLevel } from '@/types'

// Form validation schema
const customerSchema = yup.object({
  name: yup.string().required('Name is required').max(200, 'Name must be less than 200 characters'),
  type: yup.string().oneOf(['individual', 'business']).required('Type is required'),
  contactPerson: yup.string().optional().max(200, 'Contact person must be less than 200 characters'),
  email: yup.string().email('Invalid email').optional().max(100, 'Email must be less than 100 characters'),
  phone: yup.string().optional(),
  alternativePhone: yup.string().optional(),
  taxId: yup.string().optional().max(30, 'Tax ID must be less than 30 characters'),
  billingAddress: yup.string().optional(),
  billingCity: yup.string().optional().max(100, 'City must be less than 100 characters'),
  billingState: yup.string().optional().max(100, 'State must be less than 100 characters'),
  billingPostalCode: yup.string().optional().max(20, 'Postal code must be less than 20 characters'),
  billingCountry: yup.string().optional().max(100, 'Country must be less than 100 characters'),
  shippingAddress: yup.string().optional(),
  shippingCity: yup.string().optional().max(100, 'City must be less than 100 characters'),
  shippingState: yup.string().optional().max(100, 'State must be less than 100 characters'),
  shippingPostalCode: yup.string().optional().max(20, 'Postal code must be less than 20 characters'),
  shippingCountry: yup.string().optional().max(100, 'Country must be less than 100 characters'),
  priceLevel: yup.string().oneOf(['retail', 'wholesale', 'special']).optional(),
  creditLimit: yup.number().min(0, 'Credit limit must be positive').optional(),
  paymentTermsDays: yup.number().min(0, 'Payment terms must be positive').optional(),
  notes: yup.string().optional(),
})

interface CustomerFormData {
  name?: string
  type?: CustomerType
  contactPerson?: string
  email?: string
  phone?: string
  alternativePhone?: string
  taxId?: string
  billingAddress?: string
  billingCity?: string
  billingState?: string
  billingPostalCode?: string
  billingCountry?: string
  shippingAddress?: string
  shippingCity?: string
  shippingState?: string
  shippingPostalCode?: string
  shippingCountry?: string
  priceLevel?: PriceLevel
  creditLimit?: number
  paymentTermsDays?: number
  notes?: string
}

const CustomersPage: React.FC = () => {
  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down('md'))
  const dispatch = useAppDispatch()

  // Redux state
  const customers = useAppSelector(selectCustomers)
  const loading = useAppSelector(selectCustomersLoading)
  const error = useAppSelector(selectCustomersError)
  const pagination = useAppSelector(selectCustomersPagination)
  const filters = useAppSelector(selectCustomersFilters)

  // Local state
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [isViewOpen, setIsViewOpen] = useState(false)
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false)
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null)
  const [copyShippingFromBilling, setCopyShippingFromBilling] = useState(false)

  // Form setup
  const { control, handleSubmit, reset, watch, setValue, formState: { errors } } = useForm({
    resolver: yupResolver(customerSchema) as any,
    defaultValues: {
      type: CustomerType.BUSINESS,
      priceLevel: PriceLevel.RETAIL,
      creditLimit: 0,
      paymentTermsDays: 30,
    }
  })

  // Watch billing address fields to copy to shipping
  const billingAddress = watch('billingAddress' as any)
  const billingCity = watch('billingCity' as any)
  const billingState = watch('billingState' as any)
  const billingPostalCode = watch('billingPostalCode' as any)
  const billingCountry = watch('billingCountry' as any)

  // Load customers on mount
  useEffect(() => {
    dispatch(fetchCustomers({ ...filters, search: searchTerm }))
  }, [dispatch, filters, searchTerm])

  // Handle search
  const handleSearch = useCallback(() => {
    dispatch(fetchCustomers({ ...filters, search: searchTerm }))
  }, [dispatch, filters, searchTerm])

  // Handle pagination
  const handleChangePage = (event: unknown, newPage: number) => {
    dispatch(fetchCustomers({ ...filters, search: searchTerm, page: newPage + 1 }))
  }

  const handleChangeRowsPerPage = (event: React.ChangeEvent<HTMLInputElement>) => {
    dispatch(fetchCustomers({ ...filters, search: searchTerm, page: 1, limit: parseInt(event.target.value) }))
  }

  // Handle form submit
  const handleFormSubmit = async (data: any) => {
    try {
      if (selectedCustomer) {
        await dispatch(updateCustomer({ id: selectedCustomer.id, data })).unwrap()
        dispatch(addNotification({
          message: 'Customer updated successfully',
          type: 'success',
          title: 'Success'
        }))
      } else {
        await dispatch(createCustomer(data)).unwrap()
        dispatch(addNotification({
          message: 'Customer created successfully',
          type: 'success',
          title: 'Success'
        }))
      }
      handleCloseForm()
      dispatch(fetchCustomers({ ...filters, search: searchTerm }))
    } catch (error) {
      dispatch(addNotification({
        message: `Failed to ${selectedCustomer ? 'update' : 'create'} customer: ${error}`,
        type: 'error',
        title: 'Error'
      }))
    }
  }

  // Handle delete
  const handleDelete = async () => {
    if (!selectedCustomer) return
    try {
      await dispatch(deleteCustomer(selectedCustomer.id)).unwrap()
      dispatch(addNotification({
        message: 'Customer deleted successfully',
        type: 'success',
        title: 'Success'
      }))
      setIsDeleteConfirmOpen(false)
      setSelectedCustomer(null)
    } catch (error) {
      dispatch(addNotification({
        message: `Failed to delete customer: ${error}`,
        type: 'error',
        title: 'Error'
      }))
    }
  }

  // Handle customer status actions
  const handleStatusAction = async (customer: Customer, action: 'activate' | 'deactivate' | 'suspend') => {
    try {
      switch (action) {
        case 'activate':
          await dispatch(activateCustomer(customer.id)).unwrap()
          break
        case 'deactivate':
          await dispatch(deactivateCustomer(customer.id)).unwrap()
          break
        case 'suspend':
          await dispatch(suspendCustomer({ id: customer.id })).unwrap()
          break
      }
      dispatch(addNotification({
        message: `Customer ${action}d successfully`,
        type: 'success',
        title: 'Success'
      }))
      dispatch(fetchCustomers({ ...filters, search: searchTerm }))
    } catch (error) {
      dispatch(addNotification({
        message: `Failed to ${action} customer: ${error}`,
        type: 'error',
        title: 'Error'
      }))
    }
    setAnchorEl(null)
  }

  // Form helpers
  const handleOpenForm = (customer?: Customer) => {
    if (customer) {
      setSelectedCustomer(customer)
      reset(customer)
    } else {
      setSelectedCustomer(null)
      reset({
        type: CustomerType.BUSINESS,
        priceLevel: PriceLevel.RETAIL,
        creditLimit: 0,
        paymentTermsDays: 30,
      })
    }
    setIsFormOpen(true)
  }

  const handleCloseForm = () => {
    setIsFormOpen(false)
    setSelectedCustomer(null)
    reset()
  }

  const handleViewCustomer = (customer: Customer) => {
    setSelectedCustomer(customer)
    setIsViewOpen(true)
  }

  // Copy billing to shipping
  const handleCopyBillingToShipping = () => {
    if (copyShippingFromBilling) {
      setValue('shippingAddress' as any, billingAddress)
      setValue('shippingCity' as any, billingCity)
      setValue('shippingState' as any, billingState)
      setValue('shippingPostalCode' as any, billingPostalCode)
      setValue('shippingCountry' as any, billingCountry)
    } else {
      setValue('shippingAddress' as any, '')
      setValue('shippingCity' as any, '')
      setValue('shippingState' as any, '')
      setValue('shippingPostalCode' as any, '')
      setValue('shippingCountry' as any, '')
    }
  }

  useEffect(() => {
    handleCopyBillingToShipping()
  }, [copyShippingFromBilling, billingAddress, billingCity, billingState, billingPostalCode, billingCountry])

  // Get status color and label
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

  const getCustomerTypeIcon = (type: CustomerType) => {
    return type === CustomerType.BUSINESS ? <BusinessIcon /> : <PersonIcon />
  }

  return (
    <Box>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4" sx={{ fontWeight: 700 }}>
          Customers
        </Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => handleOpenForm()}
          sx={{ borderRadius: 2 }}
        >
          Add Customer
        </Button>
      </Box>

      {/* Filters and Search */}
      <Paper sx={{ p: 2, mb: 3 }}>
        <Grid container spacing={2} alignItems="center">
          <Grid item xs={12} md={4}>
            <TextField
              fullWidth
              placeholder="Search customers..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon />
                  </InputAdornment>
                ),
              }}
            />
          </Grid>
          <Grid item xs={6} md={2}>
            <FormControl fullWidth size="small">
              <InputLabel>Type</InputLabel>
              <Select
                value={filters.type || ''}
                label="Type"
                onChange={(e) => dispatch(setFilters({ type: e.target.value as CustomerType }))}
              >
                <MenuItem value="">All Types</MenuItem>
                <MenuItem value={CustomerType.INDIVIDUAL}>Individual</MenuItem>
                <MenuItem value={CustomerType.BUSINESS}>Business</MenuItem>
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={6} md={2}>
            <FormControl fullWidth size="small">
              <InputLabel>Status</InputLabel>
              <Select
                value={filters.status || ''}
                label="Status"
                onChange={(e) => dispatch(setFilters({ status: e.target.value as CustomerStatus }))}
              >
                <MenuItem value="">All Statuses</MenuItem>
                <MenuItem value={CustomerStatus.ACTIVE}>Active</MenuItem>
                <MenuItem value={CustomerStatus.INACTIVE}>Inactive</MenuItem>
                <MenuItem value={CustomerStatus.SUSPENDED}>Suspended</MenuItem>
                <MenuItem value={CustomerStatus.BLACKLISTED}>Blacklisted</MenuItem>
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={6} md={2}>
            <FormControl fullWidth size="small">
              <InputLabel>Price Level</InputLabel>
              <Select
                value={filters.priceLevel || ''}
                label="Price Level"
                onChange={(e) => dispatch(setFilters({ priceLevel: e.target.value as PriceLevel }))}
              >
                <MenuItem value="">All Levels</MenuItem>
                <MenuItem value={PriceLevel.RETAIL}>Retail</MenuItem>
                <MenuItem value={PriceLevel.WHOLESALE}>Wholesale</MenuItem>
                <MenuItem value={PriceLevel.SPECIAL}>Special</MenuItem>
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={6} md={2}>
            <Button
              variant="outlined"
              startIcon={<RefreshIcon />}
              onClick={() => dispatch(fetchCustomers({ ...filters, search: searchTerm }))}
              sx={{ height: 40 }}
            >
              Refresh
            </Button>
          </Grid>
        </Grid>
      </Paper>

      {/* Error Alert */}
      {error && (
        <Alert severity="error" sx={{ mb: 3 }} onClose={() => dispatch(clearError())}>
          {error}
        </Alert>
      )}

      {/* Customer Table */}
      <Paper>
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Customer</TableCell>
                <TableCell>Type</TableCell>
                <TableCell>Contact</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Credit Info</TableCell>
                <TableCell>Sales</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={7} align="center">
                    <CircularProgress />
                  </TableCell>
                </TableRow>
              ) : customers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} align="center">
                    <Typography variant="body2" color="text.secondary">
                      No customers found
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                customers.map((customer) => (
                  <TableRow key={customer.id} hover>
                    <TableCell>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                        <Avatar sx={{ bgcolor: 'primary.main' }}>
                          {getCustomerTypeIcon(customer.type)}
                        </Avatar>
                        <Box>
                          <Typography variant="subtitle2" fontWeight={600}>
                            {customer.name}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {customer.customerCode}
                          </Typography>
                        </Box>
                      </Box>
                    </TableCell>
                    <TableCell>
                      <Chip 
                        label={customer.type === CustomerType.BUSINESS ? 'Business' : 'Individual'}
                        size="small"
                        variant="outlined"
                      />
                    </TableCell>
                    <TableCell>
                      <Stack spacing={0.5}>
                        {customer.email && (
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <EmailIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
                            <Typography variant="caption">{customer.email}</Typography>
                          </Box>
                        )}
                        {customer.phone && (
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <PhoneIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
                            <Typography variant="caption">{customer.phone}</Typography>
                          </Box>
                        )}
                      </Stack>
                    </TableCell>
                    <TableCell>
                      {getStatusChip(customer.status, customer.isActive)}
                    </TableCell>
                    <TableCell>
                      <Stack spacing={0.5}>
                        <Typography variant="caption" color="text.secondary">
                          Limit: ${customer.creditLimit.toFixed(2)}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          Balance: ${customer.currentBalance.toFixed(2)}
                        </Typography>
                        <Typography 
                          variant="caption" 
                          color={customer.availableCredit >= 0 ? 'success.main' : 'error.main'}
                        >
                          Available: ${customer.availableCredit.toFixed(2)}
                        </Typography>
                      </Stack>
                    </TableCell>
                    <TableCell>
                      <Stack spacing={0.5}>
                        <Typography variant="caption" color="text.secondary">
                          Orders: {customer.totalOrders}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          Sales: ${customer.totalSales.toFixed(2)}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          Avg: ${customer.averageOrderValue.toFixed(2)}
                        </Typography>
                      </Stack>
                    </TableCell>
                    <TableCell align="right">
                      <IconButton
                        size="small"
                        onClick={(e) => {
                          setSelectedCustomer(customer)
                          setAnchorEl(e.currentTarget)
                        }}
                      >
                        <MoreIcon />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
        
        {/* Pagination */}
        <TablePagination
          rowsPerPageOptions={[10, 20, 50]}
          component="div"
          count={pagination.total}
          rowsPerPage={pagination.limit}
          page={pagination.page - 1}
          onPageChange={handleChangePage}
          onRowsPerPageChange={handleChangeRowsPerPage}
        />
      </Paper>

      {/* Actions Menu */}
      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={() => setAnchorEl(null)}
      >
        <MenuItem onClick={() => selectedCustomer && handleViewCustomer(selectedCustomer)}>
          <ViewIcon sx={{ mr: 1 }} />
          View Details
        </MenuItem>
        <MenuItem onClick={() => {
          setAnchorEl(null)
          selectedCustomer && handleOpenForm(selectedCustomer)
        }}>
          <EditIcon sx={{ mr: 1 }} />
          Edit
        </MenuItem>
        <Divider />
        {selectedCustomer?.status !== CustomerStatus.ACTIVE && (
          <MenuItem onClick={() => selectedCustomer && handleStatusAction(selectedCustomer, 'activate')}>
            <ActivateIcon sx={{ mr: 1 }} />
            Activate
          </MenuItem>
        )}
        {selectedCustomer?.isActive && selectedCustomer?.status === CustomerStatus.ACTIVE && (
          <MenuItem onClick={() => selectedCustomer && handleStatusAction(selectedCustomer, 'deactivate')}>
            <DeactivateIcon sx={{ mr: 1 }} />
            Deactivate
          </MenuItem>
        )}
        {selectedCustomer?.status !== CustomerStatus.SUSPENDED && (
          <MenuItem onClick={() => selectedCustomer && handleStatusAction(selectedCustomer, 'suspend')}>
            <SuspendIcon sx={{ mr: 1 }} />
            Suspend
          </MenuItem>
        )}
        <Divider />
        <MenuItem
          onClick={() => {
            setAnchorEl(null)
            setIsDeleteConfirmOpen(true)
          }}
          sx={{ color: 'error.main' }}
        >
          <DeleteIcon sx={{ mr: 1 }} />
          Delete
        </MenuItem>
      </Menu>

      {/* Customer Form Dialog */}
      <Dialog 
        open={isFormOpen} 
        onClose={handleCloseForm}
        maxWidth="md"
        fullWidth
        fullScreen={isMobile}
      >
        <DialogTitle>
          {selectedCustomer ? 'Edit Customer' : 'Add New Customer'}
        </DialogTitle>
        <form onSubmit={handleSubmit(handleFormSubmit)}>
          <DialogContent dividers>
            <Grid container spacing={2}>
              {/* Basic Information */}
              <Grid item xs={12}>
                <Typography variant="h6" gutterBottom>
                  Basic Information
                </Typography>
              </Grid>
              
              <Grid item xs={12} md={6}>
                <Controller
                  name="type"
                  control={control}
                  render={({ field }) => (
                    <FormControl fullWidth error={!!errors.type}>
                      <InputLabel>Customer Type</InputLabel>
                      <Select {...field} label="Customer Type">
                        <MenuItem value={CustomerType.INDIVIDUAL}>Individual</MenuItem>
                        <MenuItem value={CustomerType.BUSINESS}>Business</MenuItem>
                      </Select>
                    </FormControl>
                  )}
                />
              </Grid>

              <Grid item xs={12} md={6}>
                <Controller
                  name="priceLevel"
                  control={control}
                  render={({ field }) => (
                    <FormControl fullWidth>
                      <InputLabel>Price Level</InputLabel>
                      <Select {...field} label="Price Level">
                        <MenuItem value={PriceLevel.RETAIL}>Retail</MenuItem>
                        <MenuItem value={PriceLevel.WHOLESALE}>Wholesale</MenuItem>
                        <MenuItem value={PriceLevel.SPECIAL}>Special</MenuItem>
                      </Select>
                    </FormControl>
                  )}
                />
              </Grid>

              <Grid item xs={12}>
                <Controller
                  name={"name" as any}
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      fullWidth
                      label="Customer Name"
                      error={!!(errors as any).name}
                      helperText={(errors as any).name?.message}
                    />
                  )}
                />
              </Grid>

              <Grid item xs={12} md={6}>
                <Controller
                  name="contactPerson"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      fullWidth
                      label="Contact Person"
                      error={!!errors.contactPerson}
                      helperText={errors.contactPerson?.message}
                    />
                  )}
                />
              </Grid>

              <Grid item xs={12} md={6}>
                <Controller
                  name="taxId"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      fullWidth
                      label="Tax ID"
                      error={!!errors.taxId}
                      helperText={errors.taxId?.message}
                    />
                  )}
                />
              </Grid>

              {/* Contact Information */}
              <Grid item xs={12}>
                <Typography variant="h6" gutterBottom sx={{ mt: 2 }}>
                  Contact Information
                </Typography>
              </Grid>

              <Grid item xs={12} md={6}>
                <Controller
                  name="email"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      fullWidth
                      type="email"
                      label="Email"
                      error={!!errors.email}
                      helperText={errors.email?.message}
                    />
                  )}
                />
              </Grid>

              <Grid item xs={12} md={6}>
                <Controller
                  name="phone"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      fullWidth
                      label="Primary Phone"
                      error={!!errors.phone}
                      helperText={errors.phone?.message}
                    />
                  )}
                />
              </Grid>

              <Grid item xs={12} md={6}>
                <Controller
                  name="alternativePhone"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      fullWidth
                      label="Alternative Phone"
                      error={!!errors.alternativePhone}
                      helperText={errors.alternativePhone?.message}
                    />
                  )}
                />
              </Grid>

              {/* Billing Address */}
              <Grid item xs={12}>
                <Typography variant="h6" gutterBottom sx={{ mt: 2 }}>
                  Billing Address
                </Typography>
              </Grid>

              <Grid item xs={12}>
                <Controller
                  name="billingAddress"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      fullWidth
                      multiline
                      rows={2}
                      label="Street Address"
                      error={!!errors.billingAddress}
                      helperText={errors.billingAddress?.message}
                    />
                  )}
                />
              </Grid>

              <Grid item xs={12} md={6}>
                <Controller
                  name="billingCity"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      fullWidth
                      label="City"
                      error={!!errors.billingCity}
                      helperText={errors.billingCity?.message}
                    />
                  )}
                />
              </Grid>

              <Grid item xs={12} md={6}>
                <Controller
                  name="billingState"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      fullWidth
                      label="State/Province"
                      error={!!errors.billingState}
                      helperText={errors.billingState?.message}
                    />
                  )}
                />
              </Grid>

              <Grid item xs={12} md={6}>
                <Controller
                  name="billingPostalCode"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      fullWidth
                      label="Postal Code"
                      error={!!errors.billingPostalCode}
                      helperText={errors.billingPostalCode?.message}
                    />
                  )}
                />
              </Grid>

              <Grid item xs={12} md={6}>
                <Controller
                  name="billingCountry"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      fullWidth
                      label="Country"
                      error={!!errors.billingCountry}
                      helperText={errors.billingCountry?.message}
                    />
                  )}
                />
              </Grid>

              {/* Shipping Address */}
              <Grid item xs={12}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mt: 2 }}>
                  <Typography variant="h6">
                    Shipping Address
                  </Typography>
                  <FormControl>
                    <Button
                      size="small"
                      variant={copyShippingFromBilling ? "contained" : "outlined"}
                      onClick={() => setCopyShippingFromBilling(!copyShippingFromBilling)}
                    >
                      Same as Billing
                    </Button>
                  </FormControl>
                </Box>
              </Grid>

              <Grid item xs={12}>
                <Controller
                  name="shippingAddress"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      fullWidth
                      multiline
                      rows={2}
                      label="Street Address"
                      disabled={copyShippingFromBilling}
                      error={!!errors.shippingAddress}
                      helperText={errors.shippingAddress?.message}
                    />
                  )}
                />
              </Grid>

              <Grid item xs={12} md={6}>
                <Controller
                  name="shippingCity"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      fullWidth
                      label="City"
                      disabled={copyShippingFromBilling}
                      error={!!errors.shippingCity}
                      helperText={errors.shippingCity?.message}
                    />
                  )}
                />
              </Grid>

              <Grid item xs={12} md={6}>
                <Controller
                  name="shippingState"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      fullWidth
                      label="State/Province"
                      disabled={copyShippingFromBilling}
                      error={!!errors.shippingState}
                      helperText={errors.shippingState?.message}
                    />
                  )}
                />
              </Grid>

              <Grid item xs={12} md={6}>
                <Controller
                  name="shippingPostalCode"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      fullWidth
                      label="Postal Code"
                      disabled={copyShippingFromBilling}
                      error={!!errors.shippingPostalCode}
                      helperText={errors.shippingPostalCode?.message}
                    />
                  )}
                />
              </Grid>

              <Grid item xs={12} md={6}>
                <Controller
                  name="shippingCountry"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      fullWidth
                      label="Country"
                      disabled={copyShippingFromBilling}
                      error={!!errors.shippingCountry}
                      helperText={errors.shippingCountry?.message}
                    />
                  )}
                />
              </Grid>

              {/* Financial Information */}
              <Grid item xs={12}>
                <Typography variant="h6" gutterBottom sx={{ mt: 2 }}>
                  Financial Information
                </Typography>
              </Grid>

              <Grid item xs={12} md={6}>
                <Controller
                  name="creditLimit"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      fullWidth
                      type="number"
                      label="Credit Limit"
                      error={!!errors.creditLimit}
                      helperText={errors.creditLimit?.message}
                    />
                  )}
                />
              </Grid>

              <Grid item xs={12} md={6}>
                <Controller
                  name="paymentTermsDays"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      fullWidth
                      type="number"
                      label="Payment Terms (Days)"
                      error={!!errors.paymentTermsDays}
                      helperText={errors.paymentTermsDays?.message}
                    />
                  )}
                />
              </Grid>

              {/* Notes */}
              <Grid item xs={12}>
                <Controller
                  name="notes"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      fullWidth
                      multiline
                      rows={3}
                      label="Notes"
                      error={!!errors.notes}
                      helperText={errors.notes?.message}
                    />
                  )}
                />
              </Grid>
            </Grid>
          </DialogContent>
          <DialogActions>
            <Button onClick={handleCloseForm}>
              Cancel
            </Button>
            <Button type="submit" variant="contained" disabled={loading}>
              {loading ? <CircularProgress size={20} /> : (selectedCustomer ? 'Update' : 'Create')}
            </Button>
          </DialogActions>
        </form>
      </Dialog>

      {/* Customer Details Dialog */}
      <Dialog
        open={isViewOpen}
        onClose={() => setIsViewOpen(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>Customer Details</DialogTitle>
        <DialogContent dividers>
          {selectedCustomer && (
            <Grid container spacing={2}>
              <Grid item xs={12}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
                  <Avatar sx={{ bgcolor: 'primary.main', width: 56, height: 56 }}>
                    {getCustomerTypeIcon(selectedCustomer.type)}
                  </Avatar>
                  <Box>
                    <Typography variant="h5" fontWeight={600}>
                      {selectedCustomer.name}
                    </Typography>
                    <Typography variant="subtitle1" color="text.secondary">
                      {selectedCustomer.customerCode}
                    </Typography>
                    {getStatusChip(selectedCustomer.status, selectedCustomer.isActive)}
                  </Box>
                </Box>
              </Grid>

              <Grid item xs={12} md={6}>
                <Typography variant="h6" gutterBottom>Contact Information</Typography>
                <Stack spacing={1}>
                  {selectedCustomer.email && (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <EmailIcon sx={{ fontSize: 18, color: 'text.secondary' }} />
                      <Typography>{selectedCustomer.email}</Typography>
                    </Box>
                  )}
                  {selectedCustomer.phone && (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <PhoneIcon sx={{ fontSize: 18, color: 'text.secondary' }} />
                      <Typography>{selectedCustomer.phone}</Typography>
                    </Box>
                  )}
                  {selectedCustomer.fullAddress && (
                    <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
                      <LocationIcon sx={{ fontSize: 18, color: 'text.secondary', mt: 0.25 }} />
                      <Typography>{selectedCustomer.fullAddress}</Typography>
                    </Box>
                  )}
                </Stack>
              </Grid>

              <Grid item xs={12} md={6}>
                <Typography variant="h6" gutterBottom>Financial Information</Typography>
                <Stack spacing={1}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Typography color="text.secondary">Credit Limit:</Typography>
                    <Typography fontWeight={600}>${selectedCustomer.creditLimit.toFixed(2)}</Typography>
                  </Box>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Typography color="text.secondary">Current Balance:</Typography>
                    <Typography fontWeight={600}>${selectedCustomer.currentBalance.toFixed(2)}</Typography>
                  </Box>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Typography color="text.secondary">Available Credit:</Typography>
                    <Typography 
                      fontWeight={600}
                      color={selectedCustomer.availableCredit >= 0 ? 'success.main' : 'error.main'}
                    >
                      ${selectedCustomer.availableCredit.toFixed(2)}
                    </Typography>
                  </Box>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Typography color="text.secondary">Payment Terms:</Typography>
                    <Typography fontWeight={600}>{selectedCustomer.paymentTermsDays} days</Typography>
                  </Box>
                </Stack>
              </Grid>

              <Grid item xs={12} md={6}>
                <Typography variant="h6" gutterBottom>Sales Statistics</Typography>
                <Stack spacing={1}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Typography color="text.secondary">Total Orders:</Typography>
                    <Typography fontWeight={600}>{selectedCustomer.totalOrders}</Typography>
                  </Box>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Typography color="text.secondary">Total Sales:</Typography>
                    <Typography fontWeight={600}>${selectedCustomer.totalSales.toFixed(2)}</Typography>
                  </Box>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Typography color="text.secondary">Average Order:</Typography>
                    <Typography fontWeight={600}>${selectedCustomer.averageOrderValue.toFixed(2)}</Typography>
                  </Box>
                  {selectedCustomer.lastPurchaseDate && (
                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                      <Typography color="text.secondary">Last Purchase:</Typography>
                      <Typography fontWeight={600}>
                        {new Date(selectedCustomer.lastPurchaseDate).toLocaleDateString()}
                      </Typography>
                    </Box>
                  )}
                </Stack>
              </Grid>

              {selectedCustomer.notes && (
                <Grid item xs={12}>
                  <Typography variant="h6" gutterBottom>Notes</Typography>
                  <Typography>{selectedCustomer.notes}</Typography>
                </Grid>
              )}
            </Grid>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setIsViewOpen(false)}>
            Close
          </Button>
          <Button 
            variant="contained"
            startIcon={<EditIcon />}
            onClick={() => {
              setIsViewOpen(false)
              selectedCustomer && handleOpenForm(selectedCustomer)
            }}
          >
            Edit
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={isDeleteConfirmOpen} onClose={() => setIsDeleteConfirmOpen(false)}>
        <DialogTitle>Confirm Delete</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to delete customer "{selectedCustomer?.name}"? 
            This action cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setIsDeleteConfirmOpen(false)}>
            Cancel
          </Button>
          <Button 
            onClick={handleDelete} 
            color="error" 
            variant="contained"
            disabled={loading}
          >
            {loading ? <CircularProgress size={20} /> : 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}

export default CustomersPage
