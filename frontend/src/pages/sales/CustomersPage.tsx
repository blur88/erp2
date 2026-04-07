import React, { useState, useRef, useMemo } from 'react'
import {
  Box,
  Typography,
  Paper,
  Chip,
  IconButton,
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
} from '@mui/material'
import {
  Edit as EditIcon,
  Delete as DeleteIcon,
  Visibility as ViewIcon,
  Phone as PhoneIcon,
} from '@mui/icons-material'
import { useNavigate } from 'react-router-dom'
import { ListSkeleton } from '@/components/common/ListSkeleton'
import { FilterBar } from '@/components/filters'
import { useFilterBar } from '@/hooks/useFilterBar'
import { useNotification } from '@/hooks/useNotification'
import { useKeyboardShortcuts } from '@/hooks/useSearchAndFilter'
import {
  useDeleteCustomerMutation,
  useGetCustomersQuery,
} from '@/store/api/salesApi'
import type { Customer } from '@/types'
import { CustomerType } from '@/types'
import { formatCurrency } from '@/utils/currency'
import { formatDate } from '@/utils/formatters'
import DeletedCustomersDialog from '@/components/sales/DeletedCustomersDialog'
import ConfirmationDialog from '@/components/common/ConfirmationDialog'
import PageHeader from '@/components/common/PageHeader'
import { TABLE_STYLES } from '@/constants/tableStyles'
import type { FilterBarConfig } from '@/types/filterBar.types'

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
  const navigate = useNavigate()
  const { showSuccess, showError } = useNotification()
  const searchInputRef = useRef<HTMLInputElement | null>(null)

  // Local state
  const [sortState, setSortState] = useState<CustomerSortState>({
    sortBy: 'name',
    sortOrder: 'ASC',
  })
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false)
  const [isDeletedDialogOpen, setIsDeletedDialogOpen] = useState(false)
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
    }),
    [appliedFilters, sortState],
  )

  const { data: customersResponse, isLoading, isFetching, error, refetch } = useGetCustomersQuery(customerQueryParams)
  const [deleteCustomer] = useDeleteCustomerMutation()
  const customers = customersResponse?.data ?? []
  const loading = isLoading || isFetching

  // Keyboard shortcuts - only search
  useKeyboardShortcuts({
    onSearch: () => {
      searchInputRef.current?.focus()
      searchInputRef.current?.select()
    },
  })

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

        }
      } else if (actualError?.message && actualError.message !== 'Request failed with status code 400') {
        // Use the error message if it's meaningful
        errorMessage = actualError.message
      }

      setPageError(errorMessage)
      showError(errorMessage)
    }
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
    <>
      <PageHeader
        title="Customers"
        subtitle="View customer profiles and client account details"
        variant="workflow"
        secondaryAction={{ label: 'View Deleted', onClick: () => setIsDeletedDialogOpen(true) }}
        primaryAction={{ label: 'New Customer', onClick: () => navigate('/sales/customers/create') }}
        toolbar={(
          <FilterBar
            config={filterConfig}
            draftFilters={draftFilters}
            handlers={handlers}
            hasActiveFilters={hasActiveFilters}
            searchInputRef={searchInputRef}
          />
        )}
      />
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
                          onClick={() => navigate(`/sales/customers/${customer.id}/edit`)}
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
    </>
  )
}

export default CustomersPage
