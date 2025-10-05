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
  Business as BusinessIcon,
  Phone as PhoneIcon,
  Refresh as RefreshIcon,
} from '@mui/icons-material'
import { useForm, Controller } from 'react-hook-form'
import { yupResolver } from '@hookform/resolvers/yup'
import * as yup from 'yup'
import { useAppDispatch, useAppSelector } from '@/hooks/useRedux'
import { useNotification } from '@/hooks/useNotification'
import { useSearchAndFilter, useKeyboardShortcuts } from '@/hooks/useSearchAndFilter'
import {
  fetchSuppliers,
  createSupplier,
  updateSupplier,
  deleteSupplier,
  selectSuppliers,
  selectSuppliersLoading,
  selectSuppliersError,
  selectSuppliersPagination,
  selectSuppliersFilters,
  setFilters,
  clearError,
} from '@/store/slices/supplierSlice'
import type { Supplier } from '@/types'
import { SupplierType } from '@/types'
import { purchasingApi } from '@/services/purchasingApi'
import { formatCurrency } from '@/utils/currency'
import DeletedSuppliersDialog from '@/components/purchasing/DeletedSuppliersDialog'
import ConfirmationDialog from '@/components/common/ConfirmationDialog'
import { TYPOGRAPHY_STYLES, TABLE_STYLES } from '@/constants/typography'

// Form validation schema
const supplierSchema = yup.object({
  companyName: yup.string().required('Company name is required').max(200, 'Name must be less than 200 characters'),
  type: yup.string().oneOf(['local', 'international']).required('Type is required'),
  contactPerson: yup.string().optional().nullable().transform((value) => value?.trim() || null).max(200, 'Name must be less than 200 characters'),
  phone: yup.string().optional().nullable().transform((value) => value?.trim() || null).max(20, 'Phone must be less than 20 characters'),
  notes: yup.string().optional().nullable().transform((value) => value?.trim() || null),
})

interface SupplierFormData {
  companyName: string
  type: SupplierType
  contactPerson?: string | null
  phone?: string | null
  notes?: string | null
}

