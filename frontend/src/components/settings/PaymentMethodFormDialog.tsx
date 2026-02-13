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
  const [requiresSettlement, setRequiresSettlement] = useState(false);
  const [sortOrder, setSortOrder] = useState(0);

  useEffect(() => {
    if (open) {
      setCode(initialData?.code || '');
      setName(initialData?.name || '');
      setRequiresSettlement(initialData?.requiresSettlement || false);
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
      requiresSettlement,
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
            inputProps={{ maxLength: 20 }}
            disabled={isEdit}
            required
            fullWidth
          />
          <TextField
            label="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            inputProps={{ maxLength: 100 }}
            required
            fullWidth
          />
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
                checked={requiresSettlement}
                onChange={(e) => setRequiresSettlement(e.target.checked)}
              />
            }
            label="Requires Settlement"
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
