import React, { useEffect, useMemo, useState } from 'react';
import {
  Close as CloseIcon,
  Delete as DeleteIcon,
  Payment as PaymentIcon,
  Restore as RestoreIcon,
  Search as SearchIcon,
} from '@mui/icons-material';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  InputAdornment,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { skipToken } from '@reduxjs/toolkit/query';

import { useNotification } from '@/hooks/useNotification';
import {
  useGetDeletedPaymentMethodsQuery,
  usePermanentDeletePaymentMethodMutation,
  useRestorePaymentMethodMutation,
} from '@/store/api/accountingApi';
import type { PaymentMethodConfig } from '@/types';
import { formatDate } from '@/utils/formatters';

interface DeletedPaymentMethodsDialogProps {
  open: boolean;
  onClose: () => void;
}

const DeletedPaymentMethodsDialog: React.FC<DeletedPaymentMethodsDialogProps> = ({
  open,
  onClose,
}) => {
  const { showError, showSuccess } = useNotification();
  const {
    data: deletedPaymentMethods = [],
    isFetching: loading,
  } = useGetDeletedPaymentMethodsQuery(open ? undefined : skipToken);
  const [restorePaymentMethod] = useRestorePaymentMethodMutation();
  const [permanentDeletePaymentMethod] = usePermanentDeletePaymentMethodMutation();

  const [searchTerm, setSearchTerm] = useState('');
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [selectedMethods, setSelectedMethods] = useState<Set<string>>(new Set());
  const [showBulkRestoreConfirm, setShowBulkRestoreConfirm] = useState(false);
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<PaymentMethodConfig | null>(null);
  const [bulkRestoring, setBulkRestoring] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);

  useEffect(() => {
    if (open) {
      setSelectedMethods(new Set());
      setSearchTerm('');
    }
  }, [open]);

  const filteredRows = useMemo(
    () =>
      deletedPaymentMethods.filter(
        (row) =>
          row.code?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          row.name?.toLowerCase().includes(searchTerm.toLowerCase()),
      ),
    [deletedPaymentMethods, searchTerm],
  );

  const selectedCount = selectedMethods.size;
  const allSelected = filteredRows.length > 0 && selectedCount === filteredRows.length;
  const partiallySelected = selectedCount > 0 && selectedCount < filteredRows.length;

  const handleRestore = async (row: PaymentMethodConfig) => {
    setRestoringId(row.id);
    try {
      await restorePaymentMethod(row.id).unwrap();
      showSuccess(`Payment method "${row.code}" restored successfully`);
    } catch (error: any) {
      showError(error?.message || String(error) || 'Failed to restore payment method');
    } finally {
      setRestoringId(null);
    }
  };

  const handlePermanentDelete = async () => {
    if (!showDeleteConfirm) return;

    setDeletingId(showDeleteConfirm.id);
    try {
      await permanentDeletePaymentMethod(showDeleteConfirm.id).unwrap();
      showSuccess(`Payment method "${showDeleteConfirm.code}" permanently deleted`);
      setShowDeleteConfirm(null);
    } catch (error: any) {
      showError(error?.message || String(error) || 'Failed to permanently delete payment method');
    } finally {
      setDeletingId(null);
    }
  };

  const handleSelectMethod = (id: string, checked: boolean) => {
    setSelectedMethods((prev) => {
      const next = new Set(prev);
      if (checked) {
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedMethods(new Set(filteredRows.map((row) => row.id)));
      return;
    }
    setSelectedMethods(new Set());
  };

  const handleBulkRestore = async () => {
    setBulkRestoring(true);
    try {
      const ids = Array.from(selectedMethods);
      const results = await Promise.allSettled(ids.map((id) => restorePaymentMethod(id).unwrap()));
      const restoredCount = results.filter((result) => result.status === 'fulfilled').length;
      const failedCount = results.length - restoredCount;

      if (restoredCount > 0) {
        showSuccess(`Successfully restored ${restoredCount} payment methods`);
      }
      if (failedCount > 0) {
        showError(`Failed to restore ${failedCount} payment methods`);
      }

      setSelectedMethods(new Set());
    } catch (error: any) {
      showError(error?.message || String(error) || 'Failed to bulk restore payment methods');
    } finally {
      setBulkRestoring(false);
      setShowBulkRestoreConfirm(false);
    }
  };

  const handleBulkDelete = async () => {
    setBulkDeleting(true);
    try {
      const ids = Array.from(selectedMethods);
      const results = await Promise.allSettled(ids.map((id) => permanentDeletePaymentMethod(id).unwrap()));
      const deletedCount = results.filter((result) => result.status === 'fulfilled').length;
      const failedCount = results.length - deletedCount;

      if (deletedCount > 0) {
        showSuccess(`Successfully permanently deleted ${deletedCount} payment methods`);
      }
      if (failedCount > 0) {
        showError(`Failed to delete ${failedCount} payment methods`);
      }

      setSelectedMethods(new Set());
    } catch (error: any) {
      showError(error?.message || String(error) || 'Failed to bulk delete payment methods');
    } finally {
      setBulkDeleting(false);
      setShowBulkDeleteConfirm(false);
    }
  };

  return (
    <>
      <Dialog
        open={open}
        onClose={onClose}
        maxWidth="lg"
        fullWidth
        PaperProps={{ sx: { height: '80vh' } }}
      >
        <DialogTitle>
          <Box display="flex" justifyContent="space-between" alignItems="center">
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <PaymentIcon sx={{ color: 'error.main' }} />
              <Typography variant="h5" sx={{ fontWeight: 700 }}>
                Deleted Payment Methods
              </Typography>
            </Box>
            <IconButton onClick={onClose} size="small">
              <CloseIcon />
            </IconButton>
          </Box>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            Manage soft-deleted payment methods ({filteredRows.length} {searchTerm ? 'found' : 'total'})
          </Typography>
        </DialogTitle>

        <DialogContent>
          <Box sx={{ mb: 3 }}>
            <Alert severity="info" sx={{ mb: 2 }}>
              These payment methods have been soft-deleted. You can restore them to make them active again.
            </Alert>
            <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
              <TextField
                fullWidth
                placeholder="Search deleted payment methods..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon />
                    </InputAdornment>
                  ),
                }}
                sx={{ flex: 1, minWidth: '300px' }}
              />

              {selectedCount > 0 && (
                <>
                  <Button
                    variant="contained"
                    color="success"
                    startIcon={<RestoreIcon />}
                    onClick={() => setShowBulkRestoreConfirm(true)}
                    disabled={bulkRestoring || bulkDeleting}
                    sx={{ whiteSpace: 'nowrap' }}
                  >
                    Restore Selected ({selectedCount})
                  </Button>
                  <Button
                    variant="contained"
                    color="error"
                    startIcon={<DeleteIcon />}
                    onClick={() => setShowBulkDeleteConfirm(true)}
                    disabled={bulkRestoring || bulkDeleting}
                    sx={{ whiteSpace: 'nowrap' }}
                  >
                    Delete Selected ({selectedCount})
                  </Button>
                </>
              )}
            </Box>
          </Box>

          {loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
              <CircularProgress />
            </Box>
          ) : (
            <TableContainer>
              <Table stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell padding="checkbox">
                      <Checkbox
                        checked={allSelected}
                        indeterminate={partiallySelected}
                        onChange={(e) => handleSelectAll(e.target.checked)}
                        inputProps={{ 'aria-label': 'select all deleted payment methods' }}
                      />
                    </TableCell>
                    <TableCell>Code</TableCell>
                    <TableCell>Name</TableCell>
                    <TableCell>Requires Settlement</TableCell>
                    <TableCell>For Purchases</TableCell>
                    <TableCell>Deleted At</TableCell>
                    <TableCell align="right">Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filteredRows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} align="center" sx={{ py: 6 }}>
                        <Typography color="text.secondary">
                          {searchTerm
                            ? 'No deleted payment methods match your search.'
                            : 'No deleted payment methods found.'}
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredRows.map((row) => {
                      const isSelected = selectedMethods.has(row.id);
                      const isBusy = restoringId === row.id || deletingId === row.id;

                      return (
                        <TableRow key={row.id} hover selected={isSelected}>
                          <TableCell padding="checkbox">
                            <Checkbox
                              checked={isSelected}
                              onChange={(e) => handleSelectMethod(row.id, e.target.checked)}
                              disabled={isBusy}
                            />
                          </TableCell>
                          <TableCell>{row.code}</TableCell>
                          <TableCell>{row.name}</TableCell>
                          <TableCell>{row.requiresSettlement ? 'Yes' : 'No'}</TableCell>
                          <TableCell>{row.useForPurchases ? 'Yes' : 'No'}</TableCell>
                          <TableCell>{row.deletedAt ? formatDate(row.deletedAt) : '-'}</TableCell>
                          <TableCell align="right">
                            <Tooltip title="Restore">
                              <span>
                                <IconButton
                                  size="small"
                                  color="success"
                                  onClick={() => handleRestore(row)}
                                  disabled={isBusy || bulkRestoring || bulkDeleting}
                                >
                                  {restoringId === row.id ? <CircularProgress size={18} /> : <RestoreIcon fontSize="small" />}
                                </IconButton>
                              </span>
                            </Tooltip>
                            <Tooltip title="Delete Permanently">
                              <span>
                                <IconButton
                                  size="small"
                                  color="error"
                                  onClick={() => setShowDeleteConfirm(row)}
                                  disabled={isBusy || bulkRestoring || bulkDeleting}
                                >
                                  {deletingId === row.id ? <CircularProgress size={18} /> : <DeleteIcon fontSize="small" />}
                                </IconButton>
                              </span>
                            </Tooltip>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </DialogContent>

        <DialogActions>
          <Button onClick={onClose}>Close</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={showBulkRestoreConfirm} onClose={() => setShowBulkRestoreConfirm(false)}>
        <DialogTitle>Restore Selected Payment Methods</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to restore <strong>{selectedCount}</strong> selected payment methods?
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowBulkRestoreConfirm(false)}>Cancel</Button>
          <Button variant="contained" color="success" onClick={handleBulkRestore} disabled={bulkRestoring}>
            Restore
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={showBulkDeleteConfirm} onClose={() => setShowBulkDeleteConfirm(false)}>
        <DialogTitle>Permanently Delete Selected Payment Methods</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to permanently delete <strong>{selectedCount}</strong> selected payment methods?
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowBulkDeleteConfirm(false)}>Cancel</Button>
          <Button variant="contained" color="error" onClick={handleBulkDelete} disabled={bulkDeleting}>
            Delete Permanently
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={!!showDeleteConfirm} onClose={() => setShowDeleteConfirm(null)}>
        <DialogTitle>Permanently Delete Payment Method</DialogTitle>
        <DialogContent>
          <Typography>
            Permanently delete <strong>{showDeleteConfirm?.name}</strong> ({showDeleteConfirm?.code})?
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowDeleteConfirm(null)}>Cancel</Button>
          <Button color="error" variant="contained" onClick={handlePermanentDelete} disabled={!!deletingId}>
            Delete Permanently
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

export default DeletedPaymentMethodsDialog;
