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
  Divider,
  Chip,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import { default as TrendingUpIcon } from '@mui/icons-material/TrendingUp'
import { default as TrendingDownIcon } from '@mui/icons-material/TrendingDown';
import PageHeader from '@/components/common/PageHeader';
import { formatDate } from '@/utils/formatters';
import { useGetProfitAndLossQuery } from '@/store/api/accountingApi';
import { exportReportExcel } from '@/utils/exportReport';
import { getErrorMessage } from '@/utils/errorMessage';

// Format currency helper
const formatCurrency = (amount: number): string => {
  const absAmount = Math.abs(amount);
  const formatted = absAmount.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  // Use parentheses for negative amounts
  return amount < 0 ? `(${formatted})` : formatted;
};

// Format date to YYYY-MM-DD
const formatDateForInput = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// Get first day of current month
const getFirstDayOfMonth = (): string => {
  const date = new Date();
  date.setDate(1);
  return formatDateForInput(date);
};

// Section component for Revenue, COGS, and Expenses
interface SectionProps {
  title: string;
  accounts: Array<{
    id: string;
    code: string;
    name: string;
    amount: number;
  }>;
  subtotal: number;
  color?: 'primary' | 'warning' | 'error';
}

export const ProfitAndLossSection: React.FC<SectionProps> = ({ title, accounts, subtotal, color = 'primary' }) => {
  return (
    <Box sx={{ mb: 3 }}>
      {/* Section Title */}
      <Box sx={{ mb: 2, backgroundColor: `${color}.main`, p: 1.5, borderRadius: 1 }}>
        <Typography variant="h6" sx={{ fontWeight: 700, color: `${color}.contrastText` }}>
          {title}
        </Typography>
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
                Amount
              </TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {accounts.length > 0 ? (
              <>
                {accounts.map((account) => (
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
                          fontWeight: account.amount !== 0 ? 600 : 400,
                          color: account.amount !== 0 ? 'text.primary' : 'text.secondary',
                        }}
                      >
                        {account.amount !== 0 ? formatCurrency(account.amount) : '-'}
                      </Typography>
                    </TableCell>
                  </TableRow>
                ))}

                {/* Subtotal Row */}
                <TableRow
                  sx={{
                    backgroundColor: (theme) =>
                      alpha(theme.palette[color].main, 0.24),
                    '& td': {
                      borderTop: 2,
                      borderColor: `${color}.main`,
                    },
                  }}
                >
                  <TableCell colSpan={2}>
                    <Typography variant="body1" sx={{ fontWeight: 700, color: `${color}.main` }}>
                      Total {title}
                    </Typography>
                  </TableCell>
                  <TableCell align="right">
                    <Typography
                      variant="body1"
                      sx={{ fontWeight: 700, color: `${color}.main` }}
                    >
                      {formatCurrency(subtotal)}
                    </Typography>
                  </TableCell>
                </TableRow>
              </>
            ) : (
              <TableRow>
                <TableCell colSpan={3} align="center" sx={{ py: 2 }}>
                  <Typography variant="body2" sx={{
                    color: "text.secondary"
                  }}>
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

const ProfitAndLossPage: React.FC = () => {
  const [startDate, setStartDate] = useState<string>(getFirstDayOfMonth());
  const [endDate, setEndDate] = useState<string>(formatDateForInput(new Date()));
  const [includeInactive, setIncludeInactive] = useState<boolean>(false);
  const [dateError, setDateError] = useState<string>('');
  const [submitted, setSubmitted] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const queryArgs = submitted ? { startDate, endDate, includeInactive } : skipToken;
  const { data, isLoading: loading, error } = useGetProfitAndLossQuery(queryArgs);
  const errorMessage = error ? getErrorMessage(error, 'Failed to load profit and loss report') : null;

  const revenueSection = data?.revenue ?? { accounts: [], subtotal: 0 };
  const cogsSection = data?.cogs ?? { accounts: [], subtotal: 0 };
  const expensesSection = data?.expenses ?? { accounts: [], subtotal: 0 };

  // Validate date range
  const validateDates = (): boolean => {
    if (!startDate || !endDate) {
      setDateError('Both start date and end date are required');
      return false;
    }

    const start = new Date(startDate);
    const end = new Date(endDate);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      setDateError('Invalid date format');
      return false;
    }

    if (start > end) {
      setDateError('Start date must be before or equal to end date');
      return false;
    }

    setDateError('');
    return true;
  };

  // Handle generate report
  const handleGenerateReport = () => {
    if (!validateDates()) {
      return;
    }
    setSubmitted(true);
  };

  const handleExportToExcel = async () => {
    if (!validateDates()) {
      return;
    }
    try {
      setIsDownloading(true);
      await exportReportExcel(
        '/accounting/reports/profit-loss/export',
        { startDate, endDate, includeInactive },
        `profit-loss-${startDate}-to-${endDate}.xlsx`,
      );
    } finally {
      setIsDownloading(false);
    }
  };

  const handleStartDateChange = (value: string) => {
    setStartDate(value);
    setSubmitted(false);
  };

  const handleEndDateChange = (value: string) => {
    setEndDate(value);
    setSubmitted(false);
  };

  const handleIncludeInactiveChange = (value: boolean) => {
    setIncludeInactive(value);
    setSubmitted(false);
  };

  return (
    <>
      <PageHeader
        variant="report"
        title="Profit & Loss Statement"
        subtitle="View your Income Statement showing Revenue - COGS - Expenses = Net Income for a period"
        primaryAction={{ label: loading ? 'Generating...' : 'Generate Report', onClick: handleGenerateReport, disabled: loading }}
        secondaryAction={{ label: isDownloading ? 'Exporting...' : 'Export to Excel', onClick: handleExportToExcel, disabled: !submitted || loading || isDownloading }}
      />
      <Paper sx={{ p: 3, mb: 3 }}>
        <Stack
          data-testid="profit-loss-filters"
          direction="row"
          spacing={2}
          sx={{
            alignItems: "center",
            flexWrap: "wrap"
          }}>
          <TextField
            label="Start Date"
            type="date"
            value={startDate}
            onChange={(e) => handleStartDateChange(e.target.value)}
            size="small"
            slotProps={{ inputLabel: { shrink: true } }}
            sx={{ minWidth: 200 }}
          />
          <TextField
            label="End Date"
            type="date"
            value={endDate}
            onChange={(e) => handleEndDateChange(e.target.value)}
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
      {/* Date Validation Error */}
      {dateError && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setDateError('')}>
          {dateError}
        </Alert>
      )}
      {/* API Error Alert */}
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
      {/* Profit & Loss Report */}
      {!loading && data && (
        <Paper>
          {/* Report Header */}
          <Box sx={{ p: 3, borderBottom: 1, borderColor: 'divider' }}>
            <Typography variant="h6" sx={{ fontWeight: 600, mb: 1 }}>
              Profit & Loss Statement
            </Typography>
            <Typography variant="body2" sx={{
              color: "text.secondary"
            }}>
              For the period from{' '}
              {formatDate(data.startDate || startDate)}{' '}
              to{' '}
              {formatDate(data.endDate || endDate)}
            </Typography>
            {/* Net Income Status Indicator */}
            <Box sx={{ mt: 2 }}>
              {data.netIncome >= 0 ? (
                <Chip
                  icon={<TrendingUpIcon />}
                  label={`Net Profit: ${formatCurrency(data.netIncome)}`}
                  color="success"
                  size="small"
                  sx={{ fontWeight: 600 }}
                />
              ) : (
                <Chip
                  icon={<TrendingDownIcon />}
                  label={`Net Loss: ${formatCurrency(data.netIncome)}`}
                  color="error"
                  size="small"
                  sx={{ fontWeight: 600 }}
                />
              )}
            </Box>
          </Box>

          {/* Report Content */}
          <Box sx={{ p: 3 }}>
            {/* Revenue Section */}
            <ProfitAndLossSection
              title="REVENUE"
              accounts={revenueSection.accounts}
              subtotal={revenueSection.subtotal}
              color="primary"
            />

            {/* Cost of Goods Sold Section */}
            <ProfitAndLossSection
              title="COST OF GOODS SOLD"
              accounts={cogsSection.accounts}
              subtotal={cogsSection.subtotal}
              color="warning"
            />

            {/* Gross Profit Calculation */}
            <Box sx={{ mb: 3 }}>
              <Divider sx={{ mb: 2 }} />
              <Paper
                variant="outlined"
                sx={{
                  p: 2,
                  backgroundColor: (theme) => alpha(theme.palette.info.main, 0.25),
                  borderColor: 'info.main',
                  borderWidth: 2,
                }}
              >
                <Stack
                  direction="row"
                  sx={{
                    justifyContent: "space-between",
                    alignItems: "center"
                  }}>
                  <Typography variant="h6" sx={{ fontWeight: 700, color: 'info.main' }}>
                    Gross Profit (Revenue - COGS)
                  </Typography>
                  <Typography
                    variant="h6"
                    sx={{
                      fontWeight: 700,
                      color: 'info.main',
                    }}
                  >
                    {formatCurrency(data.grossProfit)}
                  </Typography>
                </Stack>
              </Paper>
            </Box>

            {/* Operating Expenses Section */}
            <ProfitAndLossSection
              title="OPERATING EXPENSES"
              accounts={expensesSection.accounts}
              subtotal={expensesSection.subtotal}
              color="error"
            />

            {/* Operating Income Calculation */}
            <Box sx={{ mb: 3 }}>
              <Divider sx={{ mb: 2 }} />
              <Paper
                variant="outlined"
                sx={{
                  p: 2,
                  backgroundColor: (theme) => alpha(theme.palette.success.main, 0.25),
                  borderColor: 'success.main',
                  borderWidth: 2,
                }}
              >
                <Stack
                  direction="row"
                  sx={{
                    justifyContent: "space-between",
                    alignItems: "center"
                  }}>
                  <Typography variant="h6" sx={{ fontWeight: 700, color: 'success.main' }}>
                    Operating Income (Gross Profit - Expenses)
                  </Typography>
                  <Typography
                    variant="h6"
                    sx={{
                      fontWeight: 700,
                      color: 'success.main',
                    }}
                  >
                    {formatCurrency(data.operatingIncome)}
                  </Typography>
                </Stack>
              </Paper>
            </Box>

            {/* Net Income Footer */}
            <Box sx={{ mt: 4 }}>
              <Divider sx={{ mb: 3, borderWidth: 2, borderColor: 'divider' }} />
              <Paper
                variant="outlined"
                sx={{
                  p: 3,
                  backgroundColor: data.netIncome >= 0 ? 'success.main' : 'error.main',
                  borderColor: data.netIncome >= 0 ? 'success.dark' : 'error.dark',
                  borderWidth: 3,
                  color: data.netIncome >= 0 ? 'success.contrastText' : 'error.contrastText',
                }}
              >
                <Stack
                  direction="row"
                  sx={{
                    justifyContent: "space-between",
                    alignItems: "center"
                  }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    {data.netIncome >= 0 ? (
                      <TrendingUpIcon sx={{ fontSize: 40, color: 'inherit' }} />
                    ) : (
                      <TrendingDownIcon sx={{ fontSize: 40, color: 'inherit' }} />
                    )}
                    <Typography
                      variant="h4"
                      sx={{
                        fontWeight: 700,
                        color: 'inherit',
                      }}
                    >
                      NET {data.netIncome >= 0 ? 'INCOME' : 'LOSS'}
                    </Typography>
                  </Box>
                  <Typography
                    variant="h3"
                    sx={{
                      fontWeight: 700,
                      color: 'inherit',
                    }}
                  >
                    {formatCurrency(data.netIncome)}
                  </Typography>
                </Stack>
              </Paper>
            </Box>
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
              backgroundColor: 'grey.50',
            }}
          >
            <Typography variant="body2" sx={{
              color: "text.secondary"
            }}>
              Total Accounts:{' '}
              {data.revenue.accounts.length +
                data.cogs.accounts.length +
                data.expenses.accounts.length}
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              {data.netIncome >= 0 ? (
                <Chip
                  icon={<TrendingUpIcon />}
                  label={`Profitable: ${formatCurrency(data.netIncome)}`}
                  color="success"
                  size="small"
                />
              ) : (
                <Chip
                  icon={<TrendingDownIcon />}
                  label={`Loss: ${formatCurrency(data.netIncome)}`}
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
            Click "Generate Report" to view the Profit & Loss Statement
          </Typography>
        </Paper>
      )}
    </>
  );
};

export default ProfitAndLossPage;
