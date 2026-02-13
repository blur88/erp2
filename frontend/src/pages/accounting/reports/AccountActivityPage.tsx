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
  Alert,
  CircularProgress,
  Stack,
  Chip,
  Autocomplete,
  Card,
  CardContent,
  GridLegacy as Grid,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Link as MuiLink,
} from '@mui/material';
import {
  Download as DownloadIcon,
  Receipt as ReceiptIcon,
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '@/store';
import {
  fetchAccountActivity,
  downloadAccountActivityExcel,
  selectAccountActivity,
  selectDownloading,
  clearAccountActivityError,
} from '@/store/slices/accountingReportsSlice';
import {
  fetchChartOfAccounts,
  selectChartOfAccounts,
  ChartOfAccount,
} from '@/store/slices/chartOfAccountsSlice';

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
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
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

// Status chip colors
const getStatusColor = (status: string): 'default' | 'success' | 'error' => {
  const statusUpper = status.toUpperCase();
  if (statusUpper === 'DRAFT') return 'default';
  if (statusUpper === 'POSTED') return 'success';
  if (statusUpper === 'REVERSED') return 'error';
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
  if (typeUpper === 'PAYMENT') {
    // Could be sales or purchasing payment - default to sales
    return `/sales/payments/${referenceId}`;
  }
  if (typeUpper === 'INVOICE') {
    return `/sales/invoices/${referenceId}`;
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

const AccountActivityPage: React.FC = () => {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();

  // Redux state
  const accountActivityState = useAppSelector(selectAccountActivity);
  const downloading = useAppSelector(selectDownloading);
  const accounts = useAppSelector(selectChartOfAccounts);

  const { data, loading, error } = accountActivityState || {
    data: null,
    loading: false,
    error: null,
  };
  const entries = data?.entries ?? [];

  // Local state for filters
  const [selectedAccount, setSelectedAccount] = useState<ChartOfAccount | null>(null);
  const [startDate, setStartDate] = useState<string>(getFirstDayOfMonth());
  const [endDate, setEndDate] = useState<string>(formatDateForInput(new Date()));
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [validationError, setValidationError] = useState<string | null>(null);

  // Fetch accounts on mount
  useEffect(() => {
    dispatch(fetchChartOfAccounts({ isActive: true, limit: 100 }));
  }, [dispatch]);

  // Clear error on mount
  useEffect(() => {
    return () => {
      dispatch(clearAccountActivityError());
    };
  }, [dispatch]);

  // Handle generate report
  const handleGenerateReport = () => {
    // Validate account selection
    if (!selectedAccount) {
      setValidationError('Please select an account to generate the report');
      return;
    }

    // Clear validation error
    setValidationError(null);

    // Fetch report
    dispatch(
      fetchAccountActivity({
        accountId: selectedAccount.id,
        startDate,
        endDate,
        status: statusFilter === 'ALL' ? undefined : statusFilter,
      })
    );
  };

  // Handle export to Excel
  const handleExportToExcel = () => {
    if (!selectedAccount) {
      setValidationError('Please select an account to export the report');
      return;
    }

    dispatch(
      downloadAccountActivityExcel({
        accountId: selectedAccount.id,
        startDate,
        endDate,
        status: statusFilter === 'ALL' ? undefined : statusFilter,
      })
    );
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
    <Box sx={{ p: 3 }}>
      {/* Header */}
      <Box sx={{ mb: 3 }}>
        <Typography variant="h4" sx={{ fontWeight: 600, mb: 1 }}>
          Account Activity Report
        </Typography>
        <Typography variant="body2" color="text.secondary">
          View journal entries affecting an account with drill-down to source transactions
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
            data-testid="account-activity-filters"
            direction="row"
            spacing={2}
            alignItems="flex-start"
            flexWrap="wrap"
          >
            {/* Account Selector */}
            <Autocomplete
              options={accounts}
              getOptionLabel={(option) => `${option.code} - ${option.name}`}
              value={selectedAccount}
              onChange={(event, newValue) => {
                setSelectedAccount(newValue);
                setValidationError(null);
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
              onChange={(e) => setStartDate(e.target.value)}
              size="small"
              InputLabelProps={{ shrink: true }}
              sx={{ minWidth: 180 }}
            />

            {/* End Date */}
            <TextField
              label="End Date"
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              size="small"
              InputLabelProps={{ shrink: true }}
              sx={{ minWidth: 180 }}
            />

            {/* Status Filter */}
            <FormControl size="small" sx={{ minWidth: 120 }}>
              <InputLabel id="status-filter-label">Status</InputLabel>
              <Select
                labelId="status-filter-label"
                label="Status"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <MenuItem value="ALL">All Statuses</MenuItem>
                <MenuItem value="DRAFT">Draft</MenuItem>
                <MenuItem value="POSTED">Posted</MenuItem>
                <MenuItem value="REVERSED">Reversed</MenuItem>
              </Select>
            </FormControl>
          </Stack>

          <Stack
            data-testid="account-activity-actions"
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
          onClose={() => dispatch(clearAccountActivityError())}
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

      {/* Account Activity Report */}
      {!loading && data && (
        <Paper>
          {/* Account Header Card */}
          <Box
            sx={{
              p: 3,
              borderBottom: 1,
              borderColor: 'divider',
              backgroundColor: (theme) =>
                theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.04)' : 'grey.50',
            }}
          >
            <Grid container spacing={2}>
              <Grid item xs={12} md={3}>
                <Card variant="outlined">
                  <CardContent>
                    <Typography variant="body2" color="text.secondary" gutterBottom>
                      Account Code
                    </Typography>
                    <Typography
                      variant="h5"
                      sx={{ fontFamily: 'monospace', fontWeight: 700 }}
                    >
                      {data.account.code}
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
              <Grid item xs={12} md={6}>
                <Card variant="outlined">
                  <CardContent>
                    <Typography variant="body2" color="text.secondary" gutterBottom>
                      Account Name
                    </Typography>
                    <Typography variant="h6" sx={{ fontWeight: 600 }}>
                      {data.account.name}
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
              <Grid item xs={12} md={3}>
                <Card variant="outlined">
                  <CardContent>
                    <Typography variant="body2" color="text.secondary" gutterBottom>
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
              <Typography variant="body2" color="text.secondary">
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
                          backgroundColor: (theme) =>
                            theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.08)' : 'grey.200',
                          width: '10%',
                        }}
                      >
                        Entry Date
                      </TableCell>
                      <TableCell
                        sx={{
                          fontWeight: 600,
                          backgroundColor: (theme) =>
                            theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.08)' : 'grey.200',
                          width: '10%',
                        }}
                      >
                        Entry Number
                      </TableCell>
                      <TableCell
                        sx={{
                          fontWeight: 600,
                          backgroundColor: (theme) =>
                            theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.08)' : 'grey.200',
                          width: '10%',
                        }}
                      >
                        Entry Type
                      </TableCell>
                      <TableCell
                        sx={{
                          fontWeight: 600,
                          backgroundColor: (theme) =>
                            theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.08)' : 'grey.200',
                          width: '8%',
                        }}
                      >
                        Status
                      </TableCell>
                      <TableCell
                        sx={{
                          fontWeight: 600,
                          backgroundColor: (theme) =>
                            theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.08)' : 'grey.200',
                          width: '25%',
                        }}
                      >
                        Description
                      </TableCell>
                      <TableCell
                        align="right"
                        sx={{
                          fontWeight: 600,
                          backgroundColor: (theme) =>
                            theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.08)' : 'grey.200',
                          width: '12%',
                        }}
                      >
                        Amount
                      </TableCell>
                      <TableCell
                        sx={{
                          fontWeight: 600,
                          backgroundColor: (theme) =>
                            theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.08)' : 'grey.200',
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
                              backgroundColor: (theme) =>
                                theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.02)' : 'grey.50',
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
                                fontFamily: 'monospace',
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
                            <Chip
                              label={entry.status.toUpperCase()}
                              color={getStatusColor(entry.status)}
                              size="small"
                              sx={{ fontWeight: 500 }}
                            />
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
                                fontFamily: 'monospace',
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
                              <Typography variant="body2" color="text.secondary">
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
                <Typography variant="h6" color="text.secondary">
                  No entries found for the selected period
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
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
                backgroundColor: (theme) =>
                  theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.04)' : 'grey.50',
              }}
            >
              <Grid container spacing={2}>
                <Grid item xs={12} md={4}>
                  <Card variant="outlined">
                    <CardContent>
                      <Typography variant="body2" color="text.secondary" gutterBottom>
                        Total Entries
                      </Typography>
                      <Typography
                        variant="h6"
                        sx={{
                          fontFamily: 'monospace',
                          fontWeight: 700,
                          color: 'text.primary',
                        }}
                      >
                        {data.totalEntries}
                      </Typography>
                    </CardContent>
                  </Card>
                </Grid>
                <Grid item xs={12} md={4}>
                  <Card
                    variant="outlined"
                    sx={{
                      backgroundColor: (theme) =>
                        theme.palette.mode === 'dark' ? 'rgba(33, 150, 243, 0.16)' : 'primary.light',
                      borderColor: 'primary.main',
                      borderWidth: 2,
                    }}
                  >
                    <CardContent>
                      <Typography variant="body2" color="text.secondary" gutterBottom>
                        Total Amount (Net)
                      </Typography>
                      <Typography
                        variant="h5"
                        sx={{
                          fontFamily: 'monospace',
                          fontWeight: 700,
                          color: calculateTotalAmount() >= 0 ? 'text.primary' : 'error.main',
                        }}
                      >
                        {formatCurrency(calculateTotalAmount())}
                      </Typography>
                    </CardContent>
                  </Card>
                </Grid>
                <Grid item xs={12} md={4}>
                  <Card variant="outlined">
                    <CardContent>
                      <Typography variant="body2" color="text.secondary" gutterBottom>
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
              backgroundColor: (theme) =>
                theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.06)' : 'grey.100',
            }}
          >
            <Typography variant="body2" color="text.secondary">
              Total Entries: {entries.length}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Generated on: {new Date().toLocaleString('en-US', {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </Typography>
          </Box>
        </Paper>
      )}

      {/* Empty State - No Account Selected */}
      {!loading && !data && !error && (
        <Paper sx={{ p: 6, textAlign: 'center' }}>
          <ReceiptIcon sx={{ fontSize: 80, color: 'text.secondary', mb: 2 }} />
          <Typography variant="h6" color="text.secondary" gutterBottom>
            Please select an account
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Choose an account from the dropdown above to view its activity
          </Typography>
        </Paper>
      )}
    </Box>
  );
};

export default AccountActivityPage;
