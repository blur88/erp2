import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import {
  Box,
  Typography,
  Paper,
  Button,
  TextField,
  Grid,
  Chip,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
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
  Tooltip,
  Stack,
} from '@mui/material'
import {
  Add as AddIcon,
  Search as SearchIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Visibility as ViewIcon,
  RestoreFromTrash as RestoreIcon,
  Person as PersonIcon,
  AccountBalance as CreditIcon,
  Phone as PhoneIcon,
  TrendingUp as SalesIcon,
  Refresh as RefreshIcon,
} from '@mui/icons-material'
import { useForm, Controller } from 'react-hook-form'
import { yupResolver } from '@hookform/resolvers/yup'
import * as yup from 'yup'
import { useAppDispatch, useAppSelector } from '@/hooks/useRedux'
import { useNotification } from '@/hooks/useNotification'
import { useSearchAndFilter, useKeyboardShortcuts } from '@/hooks/useSearchAndFilter'
import {
  fetchCustomers,
  createCustomer,
  updateCustomer,
  deleteCustomer,
  selectCustomers,
  selectCustomersLoading,
  selectCustomersError,
  selectCustomersPagination,
  selectCustomersFilters,
  setFilters,
  clearError,
} from '@/store/slices/customerSlice'
import type { Customer } from '@/types'
import { CustomerType, PriceLevel } from '@/types'
import { salesApi } from '@/services/salesApi'
import { formatCurrency } from '@/utils/currency'
import DeletedCustomersDialog from '@/components/sales/DeletedCustomersDialog'
import ConfirmationDialog from '@/components/common/ConfirmationDialog'
import { TYPOGRAPHY_STYLES, TABLE_STYLES } from '@/constants/typography'

// Form validation schema
const customerSchema = yup.object({
  name: yup.string().required('Name is required').max(200, 'Name must be less than 200 characters'),
  type: yup.string().oneOf(['individual', 'business']).required('Type is required'),
  phone: yup.string().optional().nullable().transform((value) => value?.trim() || null).max(20, 'Phone must be less than 20 characters'),
  priceLevel: yup.string().oneOf(['retail', 'wholesale', 'special']).optional(),
  notes: yup.string().optional().nullable().transform((value) => value?.trim() || null),
})

interface CustomerFormData {
  name: string
  type: CustomerType
  phone?: string | null
  priceLevel: PriceLevel
  notes?: string | null
}

