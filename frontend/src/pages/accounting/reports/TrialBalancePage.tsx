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
} from '@mui/material';
import {
  Download as DownloadIcon,
  CheckCircle as CheckCircleIcon,
  Cancel as CancelIcon,
} from '@mui/icons-material';
import PageHeader from '@/components/common/PageHeader';
import { formatDate } from '@/utils/formatters';
import { useGetTrialBalanceQuery } from '@/store/api/accountingApi';
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

const TrialBalancePage: React.FC = () => {
  const [asOfDate, setAsOfDate] = useState<string>(formatDateForInput(new Date()));
  const [includeInactive, setIncludeInactive] = useState<boolean>(false);
  const [submitted, setSubmitted] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const queryArgs = submitted ? { asOfDate, includeInactive } : skipToken;
  const { data, isLoading: loading, error } = useGetTrialBalanceQuery(queryArgs);
  const errorMessage = error ? getErrorMessage(error, 'Failed to load trial balance') : null;

  const handleGenerateReport = () => {
    setSubmitted(true);
  };

  const handleExportToExcel = async () => {
    try {
      setIsDownloading(true);
      await exportReportExcel(
        '/accounting/reports/trial-balance/export',
        {
          asOfDate,
          includeInactive,
        },
        `trial-balance-${asOfDate}.xlsx`,
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

  const calculateTotals = () => {
    if (!data?.accounts || data.accounts.length === 0) {
      return { totalDebit: 0, totalCredit: 0 };
    }

    const totalDebit = data.accounts.reduce(
      (sum, account) => sum + (account.debit || 0),
      0
    );
    const totalCredit = data.accounts.reduce(
      (sum, account) => sum + (account.credit || 0),
      0
    );

    return { totalDebit, totalCredit };
  };

  const { totalDebit, totalCredit } = data
    ? { totalDebit: data.totalDebit, totalCredit: data.totalCredit }
    : calculateTotals();

  return (
    <Box sx={{ p: 3 }}>
      <PageHeader
        variant="report"
        title="Trial Balance"
        subtitle="View account balances and verify debits equal credits as of a specific date"
        toolbar={
          <Paper sx={{ p: 3, mb: 3 }}>
            <Stack
              direction={{ xs: 'column', md: 'row' }}
              spacing={2}
              justifyContent="space-between"
              alignItems={{ xs: 'stretch', md: 'center' }}
            >
              <Stack
                data-testid="trial-balance-filters"
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
                data-testid="trial-balance-actions"
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
        }
      />

      {errorMessage && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {errorMessage}
        </Alert>
      )}

      {loading && submitted && !data && (
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', py: 8 }}>
          <CircularProgress />
        </Box>
      )}

      {!loading && data && (
        <Paper>
          {/* Report Header */}
          <Box sx={{ p: 3, borderBottom: 1, borderColor: 'divider' }}>
            <Typography variant="h6" sx={{ fontWeight: 600, mb: 1 }}>
              Trial Balance Report
            </Typography>
            <Typography variant="body2" color="text.secondary">
              As of: {asOfDate ? formatDate(asOfDate) : 'N/A'}
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
                  <TableCell sx={{ fontWeight: 600, width: '15%' }}>Account Code</TableCell>
                  <TableCell sx={{ fontWeight: 600, width: '35%' }}>Account Name</TableCell>
                  <TableCell sx={{ fontWeight: 600, width: '20%' }}>Account Type</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 600, width: '15%' }}>
                    Debit
                  </TableCell>
                  <TableCell align="right" sx={{ fontWeight: 600, width: '15%' }}>
                    Credit
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {data.accounts && data.accounts.length > 0 ? (
                  <>
                    {data.accounts.map((account, index) => (
                      <TableRow key={`${account.accountCode}-${index}`} hover>
                        <TableCell>{account.accountCode}</TableCell>
                        <TableCell>{account.accountName}</TableCell>
                        <TableCell>{account.accountType}</TableCell>
                        <TableCell align="right">
                          {account.debit !== 0 ? formatCurrency(account.debit) : '-'}
                        </TableCell>
                        <TableCell align="right">
                          {account.credit !== 0 ? formatCurrency(account.credit) : '-'}
                        </TableCell>
                      </TableRow>
                    ))}
                    <TableRow
                      sx={{
                        backgroundColor: (theme) => theme.palette.action.hover,
                        '& td': { fontWeight: 700, borderTop: 2, borderColor: 'divider' },
                      }}
                    >
                      <TableCell colSpan={3}>Total</TableCell>
                      <TableCell align="right">{formatCurrency(totalDebit)}</TableCell>
                      <TableCell align="right">{formatCurrency(totalCredit)}</TableCell>
                    </TableRow>
                  </>
                ) : (
                  <TableRow>
                    <TableCell colSpan={5} align="center" sx={{ py: 4 }}>
                      No trial balance data found
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      )}
    </Box>
  );
};

export default TrialBalancePage;
