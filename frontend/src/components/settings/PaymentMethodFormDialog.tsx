import React, { useEffect, useMemo, useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  FormControlLabel,
  Switch,
  Stack,
  Select,
  MenuItem,
  InputLabel,
  FormControl,
} from '@mui/material';
import type { PaymentMethodConfig } from '@/types';

interface PaymentMethodFormDialogProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: Partial<PaymentMethodConfig>) => Promise<void> | void;
  initialData?: PaymentMethodConfig | null;
}

const PaymentMethodFormDialog: React.FC<PaymentMethodFormDialogProps> = ({
  open,
  onClose,
  onSubmit,
  initialData,
}) => {
  const isEdit = !!initialData;

  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [accountingChannel, setAccountingChannel] = useState<'CASH' | 'BANK'>('BANK');
  const [useForPurchases, setUseForPurchases] = useState(true);
  const [sortOrder, setSortOrder] = useState(0);

  useEffect(() => {
    if (open) {
      setCode(initialData?.code || '');
      setName(initialData?.name || '');
      setAccountingChannel(initialData?.accountingChannel ?? 'BANK');
      setUseForPurchases(initialData?.useForPurchases ?? true);
      setSortOrder(initialData?.sortOrder || 0);
    }
  }, [open, initialData]);

  const disabled = useMemo(() => {
    return !code.trim() || !name.trim();
  }, [code, name]);

  const handleSubmit = async () => {
    await onSubmit({
      code: code.trim().toUpperCase(),
      name: name.trim(),
      accountingChannel,
      useForPurchases,
      sortOrder,
    });
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{isEdit ? 'Edit Payment Method' : 'Create Payment Method'}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField
            label="Code"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            slotProps={{ htmlInput: { maxLength: 20 } }}
            disabled={isEdit}
            required
            fullWidth
          />
          <TextField
            label="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            slotProps={{ htmlInput: { maxLength: 100 } }}
            required
            fullWidth
          />
          <FormControl fullWidth>
            <InputLabel>Accounting Channel</InputLabel>
            <Select
              label="Accounting Channel"
              value={accountingChannel}
              onChange={(e) => setAccountingChannel(e.target.value as 'CASH' | 'BANK')}
            >
              <MenuItem value="BANK">Bank</MenuItem>
              <MenuItem value="CASH">Cash</MenuItem>
            </Select>
          </FormControl>
          <TextField
            label="Sort Order"
            type="number"
            value={sortOrder}
            onChange={(e) => setSortOrder(Number(e.target.value || 0))}
            fullWidth
          />
          <FormControlLabel
            control={
              <Switch
                checked={useForPurchases}
                onChange={(e) => setUseForPurchases(e.target.checked)}
              />
            }
            label="Use for Purchase Orders"
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={handleSubmit} disabled={disabled}>
          {isEdit ? 'Update' : 'Create'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default PaymentMethodFormDialog;
