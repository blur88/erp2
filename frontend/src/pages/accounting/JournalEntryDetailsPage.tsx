import React, { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  Box,
  Button,
  Card,
  CardContent,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  IconButton,
  Chip,
  Stack,
  Alert,
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Grid,
} from '@mui/material'
import {
  ArrowBack as ArrowBackIcon,
  Edit as EditIcon,
  PostAdd as PostIcon,
  Undo as ReverseIcon,
  Delete as DeleteIcon,
  CheckCircle as CheckCircleIcon,
  Warning as WarningIcon,
} from '@mui/icons-material'
import { useAppDispatch, useAppSelector } from '@/hooks/useRedux'
import { useNotification } from '@/hooks/useNotification'
import {
  fetchJournalEntryById,
  postEntry,
  reverseEntry,
  deleteJournalEntry,
  selectSelectedEntry,
  selectJournalEntriesLoading,
  selectJournalEntriesError,
  clearError,
} from '@/store/slices/journalEntriesSlice'
import { formatCurrency, formatDate, getCurrentDate } from '@/utils/formatters'
import { JournalEntryStatus } from '@/types'

const JournalEntryDetailsPage: React.FC = () => {
  const navigate = useNavigate()
  const dispatch = useAppDispatch()
  const { id } = useParams<{ id: string }>()
  const { showSuccess, showError } = useNotification()

  // Redux state
  const entry = useAppSelector(selectSelectedEntry)
  const loading = useAppSelector(selectJournalEntriesLoading)
  const error = useAppSelector(selectJournalEntriesError)

  // Local state
  const [postDialogOpen, setPostDialogOpen] = useState(false)
  const [reverseDialogOpen, setReverseDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [reverseDate, setReverseDate] = useState(getCurrentDate())
  const [actionLoading, setActionLoading] = useState(false)

  // Load entry on mount
  useEffect(() => {
    if (id) {
      dispatch(fetchJournalEntryById(id))
    }
  }, [id, dispatch])

  // Clear error on unmount
  useEffect(() => {
    return () => {
      dispatch(clearError())
    }
  }, [dispatch])

  // Handle back to list
  const handleBack = () => {
    navigate('/accounting/journal-entries')
  }

  // Handle edit
  const handleEdit = () => {
    if (entry?.status === JournalEntryStatus.DRAFT) {
      navigate(`/accounting/journal-entries/edit/${entry.id}`)
    } else {
      showError('Only draft entries can be edited')
    }
  }

  // Handle post entry
  const handlePost = async () => {
    if (!id) return

    setActionLoading(true)
    try {
      await dispatch(postEntry(id)).unwrap()
      showSuccess('Journal entry posted successfully')
      setPostDialogOpen(false)
      // Reload to get updated status
      dispatch(fetchJournalEntryById(id))
    } catch (err: any) {
      showError(err || 'Failed to post journal entry')
    } finally {
      setActionLoading(false)
    }
  }

  // Handle reverse entry
  const handleReverse = async () => {
    if (!id) return

    setActionLoading(true)
    try {
      const result = await dispatch(reverseEntry({ id, reverseDate })).unwrap()
      showSuccess('Journal entry reversed successfully')
      setReverseDialogOpen(false)

      // Navigate to the new reversing entry
      if (result && result.id) {
        navigate(`/accounting/journal-entries/${result.id}`)
      } else {
        // Or just reload current entry
        dispatch(fetchJournalEntryById(id))
      }
    } catch (err: any) {
      showError(err || 'Failed to reverse journal entry')
    } finally {
      setActionLoading(false)
    }
  }

  // Handle delete entry
  const handleDelete = async () => {
    if (!id) return

    setActionLoading(true)
    try {
      await dispatch(deleteJournalEntry(id)).unwrap()
      showSuccess('Journal entry deleted successfully')
      setDeleteDialogOpen(false)
      navigate('/accounting/journal-entries')
    } catch (err: any) {
      showError(err || 'Failed to delete journal entry')
    } finally {
      setActionLoading(false)
    }
  }

  // Get status color
  const getStatusColor = (status: JournalEntryStatus) => {
    switch (status) {
      case JournalEntryStatus.DRAFT:
        return 'default'
      case JournalEntryStatus.POSTED:
        return 'success'
      case JournalEntryStatus.REVERSED:
        return 'error'
      default:
        return 'default'
    }
  }

  if (loading && !entry) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
        <CircularProgress />
      </Box>
    )
  }

  if (!entry) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error">Journal entry not found</Alert>
        <Button onClick={handleBack} sx={{ mt: 2 }}>
          Back to List
        </Button>
      </Box>
    )
  }

  const isDraft = entry.status === JournalEntryStatus.DRAFT
  const isPosted = entry.status === JournalEntryStatus.POSTED
  const isReversed = entry.status === JournalEntryStatus.REVERSED
  const isBalanced = entry.isBalanced || Math.abs(entry.totalDebits - entry.totalCredits) < 0.01
  const difference = entry.totalDebits - entry.totalCredits

  return (
    <Box sx={{ p: 3 }}>
      {/* Header */}
      <Box sx={{ mb: 3, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <IconButton onClick={handleBack}>
            <ArrowBackIcon />
          </IconButton>
          <Box>
            <Typography variant="h4" sx={{ fontWeight: 600 }}>
              {entry.referenceNumber}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Journal Entry Details
            </Typography>
          </Box>
        </Box>

        {/* Action Buttons */}
        <Stack direction="row" spacing={1}>
          {isDraft && (
            <>
              <Button
                variant="outlined"
                startIcon={<EditIcon />}
                onClick={handleEdit}
              >
                Edit
              </Button>
              <Button
                variant="contained"
                color="success"
                startIcon={<PostIcon />}
                onClick={() => setPostDialogOpen(true)}
                disabled={!isBalanced}
              >
                Post
              </Button>
              <Button
                variant="outlined"
                color="error"
                startIcon={<DeleteIcon />}
                onClick={() => setDeleteDialogOpen(true)}
              >
                Delete
              </Button>
            </>
          )}
          {isPosted && (
            <Button
              variant="outlined"
              color="warning"
              startIcon={<ReverseIcon />}
              onClick={() => setReverseDialogOpen(true)}
            >
              Reverse
            </Button>
          )}
          <Button variant="outlined" onClick={handleBack}>
            Back to List
          </Button>
        </Stack>
      </Box>

      {/* Error Alert */}
      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => dispatch(clearError())}>
          {error}
        </Alert>
      )}

      {/* Entry Header Card */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Grid container spacing={3}>
            <Grid item xs={12} md={3}>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                Reference Number
              </Typography>
              <Typography variant="h6" sx={{ fontWeight: 600 }}>
                {entry.referenceNumber}
              </Typography>
            </Grid>
            <Grid item xs={12} md={3}>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                Date
              </Typography>
              <Typography variant="body1">
                {formatDate(entry.entryDate)}
              </Typography>
            </Grid>
            <Grid item xs={12} md={3}>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                Status
              </Typography>
              <Chip
                label={entry.status}
                color={getStatusColor(entry.status)}
                size="small"
              />
            </Grid>
            <Grid item xs={12} md={3}>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                Fiscal Period
              </Typography>
              <Typography variant="body1">
                {entry.fiscalPeriod
                  ? `${entry.fiscalPeriod.code} - ${entry.fiscalPeriod.name}`
                  : 'N/A'}
              </Typography>
            </Grid>
            <Grid item xs={12}>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                Description
              </Typography>
              <Typography variant="body1">{entry.description}</Typography>
            </Grid>
            {entry.sourceType && (
              <Grid item xs={12} md={6}>
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  Source
                </Typography>
                <Typography variant="body1">
                  {entry.sourceType}
                  {entry.sourceId && ` (${entry.sourceId})`}
                </Typography>
              </Grid>
            )}
            {entry.reversalOf && (
              <Grid item xs={12} md={6}>
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  Reverses Entry
                </Typography>
                <Typography
                  variant="body1"
                  sx={{ cursor: 'pointer', color: 'primary.main' }}
                  onClick={() => navigate(`/accounting/journal-entries/${entry.reversalOf?.id}`)}
                >
                  {entry.reversalOf.referenceNumber}
                </Typography>
              </Grid>
            )}
            {entry.reversedBy && (
              <Grid item xs={12} md={6}>
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  Reversed By
                </Typography>
                <Typography
                  variant="body1"
                  sx={{ cursor: 'pointer', color: 'primary.main' }}
                  onClick={() => navigate(`/accounting/journal-entries/${entry.reversedBy?.id}`)}
                >
                  {entry.reversedBy.referenceNumber}
                </Typography>
              </Grid>
            )}
          </Grid>
        </CardContent>
      </Card>

      {/* Balance Validation Card */}
      <Card sx={{ mb: 3, bgcolor: isBalanced ? 'success.50' : 'error.50' }}>
        <CardContent>
          <Stack direction="row" spacing={2} alignItems="center">
            {isBalanced ? (
              <>
                <CheckCircleIcon color="success" />
                <Typography variant="body1" color="success.main" sx={{ fontWeight: 600 }}>
                  Entry is Balanced
                </Typography>
              </>
            ) : (
              <>
                <WarningIcon color="error" />
                <Typography variant="body1" color="error.main" sx={{ fontWeight: 600 }}>
                  Entry is Unbalanced - Difference: {formatCurrency(Math.abs(difference))}
                </Typography>
              </>
            )}
          </Stack>
        </CardContent>
      </Card>

      {/* Line Items Card */}
      <Card>
        <CardContent>
          <Typography variant="h6" sx={{ mb: 2, fontWeight: 600 }}>
            Line Items
          </Typography>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 600 }}>Account</TableCell>
                  <TableCell sx={{ fontWeight: 600 }} align="right">
                    Debit
                  </TableCell>
                  <TableCell sx={{ fontWeight: 600 }} align="right">
                    Credit
                  </TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Memo</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {entry.lines && entry.lines.length > 0 ? (
                  <>
                    {entry.lines.map((line) => (
                      <TableRow key={line.id}>
                        <TableCell>
                          {line.account
                            ? `${line.account.code} - ${line.account.name}`
                            : line.accountId}
                        </TableCell>
                        <TableCell align="right" sx={{ fontFamily: 'monospace' }}>
                          {line.debitAmount > 0 ? formatCurrency(line.debitAmount) : ''}
                        </TableCell>
                        <TableCell align="right" sx={{ fontFamily: 'monospace' }}>
                          {line.creditAmount > 0 ? formatCurrency(line.creditAmount) : ''}
                        </TableCell>
                        <TableCell>{line.memo || '-'}</TableCell>
                      </TableRow>
                    ))}
                    {/* Totals Row */}
                    <TableRow>
                      <TableCell sx={{ fontWeight: 600, borderTop: 2 }}>TOTALS</TableCell>
                      <TableCell
                        align="right"
                        sx={{ fontWeight: 600, fontFamily: 'monospace', borderTop: 2 }}
                      >
                        {formatCurrency(entry.totalDebits)}
                      </TableCell>
                      <TableCell
                        align="right"
                        sx={{ fontWeight: 600, fontFamily: 'monospace', borderTop: 2 }}
                      >
                        {formatCurrency(entry.totalCredits)}
                      </TableCell>
                      <TableCell sx={{ borderTop: 2 }} />
                    </TableRow>
                  </>
                ) : (
                  <TableRow>
                    <TableCell colSpan={4} align="center">
                      <Typography color="text.secondary">No line items</Typography>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>

      {/* Post Confirmation Dialog */}
      <Dialog open={postDialogOpen} onClose={() => setPostDialogOpen(false)}>
        <DialogTitle>Post Journal Entry</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to post this journal entry? Once posted, the entry cannot be
            edited and will update the general ledger balances.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPostDialogOpen(false)} disabled={actionLoading}>
            Cancel
          </Button>
          <Button
            onClick={handlePost}
            variant="contained"
            color="success"
            disabled={actionLoading}
          >
            {actionLoading ? 'Posting...' : 'Post Entry'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Reverse Confirmation Dialog */}
      <Dialog open={reverseDialogOpen} onClose={() => setReverseDialogOpen(false)}>
        <DialogTitle>Reverse Journal Entry</DialogTitle>
        <DialogContent>
          <Typography gutterBottom>
            This will create a reversing journal entry with opposite debits and credits. The
            original entry will be marked as reversed.
          </Typography>
          <TextField
            fullWidth
            label="Reversal Date"
            type="date"
            value={reverseDate}
            onChange={(e) => setReverseDate(e.target.value)}
            InputLabelProps={{ shrink: true }}
            sx={{ mt: 2 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setReverseDialogOpen(false)} disabled={actionLoading}>
            Cancel
          </Button>
          <Button
            onClick={handleReverse}
            variant="contained"
            color="warning"
            disabled={actionLoading}
          >
            {actionLoading ? 'Reversing...' : 'Reverse Entry'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)}>
        <DialogTitle>Delete Journal Entry</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to delete this journal entry? This action cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)} disabled={actionLoading}>
            Cancel
          </Button>
          <Button
            onClick={handleDelete}
            variant="contained"
            color="error"
            disabled={actionLoading}
          >
            {actionLoading ? 'Deleting...' : 'Delete Entry'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}

export default JournalEntryDetailsPage
