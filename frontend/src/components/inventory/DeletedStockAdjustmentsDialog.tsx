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
  Divider,
  CircularProgress,
  useTheme,
  useMediaQuery,
} from '@mui/material'
import {
  Search as SearchIcon,
  Restore as RestoreIcon,
  Close as CloseIcon,
  Assessment as AssessmentIcon,
} from '@mui/icons-material'
import { useDispatch, useSelector } from 'react-redux'
import {
  fetchDeletedStockAdjustments,
  restoreStockAdjustment,
  selectDeletedStockAdjustments,
  selectInventoryLoading,
  fetchStockAdjustments,
} from '@/store/slices/inventorySlice'
import { useNotification } from '@/hooks/useNotification'
import type { StockAdjustment } from '@/types'
import { formatDate } from '@/utils/formatters'

interface DeletedStockAdjustmentsDialogProps {
  open: boolean
  onClose: () => void
}

const DeletedStockAdjustmentsDialog: React.FC<DeletedStockAdjustmentsDialogProps> = ({ open, onClose }) => {
  const dispatch = useDispatch() as any
  const { showSuccess, showError } = useNotification()
  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down('md'))
  const deletedAdjustments = useSelector(selectDeletedStockAdjustments) || []
  const loading = useSelector(selectInventoryLoading)

  const [searchTerm, setSearchTerm] = useState('')
  const [restoringId, setRestoringId] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      dispatch(fetchDeletedStockAdjustments({}))
    }
  }, [open, dispatch])

  // Filter adjustments based on search term
  const filteredAdjustments = deletedAdjustments.filter(adjustment =>
    adjustment.adjustmentNumber?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    adjustment.notes?.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const handleRestore = async (adjustment: StockAdjustment) => {
    setRestoringId(adjustment.id)
    try {
      const result = await dispatch(restoreStockAdjustment(adjustment.id))

      if (restoreStockAdjustment.rejected.match(result)) {
        throw new Error(result.payload as string)
      }

      showSuccess(`Stock adjustment "${adjustment.adjustmentNumber}" restored successfully`)
      // Lists are refreshed by the action's dispatch
    } catch (error: any) {
      console.error('Stock adjustment restore error:', error)
      const errorMessage = error?.response?.data?.message || error?.message || 'Failed to restore stock adjustment'
      showError(errorMessage)
    } finally {
      setRestoringId(null)
    }
  }

  const getStatusColor = (status: string): 'warning' | 'success' | 'error' => {
    switch (status.toLowerCase()) {
      case 'draft':
        return 'warning'
      case 'completed':
        return 'success'
      case 'cancelled':
        return 'error'
      default:
        return 'warning'
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="lg"
      fullWidth
      fullScreen={isMobile}
      PaperProps={{
        sx: {
          minHeight: isMobile ? '100vh' : '70vh',
          maxHeight: isMobile ? '100vh' : '85vh'
        }
      }}
    >
      <DialogTitle sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        pb: 2,
        pt: 2
      }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <AssessmentIcon color="primary" sx={{ fontSize: '1.5rem' }} />
          <Typography variant="h6" sx={{ fontWeight: 600 }}>
            Deleted Stock Adjustments
          </Typography>
          <Chip
            label={filteredAdjustments.length}
            color="default"
            size="small"
            sx={{
              fontWeight: 600,
              fontSize: '0.75rem'
            }}
          />
        </Box>
        <IconButton edge="end" color="inherit" onClick={onClose} aria-label="close">
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <Divider />

      <DialogContent sx={{ p: 0 }}>
        {/* Search Bar */}
        <Box sx={{
          p: 2,
          backgroundColor: 'grey.50',
          borderBottom: '1px solid',
          borderColor: 'divider'
        }}>
          <TextField
            fullWidth
            placeholder="Search by adjustment number or notes..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            size="small"
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon sx={{ fontSize: '1.25rem', color: 'action.active' }} />
                </InputAdornment>
              ),
            }}
            sx={{
              backgroundColor: 'white',
              '& .MuiOutlinedInput-root': {
                fontSize: '0.875rem'
              }
            }}
          />
        </Box>

        {/* Table */}
        <TableContainer sx={{
          maxHeight: isMobile ? 'calc(100vh - 250px)' : 'calc(85vh - 220px)',
          overflow: 'auto'
        }}>
          <Table stickyHeader size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{
                  fontWeight: 600,
                  backgroundColor: 'grey.50',
                  fontSize: '0.75rem',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px'
                }}>
                  Adjustment Number
                </TableCell>
                <TableCell sx={{
                  fontWeight: 600,
                  backgroundColor: 'grey.50',
                  fontSize: '0.75rem',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px'
                }}>
                  Date
                </TableCell>
                <TableCell sx={{
                  fontWeight: 600,
                  backgroundColor: 'grey.50',
                  fontSize: '0.75rem',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px'
                }}>
                  Status
                </TableCell>
                <TableCell sx={{
                  fontWeight: 600,
                  backgroundColor: 'grey.50',
                  fontSize: '0.75rem',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px'
                }} align="center">
                  Items
                </TableCell>
                <TableCell sx={{
                  fontWeight: 600,
                  backgroundColor: 'grey.50',
                  fontSize: '0.75rem',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px'
                }} align="center">
                  Actions
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading?.deletedStockAdjustments ? (
                <TableRow>
                  <TableCell colSpan={5} align="center" sx={{ py: 4 }}>
                    <CircularProgress size={32} />
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
                      Loading deleted stock adjustments...
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : filteredAdjustments.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} align="center" sx={{ py: 4 }}>
                    <AssessmentIcon sx={{ fontSize: 48, color: 'action.disabled', mb: 1 }} />
                    <Typography variant="body1" color="text.secondary">
                      {searchTerm ? 'No matching deleted stock adjustments found' : 'No deleted stock adjustments'}
                    </Typography>
                    {searchTerm && (
                      <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                        Try adjusting your search criteria
                      </Typography>
                    )}
                  </TableCell>
                </TableRow>
              ) : (
                filteredAdjustments.map((adjustment) => (
                  <TableRow
                    key={adjustment.id}
                    hover
                    sx={{
                      '&:hover': { backgroundColor: 'action.hover' },
                      height: '52px'
                    }}
                  >
                    <TableCell>
                      <Typography
                        variant="body2"
                        sx={{
                          fontWeight: 600,
                          color: 'primary.main',
                          fontSize: '0.875rem'
                        }}
                      >
                        {adjustment.adjustmentNumber}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" sx={{ fontSize: '0.875rem' }}>
                        {formatDate(adjustment.adjustmentDate)}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={adjustment.status.charAt(0).toUpperCase() + adjustment.status.slice(1)}
                        color={getStatusColor(adjustment.status)}
                        size="small"
                        sx={{
                          fontSize: '0.75rem',
                          fontWeight: 600,
                          textTransform: 'capitalize'
                        }}
                      />
                    </TableCell>
                    <TableCell align="center">
                      <Typography variant="body2" sx={{ fontSize: '0.875rem' }}>
                        {adjustment.itemCount || 0}
                      </Typography>
                    </TableCell>
                    <TableCell align="center">
                      <Tooltip title="Restore stock adjustment">
                        <span>
                          <IconButton
                            size="small"
                            onClick={() => handleRestore(adjustment)}
                            disabled={restoringId === adjustment.id}
                            color="primary"
                            sx={{
                              '&:hover': {
                                backgroundColor: 'primary.lighter',
                                color: 'primary.dark'
                              }
                            }}
                          >
                            {restoringId === adjustment.id ? (
                              <CircularProgress size={20} />
                            ) : (
                              <RestoreIcon fontSize="small" />
                            )}
                          </IconButton>
                        </span>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </DialogContent>

      <Divider />

      <DialogActions sx={{ p: 2, justifyContent: 'space-between' }}>
        <Typography variant="body2" color="text.secondary">
          {filteredAdjustments.length} deleted stock {filteredAdjustments.length === 1 ? 'adjustment' : 'adjustments'}
        </Typography>
        <Button onClick={onClose} variant="outlined" size="medium">
          Close
        </Button>
      </DialogActions>
    </Dialog>
  )
}

export default DeletedStockAdjustmentsDialog
