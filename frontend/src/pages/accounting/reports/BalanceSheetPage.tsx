import React, { useState } from 'react';
import { skipToken } from '@reduxjs/toolkit/query';
import {
  Box,
  Typography,
  Paper,
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
  Grid,
} from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';
import { default as CheckCircleIcon } from '@mui/icons-material/CheckCircle'
import { default as CancelIcon } from '@mui/icons-material/Cancel';
import PageHeader from '@/components/common/PageHeader';
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

export const getBalanceSheetTone = () => ({
  surfaceSoft: 'rgba(255, 255, 255, 0.06)',
  surfaceStrong: 'rgba(255, 255, 255, 0.1)',
  sectionAccent: 'rgba(255, 255, 255, 0.08)',
});

const BalanceSheetSection: React.FC<SectionProps> = ({ title, accounts, subtotal, color = 'primary', netIncome }) => {
  const theme = useTheme();
  const tone = getBalanceSheetTone();

  // Filter out zero-balance accounts
  const nonZeroAccounts = accounts.filter((a) => a.balance !== 0);
  const hasNetIncome = netIncome !== undefined && netIncome !== 0;

  // For equity: show positive accounts (capital) first, then net income, then negative (drawings)
  const negativeAccounts = nonZeroAccounts.filter((a) => a.balance < 0);
  const orderedAccounts = title === 'EQUITY'
    ? [...nonZeroAccounts.filter((a) => a.balance > 0), ...negativeAccounts]
    : nonZeroAccounts;

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
            {orderedAccounts.length > 0 || hasNetIncome ? (
              <>
                {orderedAccounts.map((account, idx) => {
                  // For equity: insert Net Income row after positive accounts (before first negative)
                  const isFirstNegative = title === 'EQUITY' && account.balance < 0 && (idx === 0 || orderedAccounts[idx - 1].balance > 0);
                  return (
                    <React.Fragment key={account.id}>
                      {isFirstNegative && hasNetIncome && (
                        <TableRow hover data-testid="balance-sheet-net-income">
                          <TableCell />
                          <TableCell>
                            <Typography variant="body2" sx={{ fontStyle: 'italic' }} data-testid="balance-sheet-net-income-label">
                              {netIncome! >= 0 ? 'Add: Net Income' : 'Less: Net Loss'}
                            </Typography>
                          </TableCell>
                          <TableCell align="right">
                            <Typography
                              variant="body2"
                              data-testid="balance-sheet-net-income-value"
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
                      <TableRow hover>
                        <TableCell>
                          <Typography variant="body2">{account.code}</Typography>
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
                    </React.Fragment>
                  );
                })}

                {/* Net Income row — shown at end if no negative accounts */}
                {hasNetIncome && (title !== 'EQUITY' || negativeAccounts.length === 0) && (
                  <TableRow hover data-testid="balance-sheet-net-income">
                    <TableCell />
                    <TableCell>
                      <Typography variant="body2" sx={{ fontStyle: 'italic' }} data-testid="balance-sheet-net-income-label">
                        {netIncome! >= 0 ? 'Add: Net Income' : 'Less: Net Loss'}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      <Typography
                        variant="body2"
                        data-testid="balance-sheet-net-income-value"
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
              <>
                <TableRow>
                  <TableCell colSpan={3} align="center" sx={{ py: 2 }}>
                    <Typography variant="body2" sx={{
                      color: "text.secondary"
                    }}>
                      No accounts in this section
                    </Typography>
                  </TableCell>
                </TableRow>
                <TableRow sx={{ backgroundColor: tone.sectionAccent, '& td': { borderTop: 2, borderColor: 'divider' } }}>
                  <TableCell colSpan={2}>
                    <Typography variant="body1" sx={{ fontWeight: 700 }}>Total {title}</Typography>
                  </TableCell>
                  <TableCell align="right">
                    <Typography variant="body1" sx={{ fontWeight: 700 }}>0.00</Typography>
                  </TableCell>
                </TableRow>
              </>
            )}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
};

const BalanceSheetPage: React.FC = () => {
  const theme = useTheme();
  const tone = getBalanceSheetTone();
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
    <>
      <PageHeader
        variant="report"
        title="Balance Sheet"
        subtitle="View your financial position showing Assets = Liabilities + Equity as of a specific date"
        primaryAction={{ label: loading ? 'Generating...' : 'Generate Report', onClick: handleGenerateReport, disabled: loading }}
        secondaryAction={{ label: isDownloading ? 'Exporting...' : 'Export to Excel', onClick: handleExportToExcel, disabled: !submitted || loading || isDownloading }}
      />
      <Paper sx={{ p: 3, mb: 3 }}>
        <Stack
          data-testid="balance-sheet-filters"
          direction="row"
          spacing={2}
          sx={{
            alignItems: "center",
            flexWrap: "wrap"
          }}>
          <TextField
            label="As Of Date"
            type="date"
            value={asOfDate}
            onChange={(e) => handleAsOfDateChange(e.target.value)}
            size="small"
            slotProps={{ inputLabel: { shrink: true } }}
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
            <Typography variant="body2" sx={{
              color: "text.secondary"
            }}>
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
            <Grid container spacing={3} sx={{ alignItems: 'stretch' }}>
              {/* Assets Section */}
              <Grid size={{ xs: 12, md: 4 }} sx={{ display: 'flex' }}>
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
              <Grid size={{ xs: 12, md: 4 }} sx={{ display: 'flex' }}>
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
              <Grid size={{ xs: 12, md: 4 }} sx={{ display: 'flex' }}>
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
              <Grid size={{ xs: 12, md: 4 }} sx={{ display: 'flex' }}>
                <Paper
                  variant="outlined"
                  data-testid="balance-sheet-total-assets"
                  sx={{
                    p: 2,
                    height: '100%',
                    flex: 1,
                    backgroundColor: alpha(theme.palette.primary.main, 0.2),
                    borderColor: 'primary.main',
                  }}
                >
                  <Typography
                    variant="body2"
                    sx={{
                      color: "text.secondary",
                      mb: 0.5
                    }}>
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
              <Grid size={{ xs: 12, md: 4 }} sx={{ display: 'flex' }}>
                <Paper
                  variant="outlined"
                  data-testid="balance-sheet-total-liabilities-equity"
                  sx={{
                    p: 2,
                    height: '100%',
                    flex: 1,
                    backgroundColor: alpha(theme.palette.success.main, 0.2),
                    borderColor: 'success.main',
                  }}
                >
                  <Typography
                    variant="body2"
                    sx={{
                      color: "text.secondary",
                      mb: 0.5
                    }}>
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
              <Grid size={{ xs: 12, md: 4 }} sx={{ display: 'flex' }}>
                <Paper
                  variant="outlined"
                  data-testid="balance-sheet-balance-check"
                  sx={{
                    p: 2,
                    height: '100%',
                    flex: 1,
                    backgroundColor: isBalanced
                      ? alpha(theme.palette.success.main, 0.2)
                      : alpha(theme.palette.error.main, 0.2),
                    borderColor: isBalanced ? 'success.main' : 'error.main',
                  }}
                >
                  <Typography
                    variant="body2"
                    sx={{
                      color: "text.secondary",
                      mb: 0.5
                    }}>
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
            <Typography variant="body2" sx={{
              color: "text.secondary"
            }}>
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
          <Typography variant="body1" sx={{
            color: "text.secondary"
          }}>
            Click "Generate Report" to view the Balance Sheet
          </Typography>
        </Paper>
      )}
    </>
  );
};

export default BalanceSheetPage;
