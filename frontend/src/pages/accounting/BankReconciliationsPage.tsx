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
  AccountBalance as AccountBalanceIcon,
  Add as AddIcon,
  Delete as DeleteIcon,
} from '@mui/icons-material';
import { format } from 'date-fns';
import { useDispatch, useSelector } from 'react-redux';
import ConfirmationDialog from '@/components/common/ConfirmationDialog';
import BankReconciliationFormDialog from '@/components/accounting/BankReconciliationFormDialog';
import { useNotification } from '@/hooks/useNotification';
import { TYPOGRAPHY_STYLES, TABLE_STYLES } from '@/constants/typography';
import {
  fetchBankReconciliations,
  deleteBankReconciliation,
  selectBankReconciliations,
  selectBankReconciliationsLoading,
  selectBankReconciliationsError,
  selectBankReconciliationsPagination,
} from '@/store/slices/bankReconciliationsSlice';
import {
  fetchChartOfAccounts,
  selectChartOfAccounts,
} from '@/store/slices/chartOfAccountsSlice';
import {
  fetchFiscalPeriods,
  selectFiscalPeriods,
} from '@/store/slices/fiscalPeriodsSlice';
import { BankReconciliation, BankReconciliationStatus } from '@/types';
import { formatCurrency } from '@/utils/formatters';
import { useKeyboardShortcuts } from '@/hooks/useSearchAndFilter';

const BankReconciliationsPage: React.FC = () => {
  const dispatch = useDispatch() as any;
  const navigate = useNavigate();
  const location = useLocation();
  const { showSuccess, showError } = useNotification();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  const reconciliations = useSelector(selectBankReconciliations) || [];
  const loading = useSelector(selectBankReconciliationsLoading);
  const error = useSelector(selectBankReconciliationsError);
  const pagination = useSelector(selectBankReconciliationsPagination);
  const accounts = useSelector(selectChartOfAccounts) || [];
  const periods = useSelector(selectFiscalPeriods) || [];

  const [accountFilter, setAccountFilter] = useState<string>('all');
  const [periodFilter, setPeriodFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [formDialogOpen, setFormDialogOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [selectedReconciliation, setSelectedReconciliation] = useState<BankReconciliation | null>(null);

  useKeyboardShortcuts({
    onSearch: () => {
      const el = document.querySelector<HTMLInputElement>('[data-testid="search-input"]');
      el?.focus();
    },
    onAdd: () => setFormDialogOpen(true),
    onRefresh: () => dispatch(fetchBankReconciliations({})),
  });

  useEffect(() => {
    dispatch(fetchChartOfAccounts({ page: 1, limit: 1000, isActive: true }));
    dispatch(fetchFiscalPeriods({ page: 1, limit: 1000, sortBy: 'startDate', sortOrder: 'DESC' }));
  }, [dispatch]);

  useEffect(() => {
    const params: any = {
      page: 1,
      limit: 1000,
      sortBy: 'reconciliationDate',
      sortOrder: 'DESC' as const,
    };

    if (accountFilter !== 'all') params.accountId = accountFilter;
    if (periodFilter !== 'all') params.fiscalPeriodId = periodFilter;
    if (statusFilter !== 'all') params.status = statusFilter;

    dispatch(fetchBankReconciliations(params));
  }, [dispatch, accountFilter, periodFilter, statusFilter]);

  useEffect(() => {
    if (error) {
      showError(error);
    }
  }, [error, showError]);

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
      await dispatch(deleteBankReconciliation(selectedReconciliation.id)).unwrap();
      showSuccess('Reconciliation deleted successfully');
      setDeleteConfirmOpen(false);
      setSelectedReconciliation(null);
      dispatch(fetchBankReconciliations({ page: 1, limit: 1000, sortBy: 'reconciliationDate', sortOrder: 'DESC' }));
    } catch (err: any) {
      showError(err || 'Failed to delete reconciliation');
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
    dispatch(fetchBankReconciliations({ page: 1, limit: 1000, sortBy: 'reconciliationDate', sortOrder: 'DESC' }));
    showSuccess('Reconciliation saved successfully');
  };

  const getStatusChip = (status: BankReconciliationStatus) => {
    if (status === BankReconciliationStatus.COMPLETED) {
      return <Chip size="small" color="success" label="Completed" />;
    }
    return <Chip size="small" color="warning" label="In Progress" />;
  };

  return (
    <Box>
      <Box sx={{
        display: 'flex',
        flexDirection: isMobile ? 'column' : 'row',
        justifyContent: 'space-between',
        alignItems: isMobile ? 'stretch' : 'center',
        mb: 4,
        gap: isMobile ? 2 : 0,
      }}>
        <Box>
          <Typography
            variant={isMobile ? TYPOGRAPHY_STYLES.pageHeader.mobileVariant : TYPOGRAPHY_STYLES.pageHeader.variant}
            sx={{
              fontWeight: TYPOGRAPHY_STYLES.pageHeader.fontWeight,
              mb: 1,
              display: 'flex',
              alignItems: 'center',
              gap: 2,
            }}
          >
            <AccountBalanceIcon sx={{ fontSize: TYPOGRAPHY_STYLES.pageHeader.icon.fontSize, color: TYPOGRAPHY_STYLES.pageHeader.icon.color }} />
            Bank Reconciliations
          </Typography>
          <Typography variant={TYPOGRAPHY_STYLES.pageSubtitle.variant} color={TYPOGRAPHY_STYLES.pageSubtitle.color}>
            Reconcile bank and cash accounts ({pagination?.total || 0} total)
          </Typography>
        </Box>
        <Button variant="contained" startIcon={<AddIcon />} onClick={handleOpenCreate}>
          New Reconciliation
        </Button>
      </Box>

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
