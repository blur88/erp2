import React, { useState, useEffect, useMemo } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Box,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
} from '@mui/material';
import { format } from 'date-fns';
import { useNotification } from '@/hooks/useNotification';
import {
  useCreateBankReconciliationMutation,
  useGetChartOfAccountsQuery,
  useGetFiscalPeriodsQuery,
  useUpdateBankReconciliationMutation,
} from '@/store/api/accountingApi';
import { BankReconciliation, FiscalPeriodStatus } from '@/types';
import { getErrorMessage } from '@/utils/errorMessage';
import { AppButton } from '@/components/common/AppButton';

interface BankReconciliationFormDialogProps {
  open: boolean;
  reconciliation: BankReconciliation | null;
  onClose: () => void;
  onSuccess: () => void;
}

interface FormData {
  accountId: string;
  fiscalPeriodId: string;
  reconciliationDate: string;
  statementBalance: string;
}

const BankReconciliationFormDialog: React.FC<BankReconciliationFormDialogProps> = ({
  open,
  reconciliation,
  onClose,
  onSuccess,
}) => {
  const { showError } = useNotification();
  const { data: accountsResponse } = useGetChartOfAccountsQuery(
    { page: 1, isActive: true, isCashEquivalent: true, limit: 200 },
    { skip: !open },
  );
  const { data: periodsResponse } = useGetFiscalPeriodsQuery(
    { status: FiscalPeriodStatus.OPEN },
    { skip: !open },
  );
  const [createBankReconciliation] = useCreateBankReconciliationMutation();
  const [updateBankReconciliation] = useUpdateBankReconciliationMutation();
  const accounts = accountsResponse?.data ?? [];
  const periods = periodsResponse?.data ?? [];

  const [formData, setFormData] = useState<FormData>({
    accountId: '',
    fiscalPeriodId: '',
    reconciliationDate: format(new Date(), 'yyyy-MM-dd'),
    statementBalance: '',
  });
  const [errors, setErrors] = useState<Partial<Record<keyof FormData, string>>>({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (reconciliation) {
      setFormData({
        accountId: reconciliation.accountId,
        fiscalPeriodId: reconciliation.fiscalPeriodId,
        reconciliationDate: format(new Date(reconciliation.reconciliationDate), 'yyyy-MM-dd'),
        statementBalance: String(reconciliation.statementBalance),
      });
    } else {
      setFormData({
        accountId: '',
        fiscalPeriodId: '',
        reconciliationDate: format(new Date(), 'yyyy-MM-dd'),
        statementBalance: '',
      });
    }
    setErrors({});
  }, [reconciliation, open]);

  const openPeriods = useMemo(
    () => periods.filter((period: any) => period.status === FiscalPeriodStatus.OPEN),
    [periods],
  );

  const validateForm = (): boolean => {
    const newErrors: Partial<Record<keyof FormData, string>> = {};

    if (!formData.accountId) {
      newErrors.accountId = 'Account is required';
    }
    if (!formData.fiscalPeriodId) {
      newErrors.fiscalPeriodId = 'Fiscal period is required';
    }
    if (!formData.reconciliationDate) {
      newErrors.reconciliationDate = 'Reconciliation date is required';
    }
    if (!formData.statementBalance || Number.isNaN(Number(formData.statementBalance))) {
      newErrors.statementBalance = 'Valid statement balance is required';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleChange = (field: keyof FormData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => ({ ...prev, [field]: undefined }));
  };

  const handleSubmit = async () => {
    if (!validateForm()) {
      return;
    }

    setSubmitting(true);

    try {
      if (reconciliation) {
        await updateBankReconciliation({
          id: reconciliation.id,
          data: {
            // always sent; service ignores if unchanged (guards on !== current value)
            accountId: formData.accountId,
            fiscalPeriodId: formData.fiscalPeriodId,
            reconciliationDate: formData.reconciliationDate,
            statementBalance: Number(formData.statementBalance),
          },
        }).unwrap();
      } else {
        await createBankReconciliation({
          accountId: formData.accountId,
          fiscalPeriodId: formData.fiscalPeriodId,
          reconciliationDate: formData.reconciliationDate,
          statementBalance: Number(formData.statementBalance),
        }).unwrap();
      }

      onSuccess();
    } catch (error: any) {
      showError(getErrorMessage(error, `Failed to ${reconciliation ? 'update' : 'create'} reconciliation`));
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    if (!submitting) {
      onClose();
    }
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>{reconciliation ? 'Edit Reconciliation' : 'New Reconciliation'}</DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 2 }}>
          <FormControl fullWidth required error={!!errors.accountId} disabled={submitting || (!!reconciliation && !reconciliation.isInProgress)}>
            <InputLabel>Account</InputLabel>
            <Select
              value={formData.accountId}
              label="Account"
              onChange={(e) => handleChange('accountId', e.target.value)}
            >
              {accounts.map((account: any) => (
                <MenuItem key={account.id} value={account.id}>
                  {account.code} - {account.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <FormControl fullWidth required error={!!errors.fiscalPeriodId} disabled={submitting || (!!reconciliation && !reconciliation.isInProgress)}>
            <InputLabel>Fiscal Period</InputLabel>
            <Select
              value={formData.fiscalPeriodId}
              label="Fiscal Period"
              onChange={(e) => handleChange('fiscalPeriodId', e.target.value)}
            >
              {openPeriods.map((period: any) => (
                <MenuItem key={period.id} value={period.id}>
                  {period.code} - {period.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <TextField
            label="Reconciliation Date"
            type="date"
            value={formData.reconciliationDate}
            onChange={(e) => handleChange('reconciliationDate', e.target.value)}
            error={!!errors.reconciliationDate}
            helperText={errors.reconciliationDate}
            fullWidth
            required
            disabled={submitting}
            slotProps={{ inputLabel: { shrink: true } }}
          />

          <TextField
            label="Statement Balance"
            type="number"
            value={formData.statementBalance}
            onChange={(e) => handleChange('statementBalance', e.target.value)}
            error={!!errors.statementBalance}
            helperText={errors.statementBalance}
            fullWidth
            required
            disabled={submitting}
            slotProps={{ htmlInput: { step: '0.0001' } }}
          />
        </Box>
      </DialogContent>
      <DialogActions>
        <AppButton variant="secondary" onClick={handleClose} disabled={submitting}>
          Cancel
        </AppButton>
        <AppButton variant="primary" onClick={handleSubmit} disabled={submitting}>
          {reconciliation ? 'Update' : 'Create'}
        </AppButton>
      </DialogActions>
    </Dialog>
  );
};

export default BankReconciliationFormDialog;