const CustomersPage: React.FC = () => {
  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down('md'))
  const dispatch = useAppDispatch()
  const { showSuccess, showError } = useNotification()

  // Redux state
  const customers = useAppSelector(selectCustomers)
  const loading = useAppSelector(selectCustomersLoading)
  const error = useAppSelector(selectCustomersError)
  const pagination = useAppSelector(selectCustomersPagination)
  const filters = useAppSelector(selectCustomersFilters)

  // Local state
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [isViewOpen, setIsViewOpen] = useState(false)
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false)
  const [isDeletedDialogOpen, setIsDeletedDialogOpen] = useState(false)
  const [phoneValue, setPhoneValue] = useState<string>('')
  const [isCheckingPhone, setIsCheckingPhone] = useState(false)
  const [phoneError, setPhoneError] = useState<string | null>(null)

  // Form setup
  const { control, handleSubmit, reset, formState: { errors } } = useForm<CustomerFormData>({
    resolver: yupResolver(customerSchema) as any,
    defaultValues: {
      name: '',
      type: CustomerType.BUSINESS,
      priceLevel: PriceLevel.RETAIL,
      phone: null,
      notes: null,
    }
  })

  // Search and filter functionality
  const searchHookInitialized = useRef(false)
  const { searchTerm, setSearchTerm, focusSearchInput } = useSearchAndFilter({
    initialSearchTerm: filters.search || '',
    onSearchChange: (searchTerm) => {
      // Prevent initial trigger from hook
      if (!searchHookInitialized.current) {
        searchHookInitialized.current = true
        return
      }
      dispatch(setFilters({ search: searchTerm }))
    },
  })

  // Keyboard shortcuts
  useKeyboardShortcuts({
    onSearch: focusSearchInput,
    onAdd: () => handleOpenForm(),
    onRefresh: () => dispatch(fetchCustomers({ ...filters })),
  })

  // Phone duplicate validation
  const checkPhoneDuplicate = useCallback(async (phone: string) => {
    if (!phone || phone.trim().length === 0) {
      setPhoneError(null)
      return
    }

    // Normalize phone for comparison (remove spaces, hyphens, parentheses, plus)
    const normalizedPhone = phone.replace(/[\s\-\(\)\+]/g, '')
    if (normalizedPhone.length === 0) {
      setPhoneError(null)
      return
    }

    setIsCheckingPhone(true)
    setPhoneError(null)

    try {
      // Search for customers with similar phone numbers in BOTH active and deleted customers
      const [activeResponse, deletedResponse] = await Promise.all([
        salesApi.getCustomers({ search: phone }),
        salesApi.getDeletedCustomers({ search: phone })
      ])

      // Cast to any to handle type mismatch between interface and actual API response
      const activeApiResponse = activeResponse as any
      const deletedApiResponse = deletedResponse as any

      // Combine both active and deleted customers for duplicate checking
      const allCustomers = [
        ...(activeApiResponse.data || []),
        ...(deletedApiResponse.data || [])
      ]

      if (allCustomers.length > 0) {
        // Check if any customer has the same normalized phone
        const duplicateCustomer = allCustomers.find((customer: Customer) => {
          if (!customer.phone) return false
          const existingNormalizedPhone = customer.phone.replace(/[\s\-\(\)\+]/g, '')
          return existingNormalizedPhone === normalizedPhone &&
                 (!selectedCustomer || customer.id !== selectedCustomer.id)
        })

        if (duplicateCustomer) {
          setPhoneError(`Phone number already exists for customer: ${duplicateCustomer.name} (${duplicateCustomer.customerCode})`)
        }
      }
    } catch (error) {
      console.error('Error checking phone duplicate:', error)
    } finally {
      setIsCheckingPhone(false)
    }
  }, [selectedCustomer])

  // Debounced phone validation
  const debouncedPhoneCheck = useMemo(
    () => {
      let timeoutId: NodeJS.Timeout
      return (phone: string) => {
        clearTimeout(timeoutId)
        timeoutId = setTimeout(() => checkPhoneDuplicate(phone), 500)
      }
    },
    [checkPhoneDuplicate]
  )

  // Load customers on mount and when filters change
  useEffect(() => {
    dispatch(fetchCustomers({ ...filters }))
  }, [dispatch, filters.search, filters.type, filters.priceLevel, filters.sortBy, filters.sortOrder])

  // Handle pagination
  const handleChangePage = (event: unknown, newPage: number) => {
    dispatch(fetchCustomers({ ...filters, page: newPage + 1 }))
  }

  const handleChangeRowsPerPage = (event: React.ChangeEvent<HTMLInputElement>) => {
    dispatch(fetchCustomers({ ...filters, page: 1, limit: parseInt(event.target.value) }))
  }

  // Handle form submit
  const handleFormSubmit = async (data: CustomerFormData) => {
    try {
      // Ensure empty strings are converted to null for optional fields
      const cleanedData = {
        ...data,
        phone: data.phone?.trim() || null,
        notes: data.notes?.trim() || null,
      }

      if (selectedCustomer) {
        await dispatch(updateCustomer({ id: selectedCustomer.id, data: cleanedData })).unwrap()
        showSuccess('Customer updated successfully')
      } else {
        await dispatch(createCustomer(cleanedData)).unwrap()
        showSuccess('Customer created successfully')
      }
      handleCloseForm()
      dispatch(fetchCustomers({ ...filters }))
    } catch (error) {
      showError(`Failed to ${selectedCustomer ? 'update' : 'create'} customer: ${error}`)
    }
  }

  // Handle delete
  const handleDelete = async () => {
    if (!selectedCustomer) return
    try {
      await dispatch(deleteCustomer(selectedCustomer.id)).unwrap()

      // If we get here, deletion was successful
      showSuccess(`Customer "${selectedCustomer.name}" deleted successfully`)
      setIsDeleteConfirmOpen(false)
      setSelectedCustomer(null)

      // Refresh the customer list to ensure consistency
      dispatch(fetchCustomers({
        page: pagination.page,
        limit: pagination.limit,
        search: filters.search || undefined,
        type: filters.type || undefined,
        priceLevel: filters.priceLevel || undefined,
        isActive: filters.isActive,
        sortBy: filters.sortBy || undefined,
        sortOrder: filters.sortOrder || undefined
      }))
    } catch (error: any) {
      // Handle error responses with detailed information
      let errorTitle = 'Failed to Delete Customer'
      let errorMessage = 'An unexpected error occurred. Please try again.'

      console.log('Delete error:', error) // Debug log

      // Handle axios error responses - check multiple possible error structures
      if (error?.response?.data) {
        const backendError = error.response.data
        console.log('Backend error:', backendError) // Debug log

        if (backendError.message) {
          errorMessage = backendError.message

          // Add detailed context if available
          if (backendError.details) {
            errorMessage += `\n\n${backendError.details}`
          }

          // Add dependency information if available
          if (backendError.dependencies) {
            const deps = backendError.dependencies
            let depInfo = '\n\nDependency Details:'
            if (deps.orders > 0) {
              depInfo += `\n• ${deps.orders} active order${deps.orders === 1 ? '' : 's'}`
            }
            if (deps.invoices > 0) {
              depInfo += `\n• ${deps.invoices} active invoice${deps.invoices === 1 ? '' : 's'}`
            }
            errorMessage += depInfo
          }

          // Add suggestions if available
          if (backendError.suggestions && Array.isArray(backendError.suggestions)) {
            errorMessage += '\n\nTo resolve this issue:\n• ' + backendError.suggestions.join('\n• ')
          }

          // Customize title based on error type
          if (backendError.error === 'DELETION_PREVENTED_BY_DEPENDENCIES') {
            errorTitle = 'Customer Deletion Blocked'
          }
        }
      } else if (error?.message && error.message !== 'Request failed with status code 400') {
        // Use the error message if it's meaningful
        errorMessage = error.message
      }

      showError(errorMessage)
    }
  }


  // Form helpers
  const handleOpenForm = (customer?: Customer) => {
    setPhoneError(null)
    setIsCheckingPhone(false)
    if (customer) {
      setSelectedCustomer(customer)
      setPhoneValue(customer.phone || '')
      reset({
        name: customer.name,
        type: customer.type,
        priceLevel: customer.priceLevel,
        phone: customer.phone || null,
        notes: customer.notes || null,
      })
    } else {
      setSelectedCustomer(null)
      setPhoneValue('')
      reset({
        name: '',
        type: CustomerType.BUSINESS,
        priceLevel: PriceLevel.RETAIL,
        phone: null,
        notes: null,
      })
    }
    setIsFormOpen(true)
  }

  const handleCloseForm = () => {
    setIsFormOpen(false)
    setSelectedCustomer(null)
    setPhoneError(null)
    setIsCheckingPhone(false)
    setPhoneValue('')
    reset()
  }

  const handleViewCustomer = (customer: Customer) => {
    setSelectedCustomer(customer)
    setIsViewOpen(true)
  }


  // Get active status chip
  const getActiveStatusChip = (isActive: boolean) => {
    return isActive
      ? <Chip label="Active" size="small" color="success" />
      : <Chip label="Inactive" size="small" color="default" />
  }


  return (
    <Box>
      {/* Header */}
      <Box sx={{ 
        display: 'flex', 
        flexDirection: isMobile ? 'column' : 'row',
        justifyContent: 'space-between', 
        alignItems: isMobile ? 'stretch' : 'center', 
        mb: 4,
        gap: isMobile ? 2 : 0
      }}>
        <Box sx={{ mb: isMobile ? 2 : 0 }}>
          <Typography variant={isMobile ? TYPOGRAPHY_STYLES.pageHeader.mobileVariant : TYPOGRAPHY_STYLES.pageHeader.variant} sx={{
            fontWeight: TYPOGRAPHY_STYLES.pageHeader.fontWeight,
            mb: 1,
            display: 'flex',
            alignItems: 'center',
            gap: 2
          }}>
            <PersonIcon sx={{
              fontSize: TYPOGRAPHY_STYLES.pageHeader.icon.fontSize,
              color: TYPOGRAPHY_STYLES.pageHeader.icon.color
            }} />
            Customers
          </Typography>
          <Typography variant={TYPOGRAPHY_STYLES.pageSubtitle.variant} color={TYPOGRAPHY_STYLES.pageSubtitle.color}>
            Manage your customers and client information ({customers.length} total)
          </Typography>
        </Box>
        <Box sx={{
          display: 'flex',
          flexDirection: isMobile ? 'column' : 'row',
          gap: isMobile ? 1.5 : 1,
          alignItems: isMobile ? 'stretch' : 'center'
        }}>
          <Button
            variant="outlined"
            startIcon={!isMobile ? <RefreshIcon /> : undefined}
            onClick={() => dispatch(fetchCustomers({ ...filters, search: searchTerm }))}
            disabled={loading}
            size={isMobile ? "medium" : "medium"}
            fullWidth={isMobile}
          >
            {isMobile ? "Refresh Customers" : "Refresh"}
          </Button>
          <Button
            variant="outlined"
            startIcon={!isMobile ? <RestoreIcon /> : undefined}
            onClick={() => setIsDeletedDialogOpen(true)}
            size={isMobile ? "medium" : "medium"}
            fullWidth={isMobile}
            sx={{
              color: 'warning.main',
              borderColor: 'warning.main',
              '&:hover': {
                borderColor: 'warning.dark',
                backgroundColor: 'warning.light'
              }
            }}
          >
            {isMobile ? "View Deleted" : "View Deleted"}
          </Button>
          <Button
            variant="contained"
            startIcon={!isMobile ? <AddIcon /> : undefined}
            size="medium"
            onClick={() => handleOpenForm()}
            fullWidth={isMobile}
          >
            {isMobile ? "Add New Customer" : "Add Customer"}
          </Button>
        </Box>
      </Box>

      {/* Filters and Search */}
      <Box sx={{
        display: 'flex',
        flexDirection: isMobile ? 'column' : 'row',
        gap: isMobile ? 2 : 1,
        alignItems: isMobile ? 'stretch' : 'center',
        mb: 3,
        '& > *': {
          alignSelf: isMobile ? 'stretch' : 'flex-start'
        }
      }}>
        <TextField
          placeholder="Search customers..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          size="medium"
          sx={{ 
            minWidth: isMobile ? 'auto' : 250,
            flex: isMobile ? 'none' : 1,
            maxWidth: isMobile ? 'none' : 400,
            '& .MuiOutlinedInput-root': {
              height: TYPOGRAPHY_STYLES.searchField.input.height,
              fontSize: TYPOGRAPHY_STYLES.searchField.input.fontSize,
              '& input': {
                padding: TYPOGRAPHY_STYLES.searchField.input.padding,
                fontSize: TYPOGRAPHY_STYLES.searchField.input.fontSize
              }
            },
            '& .MuiInputAdornment-root': {
              '& .MuiSvgIcon-root': {
                fontSize: TYPOGRAPHY_STYLES.searchField.icon.fontSize,
                color: TYPOGRAPHY_STYLES.searchField.icon.color
              }
            }
          }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon fontSize="small" />
              </InputAdornment>
            ),
          }}
        />
        <FormControl 
          size="medium" 
          sx={{ 
            minWidth: isMobile ? 'auto' : 120,
            flex: 'none'
          }}
        >
          <InputLabel 
            sx={{ 
              fontSize: TYPOGRAPHY_STYLES.searchField.input.fontSize,
              '&.MuiInputLabel-shrunk': {
                fontSize: TYPOGRAPHY_STYLES.tableCell.caption.fontSize
              }
            }}
          >
            Type
          </InputLabel>
          <Select
            value={filters.type || ''}
            label="Type"
            onChange={(e) => dispatch(setFilters({ type: e.target.value as CustomerType }))}
            sx={{
              height: TYPOGRAPHY_STYLES.searchField.input.height,
              fontSize: TYPOGRAPHY_STYLES.searchField.input.fontSize,
              '& .MuiSelect-select': {
                display: 'flex',
                alignItems: 'center',
                fontSize: TYPOGRAPHY_STYLES.searchField.input.fontSize,
                padding: '8.5px 14px',
                height: TYPOGRAPHY_STYLES.searchField.input.height,
                boxSizing: 'border-box'
              },
              '& .MuiOutlinedInput-notchedOutline': {
                borderColor: 'rgba(0, 0, 0, 0.23)'
              },
              '&:hover .MuiOutlinedInput-notchedOutline': {
                borderColor: 'rgba(0, 0, 0, 0.87)'
              },
              '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
                borderColor: theme.palette.primary.main,
                borderWidth: 2
              }
            }}
          >
            <MenuItem value="" sx={{ fontSize: TYPOGRAPHY_STYLES.searchField.input.fontSize }}>All Types</MenuItem>
            <MenuItem value={CustomerType.INDIVIDUAL} sx={{ fontSize: TYPOGRAPHY_STYLES.searchField.input.fontSize }}>Individual</MenuItem>
            <MenuItem value={CustomerType.BUSINESS} sx={{ fontSize: TYPOGRAPHY_STYLES.searchField.input.fontSize }}>Business</MenuItem>
          </Select>
        </FormControl>
        <FormControl 
          size="medium" 
          sx={{ 
            minWidth: isMobile ? 'auto' : 130,
            flex: 'none'
          }}
        >
          <InputLabel 
            sx={{ 
              fontSize: TYPOGRAPHY_STYLES.searchField.input.fontSize,
              '&.MuiInputLabel-shrunk': {
                fontSize: TYPOGRAPHY_STYLES.tableCell.caption.fontSize
              }
            }}
          >
            Price Level
          </InputLabel>
          <Select
            value={filters.priceLevel || ''}
            label="Price Level"
            onChange={(e) => dispatch(setFilters({ priceLevel: e.target.value as PriceLevel }))}
            sx={{
              height: TYPOGRAPHY_STYLES.searchField.input.height,
              fontSize: TYPOGRAPHY_STYLES.searchField.input.fontSize,
              '& .MuiSelect-select': {
                display: 'flex',
                alignItems: 'center',
                fontSize: TYPOGRAPHY_STYLES.searchField.input.fontSize,
                padding: '8.5px 14px',
                height: TYPOGRAPHY_STYLES.searchField.input.height,
                boxSizing: 'border-box'
              },
              '& .MuiOutlinedInput-notchedOutline': {
                borderColor: 'rgba(0, 0, 0, 0.23)'
              },
              '&:hover .MuiOutlinedInput-notchedOutline': {
                borderColor: 'rgba(0, 0, 0, 0.87)'
              },
              '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
                borderColor: theme.palette.primary.main,
                borderWidth: 2
              }
            }}
          >
            <MenuItem value="" sx={{ fontSize: TYPOGRAPHY_STYLES.searchField.input.fontSize }}>All Levels</MenuItem>
            <MenuItem value={PriceLevel.RETAIL} sx={{ fontSize: TYPOGRAPHY_STYLES.searchField.input.fontSize }}>Retail</MenuItem>
            <MenuItem value={PriceLevel.WHOLESALE} sx={{ fontSize: TYPOGRAPHY_STYLES.searchField.input.fontSize }}>Wholesale</MenuItem>
            <MenuItem value={PriceLevel.SPECIAL} sx={{ fontSize: TYPOGRAPHY_STYLES.searchField.input.fontSize }}>Special</MenuItem>
          </Select>
        </FormControl>
      </Box>

      {/* Error Alert */}
      {error && (
        <Alert severity="error" sx={{ mb: 3 }} onClose={() => dispatch(clearError())}>
          {error}
        </Alert>
      )}

      {/* Customer Table */}
      <Paper>
        <TableContainer sx={{ overflowX: 'auto' }}>
          <Table
            size={TABLE_STYLES.size}
            sx={{
              minWidth: isMobile ? 650 : 800,
              '& .MuiTableCell-root': {
                borderBottom: TABLE_STYLES.cell.border,
                py: TABLE_STYLES.cell.padding.py,
                px: TABLE_STYLES.cell.padding.px
              }
            }}
          >
            <TableHead>
              <TableRow sx={{ '& .MuiTableCell-head': { fontWeight: 600, backgroundColor: 'grey.50', py: 1 } }}>
                <TableCell sx={{ width: isMobile ? '35%' : '30%' }}>
                  <Typography variant={TYPOGRAPHY_STYLES.tableHeader.variant} sx={{
                    fontWeight: TYPOGRAPHY_STYLES.tableHeader.fontWeight,
                    color: TYPOGRAPHY_STYLES.tableHeader.color,
                    fontSize: TYPOGRAPHY_STYLES.tableHeader.fontSize
                  }}>
                    Customer
                  </Typography>
                </TableCell>
                {!isMobile && (
                  <TableCell sx={{ width: '10%' }}>
                    <Typography variant={TYPOGRAPHY_STYLES.tableHeader.variant} sx={{
                    fontWeight: TYPOGRAPHY_STYLES.tableHeader.fontWeight,
                    color: TYPOGRAPHY_STYLES.tableHeader.color,
                    fontSize: TYPOGRAPHY_STYLES.tableHeader.fontSize
                  }}>
                      Type
                    </Typography>
                  </TableCell>
                )}
                <TableCell sx={{ width: isMobile ? '25%' : '18%' }}>
                  <Typography variant={TYPOGRAPHY_STYLES.tableHeader.variant} sx={{
                    fontWeight: TYPOGRAPHY_STYLES.tableHeader.fontWeight,
                    color: TYPOGRAPHY_STYLES.tableHeader.color,
                    fontSize: TYPOGRAPHY_STYLES.tableHeader.fontSize
                  }}>
                    Contact
                  </Typography>
                </TableCell>
                {!isMobile && (
                  <TableCell sx={{ width: '10%' }}>
                    <Typography variant={TYPOGRAPHY_STYLES.tableHeader.variant} sx={{
                    fontWeight: TYPOGRAPHY_STYLES.tableHeader.fontWeight,
                    color: TYPOGRAPHY_STYLES.tableHeader.color,
                    fontSize: TYPOGRAPHY_STYLES.tableHeader.fontSize
                  }}>
                      Sales
                    </Typography>
                  </TableCell>
                )}
                <TableCell align="right" sx={{ width: isMobile ? '40%' : '15%' }}>
                  <Typography variant={TYPOGRAPHY_STYLES.tableHeader.variant} sx={{
                    fontWeight: TYPOGRAPHY_STYLES.tableHeader.fontWeight,
                    color: TYPOGRAPHY_STYLES.tableHeader.color,
                    fontSize: TYPOGRAPHY_STYLES.tableHeader.fontSize
                  }}>
                    Actions
                  </Typography>
                </TableCell>
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
                  <TableRow 
                    key={customer.id} 
                    hover
                    tabIndex={0}
                    sx={{
                      '&:hover, &:focus-within': {
                        backgroundColor: 'action.hover',
                        '& .customer-actions': {
                          opacity: 1
                        }
                      },
                      transition: 'background-color 0.2s ease',
                      cursor: 'default',
                      height: TABLE_STYLES.row.height
                    }}
                  >
                    <TableCell>
                      <Box>
                        <Typography variant={TYPOGRAPHY_STYLES.tableCell.primary.variant} sx={{
                          fontWeight: 400,
                          fontSize: TYPOGRAPHY_STYLES.tableCell.primary.fontSize,
                          lineHeight: TYPOGRAPHY_STYLES.tableCell.primary.lineHeight
                        }}>
                          {customer.name}
                        </Typography>
                      </Box>
                      {/* Mobile-only type and active status indicators */}
                      {isMobile && (
                        <Box sx={{ mt: 0.5, display: 'flex', gap: 0.5 }}>
                          <Chip
                            label={customer.type === CustomerType.BUSINESS ? 'Business' : 'Individual'}
                            size="small"
                            variant="outlined"
                            sx={{ fontSize: TYPOGRAPHY_STYLES.mobile.caption.fontSize }}
                          />
                          {getActiveStatusChip(customer.isActive)}
                        </Box>
                      )}
                    </TableCell>
                    {!isMobile && (
                      <TableCell>
                        <Chip
                          label={customer.type === CustomerType.BUSINESS ? 'Business' : 'Individual'}
                          size="small"
                          variant="outlined"
                          sx={{
                            fontSize: TYPOGRAPHY_STYLES.chip.small.fontSize,
                            fontWeight: TYPOGRAPHY_STYLES.chip.small.fontWeight,
                            height: `${TABLE_STYLES.row.height * 0.65}px`, // Scale to 65% of row height for better proportion
                            '& .MuiChip-label': {
                              fontSize: `${Math.max(10, TABLE_STYLES.row.height * 0.35)}px`, // Scale font size with row height
                              lineHeight: 1
                            }
                          }}
                        />
                      </TableCell>
                    )}
                    <TableCell>
                      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.25 }}>
                        {customer.phone && (
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                            <PhoneIcon sx={{ fontSize: 14, color: 'text.secondary' }} />
                            <Typography variant={TYPOGRAPHY_STYLES.tableCell.caption.variant} sx={{ fontSize: TYPOGRAPHY_STYLES.tableCell.caption.fontSize }}>{customer.phone}</Typography>
                          </Box>
                        )}
                      </Box>
                    </TableCell>
                    {!isMobile && (
                      <TableCell>
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.25 }}>
                          <Typography variant={TYPOGRAPHY_STYLES.tableCell.caption.variant} color="text.secondary" sx={{ fontSize: TYPOGRAPHY_STYLES.tableCell.caption.fontSize }}>
                            {customer.totalOrders} orders
                          </Typography>
                          <Typography variant={TYPOGRAPHY_STYLES.tableCell.caption.variant} color="text.secondary" sx={{ fontSize: TYPOGRAPHY_STYLES.tableCell.caption.fontSize }}>
                            {formatCurrency(customer.totalSales)}
                          </Typography>
                        </Box>
                      </TableCell>
                    )}
                    <TableCell align="right">
                      <Box
                        className="customer-actions"
                        sx={{
                          display: 'flex',
                          justifyContent: 'flex-end',
                          alignItems: 'center',
                          height: '100%', // Fill the full cell height
                          gap: 0.25,
                          opacity: isMobile ? 1 : 0.7,
                          transition: 'opacity 0.2s ease'
                        }}
                      >

                        {/* Standard Action Buttons */}
                        <IconButton
                          size="small"
                          title={`Edit ${customer.name}`}
                          aria-label={`Edit customer ${customer.name}`}
                          onClick={() => handleOpenForm(customer)}
                          sx={{
                            height: `${TABLE_STYLES.row.height * 0.75}px`, // Scale to 75% of row height
                            width: `${TABLE_STYLES.row.height * 0.75}px`, // Square aspect ratio
                            minHeight: 20, // Reduced minimum size for better scaling
                            minWidth: 20,
                            p: 0.125, // Reduced padding for better proportion
                            '&:hover': {
                              backgroundColor: 'action.hover',
                              color: 'primary.main'
                            }
                          }}
                        >
                          <EditIcon sx={{
                            fontSize: `${TABLE_STYLES.row.height * 0.5}px` // Scale to 50% of row height for better proportion
                          }} />
                        </IconButton>
                        <IconButton
                          size="small"
                          title={`Delete ${customer.name}`}
                          aria-label={`Delete customer ${customer.name}`}
                          onClick={() => {
                            setSelectedCustomer(customer)
                            setIsDeleteConfirmOpen(true)
                          }}
                          sx={{
                            height: `${TABLE_STYLES.row.height * 0.75}px`, // Scale to 75% of row height
                            width: `${TABLE_STYLES.row.height * 0.75}px`, // Square aspect ratio
                            minHeight: 20, // Reduced minimum size for better scaling
                            minWidth: 20,
                            p: 0.125, // Reduced padding for better proportion
                            '&:hover': {
                              backgroundColor: 'error.light',
                              color: 'error.main'
                            }
                          }}
                        >
                          <DeleteIcon sx={{
                            fontSize: `${TABLE_STYLES.row.height * 0.5}px` // Scale to 50% of row height for better proportion
                          }} />
                        </IconButton>
                        <IconButton
                          size="small"
                          title={`View ${customer.name} details`}
                          aria-label={`View customer ${customer.name} details`}
                          onClick={() => handleViewCustomer(customer)}
                          sx={{
                            height: `${TABLE_STYLES.row.height * 0.75}px`, // Scale to 75% of row height
                            width: `${TABLE_STYLES.row.height * 0.75}px`, // Square aspect ratio
                            minHeight: 20, // Reduced minimum size for better scaling
                            minWidth: 20,
                            p: 0.125, // Reduced padding for better proportion
                            '&:hover': {
                              backgroundColor: 'action.hover',
                              color: 'primary.main'
                            }
                          }}
                        >
                          <ViewIcon sx={{
                            fontSize: `${TABLE_STYLES.row.height * 0.5}px` // Scale to 50% of row height for better proportion
                          }} />
                        </IconButton>
                      </Box>
                      {/* Mobile-only additional info */}
                      {isMobile && (
                        <Box sx={{ mt: 0.25, textAlign: 'right' }}>
                          <Typography variant={TYPOGRAPHY_STYLES.tableCell.caption.variant} color="text.secondary" sx={{ fontSize: TYPOGRAPHY_STYLES.mobile.caption.fontSize }}>
                            {customer.totalOrders} orders • {formatCurrency(customer.totalSales)}
                          </Typography>
                        </Box>
                      )}
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
                  name="name"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      fullWidth
                      label="Customer Name"
                      error={!!errors.name}
                      helperText={errors.name?.message}
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
                      value={field.value || ''}
                      fullWidth
                      label="Phone"
                      error={!!errors.phone || !!phoneError}
                      helperText={errors.phone?.message || phoneError}
                      onChange={(e) => {
                        field.onChange(e)
                        setPhoneValue(e.target.value)
                        debouncedPhoneCheck(e.target.value)
                      }}
                      InputProps={{
                        endAdornment: isCheckingPhone ? (
                          <InputAdornment position="end">
                            <CircularProgress size={20} />
                          </InputAdornment>
                        ) : undefined,
                      }}
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
                      value={field.value || ''}
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
            <Button type="submit" variant="contained" disabled={loading || !!phoneError || isCheckingPhone}>
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
                <Box sx={{ mb: 2 }}>
                  <Typography variant="h5" fontWeight={600} sx={{ mb: 1 }}>
                    {selectedCustomer.name}
                  </Typography>
                  {getActiveStatusChip(selectedCustomer.isActive)}
                </Box>
              </Grid>

              <Grid item xs={12} md={6}>
                <Typography variant="h6" gutterBottom>Contact Information</Typography>
                <Stack spacing={1}>
                  {selectedCustomer.phone && (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <PhoneIcon sx={{ fontSize: 18, color: 'text.secondary' }} />
                      <Typography>{selectedCustomer.phone}</Typography>
                    </Box>
                  )}
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
                    <Typography fontWeight={600}>{formatCurrency(selectedCustomer.totalSales)}</Typography>
                  </Box>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Typography color="text.secondary">Average Order:</Typography>
                    <Typography fontWeight={600}>{formatCurrency(selectedCustomer.averageOrderValue)}</Typography>
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
      <ConfirmationDialog
        open={isDeleteConfirmOpen}
        title="Confirm Delete"
        message={`Are you sure you want to delete "${selectedCustomer?.name}"? This will move it to deleted items.`}
        confirmText="Delete Customer"
        cancelText="Cancel"
        onConfirm={handleDelete}
        onCancel={() => setIsDeleteConfirmOpen(false)}
        severity="warning"
        loading={loading}
      />

      {/* Deleted Customers Dialog */}
      <DeletedCustomersDialog
        open={isDeletedDialogOpen}
        onClose={() => setIsDeletedDialogOpen(false)}
      />
    </Box>
  )
}

export default CustomersPage
