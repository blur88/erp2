import React, { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import { AppButton } from '@/components/common/AppButton';
import type { PaymentMethodConfig } from '@/types';
import {
  useGetPaymentMethodsQuery,
  useGetPendingSettlementPaymentsQuery,
} from '@/store/api/accountingApi';
import { formatCurrency, formatDate } from '@/utils/formatters';

interface CreateSettlementDialogProps {
  open: boolean;
  onClose: () => void;
  onCreate: (data: {
    paymentMethodId: string;
    settlementDate: string;
    paymentIds: string[];
    reference?: string;
    notes?: string;
  }) => Promise<void> | void;
}

const CreateSettlementDialog: React.FC<CreateSettlementDialogProps> = ({ open, onClose, onCreate }) => {
  const [paymentMethodId, setPaymentMethodId] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [settlementDate, setSettlementDate] = useState(new Date().toISOString().slice(0, 10));
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const { data: paymentMethodsResponse } = useGetPaymentMethodsQuery(
    { isActive: true },
    { skip: !open },
  );
  const { data: pendingPayments = [] } = useGetPendingSettlementPaymentsQuery(paymentMethodId, {
    skip: !open || !paymentMethodId,
  });

  const methods = useMemo(
    () =>
      ((paymentMethodsResponse?.data ?? []) as PaymentMethodConfig[]).filter((method) => method.requiresSettlement),
    [paymentMethodsResponse],
  );

  useEffect(() => {
    if (!open) {
      setPaymentMethodId('');
      setSelectedIds([]);
      setSettlementDate(new Date().toISOString().slice(0, 10));
      setReference('');
      setNotes('');
    }
  }, [open]);

  const totalAmount = useMemo(() => {
    return pendingPayments
      .filter((p: any) => selectedIds.includes(p.id))
      .reduce((sum: number, p: any) => sum + Number(p.amount || 0), 0);
  }, [pendingPayments, selectedIds]);

  const allSelected = pendingPayments.length > 0 && selectedIds.length === pendingPayments.length;

  const handleSubmit = async () => {
    await onCreate({
      paymentMethodId,
      settlementDate,
      paymentIds: selectedIds,
      reference: reference || undefined,
      notes: notes || undefined,
    });
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="lg">
      <DialogTitle>Create Settlement</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
            <FormControl fullWidth>
              <InputLabel>Payment Method</InputLabel>
              <Select
                value={paymentMethodId}
                label="Payment Method"
                onChange={(e) => {
                  setPaymentMethodId(e.target.value);
                  setSelectedIds([]);
                }}
              >
                {methods.map((m) => (
                  <MenuItem key={m.id} value={m.id}>{m.name}</MenuItem>
                ))}
              </Select>
            </FormControl>
            <TextField
              label="Settlement Date"
              type="date"
              value={settlementDate}
              onChange={(e) => setSettlementDate(e.target.value)}
              slotProps={{ inputLabel: { shrink: true } }}
              fullWidth
            />
          </Stack>

          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
            <TextField
              label="Bank Reference"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              fullWidth
            />
            <TextField
              label="Notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              fullWidth
            />
          </Stack>

          <Box>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>Pending Payments</Typography>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell padding="checkbox">
                    <Checkbox
                      checked={allSelected}
                      indeterminate={selectedIds.length > 0 && !allSelected}
                      onChange={(e) => {
                        setSelectedIds(e.target.checked ? pendingPayments.map((p: any) => p.id) : []);
                      }}
                    />
                  </TableCell>
                  <TableCell>Payment #</TableCell>
                  <TableCell>Date</TableCell>
                  <TableCell>Customer</TableCell>
                  <TableCell align="right">Amount</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {pendingPayments.map((p: any) => {
                  const checked = selectedIds.includes(p.id);
                  return (
                    <TableRow key={p.id} hover>
                      <TableCell padding="checkbox">
                        <Checkbox
                          checked={checked}
                          onChange={(e) => {
                            setSelectedIds((prev) => e.target.checked
                              ? [...prev, p.id]
                              : prev.filter((id) => id !== p.id));
                          }}
                        />
                      </TableCell>
                      <TableCell>{p.paymentNumber}</TableCell>
                      <TableCell>{formatDate(p.paymentDate)}</TableCell>
                      <TableCell>{p.customer?.name || '-'}</TableCell>
                      <TableCell align="right">{formatCurrency(Number(p.amount || 0))}</TableCell>
                    </TableRow>
                  );
                })}
                {!pendingPayments.length && (
                  <TableRow>
                    <TableCell colSpan={5}>
                      <Typography sx={{
                        color: "text.secondary"
                      }}>No pending payments for selected method.</Typography>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </Box>

          <Typography variant="h6">Total: {formatCurrency(totalAmount)}</Typography>
        </Stack>
      </DialogContent>
      <DialogActions>
        <AppButton variant="secondary" onClick={onClose}>Cancel</AppButton>
        <AppButton
          variant="primary"
          onClick={handleSubmit}
          disabled={!paymentMethodId || !selectedIds.length}
        >
          Create Settlement
        </AppButton>
      </DialogActions>
    </Dialog>
  );
};

export default CreateSettlementDialog;
