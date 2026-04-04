import React, { useState } from 'react';
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
  Cancel as CancelIcon,
} from '@mui/icons-material';
import PageHeader from '@/components/common/PageHeader'
import { useNotification } from '@/hooks/useNotification'
import {
  useCancelSettlementMutation,
  useCreateSettlementMutation,
  useGetPendingSettlementSummaryQuery,
  useGetSettlementsQuery,
} from '@/store/api/accountingApi';
import { formatCurrency, formatDate } from '@/utils/formatters'
import type { Settlement } from '@/types';
import CreateSettlementDialog from '@/components/accounting/CreateSettlementDialog';

const statusColor = (status: Settlement['status']) => {
  if (status === 'completed') return 'success';
  if (status === 'cancelled') return 'error';
  return 'default';
};

const SettlementsPage: React.FC = () => {
  const { showSuccess, showError } = useNotification()
  const {
    data: settlementsResponse,
    isLoading: loading,
  } = useGetSettlementsQuery({ page: 1 });
  useGetPendingSettlementSummaryQuery();
  const [createSettlement] = useCreateSettlementMutation();
  const [cancelSettlement] = useCancelSettlementMutation();

  const settlements = settlementsResponse?.data ?? [];

  const [dialogOpen, setDialogOpen] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<Settlement | null>(null);

  const onCreate = async (data: {
    paymentMethodId: string;
    settlementDate: string;
    paymentIds: string[];
    reference?: string;
    notes?: string;
  }) => {
    try {
      await createSettlement(data).unwrap();
      setDialogOpen(false);
      showSuccess('Settlement created successfully');
    } catch (error: any) {
      showError(error?.message || String(error) || 'Failed to create settlement');
    }
  };

  const onCancel = async () => {
    if (!cancelTarget) return;
    try {
      await cancelSettlement(cancelTarget.id).unwrap();
      setCancelTarget(null);
      showSuccess('Settlement cancelled successfully');
    } catch (error: any) {
      showError(error?.message || String(error) || 'Failed to cancel settlement');
    }
  };

  return (
    <>
      <PageHeader
        title="Settlements"
        subtitle="Settle pending payments by payment method"
        primaryAction={{ label: 'Create Settlement', onClick: () => setDialogOpen(true) }}
      />

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
    </>
  );
};

export default SettlementsPage;
