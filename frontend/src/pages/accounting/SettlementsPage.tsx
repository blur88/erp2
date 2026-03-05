import React, { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import {
  AccountBalanceWallet as AccountBalanceWalletIcon,
  Add as AddIcon,
  Cancel as CancelIcon,
} from '@mui/icons-material';
import { useAppDispatch, useAppSelector } from '@/hooks/useRedux';
import { useNotification } from '@/hooks/useNotification'
import {
  cancelSettlement,
  createSettlement,
  fetchPendingSummary,
  fetchSettlements,
  selectSettlements,
  selectSettlementsLoading,
} from '@/store/slices/settlementsSlice';
import { formatCurrency, formatDate } from '@/utils/formatters'
import { TYPOGRAPHY_STYLES } from '@/constants/typography';
import type { Settlement } from '@/types';
import CreateSettlementDialog from '@/components/accounting/CreateSettlementDialog';

const statusColor = (status: Settlement['status']) => {
  if (status === 'completed') return 'success';
  if (status === 'cancelled') return 'error';
  return 'default';
};

const SettlementsPage: React.FC = () => {
  const dispatch = useAppDispatch();
  const { showSuccess, showError } = useNotification()
  const settlements = useAppSelector(selectSettlements);
  const loading = useAppSelector(selectSettlementsLoading);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<Settlement | null>(null);

  useEffect(() => {
    dispatch(fetchSettlements({ page: 1 }));
    dispatch(fetchPendingSummary());
  }, [dispatch]);

  const title = useMemo(() => `Settlements (${settlements.length})`, [settlements.length]);

  const onCreate = async (data: {
    paymentMethodId: string;
    settlementDate: string;
    paymentIds: string[];
    reference?: string;
    notes?: string;
  }) => {
    try {
      await dispatch(createSettlement(data)).unwrap();
      await dispatch(fetchSettlements({ page: 1 }));
      await dispatch(fetchPendingSummary());
      setDialogOpen(false);
      showSuccess('Settlement created successfully');
    } catch (error: any) {
      showError(error?.message || String(error) || 'Failed to create settlement');
    }
  };

  const onCancel = async () => {
    if (!cancelTarget) return;
    try {
      await dispatch(cancelSettlement(cancelTarget.id)).unwrap();
      await dispatch(fetchSettlements({ page: 1 }));
      await dispatch(fetchPendingSummary());
      setCancelTarget(null);
      showSuccess('Settlement cancelled successfully');
    } catch (error: any) {
      showError(error?.message || String(error) || 'Failed to cancel settlement');
    }
  };

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 3 }}>
        <Box>
          <Typography
            variant={TYPOGRAPHY_STYLES.pageHeader.variant}
            sx={{ fontWeight: TYPOGRAPHY_STYLES.pageHeader.fontWeight, mb: 1, display: 'flex', alignItems: 'center', gap: 2 }}
          >
            <AccountBalanceWalletIcon sx={{ fontSize: TYPOGRAPHY_STYLES.pageHeader.icon.fontSize, color: TYPOGRAPHY_STYLES.pageHeader.icon.color }} />
            {title}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Settle pending payments by payment method
          </Typography>
        </Box>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => setDialogOpen(true)}>
          Create Settlement
        </Button>
      </Box>

      <Paper>
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Settlement #</TableCell>
                <TableCell>Payment Method</TableCell>
                <TableCell>Date</TableCell>
                <TableCell align="right">Total Amount</TableCell>
                <TableCell align="right">Payments</TableCell>
                <TableCell>Reference</TableCell>
                <TableCell>Status</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {settlements.map((s) => (
                <TableRow key={s.id}>
                  <TableCell>{s.settlementNumber}</TableCell>
                  <TableCell>{s.paymentMethod?.name || '-'}</TableCell>
                  <TableCell>{formatDate(s.settlementDate)}</TableCell>
                  <TableCell align="right">{formatCurrency(Number(s.totalAmount || 0))}</TableCell>
                  <TableCell align="right">{s.paymentCount}</TableCell>
                  <TableCell>{s.reference || '-'}</TableCell>
                  <TableCell>
                    <Chip size="small" color={statusColor(s.status) as any} label={s.status} />
                  </TableCell>
                  <TableCell align="right">
                    {s.status === 'completed' && (
                      <IconButton size="small" onClick={() => setCancelTarget(s)}>
                        <CancelIcon fontSize="small" />
                      </IconButton>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {!settlements.length && !loading && (
                <TableRow>
                  <TableCell colSpan={8}>
                    <Typography color="text.secondary">No settlements found.</Typography>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      <CreateSettlementDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onCreate={onCreate}
      />

      <Dialog open={!!cancelTarget} onClose={() => setCancelTarget(null)}>
        <DialogTitle>Cancel Settlement</DialogTitle>
        <DialogContent>
          <Typography>
            Cancel settlement <strong>{cancelTarget?.settlementNumber}</strong>?
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCancelTarget(null)}>No</Button>
          <Button variant="contained" color="error" onClick={onCancel}>Cancel Settlement</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default SettlementsPage;
