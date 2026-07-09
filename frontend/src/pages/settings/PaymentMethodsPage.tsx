import React, { useMemo, useState } from 'react';
import { default as DeleteIcon } from '@mui/icons-material/Delete'
import { default as EditIcon } from '@mui/icons-material/Edit';
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

import PaymentMethodFormDialog from '@/components/settings/PaymentMethodFormDialog';
import DeletedPaymentMethodsDialog from '@/components/settings/DeletedPaymentMethodsDialog';
import PageHeader from '@/components/common/PageHeader';
import { StatusChip } from '@/components/common/StatusChip';
import GenericOverviewPage from '@/components/common/GenericOverviewPage';
import { useNotification } from '@/hooks/useNotification';
import {
  useCreatePaymentMethodMutation,
  useDeletePaymentMethodMutation,
  useGetPaymentMethodsQuery,
  useUpdatePaymentMethodMutation,
} from '@/store/api/paymentMethodsApi';
import type { PaymentMethodConfig } from '@/types';

const PaymentMethodsPage: React.FC = () => {
  const { showError, showSuccess } = useNotification();
  const {
    data: methodsResponse,
    isLoading: loading,
  } = useGetPaymentMethodsQuery({ page: 1, limit: 50 });
  const [createPaymentMethod] = useCreatePaymentMethodMutation();
  const [updatePaymentMethod] = useUpdatePaymentMethodMutation();
  const [deletePaymentMethod] = useDeletePaymentMethodMutation();

  const methods = methodsResponse?.data ?? [];

  const [formOpen, setFormOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletedOpen, setDeletedOpen] = useState(false);
  const [selected, setSelected] = useState<PaymentMethodConfig | null>(null);

  const title = useMemo(() => `Payment Methods (${methods.length})`, [methods.length]);

  const onCreate = async (data: Partial<PaymentMethodConfig>) => {
    try {
      await createPaymentMethod(data).unwrap();
      showSuccess('Payment method created successfully');
      setFormOpen(false);
    } catch (error: any) {
      showError(error?.message || String(error) || 'Failed to create payment method');
    }
  };

  const onUpdate = async (data: Partial<PaymentMethodConfig>) => {
    if (!selected) return;

    try {
      await updatePaymentMethod({ id: selected.id, data }).unwrap();
      showSuccess('Payment method updated successfully');
      setFormOpen(false);
      setSelected(null);
    } catch (error: any) {
      showError(error?.message || String(error) || 'Failed to update payment method');
    }
  };

  const onDelete = async () => {
    if (!selected) return;

    try {
      await deletePaymentMethod(selected.id).unwrap();
      showSuccess('Payment method deleted successfully');
      setDeleteOpen(false);
      setSelected(null);
    } catch (error: any) {
      showError(error?.message || String(error) || 'Failed to delete payment method');
    }
  };

  return (
    <GenericOverviewPage>
      <PageHeader
        title={title}
        subtitle="Manage payment methods and configurations"
        secondaryAction={{ label: 'View Deleted', onClick: () => setDeletedOpen(true) }}
        primaryAction={{
          label: 'Add Payment Method',
          onClick: () => {
            setSelected(null);
            setFormOpen(true);
          },
        }}
      />
      <Paper>
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Code</TableCell>
                <TableCell>Name</TableCell>
                <TableCell>For Purchases</TableCell>
                <TableCell>Sort Order</TableCell>
                <TableCell>Active</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {methods.map((method) => (
                <TableRow key={method.id}>
                  <TableCell>{method.code}</TableCell>
                  <TableCell>{method.name}</TableCell>
                  <TableCell>
                    <Chip
                      size="small"
                      color={method.useForPurchases ? 'primary' : 'default'}
                      label={method.useForPurchases ? 'Yes' : 'No'}
                    />
                  </TableCell>
                  <TableCell>{method.sortOrder}</TableCell>
                  <TableCell>
                    <StatusChip status={method.isActive ? 'active' : 'inactive'} />
                  </TableCell>
                  <TableCell align="right">
                    <IconButton
                      size="small"
                      onClick={() => {
                        setSelected(method);
                        setFormOpen(true);
                      }}
                    >
                      <EditIcon fontSize="small" />
                    </IconButton>
                    <IconButton
                      size="small"
                      onClick={() => {
                        setSelected(method);
                        setDeleteOpen(true);
                      }}
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
              {!methods.length && !loading && (
                <TableRow>
                  <TableCell colSpan={6}>
                    <Typography sx={{
                      color: "text.secondary"
                    }}>No payment methods found.</Typography>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>
      <PaymentMethodFormDialog
        open={formOpen}
        onClose={() => {
          setFormOpen(false);
          setSelected(null);
        }}
        onSubmit={selected ? onUpdate : onCreate}
        initialData={selected}
      />
      <Dialog open={deleteOpen} onClose={() => setDeleteOpen(false)}>
        <DialogTitle>Delete Payment Method</DialogTitle>
        <DialogContent>
          <Typography>
            Delete <strong>{selected?.name}</strong> ({selected?.code})?
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteOpen(false)}>Cancel</Button>
          <Button color="error" variant="contained" onClick={onDelete}>
            Delete
          </Button>
        </DialogActions>
      </Dialog>
      <DeletedPaymentMethodsDialog open={deletedOpen} onClose={() => setDeletedOpen(false)} />
    </GenericOverviewPage>
  );
};

export default PaymentMethodsPage;
