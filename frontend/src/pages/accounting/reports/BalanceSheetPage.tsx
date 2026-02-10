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
  Divider,
  GridLegacy as Grid,
} from '@mui/material';
import {
  Download as DownloadIcon,
  CheckCircle as CheckCircleIcon,
  Cancel as CancelIcon,
} from '@mui/icons-material';
import { useAppDispatch, useAppSelector } from '@/store';
import {
  fetchBalanceSheet,
  downloadBalanceSheetExcel,
  selectBalanceSheet,
  selectDownloading,
  clearBalanceSheetError,
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

// Section component for rendering Assets, Liabilities, or Equity
interface SectionProps {
  title: string;
  accounts: Array<{
    id: string;
    code: string;
    name: string;
    balance: number;
  }>;
  subtotal: number;
  color?: 'primary' | 'warning' | 'success' | 'info';
}

const BalanceSheetSection: React.FC<SectionProps> = ({ title, accounts, subtotal, color = 'primary' }) => {
  return (
    <Box>
      {/* Section Title */}
      <Box sx={{ mb: 2 }}>
        <Typography variant="h6" sx={{ fontWeight: 700, color: `${color}.main` }}>
          {title}
        </Typography>
        <Divider sx={{ mt: 1 }} />
      </Box>

      {/* Accounts Table */}
      <TableContainer>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell sx={{ fontWeight: 600, backgroundColor: 'grey.50', width: '20%' }}>
                Code
              </TableCell>
              <TableCell sx={{ fontWeight: 600, backgroundColor: 'grey.50', width: '55%' }}>
                Account Name
              </TableCell>
              <TableCell align="right" sx={{ fontWeight: 600, backgroundColor: 'grey.50', width: '25%' }}>
                Balance
              </TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {accounts.length > 0 ? (
              <>
                {accounts.map((account) => (
                  <TableRow key={account.id} hover>
                    <TableCell>
                      <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                        {account.code}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">{account.name}</Typography>
                    </TableCell>
                    <TableCell align="right">
                      <Typography
                        variant="body2"
                        sx={{
                          fontFamily: 'monospace',
                          fontWeight: account.balance !== 0 ? 600 : 400,
                          color: account.balance !== 0 ? 'text.primary' : 'text.secondary',
                        }}
                      >
                        {account.balance !== 0 ? formatCurrency(Math.abs(account.balance)) : '-'}
                      </Typography>
                    </TableCell>
                  </TableRow>
                ))}

                {/* Subtotal Row */}
                <TableRow
                  sx={{
                    backgroundColor: 'grey.100',
                    '& td': { borderTop: 2, borderColor: 'divider' },
                  }}
                >
                  <TableCell colSpan={2}>
                    <Typography variant="body1" sx={{ fontWeight: 700 }}>
                      Total {title}
                    </Typography>
                  </TableCell>
                  <TableCell align="right">
                    <Typography
                      variant="body1"
                      sx={{ fontFamily: 'monospace', fontWeight: 700 }}
                    >
                      {formatCurrency(Math.abs(subtotal))}
                    </Typography>
                  </TableCell>
                </TableRow>
              </>
            ) : (
              <TableRow>
                <TableCell colSpan={3} align="center" sx={{ py: 2 }}>
                  <Typography variant="body2" color="text.secondary">
                    No accounts in this section
                  </Typography>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
};

const BalanceSheetPage: React.FC = () => {
  const dispatch = useAppDispatch();

  // Redux state
  const balanceSheetState = useAppSelector(selectBalanceSheet);
  const downloading = useAppSelector(selectDownloading);

  const { data, loading, error } = balanceSheetState || {
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
      dispatch(clearBalanceSheetError());
    };
  }, [dispatch]);

  // Handle generate report
  const handleGenerateReport = () => {
    dispatch(
      fetchBalanceSheet({
        asOfDate,
        includeInactive,
      })
    );
  };

  // Handle export to Excel
  const handleExportToExcel = () => {
    dispatch(
      downloadBalanceSheetExcel({
        asOfDate,
        includeInactive,
      })
    );
  };

  return (
    <Box sx={{ p: 3 }}>
      {/* Header */}
      <Box sx={{ mb: 3 }}>
        <Typography variant="h4" sx={{ fontWeight: 600, mb: 1 }}>
          Balance Sheet
        </Typography>
        <Typography variant="body2" color="text.secondary">
          View your financial position showing Assets = Liabilities + Equity as of a specific date
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
          onClose={() => dispatch(clearBalanceSheetError())}
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

      {/* Balance Sheet Report */}
      {!loading && data && (
        <Paper>
          {/* Report Header */}
          <Box sx={{ p: 3, borderBottom: 1, borderColor: 'divider' }}>
            <Typography variant="h6" sx={{ fontWeight: 600, mb: 1 }}>
              Balance Sheet Report
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

          {/* Three Sections in Grid Layout */}
          <Box sx={{ p: 3 }}>
            <Grid container spacing={3}>
              {/* Assets Section */}
              <Grid item xs={12} md={4}>
                <Paper variant="outlined" sx={{ p: 2 }}>
                  <BalanceSheetSection
                    title="ASSETS"
                    accounts={data.assets.accounts}
                    subtotal={data.assets.subtotal}
                    color="primary"
                  />
                </Paper>
              </Grid>

              {/* Liabilities Section */}
              <Grid item xs={12} md={4}>
                <Paper variant="outlined" sx={{ p: 2 }}>
                  <BalanceSheetSection
                    title="LIABILITIES"
                    accounts={data.liabilities.accounts}
                    subtotal={data.liabilities.subtotal}
                    color="warning"
                  />
                </Paper>
              </Grid>

              {/* Equity Section */}
              <Grid item xs={12} md={4}>
                <Paper variant="outlined" sx={{ p: 2 }}>
                  <BalanceSheetSection
                    title="EQUITY"
                    accounts={data.equity.accounts}
                    subtotal={data.equity.subtotal}
                    color="success"
                  />
                </Paper>
              </Grid>
            </Grid>
          </Box>

          {/* Balance Equation Footer */}
          <Box
            sx={{
              p: 3,
              borderTop: 2,
              borderColor: 'divider',
              backgroundColor: 'grey.50',
            }}
          >
            <Grid container spacing={2}>
              {/* Total Assets */}
              <Grid item xs={12} md={4}>
                <Paper
                  variant="outlined"
                  sx={{
                    p: 2,
                    backgroundColor: 'primary.light',
                    borderColor: 'primary.main',
                  }}
                >
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
                    Total Assets
                  </Typography>
                  <Typography
                    variant="h5"
                    sx={{ fontFamily: 'monospace', fontWeight: 700, color: 'primary.main' }}
                  >
                    {formatCurrency(Math.abs(data.totalAssets))}
                  </Typography>
                </Paper>
              </Grid>

              {/* Total Liabilities & Equity */}
              <Grid item xs={12} md={4}>
                <Paper
                  variant="outlined"
                  sx={{
                    p: 2,
                    backgroundColor: 'success.light',
                    borderColor: 'success.main',
                  }}
                >
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
                    Total Liabilities & Equity
                  </Typography>
                  <Typography
                    variant="h5"
                    sx={{ fontFamily: 'monospace', fontWeight: 700, color: 'success.main' }}
                  >
                    {formatCurrency(Math.abs(data.totalLiabilitiesAndEquity))}
                  </Typography>
                </Paper>
              </Grid>

              {/* Balance Check */}
              <Grid item xs={12} md={4}>
                <Paper
                  variant="outlined"
                  sx={{
                    p: 2,
                    backgroundColor: data.isBalanced ? 'success.light' : 'error.light',
                    borderColor: data.isBalanced ? 'success.main' : 'error.main',
                  }}
                >
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
                    Balance Check
                  </Typography>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    {data.isBalanced ? (
                      <>
                        <CheckCircleIcon color="success" />
                        <Typography
                          variant="body1"
                          sx={{ fontWeight: 700, color: 'success.main' }}
                        >
                          Assets = Liabilities + Equity
                        </Typography>
                      </>
                    ) : (
                      <>
                        <CancelIcon color="error" />
                        <Box>
                          <Typography
                            variant="body1"
                            sx={{ fontWeight: 700, color: 'error.main' }}
                          >
                            Assets ≠ Liabilities + Equity
                          </Typography>
                          <Typography
                            variant="body2"
                            sx={{ fontFamily: 'monospace', color: 'error.dark' }}
                          >
                            Difference: {formatCurrency(Math.abs(data.totalAssets - data.totalLiabilitiesAndEquity))}
                          </Typography>
                        </Box>
                      </>
                    )}
                  </Box>
                </Paper>
              </Grid>
            </Grid>
          </Box>

          {/* Summary Footer */}
          <Box
            sx={{
              p: 2,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              borderTop: 1,
              borderColor: 'divider',
              backgroundColor: 'grey.100',
            }}
          >
            <Typography variant="body2" color="text.secondary">
              Total Accounts: {
                data.assets.accounts.length +
                data.liabilities.accounts.length +
                data.equity.accounts.length
              }
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              {data.isBalanced ? (
                <Chip
                  icon={<CheckCircleIcon />}
                  label="Balance Sheet is Balanced"
                  color="success"
                  size="small"
                />
              ) : (
                <Chip
                  icon={<CancelIcon />}
                  label={`Out of Balance by ${formatCurrency(Math.abs(data.totalAssets - data.totalLiabilitiesAndEquity))}`}
                  color="error"
                  size="small"
                />
              )}
            </Box>
          </Box>
        </Paper>
      )}

      {/* Empty State - No Data Loaded */}
      {!loading && !data && !error && (
        <Paper sx={{ p: 6, textAlign: 'center' }}>
          <Typography variant="body1" color="text.secondary">
            Click "Generate Report" to view the Balance Sheet
          </Typography>
        </Paper>
      )}
    </Box>
  );
};

export default BalanceSheetPage;