const SuppliersPage: React.FC = () => {
  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down('md'))
  const dispatch = useAppDispatch()
  const { showSuccess, showError } = useNotification()

  // Redux state
  const suppliers = useAppSelector(selectSuppliers)
  const loading = useAppSelector(selectSuppliersLoading)
  const error = useAppSelector(selectSuppliersError)
  const pagination = useAppSelector(selectSuppliersPagination)
  const filters = useAppSelector(selectSuppliersFilters)

  // Local state
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null)
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [isViewOpen, setIsViewOpen] = useState(false)
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false)
  const [isDeletedDialogOpen, setIsDeletedDialogOpen] = useState(false)

  // Form setup
  const { control, handleSubmit, reset, formState: { errors } } = useForm<SupplierFormData>({
    resolver: yupResolver(supplierSchema) as any,
    defaultValues: {
      companyName: '',
      type: SupplierType.LOCAL,
      contactPerson: null,
      phone: null,
      notes: null,
    }
  })

  // Search and filter functionality
  const searchHookInitialized = useRef(false)
  const { searchTerm, setSearchTerm, focusSearchInput } = useSearchAndFilter({
    initialSearchTerm: filters.search || '',
    onSearchChange: (searchTerm) => {
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
    onRefresh: () => dispatch(fetchSuppliers({ ...filters })),
  })

  // Load suppliers on mount and when filters change
  useEffect(() => {
    dispatch(fetchSuppliers({ ...filters }))
  }, [dispatch, filters.search, filters.type, filters.sortBy, filters.sortOrder])

  // Handle pagination
  const handleChangePage = (event: unknown, newPage: number) => {
    dispatch(fetchSuppliers({ ...filters, page: newPage + 1 }))
  }

  const handleChangeRowsPerPage = (event: React.ChangeEvent<HTMLInputElement>) => {
    dispatch(fetchSuppliers({ ...filters, page: 1, limit: parseInt(event.target.value) }))
  }

  // Handle form submit
  const handleFormSubmit = async (data: SupplierFormData) => {
    try {
      const cleanedData = {
        ...data,
        contactPerson: data.contactPerson?.trim() || null,
        phone: data.phone?.trim() || null,
        notes: data.notes?.trim() || null,
      }

      if (selectedSupplier) {
        await dispatch(updateSupplier({ id: selectedSupplier.id, data: cleanedData })).unwrap()
        showSuccess('Supplier updated successfully')
      } else {
        await dispatch(createSupplier(cleanedData)).unwrap()
        showSuccess('Supplier created successfully')
      }
      handleCloseForm()
      dispatch(fetchSuppliers({
        ...filters,
        page: pagination.page,
        limit: pagination.limit,
      }))
    } catch (error) {
      showError(`Failed to ${selectedSupplier ? 'update' : 'create'} supplier: ${error}`)
    }
  }

  // Handle delete
  const handleDelete = async () => {
    if (!selectedSupplier) return
    try {
      await dispatch(deleteSupplier(selectedSupplier.id)).unwrap()
      showSuccess(`Supplier "${selectedSupplier.companyName}" deleted successfully`)
      setIsDeleteConfirmOpen(false)
      setSelectedSupplier(null)
      dispatch(fetchSuppliers({
        page: pagination.page,
        limit: pagination.limit,
        search: filters.search || undefined,
        type: filters.type || undefined,
        isActive: filters.isActive,
        sortBy: filters.sortBy || undefined,
        sortOrder: filters.sortOrder || undefined
      }))
    } catch (error: any) {
      let errorMessage = 'An unexpected error occurred. Please try again.'
      const actualError = error?.payload || error
      if (actualError?.response?.data) {
        const backendError = actualError.response.data
        if (backendError.message) {
          errorMessage = backendError.message
          if (backendError.suggestions && Array.isArray(backendError.suggestions) && backendError.suggestions.length > 0) {
            errorMessage += `\n\nSuggestion: ${backendError.suggestions[0]}`
          }
        }
      } else if (actualError?.message && actualError.message !== 'Request failed with status code 400') {
        errorMessage = actualError.message
      }
      showError(errorMessage)
    }
  }

  // Form helpers
  const handleOpenForm = (supplier?: Supplier) => {
    if (supplier) {
      setSelectedSupplier(supplier)
      reset({
        companyName: supplier.companyName,
        type: supplier.type,
        contactPerson: supplier.contactPerson || null,
        phone: supplier.phone || null,
        notes: supplier.notes || null,
      })
    } else {
      setSelectedSupplier(null)
      reset({
        companyName: '',
        type: SupplierType.LOCAL,
        contactPerson: null,
        phone: null,
        notes: null,
      })
    }
    setIsFormOpen(true)
  }

  const handleCloseForm = () => {
    setIsFormOpen(false)
    setSelectedSupplier(null)
    reset()
  }

  const handleViewSupplier = (supplier: Supplier) => {
    setSelectedSupplier(supplier)
    setIsViewOpen(true)
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
            <BusinessIcon sx={{
              fontSize: TYPOGRAPHY_STYLES.pageHeader.icon.fontSize,
              color: TYPOGRAPHY_STYLES.pageHeader.icon.color
            }} />
            Suppliers
          </Typography>
          <Typography variant={TYPOGRAPHY_STYLES.pageSubtitle.variant} color={TYPOGRAPHY_STYLES.pageSubtitle.color}>
            Manage your suppliers and vendor relationships ({suppliers.length} total)
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
            onClick={() => dispatch(fetchSuppliers({ ...filters, search: searchTerm }))}
            disabled={loading}
            size={isMobile ? "medium" : "medium"}
            fullWidth={isMobile}
          >
            {isMobile ? "Refresh Suppliers" : "Refresh"}
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
            {isMobile ? "Add New Supplier" : "Add Supplier"}
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
          placeholder="Search suppliers..."
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
            value={filters.type || 'all'}
            label="Type"
            onChange={(e) => dispatch(setFilters({ type: e.target.value === 'all' ? undefined : e.target.value as SupplierType }))}
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
              }
            }}
          >
            <MenuItem value="all">All</MenuItem>
            <MenuItem value={SupplierType.LOCAL}>Local</MenuItem>
            <MenuItem value={SupplierType.INTERNATIONAL}>International</MenuItem>
          </Select>
        </FormControl>
      </Box>

      {/* Error Alert */}
      {error && (
        <Alert severity="error" sx={{ mb: 3 }} onClose={() => dispatch(clearError())}>
          {error}
        </Alert>
      )}

      {/* Supplier Table */}
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
                <TableCell sx={{ width: isMobile ? '35%' : '25%' }}>
                  <Typography variant={TYPOGRAPHY_STYLES.tableHeader.variant} sx={{
                    fontWeight: TYPOGRAPHY_STYLES.tableHeader.fontWeight,
                    color: TYPOGRAPHY_STYLES.tableHeader.color,
                    fontSize: TYPOGRAPHY_STYLES.tableHeader.fontSize
                  }}>
                    Supplier
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
                <TableCell sx={{ width: isMobile ? '25%' : '15%' }}>
                  <Typography variant={TYPOGRAPHY_STYLES.tableHeader.variant} sx={{
                    fontWeight: TYPOGRAPHY_STYLES.tableHeader.fontWeight,
                    color: TYPOGRAPHY_STYLES.tableHeader.color,
                    fontSize: TYPOGRAPHY_STYLES.tableHeader.fontSize
                  }}>
                    Contact
                  </Typography>
                </TableCell>
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
                  <TableCell colSpan={8} align="center">
                    <CircularProgress />
                  </TableCell>
                </TableRow>
              ) : suppliers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} align="center">
                    <Typography variant="body2" color="text.secondary">
                      No suppliers found
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                suppliers.map((supplier) => (
                  <TableRow
                    key={supplier.id}
                    hover
                    tabIndex={0}
                    sx={{
                      '&:hover, &:focus-within': {
                        backgroundColor: 'action.hover',
                        '& .supplier-actions': {
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
                          {supplier.companyName}
                        </Typography>
                      </Box>
                      {isMobile && (
                        <Box sx={{ mt: 0.5, display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                          <Chip
                            label={supplier.type === SupplierType.LOCAL ? 'Local' : 'International'}
                            size="small"
                            variant="outlined"
                            sx={{ fontSize: TYPOGRAPHY_STYLES.mobile.caption.fontSize }}
                          />
                        </Box>
                      )}
                    </TableCell>
                    {!isMobile && (
                      <TableCell>
                        <Chip
                          label={supplier.type === SupplierType.LOCAL ? 'Local' : 'International'}
                          size="small"
                          variant="outlined"
                          sx={{
                            fontSize: TYPOGRAPHY_STYLES.chip.small.fontSize,
                            fontWeight: TYPOGRAPHY_STYLES.chip.small.fontWeight,
                            height: `${TABLE_STYLES.row.height * 0.65}px`,
                            '& .MuiChip-label': {
                              fontSize: `${Math.max(10, TABLE_STYLES.row.height * 0.35)}px`,
                              lineHeight: 1
                            }
                          }}
                        />
                      </TableCell>
                    )}
                    <TableCell>
                      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.25 }}>
                        {supplier.phone && (
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                            <PhoneIcon sx={{ fontSize: 14, color: 'text.secondary' }} />
                            <Typography variant={TYPOGRAPHY_STYLES.tableCell.caption.variant} sx={{ fontSize: TYPOGRAPHY_STYLES.tableCell.caption.fontSize }}>{supplier.phone}</Typography>
                          </Box>
                        )}
                        {supplier.contactPerson && (
                          <Typography variant={TYPOGRAPHY_STYLES.tableCell.caption.variant} color="text.secondary" sx={{ fontSize: TYPOGRAPHY_STYLES.tableCell.caption.fontSize }}>
                            {supplier.contactPerson}
                          </Typography>
                        )}
                      </Box>
                    </TableCell>
                    <TableCell align="right">
                      <Box
                        className="supplier-actions"
                        sx={{
                          display: 'flex',
                          justifyContent: 'flex-end',
                          alignItems: 'center',
                          height: '100%',
                          gap: 0.25,
                          opacity: isMobile ? 1 : 0.7,
                          transition: 'opacity 0.2s ease'
                        }}
                      >
                        <IconButton
                          size="small"
                          title={`Edit ${supplier.companyName}`}
                          aria-label={`Edit supplier ${supplier.companyName}`}
                          onClick={() => handleOpenForm(supplier)}
                          sx={{
                            height: `${TABLE_STYLES.row.height * 0.75}px`,
                            width: `${TABLE_STYLES.row.height * 0.75}px`,
                            minHeight: 20,
                            minWidth: 20,
                            p: 0.125,
                            '&:hover': {
                              backgroundColor: 'action.hover',
                              color: 'primary.main'
                            }
                          }}
                        >
                          <EditIcon sx={{
                            fontSize: `${TABLE_STYLES.row.height * 0.5}px`
                          }} />
                        </IconButton>
                        <IconButton
                          size="small"
                          title={`Delete ${supplier.companyName}`}
                          aria-label={`Delete supplier ${supplier.companyName}`}
                          onClick={() => {
                            setSelectedSupplier(supplier)
                            setIsDeleteConfirmOpen(true)
                          }}
                          sx={{
                            height: `${TABLE_STYLES.row.height * 0.75}px`,
                            width: `${TABLE_STYLES.row.height * 0.75}px`,
                            minHeight: 20,
                            minWidth: 20,
                            p: 0.125,
                            '&:hover': {
                              backgroundColor: 'error.light',
                              color: 'error.main'
                            }
                          }}
                        >
                          <DeleteIcon sx={{
                            fontSize: `${TABLE_STYLES.row.height * 0.5}px`
                          }} />
                        </IconButton>
                        <IconButton
                          size="small"
                          title={`View ${supplier.companyName} details`}
                          aria-label={`View supplier ${supplier.companyName} details`}
                          onClick={() => handleViewSupplier(supplier)}
                          sx={{
                            height: `${TABLE_STYLES.row.height * 0.75}px`,
                            width: `${TABLE_STYLES.row.height * 0.75}px`,
                            minHeight: 20,
                            minWidth: 20,
                            p: 0.125,
                            '&:hover': {
                              backgroundColor: 'action.hover',
                              color: 'primary.main'
                            }
                          }}
                        >
                          <ViewIcon sx={{
                            fontSize: `${TABLE_STYLES.row.height * 0.5}px`
                          }} />
                        </IconButton>
                      </Box>
                      {isMobile && (
                        <Box sx={{ mt: 0.25, textAlign: 'right' }}>
                          <Typography variant={TYPOGRAPHY_STYLES.tableCell.caption.variant} color="text.secondary" sx={{ fontSize: TYPOGRAPHY_STYLES.mobile.caption.fontSize }}>
                            {supplier.totalOrders} orders • {formatCurrency(supplier.totalPurchases)}
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

      {/* Supplier Form Dialog */}
      <Dialog
        open={isFormOpen}
        onClose={handleCloseForm}
        maxWidth="md"
        fullWidth
        fullScreen={isMobile}
      >
        <DialogTitle>
          {selectedSupplier ? 'Edit Supplier' : 'Add New Supplier'}
        </DialogTitle>
        <form onSubmit={handleSubmit(handleFormSubmit)}>
          <DialogContent dividers>
            <Grid container spacing={2}>
              <Grid item xs={12}>
                <Typography variant="h6" gutterBottom>
                  Basic Information
                </Typography>
              </Grid>

              <Grid item xs={12}>
                <Controller
                  name="type"
                  control={control}
                  render={({ field }) => (
                    <FormControl fullWidth error={!!errors.type}>
                      <InputLabel>Supplier Type</InputLabel>
                      <Select {...field} label="Supplier Type">
                        <MenuItem value={SupplierType.LOCAL}>Local</MenuItem>
                        <MenuItem value={SupplierType.INTERNATIONAL}>International</MenuItem>
                      </Select>
                    </FormControl>
                  )}
                />
              </Grid>

              <Grid item xs={12}>
                <Controller
                  name="companyName"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      fullWidth
                      label="Company Name"
                      error={!!errors.companyName}
                      helperText={errors.companyName?.message}
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
                      value={field.value || ''}
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
                  name="phone"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      value={field.value || ''}
                      fullWidth
                      label="Phone"
                      error={!!errors.phone}
                      helperText={errors.phone?.message}
                    />
                  )}
                />
              </Grid>

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
            <Button type="submit" variant="contained" disabled={loading}>
              {loading ? <CircularProgress size={20} /> : (selectedSupplier ? 'Update' : 'Create')}
            </Button>
          </DialogActions>
        </form>
      </Dialog>

      {/* Supplier Details Dialog */}
      <Dialog
        open={isViewOpen}
        onClose={() => setIsViewOpen(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>Supplier Details</DialogTitle>
        <DialogContent dividers>
          {selectedSupplier && (
            <Grid container spacing={2}>
              <Grid item xs={12}>
                <Box sx={{ mb: 2 }}>
                  <Typography variant="h5" fontWeight={600} sx={{ mb: 1 }}>
                    {selectedSupplier.companyName}
                  </Typography>
                </Box>
              </Grid>

              <Grid item xs={12} md={6}>
                <Typography variant="h6" gutterBottom>Contact Information</Typography>
                <Stack spacing={1}>
                  {selectedSupplier.contactPerson && (
                    <Box>
                      <Typography color="text.secondary" variant="caption">Contact Person</Typography>
                      <Typography>{selectedSupplier.contactPerson}</Typography>
                    </Box>
                  )}
                  {selectedSupplier.phone && (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <PhoneIcon sx={{ fontSize: 18, color: 'text.secondary' }} />
                      <Typography>{selectedSupplier.phone}</Typography>
                    </Box>
                  )}
                </Stack>
              </Grid>

              <Grid item xs={12} md={6}>
                <Typography variant="h6" gutterBottom>Purchase Statistics</Typography>
                <Stack spacing={1}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Typography color="text.secondary">Total Orders:</Typography>
                    <Typography fontWeight={600}>{selectedSupplier.totalOrders}</Typography>
                  </Box>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Typography color="text.secondary">Total Purchases:</Typography>
                    <Typography fontWeight={600}>{formatCurrency(selectedSupplier.totalPurchases)}</Typography>
                  </Box>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Typography color="text.secondary">Average Order:</Typography>
                    <Typography fontWeight={600}>{formatCurrency(selectedSupplier.averageOrderValue || 0)}</Typography>
                  </Box>
                  {selectedSupplier.lastPurchaseDate && (
                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                      <Typography color="text.secondary">Last Purchase:</Typography>
                      <Typography fontWeight={600}>
                        {new Date(selectedSupplier.lastPurchaseDate).toLocaleDateString()}
                      </Typography>
                    </Box>
                  )}
                </Stack>
              </Grid>

              {selectedSupplier.notes && (
                <Grid item xs={12}>
                  <Typography variant="h6" gutterBottom>Notes</Typography>
                  <Typography>{selectedSupplier.notes}</Typography>
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
              selectedSupplier && handleOpenForm(selectedSupplier)
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
        message={`Are you sure you want to delete "${selectedSupplier?.companyName}"? This will move it to deleted items.`}
        confirmText="Delete Supplier"
        cancelText="Cancel"
        onConfirm={handleDelete}
        onCancel={() => setIsDeleteConfirmOpen(false)}
        severity="warning"
        loading={loading}
      />

      {/* Deleted Suppliers Dialog */}
      <DeletedSuppliersDialog
        open={isDeletedDialogOpen}
        onClose={() => setIsDeletedDialogOpen(false)}
      />
    </Box>
  )
}

export default SuppliersPage
