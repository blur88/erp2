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
import { alpha, useTheme } from '@mui/material/styles';
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

interface NormalizedBalanceAccount {
  id: string;
  code: string;
  name: string;
  balance: number;
}

export const getBalanceSheetTone = (mode: 'light' | 'dark') => ({
  surfaceSoft: mode === 'dark' ? 'rgba(255, 255, 255, 0.06)' : 'grey.50',
  surfaceStrong: mode === 'dark' ? 'rgba(255, 255, 255, 0.1)' : 'grey.100',
  sectionAccent: mode === 'dark' ? 'rgba(255, 255, 255, 0.08)' : 'grey.100',
});

const BalanceSheetSection: React.FC<SectionProps> = ({ title, accounts, subtotal, color = 'primary' }) => {
  const theme = useTheme();
  const tone = getBalanceSheetTone(theme.palette.mode);

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
              <TableCell sx={{ fontWeight: 600, backgroundColor: tone.surfaceSoft, width: '20%' }}>
                Code
              </TableCell>
              <TableCell sx={{ fontWeight: 600, backgroundColor: tone.surfaceSoft, width: '55%' }}>
                Account Name
              </TableCell>
              <TableCell align="right" sx={{ fontWeight: 600, backgroundColor: tone.surfaceSoft, width: '25%' }}>
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
                    backgroundColor: tone.sectionAccent,
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
  const theme = useTheme();
  const tone = getBalanceSheetTone(theme.palette.mode);

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

  const normalizeAccounts = (accounts: any[] | undefined): NormalizedBalanceAccount[] => {
    if (!Array.isArray(accounts)) {
      return [];
    }

    return accounts.map((account, index) => {
      const code = account.code ?? account.accountCode ?? '';
      const name = account.name ?? account.accountName ?? '';
      return {
        id: account.id ?? `${code || 'account'}-${index}`,
        code,
        name,
        balance: typeof account.balance === 'number' ? account.balance : 0,
      };
    });
  };

  const assetAccounts = normalizeAccounts(
    data?.assets?.accounts ?? [...(data?.assets?.current ?? []), ...(data?.assets?.fixed ?? [])]
  );
  const liabilityAccounts = normalizeAccounts(
    data?.liabilities?.accounts ?? [
      ...(data?.liabilities?.current ?? []),
      ...(data?.liabilities?.longTerm ?? []),
    ]
  );
  const equityAccounts = normalizeAccounts(data?.equity?.accounts);
  const netIncome = data?.equity?.netIncome ?? 0;

  const assetsSubtotal = data?.assets?.subtotal ?? data?.assets?.total ?? 0;
  const liabilitiesSubtotal = data?.liabilities?.subtotal ?? data?.liabilities?.total ?? 0;
  const equitySubtotal = data?.equity?.subtotal ?? data?.equity?.total ?? 0;
  const totalAssets = data?.totalAssets ?? assetsSubtotal;
  const totalLiabilitiesAndEquity =
    data?.totalLiabilitiesAndEquity ?? liabilitiesSubtotal + equitySubtotal;
  const isBalanced =
    typeof data?.isBalanced === 'boolean'
      ? data.isBalanced
      : Math.abs(totalAssets - totalLiabilitiesAndEquity) < 0.01;

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
        <Stack
          direction={{ xs: 'column', md: 'row' }}
          spacing={2}
          justifyContent="space-between"
          alignItems={{ xs: 'stretch', md: 'center' }}
        >
          <Stack
            data-testid="balance-sheet-filters"
            direction="row"
            spacing={2}
            alignItems="center"
            flexWrap="wrap"
          >
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
          <Stack
            data-testid="balance-sheet-actions"
            direction="row"
            spacing={2}
            justifyContent={{ xs: 'stretch', md: 'flex-end' }}
            flexWrap="wrap"
          >
            <Button
              variant="contained"
              color="primary"
              onClick={handleGenerateReport}
              disabled={loading}
              aria-label="Generate Report"
              sx={{ minWidth: 150, flex: { xs: 1, sm: 'initial' } }}
            >
              {loading ? <CircularProgress size={24} /> : 'Generate Report'}
            </Button>
            <Button
              variant="outlined"
              color="secondary"
              startIcon={downloading ? <CircularProgress size={20} /> : <DownloadIcon />}
              onClick={handleExportToExcel}
              disabled={!data || loading || downloading}
              sx={{ minWidth: 150, flex: { xs: 1, sm: 'initial' } }}
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
              {isBalanced ? (
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
            <Grid container spacing={3} alignItems="stretch">
              {/* Assets Section */}
              <Grid item xs={12} md={4} sx={{ display: 'flex' }}>
                <Paper
                  variant="outlined"
                  data-testid="balance-sheet-section-assets"
                  sx={{ p: 2, height: '100%', display: 'flex', flexDirection: 'column', flex: 1 }}
                >
                  <BalanceSheetSection
                    title="ASSETS"
                    accounts={assetAccounts}
                    subtotal={assetsSubtotal}
                    color="primary"
                  />
                </Paper>
              </Grid>

              {/* Liabilities Section */}
              <Grid item xs={12} md={4} sx={{ display: 'flex' }}>
                <Paper
                  variant="outlined"
                  data-testid="balance-sheet-section-liabilities"
                  sx={{ p: 2, height: '100%', display: 'flex', flexDirection: 'column', flex: 1 }}
                >
                  <BalanceSheetSection
                    title="LIABILITIES"
                    accounts={liabilityAccounts}
                    subtotal={liabilitiesSubtotal}
                    color="warning"
                  />
                </Paper>
              </Grid>

              {/* Equity Section */}
              <Grid item xs={12} md={4} sx={{ display: 'flex' }}>
                <Paper
                  variant="outlined"
                  data-testid="balance-sheet-section-equity"
                  sx={{ p: 2, height: '100%', display: 'flex', flexDirection: 'column', flex: 1 }}
                >
                  <Box sx={{ flexGrow: 1 }}>
                    <BalanceSheetSection
                      title="EQUITY"
                      accounts={equityAccounts}
                      subtotal={equitySubtotal}
                      color="success"
                    />
                  </Box>
                  {netIncome !== 0 && (
                    <Box
                      data-testid="balance-sheet-net-income"
                      sx={{
                        mt: 2,
                        p: 1.5,
                        borderRadius: 1,
                        border: 1,
                        borderColor: netIncome >= 0 ? 'success.main' : 'error.main',
                        backgroundColor:
                          netIncome >= 0
                            ? alpha(theme.palette.success.main, theme.palette.mode === 'dark' ? 0.2 : 0.08)
                            : alpha(theme.palette.error.main, theme.palette.mode === 'dark' ? 0.2 : 0.08),
                      }}
                    >
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Typography
                          data-testid="balance-sheet-net-income-label"
                          variant="subtitle2"
                          sx={{ fontWeight: 700, letterSpacing: 0.3 }}
                        >
                          {netIncome >= 0 ? 'Net Income' : 'Net Loss'}
                        </Typography>
                        <Typography
                          data-testid="balance-sheet-net-income-value"
                          variant="h6"
                          sx={{
                            fontFamily: 'monospace',
                            fontWeight: 800,
                            color: netIncome >= 0 ? 'success.main' : 'error.main',
                          }}
                        >
                          {formatCurrency(Math.abs(netIncome))}
                          {netIncome < 0 && ' (Loss)'}
                        </Typography>
                      </Box>
                    </Box>
                  )}
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
              backgroundColor: tone.surfaceSoft,
            }}
          >
            <Grid container spacing={2}>
              {/* Total Assets */}
              <Grid item xs={12} md={4} sx={{ display: 'flex' }}>
                <Paper
                  variant="outlined"
                  data-testid="balance-sheet-total-assets"
                  sx={{
                    p: 2,
                    height: '100%',
                    flex: 1,
                    backgroundColor:
                      theme.palette.mode === 'dark'
                        ? alpha(theme.palette.primary.main, 0.2)
                        : theme.palette.primary.light,
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
                    {formatCurrency(Math.abs(totalAssets))}
                  </Typography>
                </Paper>
              </Grid>

              {/* Total Liabilities & Equity */}
              <Grid item xs={12} md={4} sx={{ display: 'flex' }}>
                <Paper
                  variant="outlined"
                  data-testid="balance-sheet-total-liabilities-equity"
                  sx={{
                    p: 2,
                    height: '100%',
                    flex: 1,
                    backgroundColor:
                      theme.palette.mode === 'dark'
                        ? alpha(theme.palette.success.main, 0.2)
                        : theme.palette.success.light,
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
                    {formatCurrency(Math.abs(totalLiabilitiesAndEquity))}
                  </Typography>
                </Paper>
              </Grid>

              {/* Balance Check */}
              <Grid item xs={12} md={4} sx={{ display: 'flex' }}>
                <Paper
                  variant="outlined"
                  data-testid="balance-sheet-balance-check"
                  sx={{
                    p: 2,
                    height: '100%',
                    flex: 1,
                    backgroundColor: isBalanced
                      ? theme.palette.mode === 'dark'
                        ? alpha(theme.palette.success.main, 0.2)
                        : theme.palette.success.light
                      : theme.palette.mode === 'dark'
                        ? alpha(theme.palette.error.main, 0.2)
                        : theme.palette.error.light,
                    borderColor: isBalanced ? 'success.main' : 'error.main',
                  }}
                >
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
                    Balance Check
                  </Typography>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    {isBalanced ? (
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
                            sx={{ fontFamily: 'monospace', color: 'error.main' }}
                          >
                            Difference: {formatCurrency(Math.abs(totalAssets - totalLiabilitiesAndEquity))}
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
              backgroundColor: tone.surfaceStrong,
            }}
          >
            <Typography variant="body2" color="text.secondary">
              Total Accounts: {
                assetAccounts.length + liabilityAccounts.length + equityAccounts.length
              }
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              {isBalanced ? (
                <Chip
                  icon={<CheckCircleIcon />}
                  label="Balance Sheet is Balanced"
                  color="success"
                  size="small"
                />
              ) : (
                <Chip
                  icon={<CancelIcon />}
                  label={`Out of Balance by ${formatCurrency(Math.abs(totalAssets - totalLiabilitiesAndEquity))}`}
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
