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
  Add as AddIcon,
  Delete as DeleteIcon,
  Edit as EditIcon,
  Payment as PaymentIcon,
} from '@mui/icons-material';
import { useAppDispatch, useAppSelector } from '@/hooks/useRedux';
import {
  createPaymentMethod,
  deletePaymentMethod,
  fetchPaymentMethods,
  selectPaymentMethods,
  selectPaymentMethodsLoading,
  updatePaymentMethod,
} from '@/store/slices/paymentMethodsSlice';
import type { PaymentMethodConfig } from '@/types';
import PaymentMethodFormDialog from '@/components/settings/PaymentMethodFormDialog';

const PaymentMethodsPage: React.FC = () => {
  const dispatch = useAppDispatch();
  const methods = useAppSelector(selectPaymentMethods);
  const loading = useAppSelector(selectPaymentMethodsLoading);

  const [formOpen, setFormOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [selected, setSelected] = useState<PaymentMethodConfig | null>(null);

  useEffect(() => {
    dispatch(fetchPaymentMethods({ page: 1, limit: 100 }));
  }, [dispatch]);

  const title = useMemo(() => `Payment Methods (${methods.length})`, [methods.length]);

  const onCreate = async (data: Partial<PaymentMethodConfig>) => {
    await dispatch(createPaymentMethod(data));
    await dispatch(fetchPaymentMethods({ page: 1, limit: 100 }));
    setFormOpen(false);
  };

  const onUpdate = async (data: Partial<PaymentMethodConfig>) => {
    if (!selected) return;
    await dispatch(updatePaymentMethod({ id: selected.id, data }));
    await dispatch(fetchPaymentMethods({ page: 1, limit: 100 }));
    setFormOpen(false);
    setSelected(null);
  };

  const onDelete = async () => {
    if (!selected) return;
    await dispatch(deletePaymentMethod(selected.id));
    await dispatch(fetchPaymentMethods({ page: 1, limit: 100 }));
    setDeleteOpen(false);
    setSelected(null);
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <PaymentIcon />
          {title}
        </Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => {
            setSelected(null);
            setFormOpen(true);
          }}
        >
          Add Payment Method
        </Button>
      </Box>

      <Paper>
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Code</TableCell>
                <TableCell>Name</TableCell>
                <TableCell>Requires Settlement</TableCell>
                <TableCell>Sort Order</TableCell>
                <TableCell>Active</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {methods.map((m) => (
                <TableRow key={m.id}>
                  <TableCell>{m.code}</TableCell>
                  <TableCell>{m.name}</TableCell>
                  <TableCell>
                    <Chip
                      size="small"
                      color={m.requiresSettlement ? 'warning' : 'default'}
                      label={m.requiresSettlement ? 'Yes' : 'No'}
                    />
                  </TableCell>
                  <TableCell>{m.sortOrder}</TableCell>
                  <TableCell>
                    <Chip size="small" color={m.isActive ? 'success' : 'default'} label={m.isActive ? 'Active' : 'Inactive'} />
                  </TableCell>
                  <TableCell align="right">
                    <IconButton
                      size="small"
                      onClick={() => {
                        setSelected(m);
                        setFormOpen(true);
                      }}
                    >
                      <EditIcon fontSize="small" />
                    </IconButton>
                    <IconButton
                      size="small"
                      onClick={() => {
                        setSelected(m);
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
                    <Typography color="text.secondary">No payment methods found.</Typography>
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
          <Button color="error" variant="contained" onClick={onDelete}>Delete</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default PaymentMethodsPage;
