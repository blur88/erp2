import React, { useMemo, useState } from 'react'
import {
  Box,
  Typography,
  Paper,
  Button,
  IconButton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Alert,
  CircularProgress,
  Chip,
  Tooltip,
} from '@mui/material'
import { default as EditIcon } from '@mui/icons-material/Edit'
import { default as DeleteIcon } from '@mui/icons-material/Delete'
import { default as CopyIcon } from '@mui/icons-material/ContentCopy'
import { default as StarIcon } from '@mui/icons-material/Star'
import { default as StarBorderIcon } from '@mui/icons-material/StarBorder'
import { default as ViewIcon } from '@mui/icons-material/Visibility'
import { useLocation, useNavigate } from 'react-router-dom'
import PageHeader from '@/components/common/PageHeader'
import PagePagination from '@/components/common/PagePagination'
import GenericOverviewPage from '@/components/common/GenericOverviewPage'
import { StatusChip } from '@/components/common/StatusChip'
import { FilterBar } from '@/components/filters'
import { useFilterBar } from '@/hooks/useFilterBar'
import { useListUrlState } from '@/hooks/useListUrlState'
import { withListQuery } from '@/utils/listQuery'
import { useNotification } from '@/hooks/useNotification'
import {
  useDeletePriceListMutation,
  useGetPriceListsQuery,
  useSetDefaultPriceListMutation,
} from '@/store/api/priceListApi'
import type { PriceList } from '@/types'
import { STATUS_OPTIONS } from '@/constants/filterOptions'
import type { FilterBarConfig } from '@/types/filterBar.types'
import PriceListFormDialog from '@/components/settings/PriceListFormDialog'
import PriceListCopyDialog from '@/components/settings/PriceListCopyDialog'
import ConfirmationDialog from '@/components/common/ConfirmationDialog'
import { TABLE_STYLES } from '@/constants/tableStyles'
import { formatDate as formatDisplayDate } from '@/utils/formatters'

interface PriceListFilters {
  search: string
  status: 'active' | 'inactive' | null
}

const PriceListsPage: React.FC = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const { showSuccess, showError } = useNotification()
  const { page, limit, setPage, setLimit, resetPage } = useListUrlState()
  const filterConfig = useMemo<FilterBarConfig<PriceListFilters>>(
    () => ({
      search: { placeholder: 'Search by code or name...' },
      fields: [
        { field: 'status', label: 'Status', type: 'select', options: STATUS_OPTIONS },
      ],
      defaults: {
        search: '',
        status: null,
      },
    }),
    [],
  )
  const { appliedFilters, draftFilters, handlers, hasActiveFilters } = useFilterBar(filterConfig, {
    onApply: resetPage,
  })

  const { data: priceListResponse, isLoading: loading, error, refetch } = useGetPriceListsQuery({
    page,
    limit,
    search: appliedFilters.search || undefined,
    isActive:
      appliedFilters.status === 'active'
        ? true
        : appliedFilters.status === 'inactive'
          ? false
          : undefined,
  })
  const [deletePriceList] = useDeletePriceListMutation()
  const [setDefaultPriceList] = useSetDefaultPriceListMutation()
  const priceLists = priceListResponse?.data ?? []
  const total = priceListResponse?.meta?.total ?? 0

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

  // Handlers
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
    navigate(withListQuery(`/settings/price-lists/${priceList.id}`, location.search))
  }

  const handleFormClose = () => {
    setFormDialogOpen(false)
    setSelectedPriceList(null)
  }

  const handleFormSuccess = () => {
    setFormDialogOpen(false)
    setSelectedPriceList(null)
    showSuccess(selectedPriceList ? 'Price list updated successfully' : 'Price list created successfully')
  }

  const handleCopyClose = () => {
    setCopyDialogOpen(false)
    setSelectedPriceList(null)
  }

  const handleCopySuccess = () => {
    setCopyDialogOpen(false)
    setSelectedPriceList(null)
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
          await setDefaultPriceList(priceList.id).unwrap()
          showSuccess('Default price list updated successfully')
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
          await deletePriceList(priceList.id).unwrap()
          showSuccess('Price list deleted successfully')
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
  return (
    <GenericOverviewPage>
      {/* Header */}
      <PageHeader
        title="Price Lists"
        subtitle="Manage pricing structures and product prices"
        variant="workflow"
        secondaryAction={{ label: 'Refresh', onClick: () => refetch() }}
        primaryAction={{ label: 'Add Price List', onClick: handleAddPriceList }}
        toolbar={(
          <FilterBar
            config={filterConfig}
            draftFilters={draftFilters}
            handlers={handlers}
            hasActiveFilters={hasActiveFilters}
          />
        )}
      />
      {/* Error Alert */}
      {error && <Alert severity="error" sx={{ mb: 2 }}>Failed to load price lists</Alert>}
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
                    <Typography sx={{
                      color: "text.secondary"
                    }}>No price lists found</Typography>
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
                        {formatDisplayDate(priceList.effectiveFrom)}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" sx={{ fontSize: '0.8rem', fontWeight: 400 }}>
                        {formatDisplayDate(priceList.effectiveTo)}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <StatusChip status={priceList.isActive ? 'active' : 'inactive'} sx={{ fontSize: '0.65rem', height: 20 }} />
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
        <PagePagination
          total={total}
          page={page}
          limit={limit}
          onPageChange={setPage}
          onLimitChange={setLimit}
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
    </GenericOverviewPage>
  );
}

export default PriceListsPage
