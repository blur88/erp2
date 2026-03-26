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
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
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
  Phone as PhoneIcon,
  LocationOn as LocationIcon,
} from '@mui/icons-material'
import { useForm, Controller } from 'react-hook-form'
import { yupResolver } from '@hookform/resolvers/yup'
import * as yup from 'yup'
import { ListSkeleton } from '@/components/common/ListSkeleton'
import PageHeader from '@/components/common/PageHeader'
import { FilterBar, useFilterBar } from '@/components/filters'
import type { FilterBarConfig } from '@/components/filters'
import { useNotification } from '@/hooks/useNotification'
import { useKeyboardShortcuts } from '@/hooks/useSearchAndFilter'
import {
  useCreateSupplierMutation,
  useDeleteSupplierMutation,
  useGetSuppliersQuery,
  useLazyCheckDuplicateCompanyNameQuery,
  useUpdateSupplierMutation,
} from '@/store/api/purchasingApi'
import type { Supplier } from '@/types'
import { SupplierType } from '@/types'
import { formatCurrency } from '@/utils/currency'
import { formatDate } from '@/utils/formatters'
import DeletedSuppliersDialog from '@/components/purchasing/DeletedSuppliersDialog'
import ConfirmationDialog from '@/components/common/ConfirmationDialog'
import { TYPOGRAPHY_STYLES, TABLE_STYLES } from '@/constants/typography'

// Form validation schema
const supplierSchema = yup.object({
  companyName: yup.string().required('Company name is required').max(200, 'Name must be less than 200 characters'),
  type: yup.string().oneOf(['local', 'international']).required('Type is required'),
  contactPerson: yup.string().optional().nullable().transform((value) => value?.trim() || null).max(200, 'Name must be less than 200 characters'),
  phone: yup.string().optional().nullable().transform((value) => value?.trim() || null).max(20, 'Phone must be less than 20 characters'),
  streetAddress: yup.string().optional().nullable().transform((value) => value?.trim() || null).max(255, 'Street address must be less than 255 characters'),
  city: yup.string().optional().nullable().transform((value) => value?.trim() || null).max(100, 'City must be less than 100 characters'),
  state: yup.string().optional().nullable().transform((value) => value?.trim() || null).max(100, 'State must be less than 100 characters'),
  postalCode: yup.string().optional().nullable().transform((value) => value?.trim() || null).max(20, 'Postal code must be less than 20 characters'),
  country: yup.string().optional().nullable().transform((value) => value?.trim() || null).max(100, 'Country must be less than 100 characters'),
  notes: yup.string().optional().nullable().transform((value) => value?.trim() || null),
})

interface SupplierFormData {
  companyName: string
  type: SupplierType
  contactPerson?: string | null
  phone?: string | null
  streetAddress?: string | null
  city?: string | null
  state?: string | null
  postalCode?: string | null
  country?: string | null
  notes?: string | null
}

interface SupplierFilters {
  search: string
  status: 'active' | 'inactive' | null
  type: 'local' | 'international' | null
}

