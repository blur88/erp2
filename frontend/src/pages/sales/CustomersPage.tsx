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
  TableSortLabel,
  Alert,
  CircularProgress,
  useTheme,
  useMediaQuery,
  Tooltip,
  Stack,
} from '@mui/material'
import {
  Edit as EditIcon,
  Delete as DeleteIcon,
  Visibility as ViewIcon,
  AccountBalance as CreditIcon,
  Phone as PhoneIcon,
  TrendingUp as SalesIcon,
  LocationOn as LocationIcon,
} from '@mui/icons-material'
import { useLocation, useNavigate } from 'react-router-dom'
import { useForm, Controller } from 'react-hook-form'
import { yupResolver } from '@hookform/resolvers/yup'
import * as yup from 'yup'
import { ListSkeleton } from '@/components/common/ListSkeleton'
import { FilterBar } from '@/components/filters'
import { useFilterBar } from '@/hooks/useFilterBar'
import { useNotification } from '@/hooks/useNotification'
import { useKeyboardShortcuts } from '@/hooks/useSearchAndFilter'
import {
  useCreateCustomerMutation,
  useDeleteCustomerMutation,
  useGetCustomersQuery,
  useUpdateCustomerMutation,
} from '@/store/api/salesApi'
import type { Customer } from '@/types'
import { CustomerType } from '@/types'
import api from '@/services/api'
import { formatCurrency } from '@/utils/currency'
import { formatDate } from '@/utils/formatters'
import DeletedCustomersDialog from '@/components/sales/DeletedCustomersDialog'
import PriceListSelector from '@/components/price-lists/PriceListSelector'
import ConfirmationDialog from '@/components/common/ConfirmationDialog'
import PageHeader from '@/components/common/PageHeader'
import { TABLE_STYLES } from '@/constants/tableStyles'
import type { FilterBarConfig } from '@/types/filterBar.types'

// Form validation schema
const customerSchema = yup.object({
  name: yup.string().required('Name is required').max(200, 'Name must be less than 200 characters'),
  type: yup.string().oneOf(['individual', 'business']).required('Type is required'),
  phone: yup.string().optional().nullable().transform((value) => value?.trim() || null).max(20, 'Phone must be less than 20 characters'),
  streetAddress: yup.string().optional().nullable().transform((value) => value?.trim() || null).max(255, 'Street address must be less than 255 characters'),
  city: yup.string().optional().nullable().transform((value) => value?.trim() || null).max(100, 'City must be less than 100 characters'),
  state: yup.string().optional().nullable().transform((value) => value?.trim() || null).max(100, 'State must be less than 100 characters'),
  postalCode: yup.string().optional().nullable().transform((value) => value?.trim() || null).max(20, 'Postal code must be less than 20 characters'),
  country: yup.string().optional().nullable().transform((value) => value?.trim() || null).max(100, 'Country must be less than 100 characters'),
  priceListId: yup.string().optional().nullable(),
  notes: yup.string().optional().nullable().transform((value) => value?.trim() || null),
})

interface CustomerFormData {
  name: string
  type: CustomerType
  phone?: string | null
  streetAddress?: string | null
  city?: string | null
  state?: string | null
  postalCode?: string | null
  country?: string | null
  priceListId?: string | null
  notes?: string | null
}

interface CustomerFilters {
  search: string
  status: 'active' | 'inactive' | null
}

interface CustomerSortState {
  sortBy?: string
  sortOrder?: 'ASC' | 'DESC'
}

