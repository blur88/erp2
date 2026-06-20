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
  Alert,
  CircularProgress,
  Stack,
  Chip,
  Divider,
  Autocomplete,
  Card,
  CardContent,
  Grid,
} from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';
import { default as ReceiptIcon } from '@mui/icons-material/Receipt';
import PageHeader from '@/components/common/PageHeader';
import { formatDate, formatDateTime } from '@/utils/formatters';
import { useGetChartOfAccountsQuery, useGetGeneralLedgerQuery } from '@/store/api/accountingApi';
import type { ChartOfAccount } from '@/types';
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

// Format date for display (e.g., "Jan 15, 2026")
const formatDateForDisplay = (dateString: string): string => {
  return formatDate(dateString);
};

// Get first day of current month
const getFirstDayOfMonth = (): string => {
  const date = new Date();
  date.setDate(1);
  return formatDateForInput(date);
};

// Account type colors
const getAccountTypeColor = (type: string): 'primary' | 'success' | 'warning' | 'error' | 'info' => {
  const typeUpper = type.toUpperCase();
  if (typeUpper === 'ASSET') return 'primary';
  if (typeUpper === 'LIABILITY') return 'warning';
  if (typeUpper === 'EQUITY') return 'success';
  if (typeUpper === 'REVENUE') return 'info';
  if (typeUpper === 'EXPENSE') return 'error';
  return 'primary';
};

export const getGeneralLedgerTone = () => ({
  surfaceSoft: 'rgba(255, 255, 255, 0.06)',
  surfaceStrong: 'rgba(255, 255, 255, 0.1)',
  tableHeader: 'rgba(255, 255, 255, 0.08)',
});

export const getLedgerMetricCardSx = () => ({
  height: '100%',
  minHeight: 88,
  display: 'flex',
  '& .MuiCardContent-root': {
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
    gap: 4,
    height: '100%',
    padding: 1.5,
    '&:last-child': {
      paddingBottom: 1.5,
    },
  },
});

