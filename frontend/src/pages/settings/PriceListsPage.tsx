import React, { useState, useEffect, useCallback } from 'react'
import {
  Box,
  Typography,
  Paper,
  Button,
  TextField,
  IconButton,
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
  Chip,
  Tooltip,
  Stack,
} from '@mui/material'
import {
  Add as AddIcon,
  Search as SearchIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  ContentCopy as CopyIcon,
  Star as StarIcon,
  StarBorder as StarBorderIcon,
  Visibility as ViewIcon,
  Refresh as RefreshIcon,
  LocalOffer as PriceListIcon,
} from '@mui/icons-material'
import { useNavigate } from 'react-router-dom'
import { useAppDispatch, useAppSelector } from '@/hooks/useRedux'
import { useNotification } from '@/hooks/useNotification'
import {
  fetchPriceLists,
  deletePriceList,
  setDefaultPriceList,
  setFilters,
  setPagination,
  clearError,
} from '@/store/slices/priceListSlice'
import type { PriceList } from '@/types'
import PriceListFormDialog from '@/components/settings/PriceListFormDialog'
import PriceListCopyDialog from '@/components/settings/PriceListCopyDialog'
import ConfirmationDialog from '@/components/common/ConfirmationDialog'
import { TYPOGRAPHY_STYLES, TABLE_STYLES } from '@/constants/typography'

