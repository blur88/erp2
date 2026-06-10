import React, { useMemo } from 'react';
import { AppButton } from '@/components/common/AppButton'
import {
  Box,
  Grid,
  Typography,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Card,
  CardContent,
  CardActionArea,
  Skeleton,
  Alert,
  Stack,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import { default as AccountBalanceIcon } from '@mui/icons-material/AccountBalance'
import { default as ReceiptIcon } from '@mui/icons-material/Receipt'
import { default as PieChartIcon } from '@mui/icons-material/PieChart'
import { default as TrendingUpIcon } from '@mui/icons-material/TrendingUp'
import { default as TrendingDownIcon } from '@mui/icons-material/TrendingDown'
import { default as AddIcon } from '@mui/icons-material/Add'
import { default as AccountBalanceWalletIcon } from '@mui/icons-material/AccountBalanceWallet';
import PageHeader from '@/components/common/PageHeader';
import GenericOverviewPage from '@/components/common/GenericOverviewPage';
import { useNavigate } from 'react-router-dom';
import { StatusChip, EntityTypeChip } from '@/components/common/StatusChip';
import {
  useGetBalanceSheetQuery,
  useGetCurrentFiscalPeriodQuery,
  useGetJournalEntriesQuery,
  useGetPendingSettlementSummaryQuery,
  useGetProfitAndLossQuery,
} from '@/store/api/accountingApi';
import { formatCurrency, formatDate, getCurrentDate } from '@/utils/formatters';
import type { JournalEntry } from '@/types';
import { useKeyboardShortcuts } from '@/hooks/useSearchAndFilter';

// Summary Card Component
interface SummaryCardProps {
  title: string;
  value: string | number;
  subtitle: string;
  icon: React.ReactNode;
  color: 'primary' | 'success' | 'warning' | 'error';
  onClick: () => void;
  loading?: boolean;
}

const SummaryCard: React.FC<SummaryCardProps> = ({
  title,
  value,
  subtitle,
  icon,
  color,
  onClick,
  loading,
}) => {
  const summaryIconTestId = `summary-card-icon-${title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')}`;

  return (
    <Card
      sx={{
        height: '100%',
        transition: 'all 0.3s ease',
        '&:hover': {
          boxShadow: 6,
          transform: 'translateY(-4px)',
        },
      }}
    >
      <CardActionArea onClick={onClick} sx={{ height: '100%', p: 3 }}>
        <Box>
          <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
            <Box
              data-testid={summaryIconTestId}
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 56,
                height: 56,
                borderRadius: 2,
                bgcolor: (theme) => alpha(theme.palette[color].main, 0.16),
                color: (theme) => theme.palette[color].light,
                mr: 2,
              }}
            >
              {icon}
            </Box>
            <Box sx={{ flex: 1 }}>
              <Typography
                variant="body2"
                sx={{
                  color: "text.secondary",
                  mb: 0.5
                }}>
                {title}
              </Typography>
              {loading ? (
                <Skeleton width={120} height={40} />
              ) : (
                <Typography
                  variant="h4"
                  sx={{
                    fontWeight: 700,
                    color: `${color}.main`,
                    lineHeight: 1.2,
                  }}
                >
                  {typeof value === 'number' ? formatCurrency(value) : value}
                </Typography>
              )}
            </Box>
          </Box>
          <Typography variant="caption" sx={{
            color: "text.secondary"
          }}>
            {subtitle}
          </Typography>
        </Box>
      </CardActionArea>
    </Card>
  );
};

// Status chip helper
const getStatusChip = (status: string) => <StatusChip status={status} />;

// Entry type chip helper
const getEntryTypeChip = (type: string) => <EntityTypeChip type={type} />;