const GeneralLedgerPage: React.FC = () => {
  const theme = useTheme();
  const tone = getGeneralLedgerTone();
  const [selectedAccount, setSelectedAccount] = useState<ChartOfAccount | null>(null);
  const [startDate, setStartDate] = useState<string>(getFirstDayOfMonth());
  const [endDate, setEndDate] = useState<string>(formatDateForInput(new Date()));
  const [validationError, setValidationError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const { data: accountsResponse } = useGetChartOfAccountsQuery({ isActive: true });
  const accounts = accountsResponse?.data ?? [];
  const queryArgs = submitted && selectedAccount
    ? { accountId: selectedAccount.id, startDate, endDate }
    : skipToken;
  const { data, isLoading: loading, error } = useGetGeneralLedgerQuery(queryArgs);
  const errorMessage = error ? getErrorMessage(error, 'Failed to load general ledger') : null;

  // Handle generate report
  const handleGenerateReport = () => {
    // Validate account selection
    if (!selectedAccount) {
      setValidationError('Please select an account to generate the report');
      return;
    }

    // Clear validation error
    setValidationError(null);

    setSubmitted(true);
  };

  const handleExportToExcel = async () => {
    if (!selectedAccount) {
      setValidationError('Please select an account to export the report');
      return;
    }
    try {
      setIsDownloading(true);
      await exportReportExcel(
        '/accounting/reports/general-ledger/export',
        { accountId: selectedAccount.id, startDate, endDate },
        `general-ledger-${selectedAccount.code}-${startDate}-to-${endDate}.xlsx`,
      );
    } finally {
      setIsDownloading(false);
    }
  };

  // Get color for running balance
  const getBalanceColor = (balance: number): string => {
    if (balance === 0) return 'text.secondary';
    if (balance < 0) return 'error.main';
    return 'text.primary';
  };

  return (
    <>
      <PageHeader
        variant="report"
        title="General Ledger"
        subtitle="View all transactions for a specific account with running balance"
        primaryAction={{ label: loading ? 'Generating...' : 'Generate Report', onClick: handleGenerateReport, disabled: loading }}
        secondaryAction={{ label: isDownloading ? 'Exporting...' : 'Export to Excel', onClick: handleExportToExcel, disabled: !submitted || loading || isDownloading }}
      />
      <Paper sx={{ p: 3, mb: 3 }}>
        <Stack
          data-testid="general-ledger-filters"
          direction="row"
          spacing={2}
          sx={{
            alignItems: "flex-start",
            flexWrap: "wrap"
          }}>
          {/* Account Selector */}
          <Autocomplete
            options={accounts}
            getOptionLabel={(option) => `${option.code} - ${option.name}`}
            value={selectedAccount}
            onChange={(event, newValue) => {
              setSelectedAccount(newValue);
              setValidationError(null);
              setSubmitted(false);
            }}
            renderInput={(params) => (
              <TextField
                {...params}
                label="Account"
                placeholder="Select an account"
                required
                error={!!validationError}
                helperText={validationError}
              />
            )}
            sx={{ minWidth: 350, flexGrow: 1 }}
            size="small"
          />

          {/* Start Date */}
          <TextField
            label="Start Date"
            type="date"
            value={startDate}
            onChange={(e) => {
              setStartDate(e.target.value);
              setSubmitted(false);
            }}
            size="small"
            slotProps={{ inputLabel: { shrink: true } }}
            sx={{ minWidth: 180 }}
          />

          {/* End Date */}
          <TextField
            label="End Date"
            type="date"
            value={endDate}
            onChange={(e) => {
              setEndDate(e.target.value);
              setSubmitted(false);
            }}
            size="small"
            slotProps={{ inputLabel: { shrink: true } }}
            sx={{ minWidth: 180 }}
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
      {/* General Ledger Report */}
      {!loading && data && (
        <Paper>
          {/* Account Header Card */}
          <Box sx={{ p: 3, borderBottom: 1, borderColor: 'divider', backgroundColor: tone.surfaceSoft }}>
            <Grid container spacing={2}>
              <Grid size={{ xs: 12, md: 3 }}>
                <Card variant="outlined" sx={getLedgerMetricCardSx()}>
                  <CardContent>
                    <Typography variant="body2" gutterBottom sx={{
                      color: "text.secondary"
                    }}>
                      Account Code
                    </Typography>
                    <Typography
                      variant="h5"
                      sx={{ fontWeight: 700 }}
                    >
                      {data.account.code}
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
              <Grid size={{ xs: 12, md: 5 }}>
                <Card variant="outlined" sx={getLedgerMetricCardSx()}>
                  <CardContent>
                    <Typography variant="body2" gutterBottom sx={{
                      color: "text.secondary"
                    }}>
                      Account Name
                    </Typography>
                    <Typography variant="h6" sx={{ fontWeight: 600 }}>
                      {data.account.name}
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
              <Grid size={{ xs: 12, md: 2 }}>
                <Card variant="outlined" sx={getLedgerMetricCardSx()}>
                  <CardContent>
                    <Typography variant="body2" gutterBottom sx={{
                      color: "text.secondary"
                    }}>
                      Account Type
                    </Typography>
                    <Chip
                      label={data.account.type.toUpperCase()}
                      color={getAccountTypeColor(data.account.type)}
                      size="small"
                      sx={{ fontWeight: 600, mt: 0.5 }}
                    />
                  </CardContent>
                </Card>
              </Grid>
              <Grid size={{ xs: 12, md: 2 }}>
                <Card
                  variant="outlined"
                  sx={{
                    ...getLedgerMetricCardSx(),
                    backgroundColor: alpha(theme.palette.primary.main, 0.2),
                  }}
                >
                  <CardContent>
                    <Typography variant="body2" gutterBottom sx={{
                      color: "text.secondary"
                    }}>
                      Opening Balance
                    </Typography>
                    <Typography
                      variant="h6"
                      sx={{
                                                fontWeight: 700,
                        color: getBalanceColor(data.openingBalance),
                      }}
                    >
                      {formatCurrency(data.openingBalance)}
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
            </Grid>

            {/* Report Period */}
            <Box sx={{ mt: 2 }}>
              <Typography variant="body2" sx={{
                color: "text.secondary"
              }}>
                Period: {formatDateForDisplay(data.startDate)} to {formatDateForDisplay(data.endDate)}
              </Typography>
            </Box>
          </Box>

          {/* Transaction Table */}
          <Box sx={{ p: 3 }}>
            {data.transactions.length > 0 ? (
              <TableContainer sx={{ maxHeight: 600 }}>
                <Table stickyHeader size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell
                        sx={{
                          fontWeight: 600,
                          backgroundColor: tone.tableHeader,
                          width: '12%',
                        }}
                      >
                        Date
                      </TableCell>
                      <TableCell
                        sx={{
                          fontWeight: 600,
                          backgroundColor: tone.tableHeader,
                          width: '12%',
                        }}
                      >
                        Entry Number
                      </TableCell>
                      <TableCell
                        sx={{
                          fontWeight: 600,
                          backgroundColor: tone.tableHeader,
                          width: '36%',
                        }}
                      >
                        Description
                      </TableCell>
                      <TableCell
                        align="right"
                        sx={{
                          fontWeight: 600,
                          backgroundColor: tone.tableHeader,
                          width: '13%',
                        }}
                      >
                        Debit
                      </TableCell>
                      <TableCell
                        align="right"
                        sx={{
                          fontWeight: 600,
                          backgroundColor: tone.tableHeader,
                          width: '13%',
                        }}
                      >
                        Credit
                      </TableCell>
                      <TableCell
                        align="right"
                        sx={{
                          fontWeight: 600,
                          backgroundColor: tone.tableHeader,
                          width: '14%',
                        }}
                      >
                        Running Balance
                      </TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {data.transactions.map((transaction, index) => (
                      <TableRow
                        key={`${transaction.entryNumber}-${index}`}
                        hover
                        sx={{
                          '&:nth-of-type(odd)': {
                            backgroundColor: tone.surfaceSoft,
                          },
                        }}
                      >
                        <TableCell>
                          <Typography variant="body2">
                            {formatDateForDisplay(transaction.date)}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Typography
                            variant="body2"
                            sx={{
                                                            cursor: 'pointer',
                              textDecoration: 'none',
                              '&:hover': {
                                textDecoration: 'underline',
                                color: 'primary.main',
                              },
                            }}
                          >
                            {transaction.entryNumber}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2">
                            {transaction.description}
                          </Typography>
                        </TableCell>
                        <TableCell align="right">
                          <Typography
                            variant="body2"
                            sx={{
                                                            fontWeight: transaction.debitAmount !== 0 ? 600 : 400,
                              color:
                                transaction.debitAmount !== 0
                                  ? 'text.primary'
                                  : 'text.secondary',
                            }}
                          >
                            {transaction.debitAmount !== 0
                              ? formatCurrency(transaction.debitAmount)
                              : '-'}
                          </Typography>
                        </TableCell>
                        <TableCell align="right">
                          <Typography
                            variant="body2"
                            sx={{
                                                            fontWeight: transaction.creditAmount !== 0 ? 600 : 400,
                              color:
                                transaction.creditAmount !== 0
                                  ? 'text.primary'
                                  : 'text.secondary',
                            }}
                          >
                            {transaction.creditAmount !== 0
                              ? formatCurrency(transaction.creditAmount)
                              : '-'}
                          </Typography>
                        </TableCell>
                        <TableCell align="right">
                          <Typography
                            variant="body2"
                            sx={{
                                                            fontWeight: 700,
                              color: getBalanceColor(transaction.runningBalance),
                            }}
                          >
                            {formatCurrency(transaction.runningBalance)}
                          </Typography>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            ) : (
              <Box sx={{ py: 6, textAlign: 'center' }}>
                <ReceiptIcon sx={{ fontSize: 64, color: 'text.secondary', mb: 2 }} />
                <Typography variant="h6" sx={{
                  color: "text.secondary"
                }}>
                  No transactions found for the selected period
                </Typography>
                <Typography
                  variant="body2"
                  sx={{
                    color: "text.secondary",
                    mt: 1
                  }}>
                  Try selecting a different date range
                </Typography>
              </Box>
            )}
          </Box>

          {/* Summary Footer Card */}
          {data.transactions.length > 0 && (
            <Box
              sx={{
                p: 3,
                borderTop: 2,
                borderColor: 'divider',
                backgroundColor: tone.surfaceSoft,
              }}
            >
              <Grid container spacing={2}>
                <Grid size={{ xs: 12, md: 3 }}>
                  <Card variant="outlined" sx={getLedgerMetricCardSx()}>
                    <CardContent>
                      <Typography variant="body2" gutterBottom sx={{
                        color: "text.secondary"
                      }}>
                        Opening Balance
                      </Typography>
                      <Typography
                        variant="h6"
                        sx={{
                                                    fontWeight: 700,
                          color: getBalanceColor(data.openingBalance),
                        }}
                      >
                        {formatCurrency(data.openingBalance)}
                      </Typography>
                    </CardContent>
                  </Card>
                </Grid>
                <Grid size={{ xs: 12, md: 3 }}>
                  <Card variant="outlined" sx={getLedgerMetricCardSx()}>
                    <CardContent>
                      <Typography variant="body2" gutterBottom sx={{
                        color: "text.secondary"
                      }}>
                        Total Debits
                      </Typography>
                      <Typography
                        variant="h6"
                        sx={{
                                                    fontWeight: 700,
                          color: 'text.primary',
                        }}
                      >
                        {formatCurrency(data.totalDebits)}
                      </Typography>
                    </CardContent>
                  </Card>
                </Grid>
                <Grid size={{ xs: 12, md: 3 }}>
                  <Card variant="outlined" sx={getLedgerMetricCardSx()}>
                    <CardContent>
                      <Typography variant="body2" gutterBottom sx={{
                        color: "text.secondary"
                      }}>
                        Total Credits
                      </Typography>
                      <Typography
                        variant="h6"
                        sx={{
                                                    fontWeight: 700,
                          color: 'text.primary',
                        }}
                      >
                        {formatCurrency(data.totalCredits)}
                      </Typography>
                    </CardContent>
                  </Card>
                </Grid>
                <Grid size={{ xs: 12, md: 3 }}>
                  <Card
                    variant="outlined"
                    sx={{
                      ...getLedgerMetricCardSx(),
                      backgroundColor: alpha(theme.palette.primary.main, 0.2),
                      borderColor: 'primary.main',
                      borderWidth: 2,
                    }}
                  >
                    <CardContent>
                      <Typography variant="body2" gutterBottom sx={{
                        color: "text.secondary"
                      }}>
                        Closing Balance
                      </Typography>
                      <Typography
                        variant="h5"
                        sx={{
                                                    fontWeight: 700,
                          color: getBalanceColor(data.closingBalance),
                        }}
                      >
                        {formatCurrency(data.closingBalance)}
                      </Typography>
                    </CardContent>
                  </Card>
                </Grid>
              </Grid>
            </Box>
          )}

          {/* Report Footer Info */}
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
              Total Transactions: {data.transactions.length}
            </Typography>
            <Typography variant="body2" sx={{
              color: "text.secondary"
            }}>
              Generated on: {formatDateTime(new Date())}
            </Typography>
          </Box>
        </Paper>
      )}
      {/* Empty State - No Account Selected */}
      {!loading && !data && !error && (
        <Paper sx={{ p: 6, textAlign: 'center' }}>
          <ReceiptIcon sx={{ fontSize: 80, color: 'text.secondary', mb: 2 }} />
          <Typography variant="h6" gutterBottom sx={{
            color: "text.secondary"
          }}>
            Please select an account
          </Typography>
          <Typography variant="body2" sx={{
            color: "text.secondary"
          }}>
            Choose an account from the dropdown above to view its general ledger
          </Typography>
        </Paper>
      )}
    </>
  );
};

export default GeneralLedgerPage;
