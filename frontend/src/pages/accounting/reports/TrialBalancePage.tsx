import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Paper,
  Button,
  TextField,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  FormControlLabel,
  Checkbox,
  Alert,
  CircularProgress,
  Stack,
  Chip,
} from '@mui/material';
import {
  Download as DownloadIcon,
  CheckCircle as CheckCircleIcon,
  Cancel as CancelIcon,
} from '@mui/icons-material';
import { useAppDispatch, useAppSelector } from '@/store';
import {
  fetchTrialBalance,
  downloadTrialBalanceExcel,
  selectTrialBalance,
  selectDownloading,
  clearTrialBalanceError,
} from '@/store/slices/accountingReportsSlice';

// Format currency helper
const formatCurrency = (amount: number): string => {
  return amount.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

// Format date to YYYY-MM-DD
const formatDateForInput = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const TrialBalancePage: React.FC = () => {
  const dispatch = useAppDispatch();

  // Redux state
  const trialBalanceState = useAppSelector(selectTrialBalance);
  const downloading = useAppSelector(selectDownloading);

  const { data, loading, error } = trialBalanceState || {
    data: null,
    loading: false,
    error: null,
  };

  // Local state for filters
  const [asOfDate, setAsOfDate] = useState<string>(formatDateForInput(new Date()));
  const [includeInactive, setIncludeInactive] = useState<boolean>(false);

  // Load report on mount with default parameters
  useEffect(() => {
    handleGenerateReport();
  }, []);

  // Clear error on mount
  useEffect(() => {
    return () => {
      dispatch(clearTrialBalanceError());
    };
  }, [dispatch]);

  // Handle generate report
  const handleGenerateReport = () => {
    dispatch(
      fetchTrialBalance({
        asOfDate,
        includeInactive,
      })
    );
  };

  // Handle export to Excel
  const handleExportToExcel = () => {
    dispatch(
      downloadTrialBalanceExcel({
        asOfDate,
        includeInactive,
      })
    );
  };

  // Calculate totals from accounts (fallback if not provided by API)
  const calculateTotals = () => {
    if (!data?.accounts || data.accounts.length === 0) {
      return { totalDebits: 0, totalCredits: 0 };
    }

    const totalDebits = data.accounts.reduce(
      (sum, account) => sum + (account.debitBalance || 0),
      0
    );
    const totalCredits = data.accounts.reduce(
      (sum, account) => sum + (account.creditBalance || 0),
      0
    );

    return { totalDebits, totalCredits };
  };

  const { totalDebits, totalCredits } = data
    ? { totalDebits: data.totalDebits, totalCredits: data.totalCredits }
    : calculateTotals();

  return (
    <Box sx={{ p: 3 }}>
      {/* Header */}
      <Box sx={{ mb: 3 }}>
        <Typography variant="h4" sx={{ fontWeight: 600, mb: 1 }}>
          Trial Balance
        </Typography>
        <Typography variant="body2" color="text.secondary">
          View account balances and verify debits equal credits as of a specific date
        </Typography>
      </Box>

      {/* Filters Section */}
      <Paper sx={{ p: 3, mb: 3 }}>
        <Stack spacing={2}>
          <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap">
            <TextField
              label="As Of Date"
              type="date"
              value={asOfDate}
              onChange={(e) => setAsOfDate(e.target.value)}
              size="small"
              InputLabelProps={{ shrink: true }}
              sx={{ minWidth: 200 }}
            />
            <FormControlLabel
              control={
                <Checkbox
                  checked={includeInactive}
                  onChange={(e) => setIncludeInactive(e.target.checked)}
                />
              }
              label="Include Inactive Accounts"
            />
          </Stack>
          <Stack direction="row" spacing={2} justifyContent="flex-end">
            <Button
              variant="contained"
              color="primary"
              onClick={handleGenerateReport}
              disabled={loading}
              sx={{ minWidth: 150 }}
            >
              {loading ? <CircularProgress size={24} /> : 'Generate Report'}
            </Button>
            <Button
              variant="outlined"
              color="secondary"
              startIcon={downloading ? <CircularProgress size={20} /> : <DownloadIcon />}
              onClick={handleExportToExcel}
              disabled={!data || loading || downloading}
              sx={{ minWidth: 150 }}
            >
              Export to Excel
            </Button>
          </Stack>
        </Stack>
      </Paper>

      {/* Error Alert */}
      {error && (
        <Alert
          severity="error"
          sx={{ mb: 2 }}
          onClose={() => dispatch(clearTrialBalanceError())}
        >
          {error}
        </Alert>
      )}

      {/* Loading State */}
      {loading && !data && (
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', py: 8 }}>
          <CircularProgress />
        </Box>
      )}

      {/* Report Table */}
      {!loading && data && (
        <Paper>
          {/* Report Header */}
          <Box sx={{ p: 3, borderBottom: 1, borderColor: 'divider' }}>
            <Typography variant="h6" sx={{ fontWeight: 600, mb: 1 }}>
              Trial Balance Report
            </Typography>
            <Typography variant="body2" color="text.secondary">
              As of: {new Date(asOfDate).toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })}
            </Typography>
            {/* Balance Status Indicator */}
            <Box sx={{ mt: 2 }}>
              {data.isBalanced ? (
                <Chip
                  icon={<CheckCircleIcon />}
                  label="Balanced"
                  color="success"
                  size="small"
                  sx={{ fontWeight: 600 }}
                />
              ) : (
                <Chip
                  icon={<CancelIcon />}
                  label="Not Balanced"
                  color="error"
                  size="small"
                  sx={{ fontWeight: 600 }}
                />
              )}
            </Box>
          </Box>

          {/* Table */}
          <TableContainer sx={{ maxHeight: 600 }}>
            <Table stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 600, backgroundColor: 'grey.50' }}>
                    Account Code
                  </TableCell>
                  <TableCell sx={{ fontWeight: 600, backgroundColor: 'grey.50' }}>
                    Account Name
                  </TableCell>
                  <TableCell sx={{ fontWeight: 600, backgroundColor: 'grey.50' }}>
                    Account Type
                  </TableCell>
                  <TableCell
                    align="right"
                    sx={{ fontWeight: 600, backgroundColor: 'grey.50' }}
                  >
                    Debit Balance
                  </TableCell>
                  <TableCell
                    align="right"
                    sx={{ fontWeight: 600, backgroundColor: 'grey.50' }}
                  >
                    Credit Balance
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {data.accounts && data.accounts.length > 0 ? (
                  <>
                    {data.accounts.map((account) => (
                      <TableRow key={account.id} hover>
                        <TableCell>
                          <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                            {account.code}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2">{account.name}</Typography>
                        </TableCell>
                        <TableCell>
                          <Chip label={account.type} size="small" variant="outlined" />
                        </TableCell>
                        <TableCell align="right">
                          <Typography
                            variant="body2"
                            sx={{
                              fontFamily: 'monospace',
                              fontWeight: account.debitBalance > 0 ? 600 : 400,
                              color: account.debitBalance > 0 ? 'text.primary' : 'text.secondary',
                            }}
                          >
                            {account.debitBalance > 0 ? formatCurrency(account.debitBalance) : '-'}
                          </Typography>
                        </TableCell>
                        <TableCell align="right">
                          <Typography
                            variant="body2"
                            sx={{
                              fontFamily: 'monospace',
                              fontWeight: account.creditBalance > 0 ? 600 : 400,
                              color:
                                account.creditBalance > 0 ? 'text.primary' : 'text.secondary',
                            }}
                          >
                            {account.creditBalance > 0
                              ? formatCurrency(account.creditBalance)
                              : '-'}
                          </Typography>
                        </TableCell>
                      </TableRow>
                    ))}

                    {/* Footer Row - Totals */}
                    <TableRow
                      sx={{
                        backgroundColor: 'grey.100',
                        '& td': { borderTop: 2, borderColor: 'divider' },
                      }}
                    >
                      <TableCell colSpan={3}>
                        <Typography variant="body1" sx={{ fontWeight: 700 }}>
                          Total
                        </Typography>
                      </TableCell>
                      <TableCell align="right">
                        <Typography
                          variant="body1"
                          sx={{ fontFamily: 'monospace', fontWeight: 700 }}
                        >
                          {formatCurrency(totalDebits)}
                        </Typography>
                      </TableCell>
                      <TableCell align="right">
                        <Typography
                          variant="body1"
                          sx={{ fontFamily: 'monospace', fontWeight: 700 }}
                        >
                          {formatCurrency(totalCredits)}
                        </Typography>
                      </TableCell>
                    </TableRow>
                  </>
                ) : (
                  <TableRow>
                    <TableCell colSpan={5} align="center" sx={{ py: 4 }}>
                      <Typography variant="body2" color="text.secondary">
                        No data available
                      </Typography>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>

          {/* Summary Footer */}
          {data.accounts && data.accounts.length > 0 && (
            <Box
              sx={{
                p: 2,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                borderTop: 1,
                borderColor: 'divider',
                backgroundColor: 'grey.50',
              }}
            >
              <Typography variant="body2" color="text.secondary">
                Total Accounts: {data.accounts.length}
              </Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                {data.isBalanced ? (
                  <Chip
                    icon={<CheckCircleIcon />}
                    label="Debits = Credits"
                    color="success"
                    size="small"
                  />
                ) : (
                  <Chip
                    icon={<CancelIcon />}
                    label={`Difference: ${formatCurrency(Math.abs(totalDebits - totalCredits))}`}
                    color="error"
                    size="small"
                  />
                )}
              </Box>
            </Box>
          )}
        </Paper>
      )}

      {/* Empty State - No Data Loaded */}
      {!loading && !data && !error && (
        <Paper sx={{ p: 6, textAlign: 'center' }}>
          <Typography variant="body1" color="text.secondary">
            Click "Generate Report" to view the Trial Balance
          </Typography>
        </Paper>
      )}
    </Box>
  );
};

export default TrialBalancePage;