const AccountingDashboardPage: React.FC = () => {
  const navigate = useNavigate();

  // Calculate YTD date range
  const today = getCurrentDate();
  const ytdStartDate = useMemo(() => {
    const currentYear = new Date().getFullYear();
    return `${currentYear}-01-01`;
  }, []);
  const {
    data: balanceSheet,
    isLoading: balanceSheetLoading,
    error: balanceSheetError,
    refetch: refetchBalanceSheet,
  } = useGetBalanceSheetQuery({ asOfDate: today, includeInactive: false });
  const {
    data: profitAndLoss,
    isLoading: profitAndLossLoading,
    error: profitAndLossError,
    refetch: refetchProfitAndLoss,
  } = useGetProfitAndLossQuery({ startDate: ytdStartDate, endDate: today, includeInactive: false });
  const {
    data: journalEntriesResponse,
    isLoading: journalEntriesLoading,
    error: journalEntriesError,
    refetch: refetchJournalEntries,
  } = useGetJournalEntriesQuery({ page: 1, limit: 10, sortBy: 'entryDate', sortOrder: 'DESC' });
  const {
    data: currentPeriod,
    isLoading: fiscalPeriodsLoading,
  } = useGetCurrentFiscalPeriodQuery();
  const { data: pendingSummary = [] } = useGetPendingSettlementSummaryQuery();
  const isCurrentPeriodOpen = currentPeriod?.isOpen ?? currentPeriod?.status === 'OPEN';
  const journalEntries = journalEntriesResponse?.data ?? [];

  const totalAssets = balanceSheet?.assets?.total || 0;
  const totalLiabilities = balanceSheet?.liabilities?.total || 0;
  const totalEquity = balanceSheet?.equity?.total || 0;
  const netIncome = profitAndLoss?.netIncome || 0;

  const isLoading =
    balanceSheetLoading || profitAndLossLoading || journalEntriesLoading || fiscalPeriodsLoading;

  const hasError = balanceSheetError || profitAndLossError || journalEntriesError;
  const errorMessage =
    (balanceSheetError as any)?.data ||
    (profitAndLossError as any)?.data ||
    (journalEntriesError as any)?.data ||
    'Failed to load dashboard data';

  // Recent journal entries (limit to 10)
  const recentEntries = useMemo(() => {
    return (journalEntries || []).slice(0, 10);
  }, [journalEntries]);

  // Calculate days remaining in fiscal period
  const daysRemaining = useMemo(() => {
    if (!currentPeriod?.endDate) return null;
    const endDate = new Date(currentPeriod.endDate);
    const now = new Date();
    const diffTime = endDate.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays > 0 ? diffDays : 0;
  }, [currentPeriod]);

  useKeyboardShortcuts({
    onAdd: () => navigate('/accounting/journal-entries/new'),
    onRefresh: () => {
      refetchBalanceSheet();
      refetchProfitAndLoss();
      refetchJournalEntries();
    },
  });

  return (
    <GenericOverviewPage>
      <PageHeader
        variant="overview"
        title="Accounting Dashboard"
        subtitle="Overview of your financial position and accounting activity"
        titleBadge={
          currentPeriod ? (
            <StatusChip status={isCurrentPeriodOpen ? 'open' : 'closed'} label={`${currentPeriod.name} ${isCurrentPeriodOpen ? 'Open' : 'Closed'}`} />
          ) : undefined
        }
      />
      {/* Error Alert */}
      {hasError && (
        <Alert severity="error" sx={{ mb: 4 }}>
          {errorMessage}
        </Alert>
      )}
      {/* Section 1: Financial Summary Cards */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
          <SummaryCard
            title="Total Assets"
            value={totalAssets}
            subtitle={`As of: ${formatDate(today)}`}
            icon={<AccountBalanceIcon sx={{ fontSize: 32 }} />}
            color="primary"
            onClick={() => navigate('/accounting/reports/balance-sheet')}
            loading={balanceSheetLoading}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
          <SummaryCard
            title="Total Liabilities"
            value={totalLiabilities}
            subtitle={`As of: ${formatDate(today)}`}
            icon={<ReceiptIcon sx={{ fontSize: 32 }} />}
            color="warning"
            onClick={() => navigate('/accounting/reports/balance-sheet')}
            loading={balanceSheetLoading}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
          <SummaryCard
            title="Total Equity"
            value={totalEquity}
            subtitle={`As of: ${formatDate(today)}`}
            icon={<AccountBalanceWalletIcon sx={{ fontSize: 32 }} />}
            color="success"
            onClick={() => navigate('/accounting/reports/balance-sheet')}
            loading={balanceSheetLoading}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
          <SummaryCard
            title="YTD Net Income"
            value={netIncome}
            subtitle={`YTD: Jan 1 - ${formatDate(today)}`}
            icon={
              netIncome >= 0 ? (
                <TrendingUpIcon sx={{ fontSize: 32 }} />
              ) : (
                <TrendingDownIcon sx={{ fontSize: 32 }} />
              )
            }
            color={netIncome >= 0 ? 'success' : 'error'}
            onClick={() => navigate('/accounting/reports/profit-loss')}
            loading={profitAndLossLoading}
          />
        </Grid>
      </Grid>
      {pendingSummary.length > 0 && (
        <Box sx={{ mt: 1, mb: 4 }}>
          <Typography variant="h6" sx={{ mb: 2 }}>
            Pending Settlements
          </Typography>
          <Grid container spacing={2}>
            {pendingSummary.map((item: any) => (
              <Grid size={{ xs: 12, sm: 6, md: 4 }} key={item.paymentMethodId}>
                <Card>
                  <CardContent>
                    <Typography variant="subtitle2" sx={{
                      color: "text.secondary"
                    }}>
                      {item.paymentMethodName}
                    </Typography>
                    <Typography variant="h5" sx={{ fontWeight: 700 }}>
                      {formatCurrency(item.pendingAmount)}
                    </Typography>
                    <Typography variant="caption" sx={{
                      color: "text.secondary"
                    }}>
                      {item.pendingCount} payment{item.pendingCount !== 1 ? 's' : ''} pending
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>
        </Box>
      )}
      {/* Section 2: Quick Actions */}
      <Paper sx={{ p: 3, mb: 4 }}>
        <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>
          Quick Actions
        </Typography>
        <Grid container spacing={2}>
          <Grid size={{ xs: 12, sm: 6, md: 4 }}>
            <AppButton
              variant="primary"
              fullWidth
              startIcon={<AddIcon />}
              onClick={() => navigate('/accounting/journal-entries/new')}
              sx={{ py: 1.5 }}
            >
              New Journal Entry
            </AppButton>
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 4 }}>
            <AppButton
              variant="outlined"
              fullWidth
              onClick={() => navigate('/accounting/reports/trial-balance')}
              sx={{ py: 1.5 }}
            >
              View Trial Balance
            </AppButton>
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 4 }}>
            <AppButton
              variant="outlined"
              fullWidth
              onClick={() => navigate('/accounting/reports/balance-sheet')}
              sx={{ py: 1.5 }}
            >
              View Balance Sheet
            </AppButton>
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 4 }}>
            <AppButton
              variant="outlined"
              fullWidth
              onClick={() => navigate('/accounting/reports/profit-loss')}
              sx={{ py: 1.5 }}
            >
              View Profit & Loss
            </AppButton>
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 4 }}>
            <AppButton
              variant="outlined"
              fullWidth
              onClick={() => navigate('/accounting/chart-of-accounts')}
              sx={{ py: 1.5 }}
            >
              View Chart of Accounts
            </AppButton>
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 4 }}>
            <AppButton
              variant="outlined"
              fullWidth
              onClick={() => navigate('/accounting/fiscal-periods')}
              sx={{ py: 1.5 }}
            >
              Manage Fiscal Periods
            </AppButton>
          </Grid>
        </Grid>
      </Paper>
      <Grid container spacing={3}>
        {/* Section 3: Recent Journal Entries */}
        <Grid size={{ xs: 12, lg: 8 }}>
          <Paper sx={{ p: 3 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
              <Box>
                <Typography variant="h6" sx={{ fontWeight: 600 }}>
                  Recent Journal Entries
                </Typography>
                <Typography variant="caption" sx={{
                  color: "text.secondary"
                }}>
                  Last 10 entries
                </Typography>
              </Box>
              <AppButton
                variant="outlined"
                size="small"
                onClick={() => navigate('/accounting/journal-entries')}
              >
                View All
              </AppButton>
            </Box>

            {journalEntriesLoading ? (
              <Box>
                {[1, 2, 3, 4, 5].map((i) => (
                  <Skeleton key={i} height={50} sx={{ mb: 1 }} />
                ))}
              </Box>
            ) : recentEntries.length === 0 ? (
              <Box sx={{ textAlign: 'center', py: 4 }}>
                <Typography variant="body2" sx={{
                  color: "text.secondary"
                }}>
                  No journal entries found
                </Typography>
              </Box>
            ) : (
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Date</TableCell>
                      <TableCell>Entry #</TableCell>
                      <TableCell>Type</TableCell>
                      <TableCell>Status</TableCell>
                      <TableCell>Description</TableCell>
                      <TableCell align="right">Amount</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {recentEntries.map((entry: JournalEntry) => {
                      const totalAmount = entry.lines?.reduce(
                        (sum, item) => sum + (item.debitAmount || 0),
                        0
                      ) || 0;

                      return (
                        <TableRow
                          key={entry.id}
                          hover
                          sx={{ cursor: 'pointer' }}
                          onClick={() => navigate(`/accounting/journal-entries/${entry.id}`)}
                        >
                          <TableCell>{formatDate(entry.entryDate)}</TableCell>
                          <TableCell>
                            <Typography variant="body2">
                              {entry.referenceNumber}
                            </Typography>
                          </TableCell>
                          <TableCell>{getEntryTypeChip(entry.sourceType || 'manual')}</TableCell>
                          <TableCell>{getStatusChip(entry.status)}</TableCell>
                          <TableCell>
                            <Typography
                              variant="body2"
                              sx={{
                                maxWidth: 250,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {entry.description || '-'}
                            </Typography>
                          </TableCell>
                          <TableCell align="right">
                            <Typography variant="body2">
                              {formatCurrency(totalAmount)}
                            </Typography>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </Paper>
        </Grid>

        {/* Section 4: Current Fiscal Period Status */}
        <Grid size={{ xs: 12, lg: 4 }}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>
              Current Fiscal Period
            </Typography>

            {fiscalPeriodsLoading ? (
              <Box>
                <Skeleton height={40} sx={{ mb: 1 }} />
                <Skeleton height={30} sx={{ mb: 1 }} />
                <Skeleton height={30} sx={{ mb: 1 }} />
              </Box>
            ) : !currentPeriod ? (
              <Box sx={{ textAlign: 'center', py: 2 }}>
                <Typography
                  variant="body2"
                  sx={{
                    color: "text.secondary",
                    mb: 2
                  }}>
                  No active fiscal period
                </Typography>
                <AppButton
                  variant="outlined"
                  size="small"
                  onClick={() => navigate('/accounting/fiscal-periods')}
                >
                  Create Period
                </AppButton>
              </Box>
            ) : (
              <Box>
                <Typography variant="h5" sx={{ fontWeight: 700, mb: 1 }}>
                  {currentPeriod.name}
                </Typography>
                <Box sx={{ mb: 2 }}>
                  <StatusChip status={isCurrentPeriodOpen ? 'open' : 'closed'} />
                </Box>
                <Stack spacing={1.5} sx={{ mb: 2 }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Typography variant="body2" sx={{
                      color: "text.secondary"
                    }}>
                      Start Date:
                    </Typography>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      {formatDate(currentPeriod.startDate)}
                    </Typography>
                  </Box>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Typography variant="body2" sx={{
                      color: "text.secondary"
                    }}>
                      End Date:
                    </Typography>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      {formatDate(currentPeriod.endDate)}
                    </Typography>
                  </Box>
                  {isCurrentPeriodOpen && daysRemaining !== null && (
                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                      <Typography variant="body2" sx={{
                        color: "text.secondary"
                      }}>
                        Days Remaining:
                      </Typography>
                      <Typography
                        variant="body2"
                        sx={{
                          fontWeight: 700,
                          color: daysRemaining < 7 ? 'error.main' : 'success.main',
                        }}
                      >
                        {daysRemaining} days
                      </Typography>
                    </Box>
                  )}
                </Stack>
                <AppButton
                  variant="outlined"
                  fullWidth
                  size="small"
                  onClick={() => navigate('/accounting/fiscal-periods')}
                >
                  Manage Periods
                </AppButton>
              </Box>
            )}
          </Paper>
        </Grid>
      </Grid>
    </GenericOverviewPage>
  );
};

export default AccountingDashboardPage;
