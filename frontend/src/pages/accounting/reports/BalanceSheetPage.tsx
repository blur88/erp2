import React, { useState } from 'react';
import { skipToken } from '@reduxjs/toolkit/query';
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
  ReceiptLong as BalanceSheetIcon,
} from '@mui/icons-material';
import { TYPOGRAPHY_STYLES } from '@/constants/typography';
import { formatDate } from '@/utils/formatters';
import { useGetBalanceSheetQuery } from '@/store/api/accountingApi';
import { exportReportExcel } from '@/utils/exportReport';
import { getErrorMessage } from '@/utils/errorMessage';

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
  netIncome?: number;
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

const BalanceSheetSection: React.FC<SectionProps> = ({ title, accounts, subtotal, color = 'primary', netIncome }) => {
  const theme = useTheme();
  const tone = getBalanceSheetTone(theme.palette.mode);

  // Filter out zero-balance accounts
  const nonZeroAccounts = accounts.filter((a) => a.balance !== 0);
  const hasNetIncome = netIncome !== undefined && netIncome !== 0;

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
            {nonZeroAccounts.length > 0 || hasNetIncome ? (
              <>
                {nonZeroAccounts.map((account) => (
                  <TableRow key={account.id} hover>
                    <TableCell>
                      <Typography variant="body2">
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
                          fontWeight: 600,
                          color: account.balance < 0 ? 'error.main' : 'text.primary',
                        }}
                      >
                        {account.balance < 0
                          ? `(${formatCurrency(Math.abs(account.balance))})`
                          : formatCurrency(account.balance)}
                      </Typography>
                    </TableCell>
                  </TableRow>
                ))}

                {/* Net Income row inside equity section */}
                {hasNetIncome && (
                  <TableRow hover>
                    <TableCell>
                      <Typography variant="body2" sx={{ fontStyle: 'italic' }}>—</Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" sx={{ fontStyle: 'italic' }}>
                        {netIncome! >= 0 ? 'Add: Net Income' : 'Less: Net Loss'}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      <Typography
                        variant="body2"
                        sx={{
                          fontWeight: 600,
                          fontStyle: 'italic',
                          color: netIncome! >= 0 ? 'success.main' : 'error.main',
                        }}
                      >
                        {netIncome! < 0
                          ? `(${formatCurrency(Math.abs(netIncome!))})`
                          : formatCurrency(netIncome!)}
                      </Typography>
                    </TableCell>
                  </TableRow>
                )}

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
                      sx={{ fontWeight: 700 }}
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
  const theme = useTheme();
  const tone = getBalanceSheetTone(theme.palette.mode);
  const [asOfDate, setAsOfDate] = useState<string>(formatDateForInput(new Date()));
  const [includeInactive, setIncludeInactive] = useState<boolean>(false);
  const [submitted, setSubmitted] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const queryArgs = submitted ? { asOfDate, includeInactive } : skipToken;
  const { data, isLoading: loading, error } = useGetBalanceSheetQuery(queryArgs);
  const errorMessage = error ? getErrorMessage(error, 'Failed to load balance sheet') : null;

  const handleGenerateReport = () => {
    setSubmitted(true);
  };

  const handleExportToExcel = async () => {
    try {
      setIsDownloading(true);
      await exportReportExcel(
        '/accounting/reports/balance-sheet/export',
        { asOfDate, includeInactive },
        `balance-sheet-${asOfDate}.xlsx`,
      );
    } finally {
      setIsDownloading(false);
    }
  };

  const handleAsOfDateChange = (value: string) => {
    setAsOfDate(value);
    setSubmitted(false);
  };

  const handleIncludeInactiveChange = (value: boolean) => {
    setIncludeInactive(value);
    setSubmitted(false);
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
        <Typography
          variant={TYPOGRAPHY_STYLES.pageHeader.variant}
          sx={{ fontWeight: TYPOGRAPHY_STYLES.pageHeader.fontWeight, mb: 1, display: 'flex', alignItems: 'center', gap: 2 }}
        >
          <BalanceSheetIcon sx={{ fontSize: TYPOGRAPHY_STYLES.pageHeader.icon.fontSize, color: TYPOGRAPHY_STYLES.pageHeader.icon.color }} />
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
              onChange={(e) => handleAsOfDateChange(e.target.value)}
              size="small"
              InputLabelProps={{ shrink: true }}
              sx={{ minWidth: 200 }}
            />
            <FormControlLabel
              control={
                <Checkbox
                  checked={includeInactive}
                  onChange={(e) => handleIncludeInactiveChange(e.target.checked)}
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
              startIcon={isDownloading ? <CircularProgress size={20} /> : <DownloadIcon />}
              onClick={handleExportToExcel}
              disabled={!submitted || loading || isDownloading}
              sx={{ minWidth: 150, flex: { xs: 1, sm: 'initial' } }}
            >
              Export to Excel
            </Button>
          </Stack>
        </Stack>
      </Paper>

      {/* Error Alert */}
      {errorMessage && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {errorMessage}
        </Alert>
      )}

      {/* Loading State */}
      {loading && submitted && !data && (
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
              As of: {formatDate(asOfDate)}
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
                  <BalanceSheetSection
                    title="EQUITY"
                    accounts={equityAccounts}
                    subtotal={equitySubtotal}
                    color="success"
                    netIncome={netIncome}
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
                    sx={{ fontWeight: 700, color: 'primary.main' }}
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
                    sx={{ fontWeight: 700, color: 'success.main' }}
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
                            sx={{ color: 'error.main' }}
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