const SuppliersPage: React.FC = () => {
  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down('md'))
  const { showSuccess, showError } = useNotification()
  const searchInputRef = useRef<HTMLInputElement | null>(null)

  const filterConfig = useMemo<FilterBarConfig<SupplierFilters>>(
    () => ({
      search: { placeholder: 'Search by company name...' },
      quick: [
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
      advanced: [
        {
          field: 'type',
          label: 'Type',
          type: 'select',
          options: [
            { value: 'local', label: 'Local' },
            { value: 'international', label: 'International' },
          ],
        },
      ],
      defaults: { search: '', status: null, type: null },
    }),
    [],
  )

  const { appliedFilters, draftFilters, handlers, activeChips, hasActiveFilters, hasUnappliedChanges } = useFilterBar(filterConfig)

  const supplierQueryParams = useMemo(
    () => ({
      search: appliedFilters.search || undefined,
      isActive:
        appliedFilters.status === 'active'
          ? true
          : appliedFilters.status === 'inactive'
            ? false
            : undefined,
      type: appliedFilters.type ?? undefined,
    }),
    [appliedFilters],
  )

  const {
    data: suppliersResponse,
    isLoading: isSuppliersLoading,
    isFetching: isSuppliersFetching,
    error: suppliersQueryError,
    refetch: refetchSuppliers,
  } = useGetSuppliersQuery(supplierQueryParams)
  const [createSupplier, { isLoading: isCreatingSupplier }] = useCreateSupplierMutation()
  const [updateSupplier, { isLoading: isUpdatingSupplier }] = useUpdateSupplierMutation()
  const [deleteSupplier, { isLoading: isDeletingSupplier }] = useDeleteSupplierMutation()
  const [checkDuplicateCompanyName] = useLazyCheckDuplicateCompanyNameQuery()
  const suppliers = suppliersResponse?.data || []
  const isMutatingSupplier = isCreatingSupplier || isUpdatingSupplier || isDeletingSupplier
  const error =
    suppliersQueryError && typeof suppliersQueryError === 'object'
      ? ((suppliersQueryError as any).data?.message || (suppliersQueryError as any).data || 'Failed to load suppliers')
      : null

  // Local state
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null)
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [isViewOpen, setIsViewOpen] = useState(false)
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false)
  const [isDeletedDialogOpen, setIsDeletedDialogOpen] = useState(false)
  const [companyNameError, setCompanyNameError] = useState<string | null>(null)
  const [isCheckingDuplicate, setIsCheckingDuplicate] = useState(false)

  // Form setup
  const { control, handleSubmit, reset, formState: { errors }, watch } = useForm<SupplierFormData>({
    resolver: yupResolver(supplierSchema) as any,
    defaultValues: {
      companyName: '',
      type: SupplierType.LOCAL,
      contactPerson: null,
      phone: null,
      streetAddress: null,
      city: null,
      state: null,
      postalCode: null,
      country: null,
      notes: null,
    }
  })

  // Watch company name for real-time validation
  const companyName = watch('companyName')

  // Keyboard shortcuts - only search
  useKeyboardShortcuts({
    onSearch: () => {
      searchInputRef.current?.focus()
      searchInputRef.current?.select()
    },
  })

  // Load suppliers on mount and when filters change
  // Debounced duplicate check for company name
  useEffect(() => {
    // Skip check if dialog is not open
    if (!isFormOpen) {
      return
    }

    // Skip check if company name hasn't changed from original (when editing)
    if (selectedSupplier && companyName === selectedSupplier.companyName) {
      setCompanyNameError(null)
      setIsCheckingDuplicate(false)
      return
    }

    const checkDuplicate = async () => {
      if (!companyName || companyName.trim().length < 2) {
        setCompanyNameError(null)
        return
      }

      setIsCheckingDuplicate(true)
      try {
        const result = await checkDuplicateCompanyName({
          companyName: companyName.trim(),
          excludeId: selectedSupplier?.id,
        }).unwrap()

        if (result?.exists) {
          const errorMsg = result.message || 'This company name already exists'
          setCompanyNameError(errorMsg)
        } else {
          setCompanyNameError(null)
        }
      } catch (error) {
        setCompanyNameError(null)
      } finally {
        setIsCheckingDuplicate(false)
      }
    }

    const timer = setTimeout(checkDuplicate, 500)
    return () => {
      clearTimeout(timer)
    }
  }, [companyName, selectedSupplier?.id, isFormOpen, checkDuplicateCompanyName])

  // Handle form submit
  const handleFormSubmit = async (data: SupplierFormData) => {
    // Prevent submission if duplicate exists
    if (companyNameError) {
      showError(companyNameError)
      return
    }

    try {
      const cleanedData = {
        ...data,
        contactPerson: data.contactPerson?.trim() || null,
        phone: data.phone?.trim() || null,
        streetAddress: data.streetAddress?.trim() || null,
        city: data.city?.trim() || null,
        state: data.state?.trim() || null,
        postalCode: data.postalCode?.trim() || null,
        country: data.country?.trim() || null,
        notes: data.notes?.trim() || null,
      }

      if (selectedSupplier) {
        await updateSupplier({ id: selectedSupplier.id, data: cleanedData }).unwrap()
        showSuccess('Supplier updated successfully')
      } else {
        await createSupplier(cleanedData).unwrap()
        showSuccess('Supplier created successfully')
      }
      handleCloseForm()
      void refetchSuppliers()
    } catch (error: any) {
      // Extract error message from the response
      let errorMessage = `Failed to ${selectedSupplier ? 'update' : 'create'} supplier`

      if (error?.message) {
        errorMessage = error.message
      } else if (typeof error === 'string') {
        errorMessage = error
      }

      showError(errorMessage)
    }
  }

  // Handle delete
  const handleDelete = async () => {
    if (!selectedSupplier) return
    try {
      await deleteSupplier(selectedSupplier.id).unwrap()
      showSuccess(`Supplier "${selectedSupplier.companyName}" deleted successfully`)
      setIsDeleteConfirmOpen(false)
      setSelectedSupplier(null)
    } catch (error: any) {
      console.error('Delete failed:', error)
      let errorMessage = 'An unexpected error occurred. Please try again.'
      const actualError = error
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
    } finally {
      await refetchSuppliers()
    }
  }

  // Form helpers
  const handleOpenForm = (supplier?: Supplier) => {
    setCompanyNameError(null)
    setIsCheckingDuplicate(false)

    if (supplier) {
      setSelectedSupplier(supplier)
      reset({
        companyName: supplier.companyName,
        type: supplier.type,
        contactPerson: supplier.contactPerson || null,
        phone: supplier.phone || null,
        streetAddress: (supplier as any).streetAddress || null,
        city: (supplier as any).city || null,
        state: (supplier as any).state || null,
        postalCode: (supplier as any).postalCode || null,
        country: (supplier as any).country || null,
        notes: supplier.notes || null,
      })
    } else {
      setSelectedSupplier(null)
      reset({
        companyName: '',
        type: SupplierType.LOCAL,
        contactPerson: null,
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
  }

  const handleCloseForm = () => {
    setIsFormOpen(false)
    setSelectedSupplier(null)
    setCompanyNameError(null)
    setIsCheckingDuplicate(false)
    reset()
  }

  const handleViewSupplier = (supplier: Supplier) => {
    setSelectedSupplier(supplier)
    setIsViewOpen(true)
  }


  return (
    <Box sx={{ p: 3 }}>
      {/* Header */}
      <PageHeader
        title="Suppliers"
        subtitle="Manage your suppliers and vendor relationships"
        secondaryAction={{ label: 'View Deleted', onClick: () => setIsDeletedDialogOpen(true) }}
        primaryAction={{ label: 'Add Supplier', onClick: () => handleOpenForm() }}
      />
      {/* Filters and Search */}
      <Paper sx={{ p: 2, mb: 3 }}>
        <FilterBar
          config={filterConfig}
          draftFilters={draftFilters}
          handlers={handlers}
          activeChips={activeChips}
          hasActiveFilters={hasActiveFilters}
          hasUnappliedChanges={hasUnappliedChanges}
          searchInputRef={searchInputRef}
        />
      </Paper>
      {/* Error Alert */}
      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}
      {/* Supplier Table */}
      <Paper sx={{ borderRadius: 2, overflow: 'hidden' }}>
        {(isSuppliersLoading || (isSuppliersFetching && !suppliersResponse)) ? (
          <ListSkeleton rows={8} columns={4} />
        ) : (
          <Box sx={{ opacity: isSuppliersFetching ? 0.6 : 1, position: 'relative' }}>
            {isSuppliersFetching && (
              <CircularProgress size={16} sx={{ position: 'absolute', top: 8, right: 8 }} />
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
                    <TableCell sx={{ width: isMobile ? '35%' : '25%' }}>
                      <Typography variant={TYPOGRAPHY_STYLES.tableHeader.variant} sx={{
                        fontWeight: TYPOGRAPHY_STYLES.tableHeader.fontWeight,
                        color: TYPOGRAPHY_STYLES.tableHeader.color,
                        fontSize: TYPOGRAPHY_STYLES.tableHeader.fontSize,
                      }}>
                        Supplier
                      </Typography>
                    </TableCell>
                    {!isMobile && (
                      <TableCell sx={{ width: '10%' }}>
                        <Typography variant={TYPOGRAPHY_STYLES.tableHeader.variant} sx={{
                          fontWeight: TYPOGRAPHY_STYLES.tableHeader.fontWeight,
                          color: TYPOGRAPHY_STYLES.tableHeader.color,
                          fontSize: TYPOGRAPHY_STYLES.tableHeader.fontSize,
                        }}>
                          Type
                        </Typography>
                      </TableCell>
                    )}
                    <TableCell sx={{ width: isMobile ? '25%' : '15%' }}>
                      <Typography variant={TYPOGRAPHY_STYLES.tableHeader.variant} sx={{
                        fontWeight: TYPOGRAPHY_STYLES.tableHeader.fontWeight,
                        color: TYPOGRAPHY_STYLES.tableHeader.color,
                        fontSize: TYPOGRAPHY_STYLES.tableHeader.fontSize,
                      }}>
                        Contact
                      </Typography>
                    </TableCell>
                    {!isMobile && (
                      <TableCell sx={{ width: '12%' }}>
                        <Typography variant={TYPOGRAPHY_STYLES.tableHeader.variant} sx={{
                          fontWeight: TYPOGRAPHY_STYLES.tableHeader.fontWeight,
                          color: TYPOGRAPHY_STYLES.tableHeader.color,
                          fontSize: TYPOGRAPHY_STYLES.tableHeader.fontSize,
                        }}>
                          Phone
                        </Typography>
                      </TableCell>
                    )}
                    <TableCell align="right" sx={{ width: isMobile ? '40%' : '15%' }}>
                      <Typography variant={TYPOGRAPHY_STYLES.tableHeader.variant} sx={{
                        fontWeight: TYPOGRAPHY_STYLES.tableHeader.fontWeight,
                        color: TYPOGRAPHY_STYLES.tableHeader.color,
                        fontSize: TYPOGRAPHY_STYLES.tableHeader.fontSize,
                      }}>
                        Actions
                      </Typography>
                    </TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {suppliers.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} align="center">
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
                              opacity: 1,
                            },
                          },
                          transition: 'background-color 0.2s ease',
                          cursor: 'default',
                          height: TABLE_STYLES.row.height,
                        }}
                      >
                        <TableCell>
                          <Box>
                            <Typography variant={TYPOGRAPHY_STYLES.tableCell.primary.variant} sx={{
                              fontWeight: 400,
                              fontSize: TYPOGRAPHY_STYLES.tableCell.primary.fontSize,
                              lineHeight: TYPOGRAPHY_STYLES.tableCell.primary.lineHeight,
                            }}>
                              {supplier.companyName}
                            </Typography>
                          </Box>
                          {isMobile && (
                            <Box sx={{ mt: 0.5, display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                              <Chip
                                label={supplier.type === SupplierType.LOCAL ? 'Local' : 'International'}
                                size="small"
                                color={supplier.type === SupplierType.LOCAL ? 'primary' : 'secondary'}
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
                              color={supplier.type === SupplierType.LOCAL ? 'primary' : 'secondary'}
                              sx={{
                                fontSize: TYPOGRAPHY_STYLES.chip.small.fontSize,
                                fontWeight: TYPOGRAPHY_STYLES.chip.small.fontWeight,
                                height: `${TABLE_STYLES.row.height * 0.65}px`,
                                '& .MuiChip-label': {
                                  fontSize: `${Math.max(10, TABLE_STYLES.row.height * 0.35)}px`,
                                  lineHeight: 1,
                                },
                              }}
                            />
                          </TableCell>
                        )}
                        <TableCell>
                          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.25 }}>
                            {supplier.contactPerson && (
                              <Typography variant={TYPOGRAPHY_STYLES.tableCell.primary.variant} sx={{ fontSize: TYPOGRAPHY_STYLES.tableCell.primary.fontSize }}>
                                {supplier.contactPerson}
                              </Typography>
                            )}
                            {isMobile && supplier.phone && (
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                <PhoneIcon sx={{ fontSize: 14, color: 'text.secondary' }} />
                                <Typography variant={TYPOGRAPHY_STYLES.tableCell.caption.variant} sx={{ fontSize: TYPOGRAPHY_STYLES.tableCell.caption.fontSize }}>{supplier.phone}</Typography>
                              </Box>
                            )}
                          </Box>
                        </TableCell>
                        {!isMobile && (
                          <TableCell>
                            {supplier.phone && (
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                <PhoneIcon sx={{ fontSize: 14, color: 'text.secondary' }} />
                                <Typography variant={TYPOGRAPHY_STYLES.tableCell.primary.variant} sx={{ fontSize: TYPOGRAPHY_STYLES.tableCell.primary.fontSize }}>{supplier.phone}</Typography>
                              </Box>
                            )}
                          </TableCell>
                        )}
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
                              transition: 'opacity 0.2s ease',
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
                                color: 'primary.main',
                                '&:hover': {
                                  backgroundColor: 'primary.light',
                                  color: 'primary.dark',
                                },
                              }}
                            >
                              <EditIcon sx={{ fontSize: `${TABLE_STYLES.row.height * 0.5}px` }} />
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
                                color: 'error.main',
                                '&:hover': {
                                  backgroundColor: 'error.light',
                                  color: 'error.dark',
                                },
                              }}
                            >
                              <DeleteIcon sx={{ fontSize: `${TABLE_STYLES.row.height * 0.5}px` }} />
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
                                color: 'info.main',
                                '&:hover': {
                                  backgroundColor: 'info.light',
                                  color: 'info.dark',
                                },
                              }}
                            >
                              <ViewIcon sx={{ fontSize: `${TABLE_STYLES.row.height * 0.5}px` }} />
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
          </Box>
        )}
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
              <Grid size={12}>
                <Typography variant="h6" gutterBottom>
                  Basic Information
                </Typography>
              </Grid>

              <Grid size={12}>
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

              <Grid size={12}>
                <Controller
                  name="companyName"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      fullWidth
                      label="Company Name"
                      error={!!errors.companyName || !!companyNameError}
                      helperText={errors.companyName?.message || companyNameError || (isCheckingDuplicate ? 'Checking availability...' : '')}
                      InputProps={{
                        endAdornment: isCheckingDuplicate ? (
                          <CircularProgress size={20} />
                        ) : null,
                      }}
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
                      error={!!errors.phone}
                      helperText={errors.phone?.message}
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
            <Button
              type="submit"
              variant="contained"
              disabled={isMutatingSupplier || isCheckingDuplicate || !!companyNameError}
            >
              {isMutatingSupplier ? <CircularProgress size={20} /> : (selectedSupplier ? 'Update' : 'Create')}
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
              <Grid size={12}>
                <Box sx={{ mb: 2 }}>
                  <Typography variant="h5" fontWeight={600} sx={{ mb: 1 }}>
                    {selectedSupplier.companyName}
                  </Typography>
                </Box>
              </Grid>

              <Grid
                size={{
                  xs: 12,
                  md: 6
                }}>
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

              <Grid
                size={{
                  xs: 12,
                  md: 6
                }}>
                <Typography variant="h6" gutterBottom>Address</Typography>
                <Stack spacing={1}>
                  {((selectedSupplier as any).streetAddress || (selectedSupplier as any).city || (selectedSupplier as any).state || (selectedSupplier as any).postalCode || (selectedSupplier as any).country) ? (
                    <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
                      <LocationIcon sx={{ fontSize: 18, color: 'text.secondary', mt: 0.25 }} />
                      <Box>
                        {(selectedSupplier as any).streetAddress && (
                          <Typography>{(selectedSupplier as any).streetAddress}</Typography>
                        )}
                        {((selectedSupplier as any).city || (selectedSupplier as any).state || (selectedSupplier as any).postalCode) && (
                          <Typography>
                            {[(selectedSupplier as any).city, (selectedSupplier as any).state, (selectedSupplier as any).postalCode]
                              .filter(Boolean)
                              .join(', ')}
                          </Typography>
                        )}
                        {(selectedSupplier as any).country && (
                          <Typography>{(selectedSupplier as any).country}</Typography>
                        )}
                      </Box>
                    </Box>
                  ) : (
                    <Typography color="text.secondary" variant="body2">No address provided</Typography>
                  )}
                </Stack>
              </Grid>

              <Grid
                size={{
                  xs: 12,
                  md: 6
                }}>
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
                        {formatDate(selectedSupplier.lastPurchaseDate)}
                      </Typography>
                    </Box>
                  )}
                </Stack>
              </Grid>

              {selectedSupplier.notes && (
                <Grid size={12}>
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
        loading={isMutatingSupplier}
      />
      {/* Deleted Suppliers Dialog */}
      <DeletedSuppliersDialog
        open={isDeletedDialogOpen}
        onClose={() => setIsDeletedDialogOpen(false)}
      />
    </Box>
  );
}

export default SuppliersPage
