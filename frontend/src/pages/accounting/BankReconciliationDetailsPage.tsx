import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Button,
  Stack,
  Chip,
  Alert,
  CircularProgress,
  IconButton,
  TextField,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Checkbox,
  Paper,
} from '@mui/material';
import {
  ArrowBack as ArrowBackIcon,
  CheckCircle as CheckCircleIcon,
  LockOpen as ReopenIcon,
  Delete as DeleteIcon,
  Save as SaveIcon,
} from '@mui/icons-material';
import PageHeader from '@/components/common/PageHeader';
import { format } from 'date-fns';
import { useNotification } from '@/hooks/useNotification';
import {
  useCompleteBankReconciliationMutation,
  useDeleteBankReconciliationMutation,
  useGetBankReconciliationQuery,
  useMarkBankReconciliationClearedMutation,
  useReopenBankReconciliationMutation,
  useUnmarkBankReconciliationClearedMutation,
  useUpdateBankReconciliationMutation,
} from '@/store/api/accountingApi';
import { BankReconciliationStatus, ReconciledTransaction } from '@/types';
import { formatCurrency } from '@/utils/formatters';
import { getErrorMessage } from '@/utils/errorMessage';

const BankReconciliationDetailsPage: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { showSuccess, showError } = useNotification();

  const {
    data: reconciliation,
    isLoading: loading,
    error,
    refetch,
  } = useGetBankReconciliationQuery(id as string, { skip: !id });
  const [updateBankReconciliation] = useUpdateBankReconciliationMutation();
  const [deleteBankReconciliation] = useDeleteBankReconciliationMutation();
  const [markBankReconciliationCleared] = useMarkBankReconciliationClearedMutation();
  const [unmarkBankReconciliationCleared] = useUnmarkBankReconciliationClearedMutation();
  const [completeBankReconciliation] = useCompleteBankReconciliationMutation();
  const [reopenBankReconciliation] = useReopenBankReconciliationMutation();
  const errorMessage = error ? getErrorMessage(error, 'Failed to fetch reconciliation') : null;

  const [reconciliationDate, setReconciliationDate] = useState('');
  const [statementBalance, setStatementBalance] = useState('');
  const [savingHeader, setSavingHeader] = useState(false);

  useEffect(() => {
    if (reconciliation) {
      setReconciliationDate(format(new Date(reconciliation.reconciliationDate), 'yyyy-MM-dd'));
      setStatementBalance(String(reconciliation.statementBalance));
    }
  }, [reconciliation]);

  useEffect(() => {
    if (errorMessage) {
      showError(errorMessage);
    }
  }, [errorMessage, showError]);

  const isInProgress = reconciliation?.status === BankReconciliationStatus.IN_PROGRESS;

  const handleBack = () => {
    navigate('/accounting/bank-reconciliations');
  };

  const handleSaveHeader = async () => {
    if (!id) return;

    setSavingHeader(true);
    try {
      await updateBankReconciliation({
        id,
        data: {
          reconciliationDate,
          statementBalance: Number(statementBalance),
        },
      }).unwrap();
      showSuccess('Reconciliation updated');
      refetch();
    } catch (error: any) {
      showError(getErrorMessage(error, 'Failed to update reconciliation'));
    } finally {
      setSavingHeader(false);
    }
  };

  const handleDelete = async () => {
    if (!id) return;

    try {
      await deleteBankReconciliation(id).unwrap();
      showSuccess('Reconciliation deleted successfully');
      navigate('/accounting/bank-reconciliations');
    } catch (error: any) {
      showError(getErrorMessage(error, 'Failed to delete reconciliation'));
    }
  };

  const handleToggleCleared = async (txn: ReconciledTransaction) => {
    if (!id) return;

    try {
      if (txn.cleared) {
        await unmarkBankReconciliationCleared({ id, journalEntryLineIds: [txn.journalEntryLineId] }).unwrap();
      } else {
        await markBankReconciliationCleared({ id, journalEntryLineIds: [txn.journalEntryLineId] }).unwrap();
      }
      refetch();
    } catch (error: any) {
      showError(getErrorMessage(error, 'Failed to update cleared transactions'));
    }
  };

  const handleComplete = async () => {
    if (!id) return;

    try {
      await completeBankReconciliation(id).unwrap();
      showSuccess('Reconciliation completed');
      refetch();
    } catch (error: any) {
      showError(getErrorMessage(error, 'Failed to complete reconciliation'));
    }
  };

  const handleReopen = async () => {
    if (!id) return;

    try {
      await reopenBankReconciliation(id).unwrap();
      showSuccess('Reconciliation reopened');
      refetch();
    } catch (error: any) {
      showError(getErrorMessage(error, 'Failed to reopen reconciliation'));
    }
  };

  const totals = useMemo(() => {
    const transactions = reconciliation?.reconciledTransactions || [];
    let cleared = 0;
    let uncleared = 0;

    transactions.forEach((txn) => {
      const line = txn.journalEntryLine;
      if (!line) return;
      const amount = Number(line.debitAmount) - Number(line.creditAmount);
      if (txn.cleared) {
        cleared += amount;
      } else {
        uncleared += amount;
      }
    });

    return { cleared, uncleared };
  }, [reconciliation]);

  if (loading && !reconciliation) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (!reconciliation) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error">Bank reconciliation not found</Alert>
        <Button onClick={handleBack} sx={{ mt: 2 }}>Back</Button>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3 }}>
      <PageHeader
        variant="workflow"
        title={reconciliation.account ? `${reconciliation.account.code} - ${reconciliation.account.name}` : 'Bank Reconciliation'}
        subtitle={reconciliation.fiscalPeriod?.name || reconciliation.fiscalPeriodId}
        meta={
          <Chip
            size="small"
            label={reconciliation.status === BankReconciliationStatus.COMPLETED ? 'Completed' : 'In Progress'}
            color={reconciliation.status === BankReconciliationStatus.COMPLETED ? 'success' : 'warning'}
          />
        }
      />

      <Stack direction="row" spacing={1} sx={{ mb: 3 }}>
        <IconButton onClick={handleBack}>
          <ArrowBackIcon />
        </IconButton>
        {reconciliation.status === BankReconciliationStatus.COMPLETED ? (
          <Button variant="outlined" color="warning" startIcon={<ReopenIcon />} onClick={handleReopen}>
            Reopen
          </Button>
        ) : (
          <>
            <Button
              variant="contained"
              color="success"
              startIcon={<CheckCircleIcon />}
              disabled={!reconciliation.isBalanced}
              onClick={handleComplete}
            >
              Complete
            </Button>
            <Button variant="outlined" color="error" startIcon={<DeleteIcon />} onClick={handleDelete}>
              Delete
            </Button>
          </>
        )}
        <Button variant="outlined" onClick={handleBack}>
          Back to List
        </Button>
      </Stack>

      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3, minmax(0, 1fr))' }, gap: 2 }}>
            <TextField
              label="Reconciliation Date"
              type="date"
              value={reconciliationDate}
              onChange={(e) => setReconciliationDate(e.target.value)}
              InputLabelProps={{ shrink: true }}
              disabled={!isInProgress}
            />
            <TextField
              label="Statement Balance"
              type="number"
              value={statementBalance}
              onChange={(e) => setStatementBalance(e.target.value)}
              disabled={!isInProgress}
            />
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Chip
                label={reconciliation.status === BankReconciliationStatus.COMPLETED ? 'Completed' : 'In Progress'}
                color={reconciliation.status === BankReconciliationStatus.COMPLETED ? 'success' : 'warning'}
              />
              {isInProgress && (
                <Button
                  variant="outlined"
                  startIcon={<SaveIcon />}
                  onClick={handleSaveHeader}
                  disabled={savingHeader}
                >
                  Save
                </Button>
              )}
            </Box>
          </Box>

          <Box sx={{ mt: 2, display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(4, minmax(0, 1fr))' }, gap: 2 }}>
            <Typography variant="body2">Book Balance: <strong>{formatCurrency(reconciliation.bookBalance)}</strong></Typography>
            <Typography
              variant="body2"
              sx={{ color: Math.abs(reconciliation.difference) > 0.0001 ? 'error.main' : 'success.main', fontWeight: 700 }}
            >
              Difference: {formatCurrency(reconciliation.difference)}
            </Typography>
            <Typography variant="body2">Cleared Total: <strong>{formatCurrency(totals.cleared)}</strong></Typography>
            <Typography variant="body2">Uncleared Total: <strong>{formatCurrency(totals.uncleared)}</strong></Typography>
          </Box>
        </CardContent>
      </Card>

      <Paper>
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Cleared</TableCell>
                <TableCell>Entry Date</TableCell>
                <TableCell>Reference #</TableCell>
                <TableCell>Description</TableCell>
                <TableCell align="right">Debit</TableCell>
                <TableCell align="right">Credit</TableCell>
                <TableCell>Status</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {(reconciliation.reconciledTransactions || []).map((txn) => (
                <TableRow key={txn.id}>
                  <TableCell>
                    <Checkbox
                      checked={txn.cleared}
                      disabled={!isInProgress}
                      onChange={() => handleToggleCleared(txn)}
                    />
                  </TableCell>
                  <TableCell>
                    {txn.journalEntryLine?.journalEntry?.entryDate
                      ? format(new Date(txn.journalEntryLine.journalEntry.entryDate), 'yyyy-MM-dd')
                      : '-'}
                  </TableCell>
                  <TableCell>{txn.journalEntryLine?.journalEntry?.referenceNumber || '-'}</TableCell>
                  <TableCell>
                    {txn.journalEntryLine?.journalEntry?.description || ''}
                    {txn.journalEntryLine?.memo ? ` | ${txn.journalEntryLine.memo}` : ''}
                  </TableCell>
                  <TableCell align="right">{formatCurrency(Number(txn.journalEntryLine?.debitAmount || 0))}</TableCell>
                  <TableCell align="right">{formatCurrency(Number(txn.journalEntryLine?.creditAmount || 0))}</TableCell>
                  <TableCell>
                    <Chip size="small" label={txn.cleared ? 'Cleared' : 'Uncleared'} color={txn.cleared ? 'success' : 'default'} />
                  </TableCell>
                </TableRow>
              ))}
              {(reconciliation.reconciledTransactions || []).length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} align="center" sx={{ py: 5, color: 'text.secondary' }}>
                    No transactions loaded for this reconciliation
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>
    </Box>
  );
};

export default BankReconciliationDetailsPage;
