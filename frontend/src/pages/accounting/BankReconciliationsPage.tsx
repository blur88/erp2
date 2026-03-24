import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Box,
  Typography,
  Paper,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  IconButton,
  CircularProgress,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  useTheme,
  useMediaQuery,
} from '@mui/material';
import {
  Add as AddIcon,
  Delete as DeleteIcon,
} from '@mui/icons-material';
import PageHeader from '@/components/common/PageHeader';
import { format } from 'date-fns';
import ConfirmationDialog from '@/components/common/ConfirmationDialog';
import BankReconciliationFormDialog from '@/components/accounting/BankReconciliationFormDialog';
import { useNotification } from '@/hooks/useNotification';
import { TABLE_STYLES } from '@/constants/typography';
import {
  useDeleteBankReconciliationMutation,
  useGetBankReconciliationsQuery,
  useGetChartOfAccountsQuery,
  useGetFiscalPeriodsQuery,
} from '@/store/api/accountingApi';
import { BankReconciliation, BankReconciliationStatus } from '@/types';
import { formatCurrency } from '@/utils/formatters';
import { useKeyboardShortcuts } from '@/hooks/useSearchAndFilter';
import { getErrorMessage } from '@/utils/errorMessage';

const BankReconciliationsPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { showSuccess, showError } = useNotification();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  const [accountFilter, setAccountFilter] = useState<string>('all');
  const [periodFilter, setPeriodFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [formDialogOpen, setFormDialogOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [selectedReconciliation, setSelectedReconciliation] = useState<BankReconciliation | null>(null);

  const queryParams = useMemo(() => {
    const params: Record<string, unknown> = {
      page: 1,
      sortBy: 'reconciliationDate',
      sortOrder: 'DESC' as const,
    };

    if (accountFilter !== 'all') params.accountId = accountFilter;
    if (periodFilter !== 'all') params.fiscalPeriodId = periodFilter;
    if (statusFilter !== 'all') params.status = statusFilter;
    return params;
  }, [accountFilter, periodFilter, statusFilter]);

  const {
    data: reconciliationsResponse,
    isLoading: loading,
    error,
    refetch,
  } = useGetBankReconciliationsQuery(queryParams);
  const { data: accountsResponse } = useGetChartOfAccountsQuery({ page: 1, isActive: true });
  const { data: periodsResponse } = useGetFiscalPeriodsQuery({ page: 1, sortBy: 'startDate', sortOrder: 'DESC' });
  const [deleteBankReconciliation] = useDeleteBankReconciliationMutation();
  const reconciliations = reconciliationsResponse?.data ?? [];
  const pagination = reconciliationsResponse?.meta;
  const accounts = accountsResponse?.data ?? [];
  const periods = periodsResponse?.data ?? [];
  const errorMessage = error ? getErrorMessage(error, 'Failed to fetch reconciliations') : null;

  useKeyboardShortcuts({
    onSearch: () => {
      const el = document.querySelector<HTMLInputElement>('[data-testid="search-input"]');
      el?.focus();
    },
    onAdd: () => setFormDialogOpen(true),
    onRefresh: () => refetch(),
  });

  useEffect(() => {
    if (errorMessage) {
      showError(errorMessage);
    }
  }, [errorMessage, showError]);

  useEffect(() => {
    if (location.pathname.endsWith('/new')) {
      setSelectedReconciliation(null);
      setFormDialogOpen(true);
    }
  }, [location.pathname]);

  const accountOptions = useMemo(
    () => accounts.filter((account: any) => String(account.type).toUpperCase() === 'ASSET'),
    [accounts],
  );

  const handleOpenCreate = () => {
    navigate('/accounting/bank-reconciliations/new');
  };

  const handleDelete = (reconciliation: BankReconciliation) => {
    setSelectedReconciliation(reconciliation);
    setDeleteConfirmOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!selectedReconciliation) return;

    try {
      await deleteBankReconciliation(selectedReconciliation.id).unwrap();
      showSuccess('Reconciliation deleted successfully');
      setDeleteConfirmOpen(false);
      setSelectedReconciliation(null);
      refetch();
    } catch (err: any) {
      showError(getErrorMessage(err, 'Failed to delete reconciliation'));
    }
  };

  const handleCancelDelete = () => {
    setDeleteConfirmOpen(false);
    setSelectedReconciliation(null);
  };

  const handleFormClose = () => {
    setFormDialogOpen(false);
    setSelectedReconciliation(null);
    if (location.pathname.endsWith('/new')) {
      navigate('/accounting/bank-reconciliations');
    }
  };

  const handleFormSuccess = () => {
    setFormDialogOpen(false);
    setSelectedReconciliation(null);
    navigate('/accounting/bank-reconciliations');
    refetch();
    showSuccess('Reconciliation saved successfully');
  };

  const getStatusChip = (status: BankReconciliationStatus) => {
    if (status === BankReconciliationStatus.COMPLETED) {
      return <Chip size="small" color="success" label="Completed" />;
    }
    return <Chip size="small" color="warning" label="In Progress" />;
  };

  const selectedPeriodLabel =
    periodFilter === 'all'
      ? 'All periods'
      : periods.find((period: any) => period.id === periodFilter)?.name || periodFilter;

  return (
    <Box sx={{ p: 3 }}>
      <PageHeader
        variant="workflow"
        title="Bank Reconciliations"
        subtitle="Reconcile bank and cash accounts"
        titleBadge={<Chip size="small" label={selectedPeriodLabel} />}
        toolbar={
          <Button variant="contained" startIcon={<AddIcon />} onClick={handleOpenCreate}>
            New Reconciliation
          </Button>
        }
      />

      <Paper sx={{ p: 2, mb: 3 }}>
        <Box sx={{ display: 'flex', gap: 2, flexDirection: isMobile ? 'column' : 'row' }}>
          <FormControl fullWidth>
            <InputLabel>Account</InputLabel>
            <Select value={accountFilter} label="Account" onChange={(e) => setAccountFilter(e.target.value)}>
              <MenuItem value="all">All Accounts</MenuItem>
              {accountOptions.map((account: any) => (
                <MenuItem key={account.id} value={account.id}>
                  {account.code} - {account.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <FormControl fullWidth>
            <InputLabel>Period</InputLabel>
            <Select value={periodFilter} label="Period" onChange={(e) => setPeriodFilter(e.target.value)}>
              <MenuItem value="all">All Periods</MenuItem>
              {periods.map((period: any) => (
                <MenuItem key={period.id} value={period.id}>
                  {period.code} - {period.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <FormControl fullWidth>
            <InputLabel>Status</InputLabel>
            <Select value={statusFilter} label="Status" onChange={(e) => setStatusFilter(e.target.value)}>
              <MenuItem value="all">All Statuses</MenuItem>
              <MenuItem value={BankReconciliationStatus.IN_PROGRESS}>In Progress</MenuItem>
              <MenuItem value={BankReconciliationStatus.COMPLETED}>Completed</MenuItem>
            </Select>
          </FormControl>
        </Box>
      </Paper>

      <Paper sx={{ p: 0 }}>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
            <CircularProgress />
          </Box>
        ) : (
          <TableContainer>
            <Table size={TABLE_STYLES.size}>
              <TableHead>
                <TableRow>
                  <TableCell>Account</TableCell>
                  <TableCell>Period</TableCell>
                  <TableCell>Reconciliation Date</TableCell>
                  <TableCell align="right">Statement Balance</TableCell>
                  <TableCell align="right">Book Balance</TableCell>
                  <TableCell align="right">Difference</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell align="center">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {reconciliations.map((recon: BankReconciliation) => (
                  <TableRow
                    key={recon.id}
                    hover
                    sx={{ cursor: 'pointer' }}
                    onClick={() => navigate(`/accounting/bank-reconciliations/${recon.id}`)}
                  >
                    <TableCell>{recon.account ? `${recon.account.code} - ${recon.account.name}` : recon.accountId}</TableCell>
                    <TableCell>{recon.fiscalPeriod ? recon.fiscalPeriod.name : recon.fiscalPeriodId}</TableCell>
                    <TableCell>{format(new Date(recon.reconciliationDate), 'yyyy-MM-dd')}</TableCell>
                    <TableCell align="right">{formatCurrency(recon.statementBalance)}</TableCell>
                    <TableCell align="right">{formatCurrency(recon.bookBalance)}</TableCell>
                    <TableCell
                      align="right"
                      sx={{ color: Math.abs(recon.difference) > 0.0001 ? 'error.main' : 'success.main', fontWeight: 600 }}
                    >
                      {formatCurrency(recon.difference)}
                    </TableCell>
                    <TableCell>{getStatusChip(recon.status)}</TableCell>
                    <TableCell align="center" onClick={(e) => e.stopPropagation()}>
                      {recon.status === BankReconciliationStatus.IN_PROGRESS && (
                        <IconButton color="error" onClick={() => handleDelete(recon)}>
                          <DeleteIcon />
                        </IconButton>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {reconciliations.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} align="center" sx={{ py: 6, color: 'text.secondary' }}>
                      No reconciliations found
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Paper>

      <ConfirmationDialog
        open={deleteConfirmOpen}
        title="Delete Reconciliation"
        message="This will remove the in-progress reconciliation. Continue?"
        confirmText="Delete"
        severity="error"
        onConfirm={handleConfirmDelete}
        onCancel={handleCancelDelete}
      />

      <BankReconciliationFormDialog
        open={formDialogOpen}
        reconciliation={selectedReconciliation}
        onClose={handleFormClose}
        onSuccess={handleFormSuccess}
      />
    </Box>
  );
};

export default BankReconciliationsPage;
