import React, { useEffect, useMemo, useState } from 'react'
import {
  Box,
  Typography,
  Paper,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  IconButton,
  CircularProgress,
  TextField,
  InputAdornment,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  useTheme,
  useMediaQuery,
} from '@mui/material'
import {
  Edit as EditIcon,
  Delete as DeleteIcon,
  Search as SearchIcon,
  LockOpen as ReopenIcon,
  Lock as CloseIcon,
  AutoAwesome as GenerateIcon,
} from '@mui/icons-material'
import { format } from 'date-fns'
import { useNotification } from '@/hooks/useNotification'
import { useSearchAndFilter, useKeyboardShortcuts } from '@/hooks/useSearchAndFilter'
import PageHeader from '@/components/common/PageHeader'
import ConfirmationDialog from '@/components/common/ConfirmationDialog'
import GeneratePeriodsDialog from '@/components/accounting/GeneratePeriodsDialog'
import FiscalPeriodFormDialog from '@/components/accounting/FiscalPeriodFormDialog'
import AccountMappingWarning from '@/components/accounting/AccountMappingWarning'
import { TYPOGRAPHY_STYLES } from '@/constants/typography'
import { TABLE_STYLES } from '@/constants/tableStyles'
import {
  useCloseFiscalPeriodMutation,
  useDeleteFiscalPeriodMutation,
  useGenerateFiscalPeriodsMutation,
  useGetFiscalPeriodsQuery,
  useReopenFiscalPeriodMutation,
} from '@/store/api/accountingApi'
import { FiscalPeriod, FiscalPeriodStatus } from '@/types'
import { getErrorMessage } from '@/utils/errorMessage'

