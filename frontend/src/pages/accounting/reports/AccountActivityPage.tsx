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
  Autocomplete,
  Card,
  CardContent,
  Grid,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Link as MuiLink,
} from '@mui/material';
import { default as ReceiptIcon } from '@mui/icons-material/Receipt';
import PageHeader from '@/components/common/PageHeader';
import { StatusChip } from '@/components/common/StatusChip';
import { useNavigate } from 'react-router-dom';
import { formatDate, formatDateTime } from '@/utils/formatters';
import { useGetAccountActivityQuery, useGetChartOfAccountsQuery } from '@/store/api/accountingApi';
import type { ChartOfAccount } from '@/types';
import { JournalEntryStatus } from '@/types';
import { exportReportExcel } from '@/utils/exportReport';
import { getErrorMessage } from '@/utils/errorMessage';

// Format currency helper
const formatCurrency = (amount: number): string => {
  const absAmount = Math.abs(amount);
  const formatted = absAmount.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  // Use parentheses for negative amounts (credits)
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

// Entry type chip colors
const getEntryTypeColor = (entryType: string): 'default' | 'primary' | 'warning' | 'success' | 'secondary' | 'info' | 'error' => {
  const typeUpper = entryType.toUpperCase();
  if (typeUpper === 'MANUAL') return 'default';
  if (typeUpper === 'SALES') return 'primary';
  if (typeUpper === 'PURCHASE') return 'warning';
  if (typeUpper === 'PAYMENT') return 'success';
  if (typeUpper === 'ADJUSTMENT') return 'secondary';
  if (typeUpper === 'OPENING') return 'info';
  if (typeUpper === 'CLOSING') return 'error';
  return 'default';
};

// Get reference link based on reference type
const getReferenceLink = (referenceType?: string, referenceId?: string): string | null => {
  if (!referenceType || !referenceId) return null;

  const typeUpper = referenceType.toUpperCase();
  if (typeUpper === 'SALES' || typeUpper === 'SALES_ORDER') {
    return `/sales/orders/${referenceId}`;
  }
  if (typeUpper === 'PURCHASE' || typeUpper === 'PURCHASE_ORDER') {
    return `/purchasing/purchase-orders/${referenceId}`;
  }
  return null;
};

// Format reference display text
const formatReferenceText = (referenceType?: string, referenceNumber?: string): string => {
  if (!referenceType || !referenceNumber) return '-';

  const typeUpper = referenceType.toUpperCase();
  let displayType = referenceType;

  if (typeUpper === 'SALES' || typeUpper === 'SALES_ORDER') {
    displayType = 'Sales Order';
  } else if (typeUpper === 'PURCHASE' || typeUpper === 'PURCHASE_ORDER') {
    displayType = 'Purchase Order';
  } else if (typeUpper === 'INVOICE') {
    displayType = 'Invoice';
  } else if (typeUpper === 'PAYMENT') {
    displayType = 'Payment';
  }

  return `${displayType} #${referenceNumber}`;
};

export const getAccountActivityMetricCardSx = () => ({
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

const accountActivityToolbarLayout = {
  containerDirection: { xs: 'column', lg: 'row' } as const,
  containerAlignItems: { xs: 'stretch', lg: 'center' } as const,
  filtersWrap: { xs: 'wrap', md: 'nowrap' } as const,
  dateStatusDirection: { xs: 'row', sm: 'row' } as const,
  dateStatusWrap: 'nowrap' as const,
  actionsJustify: { xs: 'stretch', md: 'flex-end' } as const,
};

export const getAccountActivityToolbarLayout = () => accountActivityToolbarLayout;

const AccountActivityPage: React.FC = () => {
  const navigate = useNavigate();
  const [selectedAccount, setSelectedAccount] = useState<ChartOfAccount | null>(null);
  const [startDate, setStartDate] = useState<string>(getFirstDayOfMonth());
  const [endDate, setEndDate] = useState<string>(formatDateForInput(new Date()));
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [validationError, setValidationError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const { data: accountsResponse } = useGetChartOfAccountsQuery({ page: 1, isActive: true });
  const accounts = accountsResponse?.data ?? [];
  const queryArgs = submitted && selectedAccount
    ? {
        accountId: selectedAccount.id,
        startDate,
        endDate,
        status: statusFilter === 'ALL' ? undefined : statusFilter,
      }
    : skipToken;
  const { data, isLoading: loading, error } = useGetAccountActivityQuery(queryArgs);
  const errorMessage = error ? getErrorMessage(error, 'Failed to load account activity report') : null;
  const entries = data?.entries ?? [];

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
        '/accounting/reports/account-activity/export',
        {
          accountId: selectedAccount.id,
          startDate,
          endDate,
          status: statusFilter === 'ALL' ? undefined : statusFilter,
        },
        `account-activity-${selectedAccount.code}-${startDate}-to-${endDate}.xlsx`,
      );
    } finally {
      setIsDownloading(false);
    }
  };

  // Handle entry number click
  const handleEntryNumberClick = (entryId: string) => {
    navigate(`/accounting/journal-entries/${entryId}`);
  };

  // Calculate total amount (net of debits and credits)
  const calculateTotalAmount = (): number => {
    if (!data) return 0;
    return entries.reduce((sum, entry) => {
      return sum + entry.debitAmount - entry.creditAmount;
    }, 0);
  };

  return (
    <>
      <PageHeader
        variant="report"
        title="Account Activity Report"
        subtitle="View journal entries affecting an account with drill-down to source transactions"
        primaryAction={{ label: loading ? 'Generating...' : 'Generate Report', onClick: handleGenerateReport, disabled: loading }}
        secondaryAction={{ label: isDownloading ? 'Exporting...' : 'Export to Excel', onClick: handleExportToExcel, disabled: !submitted || loading || isDownloading }}
      />
      <Paper sx={{ p: 3, mb: 3 }}>
        <Stack
          data-testid="account-activity-filters"
          direction="row"
          spacing={2}
          sx={{
            alignItems: "flex-start",
            flexWrap: accountActivityToolbarLayout.filtersWrap
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
            sx={{ minWidth: { xs: 280, md: 220 }, flexGrow: 1 }}
            size="small"
          />

          <Stack
            direction={accountActivityToolbarLayout.dateStatusDirection}
            spacing={2}
            sx={{
              flexWrap: accountActivityToolbarLayout.dateStatusWrap,
              width: { xs: '100%', sm: 'auto' }
            }}>
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
              sx={{ minWidth: { xs: 140, sm: 160 } }}
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
              sx={{ minWidth: { xs: 140, sm: 160 } }}
            />

            {/* Status Filter */}
            <FormControl size="small" sx={{ minWidth: { xs: 110, sm: 120 } }}>
              <InputLabel id="status-filter-label">Status</InputLabel>
              <Select
                labelId="status-filter-label"
                label="Status"
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value);
                  setSubmitted(false);
                }}
              >
                <MenuItem value="ALL">All Statuses</MenuItem>
                <MenuItem value={JournalEntryStatus.DRAFT}>Draft</MenuItem>
                <MenuItem value={JournalEntryStatus.POSTED}>Posted</MenuItem>
                <MenuItem value={JournalEntryStatus.REVERSED}>Reversed</MenuItem>
              </Select>
            </FormControl>
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
      {/* Account Activity Report */}
      {!loading && data && (
        <Paper>
          {/* Account Header Card */}
          <Box
            sx={{
              p: 3,
              borderBottom: 1,
              borderColor: 'divider',
              backgroundColor: 'rgba(255, 255, 255, 0.04)',
            }}
          >
            <Grid container spacing={2}>
              <Grid size={{ xs: 12, md: 3 }}>
                <Card variant="outlined" sx={getAccountActivityMetricCardSx()}>
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
              <Grid size={{ xs: 12, md: 6 }}>
                <Card variant="outlined" sx={getAccountActivityMetricCardSx()}>
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
              <Grid size={{ xs: 12, md: 3 }}>
                <Card variant="outlined" sx={getAccountActivityMetricCardSx()}>
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
            </Grid>

            {/* Report Period */}
            <Box sx={{ mt: 2 }}>
              <Typography variant="body2" sx={{
                color: "text.secondary"
              }}>
                Period: {formatDateForDisplay(data.startDate)} to {formatDateForDisplay(data.endDate)}
                {statusFilter !== 'ALL' && ` • Status: ${statusFilter}`}
              </Typography>
            </Box>
          </Box>

          {/* Entry Table */}
          <Box sx={{ p: 3 }}>
            {entries.length > 0 ? (
              <TableContainer sx={{ maxHeight: 600 }}>
                <Table stickyHeader size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell
                        sx={{
                          fontWeight: 600,
                          backgroundColor: 'rgba(255, 255, 255, 0.08)',
                          width: '10%',
                        }}
                      >
                        Entry Date
                      </TableCell>
                      <TableCell
                        sx={{
                          fontWeight: 600,
                          backgroundColor: 'rgba(255, 255, 255, 0.08)',
                          width: '10%',
                        }}
                      >
                        Entry Number
                      </TableCell>
                      <TableCell
                        sx={{
                          fontWeight: 600,
                          backgroundColor: 'rgba(255, 255, 255, 0.08)',
                          width: '10%',
                        }}
                      >
                        Entry Type
                      </TableCell>
                      <TableCell
                        sx={{
                          fontWeight: 600,
                          backgroundColor: 'rgba(255, 255, 255, 0.08)',
                          width: '8%',
                        }}
                      >
                        Status
                      </TableCell>
                      <TableCell
                        sx={{
                          fontWeight: 600,
                          backgroundColor: 'rgba(255, 255, 255, 0.08)',
                          width: '25%',
                        }}
                      >
                        Description
                      </TableCell>
                      <TableCell
                        align="right"
                        sx={{
                          fontWeight: 600,
                          backgroundColor: 'rgba(255, 255, 255, 0.08)',
                          width: '12%',
                        }}
                      >
                        Amount
                      </TableCell>
                      <TableCell
                        sx={{
                          fontWeight: 600,
                          backgroundColor: 'rgba(255, 255, 255, 0.08)',
                          width: '15%',
                        }}
                      >
                        Reference
                      </TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {entries.map((entry, index) => {
                      const referenceLink = getReferenceLink(entry.referenceType, entry.referenceId);
                      const referenceText = formatReferenceText(entry.referenceType, entry.referenceNumber);
                      const amount = entry.debitAmount > 0 ? entry.debitAmount : -entry.creditAmount;

                      return (
                        <TableRow
                          key={`${entry.id}-${index}`}
                          hover
                          sx={{
                            '&:nth-of-type(odd)': {
                              backgroundColor: 'rgba(255, 255, 255, 0.02)',
                            },
                          }}
                        >
                          <TableCell>
                            <Typography variant="body2">
                              {formatDateForDisplay(entry.entryDate)}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            <Typography
                              variant="body2"
                              sx={{
                                                                cursor: 'pointer',
                                color: 'primary.main',
                                textDecoration: 'none',
                                '&:hover': {
                                  textDecoration: 'underline',
                                },
                              }}
                              onClick={() => handleEntryNumberClick(entry.id)}
                            >
                              {entry.entryNumber}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            <Chip
                              label={entry.entryType.toUpperCase()}
                              color={getEntryTypeColor(entry.entryType)}
                              size="small"
                              sx={{ fontWeight: 500 }}
                            />
                          </TableCell>
                          <TableCell>
                            <StatusChip status={entry.status} />
                          </TableCell>
                          <TableCell>
                            <Typography variant="body2">
                              {entry.description}
                            </Typography>
                          </TableCell>
                          <TableCell align="right">
                            <Typography
                              variant="body2"
                              sx={{
                                                                fontWeight: 700,
                                color: amount >= 0 ? 'text.primary' : 'error.main',
                              }}
                            >
                              {formatCurrency(amount)}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            {referenceLink ? (
                              <MuiLink
                                component="button"
                                variant="body2"
                                onClick={() => navigate(referenceLink)}
                                sx={{
                                  textDecoration: 'none',
                                  '&:hover': {
                                    textDecoration: 'underline',
                                  },
                                }}
                              >
                                {referenceText}
                              </MuiLink>
                            ) : (
                              <Typography variant="body2" sx={{
                                color: "text.secondary"
                              }}>
                                {referenceText}
                              </Typography>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </TableContainer>
            ) : (
              <Box sx={{ py: 6, textAlign: 'center' }}>
                <ReceiptIcon sx={{ fontSize: 64, color: 'text.secondary', mb: 2 }} />
                <Typography variant="h6" sx={{
                  color: "text.secondary"
                }}>
                  No entries found for the selected period
                </Typography>
                <Typography
                  variant="body2"
                  sx={{
                    color: "text.secondary",
                    mt: 1
                  }}>
                  {statusFilter !== 'ALL'
                    ? `Try selecting a different date range or status filter`
                    : `Try selecting a different date range`}
                </Typography>
              </Box>
            )}
          </Box>

          {/* Summary Footer Card */}
          {entries.length > 0 && (
            <Box
              sx={{
              p: 3,
              borderTop: 2,
              borderColor: 'divider',
              backgroundColor: 'rgba(255, 255, 255, 0.04)',
              }}
            >
              <Grid container spacing={2}>
                <Grid size={{ xs: 12, md: 4 }}>
                  <Card variant="outlined" sx={getAccountActivityMetricCardSx()}>
                    <CardContent>
                      <Typography variant="body2" gutterBottom sx={{
                        color: "text.secondary"
                      }}>
                        Total Entries
                      </Typography>
                      <Typography
                        variant="h6"
                        sx={{
                                                    fontWeight: 700,
                          color: 'text.primary',
                        }}
                      >
                        {data.totalEntries}
                      </Typography>
                    </CardContent>
                  </Card>
                </Grid>
                <Grid size={{ xs: 12, md: 4 }}>
                  <Card
                    variant="outlined"
                    sx={{
                      ...getAccountActivityMetricCardSx(),
                      backgroundColor: 'rgba(33, 150, 243, 0.16)',
                      borderColor: 'primary.main',
                      borderWidth: 2,
                    }}
                  >
                    <CardContent>
                      <Typography variant="body2" gutterBottom sx={{
                        color: "text.secondary"
                      }}>
                        Total Amount (Net)
                      </Typography>
                      <Typography
                        variant="h5"
                        sx={{
                                                    fontWeight: 700,
                          color: calculateTotalAmount() >= 0 ? 'text.primary' : 'error.main',
                        }}
                      >
                        {formatCurrency(calculateTotalAmount())}
                      </Typography>
                    </CardContent>
                  </Card>
                </Grid>
                <Grid size={{ xs: 12, md: 4 }}>
                  <Card variant="outlined" sx={getAccountActivityMetricCardSx()}>
                    <CardContent>
                      <Typography variant="body2" gutterBottom sx={{
                        color: "text.secondary"
                      }}>
                        Filter Applied
                      </Typography>
                      <Typography
                        variant="h6"
                        sx={{
                          fontWeight: 600,
                          color: 'text.primary',
                        }}
                      >
                        {statusFilter === 'ALL' ? 'All Statuses' : statusFilter}
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
              backgroundColor: 'rgba(255, 255, 255, 0.06)',
            }}
          >
            <Typography variant="body2" sx={{
              color: "text.secondary"
            }}>
              Total Entries: {entries.length}
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
            Choose an account from the dropdown above to view its activity
          </Typography>
        </Paper>
      )}
    </>
  );
};

export default AccountActivityPage;