const PriceListsPage: React.FC = () => {
  const navigate = useNavigate()
  const dispatch = useAppDispatch()
  const { showSuccess, showError } = useNotification()

  // Redux state
  const priceLists = useAppSelector((state) => state.priceLists.priceLists)
  const loading = useAppSelector((state) => state.priceLists.loading.priceLists)
  const error = useAppSelector((state) => state.priceLists.error)
  const pagination = useAppSelector((state) => state.priceLists.pagination)
  const filters = useAppSelector((state) => state.priceLists.filters)

  // Local state
  const [selectedPriceList, setSelectedPriceList] = useState<PriceList | null>(null)
  const [formDialogOpen, setFormDialogOpen] = useState(false)
  const [copyDialogOpen, setCopyDialogOpen] = useState(false)
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean
    title: string
    message: string
    action: () => void
  }>({
    open: false,
    title: '',
    message: '',
    action: () => {},
  })

  // Fetch price lists
  const loadPriceLists = useCallback(() => {
    dispatch(
      fetchPriceLists({
        page: pagination.page,
        limit: pagination.limit,
        search: filters.search || undefined,
        isActive: filters.isActive,
      })
    )
  }, [dispatch, pagination.page, pagination.limit, filters.search, filters.isActive])

  useEffect(() => {
    loadPriceLists()
  }, [loadPriceLists])

  // Handlers
  const handleSearch = (event: React.ChangeEvent<HTMLInputElement>) => {
    dispatch(setFilters({ search: event.target.value }))
    dispatch(setPagination({ page: 1 }))
  }

  const handleActiveFilterChange = (event: any) => {
    const value = event.target.value
    dispatch(setFilters({ isActive: value === 'all' ? undefined : value === 'true' }))
    dispatch(setPagination({ page: 1 }))
  }

  const handlePageChange = (_event: unknown, newPage: number) => {
    dispatch(setPagination({ page: newPage + 1 }))
  }

  const handleRowsPerPageChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    dispatch(setPagination({ limit: parseInt(event.target.value, 10), page: 1 }))
  }

  const handleAddPriceList = () => {
    setSelectedPriceList(null)
    setFormDialogOpen(true)
  }

  const handleEditPriceList = (priceList: PriceList) => {
    setSelectedPriceList(priceList)
    setFormDialogOpen(true)
  }

  const handleCopyPriceList = (priceList: PriceList) => {
    setSelectedPriceList(priceList)
    setCopyDialogOpen(true)
  }

  const handleViewPriceList = (priceList: PriceList) => {
    navigate(`/settings/price-lists/${priceList.id}`)
  }

  const handleFormClose = () => {
    setFormDialogOpen(false)
    setSelectedPriceList(null)
  }

  const handleFormSuccess = () => {
    setFormDialogOpen(false)
    setSelectedPriceList(null)
    loadPriceLists()
    showSuccess(selectedPriceList ? 'Price list updated successfully' : 'Price list created successfully')
  }

  const handleCopyClose = () => {
    setCopyDialogOpen(false)
    setSelectedPriceList(null)
  }

  const handleCopySuccess = () => {
    setCopyDialogOpen(false)
    setSelectedPriceList(null)
    loadPriceLists()
    showSuccess('Price list copied successfully')
  }

  const handleSetDefault = (priceList: PriceList) => {
    if (priceList.isDefault) {
      showError('This price list is already the default')
      return
    }

    setConfirmDialog({
      open: true,
      title: 'Set Default Price List',
      message: `Are you sure you want to set "${priceList.name}" as the default price list? This will update any references to the current default price list.`,
      action: async () => {
        try {
          await dispatch(setDefaultPriceList(priceList.id)).unwrap()
          showSuccess('Default price list updated successfully')
          loadPriceLists()
        } catch (err: any) {
          showError(err.response?.data?.message || 'Failed to set default price list')
        }
      },
    })
  }

  const handleDeletePriceList = (priceList: PriceList) => {
    if (priceList.isDefault) {
      showError('Cannot delete the default price list. Please set another price list as default first.')
      return
    }

    setConfirmDialog({
      open: true,
      title: 'Delete Price List',
      message: `Are you sure you want to delete "${priceList.name}"? This action cannot be undone.`,
      action: async () => {
        try {
          await dispatch(deletePriceList(priceList.id)).unwrap()
          showSuccess('Price list deleted successfully')
          loadPriceLists()
        } catch (err: any) {
          showError(err.response?.data?.message || 'Failed to delete price list')
        }
      },
    })
  }

  const handleConfirmClose = () => {
    setConfirmDialog({ ...confirmDialog, open: false })
  }

  const handleConfirmAction = () => {
    confirmDialog.action()
    handleConfirmClose()
  }

  // Format date
  const formatDate = (date?: Date | string) => {
    if (!date) return '-'
    return new Date(date).toLocaleDateString()
  }

  return (
    <Box>
      {/* Header */}
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          mb: 4,
        }}
      >
        <Box>
          <Typography
            variant={TYPOGRAPHY_STYLES.pageHeader.variant}
            sx={{
              fontWeight: TYPOGRAPHY_STYLES.pageHeader.fontWeight,
              mb: 1,
              display: 'flex',
              alignItems: 'center',
              gap: 2,
            }}
          >
            <PriceListIcon
              sx={{
                fontSize: TYPOGRAPHY_STYLES.pageHeader.icon.fontSize,
                color: TYPOGRAPHY_STYLES.pageHeader.icon.color,
              }}
            />
            Price Lists
          </Typography>
          <Typography variant={TYPOGRAPHY_STYLES.pageSubtitle.variant} color={TYPOGRAPHY_STYLES.pageSubtitle.color}>
            Manage pricing structures and product prices ({pagination.total} total)
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button variant="outlined" startIcon={<RefreshIcon />} onClick={loadPriceLists}>
            Refresh
          </Button>
          <Button variant="contained" startIcon={<AddIcon />} onClick={handleAddPriceList}>
            Add Price List
          </Button>
        </Box>
      </Box>

      {/* Filters */}
      <Paper sx={{ p: 2, mb: 3 }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
          <TextField
            placeholder="Search by code or name..."
            value={filters.search}
            onChange={handleSearch}
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon />
                  </InputAdornment>
                ),
              },
            }}
            sx={{ flexGrow: 1 }}
          />
          <FormControl sx={{ minWidth: 150 }}>
            <InputLabel>Status</InputLabel>
            <Select
              value={filters.isActive === undefined ? 'all' : filters.isActive ? 'true' : 'false'}
              onChange={handleActiveFilterChange}
              label="Status"
            >
              <MenuItem value="all">All</MenuItem>
              <MenuItem value="true">Active</MenuItem>
              <MenuItem value="false">Inactive</MenuItem>
            </Select>
          </FormControl>
        </Stack>
      </Paper>

      {/* Error Alert */}
      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => dispatch(clearError())}>
          {error}
        </Alert>
      )}

      {/* Price Lists Table */}
      <Paper sx={{ borderRadius: 2, overflow: 'hidden' }}>
        <TableContainer sx={{ overflowX: 'auto' }}>
          <Table
            size={TABLE_STYLES.size}
            sx={{
              '& .MuiTableCell-root': {
                borderBottom: TABLE_STYLES.cell.border,
                py: TABLE_STYLES.cell.padding.py,
                px: TABLE_STYLES.cell.padding.px,
              },
              '& .MuiTableBody-root .MuiTableRow-root:last-child .MuiTableCell-root': {
                borderBottom: 'none',
              },
            }}
          >
            <TableHead>
              <TableRow sx={{ '& .MuiTableCell-head': { fontWeight: 600, backgroundColor: 'grey.50', py: 1 } }}>
                <TableCell>
                  <Typography
                    variant="caption"
                    sx={{
                      fontWeight: 600,
                      color: 'text.secondary',
                      fontSize: '0.75rem',
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px',
                    }}
                  >
                    Code
                  </Typography>
                </TableCell>
                <TableCell>
                  <Typography
                    variant="caption"
                    sx={{
                      fontWeight: 600,
                      color: 'text.secondary',
                      fontSize: '0.75rem',
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px',
                    }}
                  >
                    Name
                  </Typography>
                </TableCell>
                <TableCell>
                  <Typography
                    variant="caption"
                    sx={{
                      fontWeight: 600,
                      color: 'text.secondary',
                      fontSize: '0.75rem',
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px',
                    }}
                  >
                    Description
                  </Typography>
                </TableCell>
                <TableCell>
                  <Typography
                    variant="caption"
                    sx={{
                      fontWeight: 600,
                      color: 'text.secondary',
                      fontSize: '0.75rem',
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px',
                    }}
                  >
                    Effective From
                  </Typography>
                </TableCell>
                <TableCell>
                  <Typography
                    variant="caption"
                    sx={{
                      fontWeight: 600,
                      color: 'text.secondary',
                      fontSize: '0.75rem',
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px',
                    }}
                  >
                    Effective To
                  </Typography>
                </TableCell>
                <TableCell>
                  <Typography
                    variant="caption"
                    sx={{
                      fontWeight: 600,
                      color: 'text.secondary',
                      fontSize: '0.75rem',
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px',
                    }}
                  >
                    Status
                  </Typography>
                </TableCell>
                <TableCell align="right">
                  <Typography
                    variant="caption"
                    sx={{
                      fontWeight: 600,
                      color: 'text.secondary',
                      fontSize: '0.75rem',
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px',
                    }}
                  >
                    Actions
                  </Typography>
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={7} align="center" sx={{ py: 8 }}>
                    <CircularProgress />
                  </TableCell>
                </TableRow>
              ) : priceLists.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} align="center" sx={{ py: 8 }}>
                    <Typography color="text.secondary">No price lists found</Typography>
                  </TableCell>
                </TableRow>
              ) : (
                priceLists.map((priceList) => (
                  <TableRow
                    key={priceList.id}
                    hover
                    sx={{
                      '&:hover': {
                        backgroundColor: 'action.hover',
                        '& .price-list-actions': {
                          opacity: 1,
                        },
                      },
                      transition: 'background-color 0.2s ease',
                      cursor: 'default',
                      height: TABLE_STYLES.row.height,
                    }}
                  >
                    <TableCell>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Typography variant="body2" sx={{ fontSize: '0.8rem', fontWeight: 400 }}>
                          {priceList.code}
                        </Typography>
                        {priceList.isDefault && (
                          <Tooltip title="Default price list">
                            <StarIcon sx={{ fontSize: 16, color: 'warning.main' }} />
                          </Tooltip>
                        )}
                      </Box>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" sx={{ fontSize: '0.8rem', fontWeight: 400 }}>
                        {priceList.name}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography
                        variant="body2"
                        sx={{
                          fontSize: '0.8rem',
                          fontWeight: 400,
                          maxWidth: 300,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {priceList.description || '-'}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" sx={{ fontSize: '0.8rem', fontWeight: 400 }}>
                        {formatDate(priceList.effectiveFrom)}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" sx={{ fontSize: '0.8rem', fontWeight: 400 }}>
                        {formatDate(priceList.effectiveTo)}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={priceList.isActive ? 'Active' : 'Inactive'}
                        size="small"
                        color={priceList.isActive ? 'success' : 'default'}
                        sx={{
                          fontSize: '0.65rem',
                          height: 20,
                          fontWeight: 500,
                        }}
                      />
                    </TableCell>
                    <TableCell align="right">
                      <Box
                        className="price-list-actions"
                        sx={{
                          display: 'flex',
                          justifyContent: 'flex-end',
                          alignItems: 'center',
                          gap: 0.25,
                          opacity: 0.7,
                          transition: 'opacity 0.2s ease',
                        }}
                      >
                        <Tooltip title="View Items">
                          <IconButton
                            size="small"
                            onClick={() => handleViewPriceList(priceList)}
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
                            <ViewIcon sx={{ fontSize: `${TABLE_STYLES.row.height * 0.5}px` }} />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Edit Price List">
                          <IconButton
                            size="small"
                            onClick={() => handleEditPriceList(priceList)}
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
                        </Tooltip>
                        <Tooltip title="Copy Price List">
                          <IconButton
                            size="small"
                            onClick={() => handleCopyPriceList(priceList)}
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
                            <CopyIcon sx={{ fontSize: `${TABLE_STYLES.row.height * 0.5}px` }} />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title={priceList.isDefault ? 'Default Price List' : 'Set as Default'}>
                          <span>
                            <IconButton
                              size="small"
                              onClick={() => handleSetDefault(priceList)}
                              disabled={priceList.isDefault}
                              sx={{
                                height: `${TABLE_STYLES.row.height * 0.75}px`,
                                width: `${TABLE_STYLES.row.height * 0.75}px`,
                                minHeight: 20,
                                minWidth: 20,
                                p: 0.125,
                                color: 'warning.main',
                                '&:hover': {
                                  backgroundColor: 'warning.light',
                                  color: 'warning.dark',
                                },
                                '&.Mui-disabled': {
                                  opacity: 0.3,
                                },
                              }}
                            >
                              {priceList.isDefault ? (
                                <StarIcon sx={{ fontSize: `${TABLE_STYLES.row.height * 0.5}px` }} />
                              ) : (
                                <StarBorderIcon sx={{ fontSize: `${TABLE_STYLES.row.height * 0.5}px` }} />
                              )}
                            </IconButton>
                          </span>
                        </Tooltip>
                        <Tooltip title="Delete">
                          <span>
                            <IconButton
                              size="small"
                              onClick={() => handleDeletePriceList(priceList)}
                              disabled={priceList.isDefault}
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
                                '&.Mui-disabled': {
                                  opacity: 0.3,
                                },
                              }}
                            >
                              <DeleteIcon sx={{ fontSize: `${TABLE_STYLES.row.height * 0.5}px` }} />
                            </IconButton>
                          </span>
                        </Tooltip>
                      </Box>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
        <TablePagination
          rowsPerPageOptions={[10, 20, 50, 100]}
          component="div"
          count={pagination.total}
          rowsPerPage={pagination.limit}
          page={pagination.page - 1}
          onPageChange={handlePageChange}
          onRowsPerPageChange={handleRowsPerPageChange}
        />
      </Paper>

      {/* Price List Form Dialog */}
      <PriceListFormDialog
        open={formDialogOpen}
        priceList={selectedPriceList}
        onClose={handleFormClose}
        onSuccess={handleFormSuccess}
      />

      {/* Price List Copy Dialog */}
      <PriceListCopyDialog
        open={copyDialogOpen}
        priceList={selectedPriceList}
        onClose={handleCopyClose}
        onSuccess={handleCopySuccess}
      />

      {/* Confirmation Dialog */}
      <ConfirmationDialog
        open={confirmDialog.open}
        title={confirmDialog.title}
        message={confirmDialog.message}
        onConfirm={handleConfirmAction}
        onCancel={handleConfirmClose}
      />
    </Box>
  )
}

export default PriceListsPage