const CustomersPage: React.FC = () => {
  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down('md'))
  const location = useLocation()
  const navigate = useNavigate()
  const { showSuccess, showError } = useNotification()
  const searchInputRef = useRef<HTMLInputElement | null>(null)

  // Local state
  const [sortState, setSortState] = useState<CustomerSortState>({
    sortBy: 'name',
    sortOrder: 'ASC',
  })
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false)
  const [isDeletedDialogOpen, setIsDeletedDialogOpen] = useState(false)
  const [phoneValue, setPhoneValue] = useState<string>('')
  const [isCheckingPhone, setIsCheckingPhone] = useState(false)
  const [phoneError, setPhoneError] = useState<string | null>(null)
  const [pageError, setPageError] = useState<string | null>(null)

  const filterConfig = useMemo<FilterBarConfig<CustomerFilters>>(
    () => ({
      search: { placeholder: 'Search by name or phone...' },
      fields: [
        {
          field: 'status',
          label: 'Status',
          type: 'select',
          options: [
            { value: 'active', label: 'Active' },
            { value: 'inactive', label: 'Inactive' },
          ],
        },
      ],
      defaults: { search: '', status: null },
    }),
    [],
  )

  const { appliedFilters, draftFilters, handlers, hasActiveFilters } = useFilterBar(filterConfig)

  const customerQueryParams = useMemo(
    () => ({
      search: appliedFilters.search || undefined,
      isActive:
        appliedFilters.status === 'active'
          ? true
          : appliedFilters.status === 'inactive'
            ? false
            : undefined,
      sortBy: sortState.sortBy,
      sortOrder: sortState.sortOrder,
      limit: 999999,
    }),
    [appliedFilters, sortState],
  )

  const { data: customersResponse, isLoading, isFetching, error, refetch } = useGetCustomersQuery(customerQueryParams)
  const [createCustomer] = useCreateCustomerMutation()
  const [updateCustomer] = useUpdateCustomerMutation()
  const [deleteCustomer] = useDeleteCustomerMutation()
  const customers = customersResponse?.data ?? []
  const loading = isLoading || isFetching

  // Form setup
  const { control, handleSubmit, reset, formState: { errors }, setValue } = useForm<CustomerFormData>({
    resolver: yupResolver(customerSchema) as any,
    defaultValues: {
      name: '',
      type: CustomerType.BUSINESS,
      priceListId: null,
      phone: null,
      streetAddress: null,
      city: null,
      state: null,
      postalCode: null,
      country: null,
      notes: null,
    }
  })

  // Keyboard shortcuts - only search
  useKeyboardShortcuts({
    onSearch: () => {
      searchInputRef.current?.focus()
      searchInputRef.current?.select()
    },
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
        api.get('/customers', { params: { search: phone } }),
        api.get('/customers/deleted', { params: { search: phone } }),
      ])

      // Combine both active and deleted customers for duplicate checking
      const allCustomers = [
        ...(activeResponse.data?.data || []),
        ...(deletedResponse.data?.data || []),
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
          setPhoneError(`Phone number already exists for customer: ${duplicateCustomer.name}`)
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
      let timeoutId: ReturnType<typeof setTimeout>
      return (phone: string) => {
        clearTimeout(timeoutId)
        timeoutId = setTimeout(() => checkPhoneDuplicate(phone), 500)
      }
    },
    [checkPhoneDuplicate]
  )

  // Handle form submit
  const handleFormSubmit = async (data: CustomerFormData) => {
    try {
      // Ensure empty strings are converted to null for optional fields
      const cleanedData = {
        ...data,
        phone: data.phone?.trim() || null,
        streetAddress: data.streetAddress?.trim() || null,
        city: data.city?.trim() || null,
        state: data.state?.trim() || null,
        postalCode: data.postalCode?.trim() || null,
        country: data.country?.trim() || null,
        notes: data.notes?.trim() || null,
      }

      if (selectedCustomer) {
        await updateCustomer({ id: selectedCustomer.id, data: cleanedData }).unwrap()
        showSuccess('Customer updated successfully')
      } else {
        await createCustomer(cleanedData).unwrap()
        showSuccess('Customer created successfully')
      }
      handleCloseForm()
      setPageError(null)
      void refetch()
    } catch (error) {
      showError(`Failed to ${selectedCustomer ? 'update' : 'create'} customer: ${error}`)
    }
  }

  // Handle delete
  const handleDelete = async () => {
    if (!selectedCustomer) return
    try {
      await deleteCustomer(selectedCustomer.id).unwrap()

      // If we get here, deletion was successful
      showSuccess(`Customer "${selectedCustomer.name}" deleted successfully`)
      setIsDeleteConfirmOpen(false)
      setSelectedCustomer(null)

      // Refresh the customer list to ensure consistency
      setPageError(null)
      void refetch()
    } catch (error: any) {
      // Handle error responses with detailed information
      let errorTitle = 'Failed to Delete Customer'
      let errorMessage = 'An unexpected error occurred. Please try again.'

      console.log('Delete error:', error) // Debug log

      // Handle both direct errors and Redux rejection values
      const actualError = error?.payload || error

      // Handle axios error responses - check multiple possible error structures
      if (actualError?.response?.data) {
        const backendError = actualError.response.data
        console.log('Backend error:', backendError) // Debug log

        if (backendError.message) {
          // Use a concise error message that focuses on the key issue
          errorMessage = backendError.message

          // Add the most important suggestion (first one) if available
          if (backendError.suggestions && Array.isArray(backendError.suggestions) && backendError.suggestions.length > 0) {
            errorMessage += `\n\nSuggestion: ${backendError.suggestions[0]}`
          }

          // Customize title based on error type
          if (backendError.error === 'DELETION_PREVENTED_BY_DEPENDENCIES') {
            errorTitle = 'Cannot Delete Customer'
          }
        }
      } else if (actualError?.message && actualError.message !== 'Request failed with status code 400') {
        // Use the error message if it's meaningful
        errorMessage = actualError.message
      }

      setPageError(errorMessage)
      showError(errorMessage)
    }
  }


  // Form helpers
  const handleOpenForm = useCallback((customer?: Customer) => {
    setPhoneError(null)
    setIsCheckingPhone(false)
    if (customer) {
      setSelectedCustomer(customer)
      setPhoneValue(customer.phone || '')
      reset({
        name: customer.name,
        type: customer.type,
        priceListId: customer.priceListId || null,
        phone: customer.phone || null,
        streetAddress: customer.streetAddress || null,
        city: customer.city || null,
        state: customer.state || null,
        postalCode: customer.postalCode || null,
        country: customer.country || null,
        notes: customer.notes || null,
      })
    } else {
      setSelectedCustomer(null)
      setPhoneValue('')
      reset({
        name: '',
        type: CustomerType.BUSINESS,
        priceListId: null,
        phone: null,
        streetAddress: null,
        city: null,
        state: null,
        postalCode: null,
        country: null,
        notes: null,
      })
    }
    setIsFormOpen(true)
  }, [reset, setSelectedCustomer, setPhoneValue, setPhoneError, setIsCheckingPhone, setIsFormOpen])

  // Handle edit-from-profile navigation: list page receives editCustomerId in route state
  useEffect(() => {
    const state = location.state as { editCustomerId?: string } | null
    if (!state?.editCustomerId) {
      return
    }

    const customerToEdit = customers.find(c => c.id === state.editCustomerId)
    if (customerToEdit) {
      handleOpenForm(customerToEdit)
      navigate('/sales/customers', { replace: true, state: {} })
    }
  }, [location.state, customers, navigate, handleOpenForm])

  const handleCloseForm = () => {
    setIsFormOpen(false)
    setSelectedCustomer(null)
    setPhoneError(null)
    setIsCheckingPhone(false)
    setPhoneValue('')
    reset()
  }

  const handleViewCustomer = (customer: Customer) => {
    navigate(`/sales/customers/${customer.id}`)
  }

  const handleSort = (sortBy: string) => {
    setSortState((prev) => ({
      ...prev,
      sortBy,
      sortOrder: prev.sortBy === sortBy && prev.sortOrder === 'ASC' ? 'DESC' : 'ASC',
    }))
  }

  return (
    <Box sx={{ p: 3 }}>
      <PageHeader
        title="Customers"
        subtitle="View customer profiles and client account details"
        secondaryAction={{ label: 'View Deleted', onClick: () => setIsDeletedDialogOpen(true) }}
        primaryAction={{ label: 'New Customer', onClick: () => handleOpenForm() }}
      />
      {/* Filters and Search */}
      <Paper sx={{ p: 2, mb: 3 }}>
        <FilterBar
          config={filterConfig}
          draftFilters={draftFilters}
          handlers={handlers}
          hasActiveFilters={hasActiveFilters}
          searchInputRef={searchInputRef}
        />
      </Paper>
      {/* Error Alert */}
      {(pageError || error) && (
        <Alert severity="error" sx={{ mb: 3 }} onClose={() => setPageError(null)}>
          {pageError || 'Failed to load customers.'}
        </Alert>
      )}
      {/* Customer Table */}
      <Paper sx={{ borderRadius: 2, overflow: 'hidden' }}>
        {(isLoading || (isFetching && !customersResponse)) ? (
          <ListSkeleton rows={8} columns={4} />
        ) : (
          <Box sx={{ opacity: isFetching ? 0.6 : 1, position: 'relative' }}>
            {isFetching && (
              <CircularProgress size={16} sx={{ position: 'absolute', top: 8, right: 8, zIndex: 1 }} />
            )}
            <TableContainer sx={{ overflowX: 'auto' }}>
              <Table
                size={TABLE_STYLES.size}
                sx={{
                  minWidth: isMobile ? 650 : 800,
                  '& .MuiTableCell-root': {
                    borderBottom: TABLE_STYLES.cell.border,
                    py: TABLE_STYLES.cell.padding.py,
                    px: TABLE_STYLES.cell.padding.px,
                  },
                }}
              >
                <TableHead>
                  <TableRow sx={{ '& .MuiTableCell-head': { fontWeight: 600, backgroundColor: 'grey.50', py: 1 } }}>
                    <TableCell sx={{ width: isMobile ? '35%' : '30%' }}>
                      <TableSortLabel
                        active={sortState.sortBy === 'name'}
                        direction={sortState.sortBy === 'name' ? (sortState.sortOrder?.toLowerCase() as 'asc' | 'desc') : 'asc'}
                        onClick={() => handleSort('name')}
                        sx={{
                          fontWeight: 600,
                          color: 'text.primary',
                          fontSize: '0.8rem',
                        }}
                      >
                        Name
                      </TableSortLabel>
                    </TableCell>
                    {!isMobile && (
                      <TableCell sx={{ width: '10%' }}>
                        <Typography variant="tableHeader" sx={{
                          fontWeight: 600,
                          color: 'text.primary',
                          fontSize: '0.8rem',
                        }}>
                          Type
                        </Typography>
                      </TableCell>
                    )}
                    <TableCell sx={{ width: isMobile ? '25%' : '15%' }}>
                      <Typography variant="tableHeader" sx={{
                        fontWeight: 600,
                        color: 'text.primary',
                        fontSize: '0.8rem',
                      }}>
                        Contact
                      </Typography>
                    </TableCell>
                    {!isMobile && (
                      <TableCell sx={{ width: '12%' }}>
                        <Typography variant="tableHeader" sx={{
                          fontWeight: 600,
                          color: 'text.primary',
                          fontSize: '0.8rem',
                        }}>
                          Price Level
                        </Typography>
                      </TableCell>
                    )}
                    {!isMobile && (
                      <TableCell sx={{ width: '8%' }}>
                        <TableSortLabel
                          active={sortState.sortBy === 'totalOrders'}
                          direction={sortState.sortBy === 'totalOrders' ? (sortState.sortOrder?.toLowerCase() as 'asc' | 'desc') : 'asc'}
                          onClick={() => handleSort('totalOrders')}
                          sx={{
                            fontWeight: 600,
                            color: 'text.primary',
                            fontSize: '0.8rem',
                          }}
                        >
                          Total Orders
                        </TableSortLabel>
                      </TableCell>
                    )}
                    {!isMobile && (
                      <TableCell sx={{ width: '10%' }}>
                        <TableSortLabel
                          active={sortState.sortBy === 'totalSales'}
                          direction={sortState.sortBy === 'totalSales' ? (sortState.sortOrder?.toLowerCase() as 'asc' | 'desc') : 'asc'}
                          onClick={() => handleSort('totalSales')}
                          sx={{
                            fontWeight: 600,
                            color: 'text.primary',
                            fontSize: '0.8rem',
                          }}
                        >
                          Total Sales
                        </TableSortLabel>
                      </TableCell>
                    )}
                    {!isMobile && (
                      <TableCell sx={{ width: '10%' }}>
                        <TableSortLabel
                          active={sortState.sortBy === 'lastPurchaseDate'}
                          direction={sortState.sortBy === 'lastPurchaseDate' ? (sortState.sortOrder?.toLowerCase() as 'asc' | 'desc') : 'asc'}
                          onClick={() => handleSort('lastPurchaseDate')}
                          sx={{
                            fontWeight: 600,
                            color: 'text.primary',
                            fontSize: '0.8rem',
                          }}
                        >
                          Last Purchase
                        </TableSortLabel>
                      </TableCell>
                    )}
                    <TableCell align="right" sx={{ width: isMobile ? '40%' : '15%' }}>
                      <Typography variant="tableHeader" sx={{
                        fontWeight: 600,
                        color: 'text.primary',
                        fontSize: '0.8rem',
                      }}>
                        Actions
                      </Typography>
                    </TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {customers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} align="center">
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
                        <Typography variant="body2" sx={{
                          fontWeight: 400,
                          fontSize: '0.8rem',
                          lineHeight: 1.2,
                          cursor: 'pointer',
                          color: 'primary.main',
                          '&:hover': { textDecoration: 'underline' }
                        }}>
                          <Box component="span" onClick={() => navigate(`/sales/customers/${customer.id}`)}>
                            {customer.name}
                          </Box>
                        </Typography>
                      </Box>
                      {/* Mobile-only type and price level indicators */}
                      {isMobile && (
                        <Box sx={{ mt: 0.5, display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                          <Chip
                            label={customer.type === CustomerType.BUSINESS ? 'Business' : 'Individual'}
                            size="small"
                            variant="outlined"
                            sx={{ fontSize: '0.65rem' }}
                          />
                          {customer.priceList && (
                            <Chip
                              label={customer.priceList.name}
                              size="small"
                              color={customer.priceList.isDefault ? 'primary' : 'secondary'}
                              sx={{ fontSize: '0.65rem' }}
                            />
                          )}
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
                            fontSize: '0.7rem',
                            fontWeight: 500,
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
                            <Typography variant="tableCaption" sx={{ fontSize: '0.7rem' }}>{customer.phone}</Typography>
                          </Box>
                        )}
                      </Box>
                    </TableCell>
                    {!isMobile && (
                      <TableCell>
                        {customer.priceList ? (
                          <Chip
                            label={customer.priceList.name}
                            size="small"
                            color={customer.priceList.isDefault ? 'primary' : 'secondary'}
                            sx={{
                              fontSize: '0.7rem',
                              fontWeight: 500,
                              height: `${TABLE_STYLES.row.height * 0.65}px`,
                              '& .MuiChip-label': {
                                fontSize: `${Math.max(10, TABLE_STYLES.row.height * 0.35)}px`,
                                lineHeight: 1
                              }
                            }}
                          />
                        ) : (
                          <Typography variant="caption" color="text.secondary">
                            None
                          </Typography>
                        )}
                      </TableCell>
                    )}
                    {!isMobile && (
                      <TableCell>
                        <Typography variant="tableCaption" color="text.secondary" sx={{ fontSize: '0.7rem' }}>
                          {customer.totalOrders}
                        </Typography>
                      </TableCell>
                    )}
                    {!isMobile && (
                      <TableCell>
                        <Typography variant="tableCaption" color="text.secondary" sx={{ fontSize: '0.7rem' }}>
                          {formatCurrency(customer.totalSales)}
                        </Typography>
                      </TableCell>
                    )}
                    {!isMobile && (
                      <TableCell>
                        <Typography variant="tableCaption" color="text.secondary" sx={{ fontSize: '0.7rem' }}>
                          {customer.lastPurchaseDate ? formatDate(customer.lastPurchaseDate) : 'Never'}
                        </Typography>
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
                          <Typography variant="tableCaption" color="text.secondary" sx={{ fontSize: '0.65rem' }}>
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
          </Box>
        )}
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
              <Grid size={12}>
                <Typography variant="h6" gutterBottom>
                  Basic Information
                </Typography>
              </Grid>
              
              <Grid
                size={{
                  xs: 12,
                  md: 6
                }}>
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

              <Grid
                size={{
                  xs: 12,
                  md: 6
                }}>
                <Controller
                  name="priceListId"
                  control={control}
                  render={({ field }) => (
                    <PriceListSelector
                      value={field.value}
                      onChange={(value) => field.onChange(value)}
                      error={errors.priceListId?.message}
                      label="Price List"
                    />
                  )}
                />
              </Grid>

              <Grid size={12}>
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

              <Grid
                size={{
                  xs: 12,
                  md: 6
                }}>
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

              {/* Address Information */}
              <Grid size={12}>
                <Typography variant="h6" gutterBottom sx={{ mt: 2 }}>
                  Address Information
                </Typography>
              </Grid>

              <Grid size={12}>
                <Controller
                  name="streetAddress"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      value={field.value || ''}
                      fullWidth
                      label="Street Address"
                      error={!!errors.streetAddress}
                      helperText={errors.streetAddress?.message}
                    />
                  )}
                />
              </Grid>

              <Grid
                size={{
                  xs: 12,
                  md: 6
                }}>
                <Controller
                  name="city"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      value={field.value || ''}
                      fullWidth
                      label="City"
                      error={!!errors.city}
                      helperText={errors.city?.message}
                    />
                  )}
                />
              </Grid>

              <Grid
                size={{
                  xs: 12,
                  md: 6
                }}>
                <Controller
                  name="state"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      value={field.value || ''}
                      fullWidth
                      label="State"
                      error={!!errors.state}
                      helperText={errors.state?.message}
                    />
                  )}
                />
              </Grid>

              <Grid
                size={{
                  xs: 12,
                  md: 6
                }}>
                <Controller
                  name="postalCode"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      value={field.value || ''}
                      fullWidth
                      label="Postal Code"
                      error={!!errors.postalCode}
                      helperText={errors.postalCode?.message}
                    />
                  )}
                />
              </Grid>

              <Grid
                size={{
                  xs: 12,
                  md: 6
                }}>
                <Controller
                  name="country"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      value={field.value || ''}
                      fullWidth
                      label="Country"
                      error={!!errors.country}
                      helperText={errors.country?.message}
                    />
                  )}
                />
              </Grid>

              {/* Notes */}
              <Grid size={12}>
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
  );
}

export default CustomersPage