const FiscalPeriodsPage: React.FC = () => {
  const { showSuccess, showError } = useNotification()
  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down('md'))

  const [formDialogOpen, setFormDialogOpen] = useState(false)
  const [selectedPeriod, setSelectedPeriod] = useState<FiscalPeriod | null>(null)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [periodToDelete, setPeriodToDelete] = useState<FiscalPeriod | null>(null)
  const [generateDialogOpen, setGenerateDialogOpen] = useState(false)
  const [closeConfirmOpen, setCloseConfirmOpen] = useState(false)
  const [periodToClose, setPeriodToClose] = useState<FiscalPeriod | null>(null)
  const [reopenConfirmOpen, setReopenConfirmOpen] = useState(false)
  const [periodToReopen, setPeriodToReopen] = useState<FiscalPeriod | null>(null)

  // Filters
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [yearFilter, setYearFilter] = useState<string>('all')

  // Search functionality
  const { focusSearchInput } = useSearchAndFilter({
    initialSearchTerm: '',
    onSearchChange: () => {},
  })

  // Keyboard shortcuts
  useKeyboardShortcuts({
    onSearch: focusSearchInput,
  })

  const queryParams = useMemo(() => {
    const params: Record<string, unknown> = {
      page: 1,
      sortBy: 'startDate',
      sortOrder: 'DESC' as const,
    }

    if (searchTerm) {
      params.search = searchTerm
    }

    if (statusFilter !== 'all') {
      params.status = statusFilter as FiscalPeriodStatus
    }

    if (yearFilter !== 'all') {
      params.year = parseInt(yearFilter, 10)
    }

    return params
  }, [searchTerm, statusFilter, yearFilter])

  const {
    data: periodsResponse,
    isLoading: loading,
    error,
    refetch,
  } = useGetFiscalPeriodsQuery(queryParams)
  const [deleteFiscalPeriod] = useDeleteFiscalPeriodMutation()
  const [closeFiscalPeriod] = useCloseFiscalPeriodMutation()
  const [reopenFiscalPeriod] = useReopenFiscalPeriodMutation()
  const [generateFiscalPeriods] = useGenerateFiscalPeriodsMutation()
  const periods = periodsResponse?.data ?? []
  const pagination = periodsResponse?.meta
  const errorMessage = error ? getErrorMessage(error, 'Failed to fetch fiscal periods') : null

  useEffect(() => {
    if (errorMessage) {
      showError(errorMessage)
    }
  }, [errorMessage, showError])

  const handleAddPeriod = () => {
    setSelectedPeriod(null)
    setFormDialogOpen(true)
  }

  const handleEditPeriod = (period: FiscalPeriod) => {
    setSelectedPeriod(period)
    setFormDialogOpen(true)
  }

  const handleDeletePeriod = (period: FiscalPeriod) => {
    setPeriodToDelete(period)
    setDeleteConfirmOpen(true)
  }

  const handleConfirmDelete = async () => {
    if (!periodToDelete) return

    try {
      await deleteFiscalPeriod(periodToDelete.id).unwrap()
      showSuccess(`Period "${periodToDelete.name}" deleted successfully`)
      setDeleteConfirmOpen(false)
      setPeriodToDelete(null)
      refetch()
    } catch (error: any) {
      showError(getErrorMessage(error, 'Failed to delete period'))
    }
  }

  const handleCancelDelete = () => {
    setDeleteConfirmOpen(false)
    setPeriodToDelete(null)
  }

  const handleFormClose = () => {
    setFormDialogOpen(false)
    setSelectedPeriod(null)
  }

  const handleFormSuccess = () => {
    setFormDialogOpen(false)
    setSelectedPeriod(null)
    refetch()
  }

  const handleGeneratePeriods = () => {
    setGenerateDialogOpen(true)
  }

  const handleGenerateSubmit = async (year: number, startMonth: number) => {
    try {
      await generateFiscalPeriods({ year, startMonth }).unwrap()
      showSuccess(`Successfully generated 12 periods for year ${year}`)
      setGenerateDialogOpen(false)
      refetch()
    } catch (error: any) {
      showError(getErrorMessage(error, 'Failed to generate periods'))
    }
  }

  const handleClosePeriod = (period: FiscalPeriod) => {
    setPeriodToClose(period)
    setCloseConfirmOpen(true)
  }

  const handleConfirmClose = async () => {
    if (!periodToClose) return

    try {
      await closeFiscalPeriod(periodToClose.id).unwrap()
      showSuccess(`Period "${periodToClose.name}" closed successfully`)
      setCloseConfirmOpen(false)
      setPeriodToClose(null)
      refetch()
    } catch (error: any) {
      showError(getErrorMessage(error, 'Failed to close period'))
      setCloseConfirmOpen(false)
      setPeriodToClose(null)
    }
  }

  const handleCancelClose = () => {
    setCloseConfirmOpen(false)
    setPeriodToClose(null)
  }

  const handleReopenPeriod = (period: FiscalPeriod) => {
    setPeriodToReopen(period)
    setReopenConfirmOpen(true)
  }

  const handleConfirmReopen = async () => {
    if (!periodToReopen) return

    try {
      await reopenFiscalPeriod(periodToReopen.id).unwrap()
      showSuccess(`Period "${periodToReopen.name}" reopened successfully`)
      setReopenConfirmOpen(false)
      setPeriodToReopen(null)
      refetch()
    } catch (error: any) {
      showError(getErrorMessage(error, 'Failed to reopen period'))
      setReopenConfirmOpen(false)
      setPeriodToReopen(null)
    }
  }

  const handleCancelReopen = () => {
    setReopenConfirmOpen(false)
    setPeriodToReopen(null)
  }

  const getStatusBadgeColor = (status: FiscalPeriodStatus) => {
    switch (status) {
      case FiscalPeriodStatus.OPEN:
        return 'success'
      case FiscalPeriodStatus.CLOSED:
        return 'error'
      default:
        return 'default'
    }
  }

  const canReopenPeriod = (period: FiscalPeriod): boolean => {
    if (!period.isClosed) return false

    // Find the most recently closed period
    const closedPeriods = periods
      .filter((p: FiscalPeriod) => p.isClosed)
      .sort((a: FiscalPeriod, b: FiscalPeriod) => {
        const dateA = new Date(a.endDate).getTime()
        const dateB = new Date(b.endDate).getTime()
        return dateB - dateA
      })

    if (closedPeriods.length === 0) return false

    return closedPeriods[0].id === period.id
  }

  // Extract unique years from periods
  const availableYears = useMemo(() => {
    const years = new Set<number>()
    periods.forEach((period: FiscalPeriod) => {
      const year = new Date(period.startDate).getFullYear()
      years.add(year)
    })
    return Array.from(years).sort((a, b) => b - a)
  }, [periods])

  return (
    <Box sx={{ p: 3 }}>
      {/* Account Mapping Warning */}
      <AccountMappingWarning context="system" />

      <PageHeader
        title="Fiscal Periods"
        subtitle="Manage accounting periods and year boundaries"
        secondaryAction={{ label: 'Generate Periods', onClick: handleGeneratePeriods }}
        primaryAction={{ label: 'Add Period', onClick: handleAddPeriod }}
      />

      {/* Filters and Search */}
      <Paper sx={{ p: 2, mb: 3 }}>
      <Box sx={{
        display: 'flex',
        flexDirection: isMobile ? 'column' : 'row',
        gap: isMobile ? 2 : 1,
        alignItems: isMobile ? 'stretch' : 'center',
        '& > *': {
          alignSelf: isMobile ? 'stretch' : 'flex-start'
        }
      }}>
        <TextField
          placeholder="Search by code or name..."
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
            Year
          </InputLabel>
          <Select
            value={yearFilter}
            label="Year"
            onChange={(e) => setYearFilter(e.target.value)}
            sx={{
              height: TYPOGRAPHY_STYLES.searchField.input.height,
              fontSize: TYPOGRAPHY_STYLES.searchField.input.fontSize,
            }}
          >
            <MenuItem value="all">All Years</MenuItem>
            {availableYears.map((year) => (
              <MenuItem key={year} value={year.toString()}>
                {year}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

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
            Status
          </InputLabel>
          <Select
            value={statusFilter}
            label="Status"
            onChange={(e) => setStatusFilter(e.target.value)}
            sx={{
              height: TYPOGRAPHY_STYLES.searchField.input.height,
              fontSize: TYPOGRAPHY_STYLES.searchField.input.fontSize,
            }}
          >
            <MenuItem value="all">All</MenuItem>
            <MenuItem value="OPEN">Open</MenuItem>
            <MenuItem value="CLOSED">Closed</MenuItem>
          </Select>
        </FormControl>
      </Box>
      </Paper>

      {/* Periods Table */}
      <Paper sx={{ borderRadius: 2, overflow: 'hidden' }}>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
            <CircularProgress />
          </Box>
        ) : periods.length === 0 ? (
          <Box sx={{ p: 4, textAlign: 'center' }}>
            <Typography variant="body1" color="text.secondary" sx={{ mb: 2 }}>
              No fiscal periods found. {searchTerm || statusFilter !== 'all' || yearFilter !== 'all' ? 'Try adjusting your filters.' : 'Generate periods to get started.'}
            </Typography>
            {!searchTerm && statusFilter === 'all' && yearFilter === 'all' && (
              <Button
                variant="contained"
                startIcon={<GenerateIcon />}
                onClick={handleGeneratePeriods}
              >
                Generate Periods
              </Button>
            )}
          </Box>
        ) : (
          <TableContainer sx={{ overflowX: 'auto' }}>
            <Table
              size={TABLE_STYLES.size}
              sx={{
                minWidth: isMobile ? 650 : 900,
                '& .MuiTableCell-root': {
                  borderBottom: TABLE_STYLES.cell.border,
                  py: TABLE_STYLES.cell.padding.py,
                  px: TABLE_STYLES.cell.padding.px
                },
                '& .MuiTableBody-root .MuiTableRow-root:last-child .MuiTableCell-root': {
                  borderBottom: 'none'
                }
              }}
            >
              <TableHead>
                <TableRow sx={{ '& .MuiTableCell-head': { fontWeight: 600, backgroundColor: 'grey.50', py: 1 } }}>
                  <TableCell sx={{ width: '12%' }}>
                    <Typography variant={TYPOGRAPHY_STYLES.tableHeader.variant} sx={{
                      fontWeight: TYPOGRAPHY_STYLES.tableHeader.fontWeight,
                      color: TYPOGRAPHY_STYLES.tableHeader.color,
                      fontSize: TYPOGRAPHY_STYLES.tableHeader.fontSize
                    }}>
                      Code
                    </Typography>
                  </TableCell>
                  <TableCell sx={{ width: '20%' }}>
                    <Typography variant={TYPOGRAPHY_STYLES.tableHeader.variant} sx={{
                      fontWeight: TYPOGRAPHY_STYLES.tableHeader.fontWeight,
                      color: TYPOGRAPHY_STYLES.tableHeader.color,
                      fontSize: TYPOGRAPHY_STYLES.tableHeader.fontSize
                    }}>
                      Name
                    </Typography>
                  </TableCell>
                  <TableCell sx={{ width: '15%' }}>
                    <Typography variant={TYPOGRAPHY_STYLES.tableHeader.variant} sx={{
                      fontWeight: TYPOGRAPHY_STYLES.tableHeader.fontWeight,
                      color: TYPOGRAPHY_STYLES.tableHeader.color,
                      fontSize: TYPOGRAPHY_STYLES.tableHeader.fontSize
                    }}>
                      Start Date
                    </Typography>
                  </TableCell>
                  <TableCell sx={{ width: '15%' }}>
                    <Typography variant={TYPOGRAPHY_STYLES.tableHeader.variant} sx={{
                      fontWeight: TYPOGRAPHY_STYLES.tableHeader.fontWeight,
                      color: TYPOGRAPHY_STYLES.tableHeader.color,
                      fontSize: TYPOGRAPHY_STYLES.tableHeader.fontSize
                    }}>
                      End Date
                    </Typography>
                  </TableCell>
                  <TableCell sx={{ width: '10%' }}>
                    <Typography variant={TYPOGRAPHY_STYLES.tableHeader.variant} sx={{
                      fontWeight: TYPOGRAPHY_STYLES.tableHeader.fontWeight,
                      color: TYPOGRAPHY_STYLES.tableHeader.color,
                      fontSize: TYPOGRAPHY_STYLES.tableHeader.fontSize
                    }}>
                      Duration
                    </Typography>
                  </TableCell>
                  <TableCell sx={{ width: '10%' }}>
                    <Typography variant={TYPOGRAPHY_STYLES.tableHeader.variant} sx={{
                      fontWeight: TYPOGRAPHY_STYLES.tableHeader.fontWeight,
                      color: TYPOGRAPHY_STYLES.tableHeader.color,
                      fontSize: TYPOGRAPHY_STYLES.tableHeader.fontSize
                    }}>
                      Status
                    </Typography>
                  </TableCell>
                  <TableCell align="right" sx={{ width: '18%' }}>
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
                {periods.map((period: FiscalPeriod) => (
                  <TableRow
                    key={period.id}
                    hover
                    sx={{
                      '&:hover': {
                        backgroundColor: 'action.hover',
                        '& .period-actions': {
                          opacity: 1
                        }
                      },
                      transition: 'background-color 0.2s ease',
                      height: TABLE_STYLES.row.height
                    }}
                  >
                    <TableCell>
                      <Typography variant={TYPOGRAPHY_STYLES.tableCell.primary.variant} sx={{
                        fontSize: TYPOGRAPHY_STYLES.tableCell.primary.fontSize,
                        fontWeight: TYPOGRAPHY_STYLES.tableCell.primary.fontWeight,
                      }}>
                        {period.code}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant={TYPOGRAPHY_STYLES.tableCell.secondary.variant} sx={{
                        fontSize: TYPOGRAPHY_STYLES.tableCell.secondary.fontSize,
                        lineHeight: TYPOGRAPHY_STYLES.tableCell.secondary.lineHeight,
                      }}>
                        {period.name}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant={TYPOGRAPHY_STYLES.tableCell.caption.variant} color="text.secondary" sx={{
                        fontSize: TYPOGRAPHY_STYLES.tableCell.caption.fontSize
                      }}>
                        {format(new Date(period.startDate), 'MMM dd, yyyy')}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant={TYPOGRAPHY_STYLES.tableCell.caption.variant} color="text.secondary" sx={{
                        fontSize: TYPOGRAPHY_STYLES.tableCell.caption.fontSize
                      }}>
                        {format(new Date(period.endDate), 'MMM dd, yyyy')}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant={TYPOGRAPHY_STYLES.tableCell.caption.variant} color="text.secondary" sx={{
                        fontSize: TYPOGRAPHY_STYLES.tableCell.caption.fontSize
                      }}>
                        {period.durationDays} days
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={period.status}
                        size="small"
                        color={getStatusBadgeColor(period.status) as any}
                        sx={{
                          fontSize: TYPOGRAPHY_STYLES.chip.small.fontSize,
                          fontWeight: 500,
                          height: `${TABLE_STYLES.row.height * 0.65}px`,
                        }}
                      />
                    </TableCell>
                    <TableCell align="right">
                      <Box
                        className="period-actions"
                        sx={{
                          display: 'flex',
                          justifyContent: 'flex-end',
                          alignItems: 'center',
                          gap: 0.25,
                          opacity: isMobile ? 1 : 0.7,
                          transition: 'opacity 0.2s ease'
                        }}
                      >
                        {period.isOpen && (
                          <IconButton
                            size="small"
                            title={`Close ${period.name}`}
                            aria-label={`Close period ${period.name}`}
                            onClick={() => handleClosePeriod(period)}
                            sx={{
                              height: `${TABLE_STYLES.row.height * 0.75}px`,
                              width: `${TABLE_STYLES.row.height * 0.75}px`,
                              minHeight: 20,
                              minWidth: 20,
                              p: 0.125,
                              color: 'warning.main',
                              '&:hover': {
                                backgroundColor: 'warning.light',
                                color: 'warning.dark'
                              }
                            }}
                          >
                            <CloseIcon sx={{
                              fontSize: `${TABLE_STYLES.row.height * 0.5}px`
                            }} />
                          </IconButton>
                        )}
                        {canReopenPeriod(period) && (
                          <IconButton
                            size="small"
                            title={`Reopen ${period.name}`}
                            aria-label={`Reopen period ${period.name}`}
                            onClick={() => handleReopenPeriod(period)}
                            sx={{
                              height: `${TABLE_STYLES.row.height * 0.75}px`,
                              width: `${TABLE_STYLES.row.height * 0.75}px`,
                              minHeight: 20,
                              minWidth: 20,
                              p: 0.125,
                              color: 'success.main',
                              '&:hover': {
                                backgroundColor: 'success.light',
                                color: 'success.dark'
                              }
                            }}
                          >
                            <ReopenIcon sx={{
                              fontSize: `${TABLE_STYLES.row.height * 0.5}px`
                            }} />
                          </IconButton>
                        )}
                        <IconButton
                          size="small"
                          title={`Edit ${period.name}`}
                          aria-label={`Edit period ${period.name}`}
                          onClick={() => handleEditPeriod(period)}
                          sx={{
                            height: `${TABLE_STYLES.row.height * 0.75}px`,
                            width: `${TABLE_STYLES.row.height * 0.75}px`,
                            minHeight: 20,
                            minWidth: 20,
                            p: 0.125,
                            color: 'primary.main',
                            '&:hover': {
                              backgroundColor: 'primary.light',
                              color: 'primary.dark'
                            }
                          }}
                        >
                          <EditIcon sx={{
                            fontSize: `${TABLE_STYLES.row.height * 0.5}px`
                          }} />
                        </IconButton>
                        <IconButton
                          size="small"
                          title={`Delete ${period.name}`}
                          aria-label={`Delete period ${period.name}`}
                          onClick={() => handleDeletePeriod(period)}
                          sx={{
                            height: `${TABLE_STYLES.row.height * 0.75}px`,
                            width: `${TABLE_STYLES.row.height * 0.75}px`,
                            minHeight: 20,
                            minWidth: 20,
                            p: 0.125,
                            color: 'error.main',
                            '&:hover': {
                              backgroundColor: 'error.light',
                              color: 'error.dark'
                            }
                          }}
                        >
                          <DeleteIcon sx={{
                            fontSize: `${TABLE_STYLES.row.height * 0.5}px`
                          }} />
                        </IconButton>
                      </Box>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Paper>

      {/* Form Dialog */}
      <FiscalPeriodFormDialog
        open={formDialogOpen}
        period={selectedPeriod}
        onClose={handleFormClose}
        onSuccess={handleFormSuccess}
      />

      {/* Generate Periods Dialog */}
      <GeneratePeriodsDialog
        open={generateDialogOpen}
        onClose={() => setGenerateDialogOpen(false)}
        onSubmit={handleGenerateSubmit}
      />

      {/* Delete Confirmation Dialog */}
      <ConfirmationDialog
        open={deleteConfirmOpen}
        title="Confirm Delete"
        message={`Are you sure you want to delete the period "${periodToDelete?.name}"? This action cannot be undone.`}
        confirmText="Delete"
        cancelText="Cancel"
        onConfirm={handleConfirmDelete}
        onCancel={handleCancelDelete}
        severity="error"
      />

      {/* Close Confirmation Dialog */}
      <ConfirmationDialog
        open={closeConfirmOpen}
        title="Close Fiscal Period"
        message={`Are you sure you want to close the period "${periodToClose?.name}"? This will prevent new journal entries from being created in this period.`}
        confirmText="Close Period"
        cancelText="Cancel"
        onConfirm={handleConfirmClose}
        onCancel={handleCancelClose}
        severity="warning"
      />

      {/* Reopen Confirmation Dialog */}
      <ConfirmationDialog
        open={reopenConfirmOpen}
        title="Reopen Fiscal Period"
        message={`Are you sure you want to reopen the period "${periodToReopen?.name}"? This will allow new journal entries to be created in this period.`}
        confirmText="Reopen Period"
        cancelText="Cancel"
        onConfirm={handleConfirmReopen}
        onCancel={handleCancelReopen}
        severity="info"
      />
    </Box>
  )
}

export default FiscalPeriodsPage
