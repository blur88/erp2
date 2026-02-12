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
  Alert,
  CircularProgress,
  useTheme,
  useMediaQuery,
} from '@mui/material'
import {
  Search as SearchIcon,
  Restore as RestoreIcon,
  Close as CloseIcon,
  AccountBalance as AccountIcon,
  DeleteForever as DeleteForeverIcon,
} from '@mui/icons-material'
import { useDispatch } from 'react-redux'
import {
  fetchDeletedAccounts,
  restoreAccount,
  permanentDeleteAccount,
  fetchChartOfAccounts
} from '@/store/slices/chartOfAccountsSlice'
import ConfirmationDialog from '@/components/common/ConfirmationDialog'
import { useNotification } from '@/hooks/useNotification'
import type { ChartOfAccount } from '@/store/slices/chartOfAccountsSlice'
import { formatDate } from '@/utils/formatters'

interface DeletedAccountsDialogProps {
  open: boolean
  onClose: () => void
}

const DeletedAccountsDialog: React.FC<DeletedAccountsDialogProps> = ({ open, onClose }) => {
  const dispatch = useDispatch() as any
  const { showSuccess, showError } = useNotification()
  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down('md'))

  const [deletedAccounts, setDeletedAccounts] = useState<ChartOfAccount[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [loading, setLoading] = useState(false)
  const [restoringId, setRestoringId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [confirmDeleteAccount, setConfirmDeleteAccount] = useState<ChartOfAccount | null>(null)

  useEffect(() => {
    if (open) {
      loadDeletedAccounts()
    }
  }, [open])

  const loadDeletedAccounts = async () => {
    setLoading(true)
    try {
      const result = await dispatch(fetchDeletedAccounts()).unwrap()
      setDeletedAccounts(result || [])
    } catch (error: any) {
      showError(error || 'Failed to load deleted accounts')
      setDeletedAccounts([])
    } finally {
      setLoading(false)
    }
  }

  // Filter accounts based on search term
  const filteredAccounts = deletedAccounts.filter(account =>
    account.code?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    account.name?.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const handleRestore = async (account: ChartOfAccount) => {
    setRestoringId(account.id)
    try {
      await dispatch(restoreAccount(account.id)).unwrap()
      showSuccess(`Account "${account.code} - ${account.name}" restored successfully`)

      // Refresh both deleted and active accounts
      await loadDeletedAccounts()
      dispatch(fetchChartOfAccounts({ page: 1, limit: 100 }))
    } catch (error: any) {
      showError(error || 'Failed to restore account')
    } finally {
      setRestoringId(null)
    }
  }

  const handlePermanentDelete = async () => {
    if (!confirmDeleteAccount) return

    setDeletingId(confirmDeleteAccount.id)
    try {
      await dispatch(permanentDeleteAccount(confirmDeleteAccount.id)).unwrap()
      showSuccess(`Account "${confirmDeleteAccount.code} - ${confirmDeleteAccount.name}" permanently deleted`)

      // Refresh deleted accounts list
      await loadDeletedAccounts()
    } catch (error: any) {
      showError(error || 'Failed to permanently delete account')
    } finally {
      setDeletingId(null)
      setConfirmDeleteAccount(null)
    }
  }

  const getAccountTypeBadgeColor = (type: string) => {
    switch (type?.toUpperCase()) {
      case 'ASSET':
        return 'success'
      case 'LIABILITY':
        return 'error'
      case 'EQUITY':
        return 'primary'
      case 'REVENUE':
        return 'info'
      case 'EXPENSE':
        return 'warning'
      default:
        return 'default'
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="lg"
      fullWidth
      fullScreen={isMobile}
    >
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1.5, pb: 2 }}>
        <AccountIcon color="action" />
        <Box sx={{ flex: 1 }}>
          <Typography variant="h6" component="span">
            Deleted Accounts
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            View and restore soft-deleted chart of accounts
          </Typography>
        </Box>
        <IconButton onClick={onClose} size="small">
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent dividers>
        {/* Search */}
        <Box sx={{ mb: 3 }}>
          <TextField
            fullWidth
            size="small"
            placeholder="Search by code or name..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon fontSize="small" />
                </InputAdornment>
              ),
            }}
          />
        </Box>

        {/* Info Alert */}
        {!loading && filteredAccounts.length > 0 && (
          <Alert severity="warning" sx={{ mb: 3 }}>
            <Typography variant="body2" sx={{ fontWeight: 500, mb: 0.5 }}>
              Found {filteredAccounts.length} deleted account{filteredAccounts.length !== 1 ? 's' : ''}.
            </Typography>
            <Typography variant="body2">
              You can restore accounts to recover them, or permanently delete them to remove them from the database forever.
            </Typography>
          </Alert>
        )}

        {/* Loading State */}
        {loading && (
          <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', py: 8 }}>
            <CircularProgress />
          </Box>
        )}

        {/* Empty State */}
        {!loading && filteredAccounts.length === 0 && (
          <Box sx={{ textAlign: 'center', py: 8 }}>
            <AccountIcon sx={{ fontSize: 64, color: 'text.disabled', mb: 2 }} />
            <Typography variant="h6" color="text.secondary" gutterBottom>
              {searchTerm ? 'No matching deleted accounts' : 'No deleted accounts'}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {searchTerm
                ? 'Try adjusting your search terms'
                : 'Deleted accounts will appear here and can be restored'
              }
            </Typography>
          </Box>
        )}

        {/* Table */}
        {!loading && filteredAccounts.length > 0 && (
          <TableContainer component={Paper} variant="outlined">
            <Table size="small">
              <TableHead>
                <TableRow sx={{ bgcolor: 'action.hover' }}>
                  <TableCell sx={{ fontWeight: 600 }}>Code</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Name</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Type</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Deleted At</TableCell>
                  <TableCell align="center" sx={{ fontWeight: 600 }}>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredAccounts.map((account) => (
                  <TableRow
                    key={account.id}
                    sx={{
                      '&:hover': { bgcolor: 'action.hover' },
                      opacity: restoringId === account.id ? 0.5 : 1
                    }}
                  >
                    <TableCell>
                      <Typography variant="body2" fontWeight={500}>
                        {account.code}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">
                        {account.name}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={account.type}
                        size="small"
                        color={getAccountTypeBadgeColor(account.type) as any}
                        sx={{ fontWeight: 500, minWidth: 80 }}
                      />
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" color="text.secondary">
                        {account.deletedAt ? formatDate(account.deletedAt) : '-'}
                      </Typography>
                    </TableCell>
                    <TableCell align="center">
                      <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'center' }}>
                        <Tooltip title="Restore account">
                          <span>
                            <IconButton
                              size="small"
                              color="primary"
                              onClick={() => handleRestore(account)}
                              disabled={restoringId === account.id || deletingId === account.id}
                            >
                              {restoringId === account.id ? (
                                <CircularProgress size={20} />
                              ) : (
                                <RestoreIcon fontSize="small" />
                              )}
                            </IconButton>
                          </span>
                        </Tooltip>
                        <Tooltip title="Permanently delete">
                          <span>
                            <IconButton
                              size="small"
                              color="error"
                              onClick={() => setConfirmDeleteAccount(account)}
                              disabled={restoringId === account.id || deletingId === account.id}
                            >
                              {deletingId === account.id ? (
                                <CircularProgress size={20} />
                              ) : (
                                <DeleteForeverIcon fontSize="small" />
                              )}
                            </IconButton>
                          </span>
                        </Tooltip>
                      </Box>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onClose} variant="outlined">
          Close
        </Button>
      </DialogActions>

      {/* Permanent Delete Confirmation Dialog */}
      <ConfirmationDialog
        open={!!confirmDeleteAccount}
        title="Permanently Delete Account"
        message={
          confirmDeleteAccount
            ? `Are you sure you want to permanently delete account "${confirmDeleteAccount.code} - ${confirmDeleteAccount.name}"? This action CANNOT be undone and the account will be removed from the database forever.`
            : ''
        }
        confirmText="Permanently Delete"
        cancelText="Cancel"
        onConfirm={handlePermanentDelete}
        onCancel={() => setConfirmDeleteAccount(null)}
        severity="error"
      />
    </Dialog>
  )
}

export default DeletedAccountsDialog
