import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Paper,
  Button,
  CircularProgress,
  Alert,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
} from '@mui/material';
import { default as SaveIcon } from '@mui/icons-material/Save';
import PageHeader from '@/components/common/PageHeader';
import GenericOverviewPage from '@/components/common/GenericOverviewPage';
import { useNotification } from '@/hooks/useNotification';
import {
  useGetDocumentNumberSettingsQuery,
  useUpdateDocumentNumberSettingsMutation,
  type DocumentNumberConfig,
} from '@/store/api/settingsApi';

const MODULE_GROUPS: Record<string, string[]> = {
  Sales: ['Sales Orders'],
  Purchasing: ['Purchase Orders'],
  Inventory: ['Stock Adjustment'],
  Accounting: ['Journal Entries', 'Expenses'],
};

/** Document types this page owns. Anything else the API returns is legacy. */
const ACTIVE_DOCUMENT_NAMES = new Set(Object.values(MODULE_GROUPS).flat());

const DocumentNumbersPage: React.FC = () => {
  const { showSuccess, showError } = useNotification();
  const [submitting, setSubmitting] = useState(false);
  const [configurations, setConfigurations] = useState<DocumentNumberConfig[]>([]);
  const [previews, setPreviews] = useState<Record<string, string>>({});

  const {
    data: settingsData,
    isLoading: loading,
    error: fetchError,
    refetch,
  } = useGetDocumentNumberSettingsQuery();
  const [updateDocumentNumberSettings] = useUpdateDocumentNumberSettingsMutation();

  // Legacy rows the API may still return (Payments, Goods Received) are dropped
  // here rather than at render time: the row indices this produces are what
  // handleConfigChange edits and what handleSubmit validates and saves, so
  // filtering anywhere later would let a hidden row be resubmitted — and
  // recreate settings the migration deleted (issue #946).
  //
  // Memoised on the raw array: filter() allocates a new array each call, and
  // feeding an unstable reference into setConfigurations below re-fires the
  // previews effect on every render, which loops forever.
  const activeConfigurations = React.useMemo(
    () =>
      settingsData?.configurations?.filter((c) => ACTIVE_DOCUMENT_NAMES.has(c.documentName)) ??
      null,
    [settingsData?.configurations],
  );

  // Populate local configurations state when RTK data loads
  useEffect(() => {
    if (activeConfigurations) {
      setConfigurations(activeConfigurations);
    }
  }, [activeConfigurations]);

  useEffect(() => {
    const currentYY = String(new Date().getFullYear() % 100).padStart(2, '0');
    const newPreviews: Record<string, string> = {};
    configurations.forEach((config) => {
      const seq = String(config.nextNumber).padStart(config.paddingDigits, '0');
      newPreviews[config.documentName] = `${config.prefix}-${currentYY}-${seq}`;
    });
    setPreviews(newPreviews);
  }, [configurations]);

  const error = fetchError ? (fetchError as any)?.message || 'Failed to load settings' : null;

  const handleConfigChange = (
    index: number,
    field: 'prefix' | 'nextNumber',
    value: string | number,
  ) => {
    // Replace the edited row rather than mutating it: these objects come
    // straight from RTK Query's cache, which is frozen in development, so an
    // in-place write throws — and would corrupt the cache where it doesn't.
    setConfigurations((current) =>
      current.map((config, i) =>
        i === index
          ? {
              ...config,
              [field]: field === 'nextNumber' ? parseInt(value as string) || 1 : (value as any),
            }
          : config,
      ),
    );
  };

  const handleSubmit = async () => {
    try {
      setSubmitting(true);

      // Validate configurations
      for (const config of configurations) {
        if (!config.prefix || config.nextNumber < 1) {
          showError('Please fill in all fields with valid values');
          return;
        }
      }

      await updateDocumentNumberSettings({ configurations }).unwrap();
      showSuccess('Document number settings saved successfully');
      refetch();
    } catch (error: any) {
      const errorMessage =
        error.response?.data?.message || error.message || 'Failed to save settings';
      showError(errorMessage);
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = () => {
    // Reset from the memoised cache value directly. Relying on refetch() alone
    // does not work: RTK Query's structural sharing returns the *same* array
    // reference when the refetched data is deeply equal, so activeConfigurations
    // never changes, the populate effect never re-runs, and the discarded edits
    // stay on screen. Unchanged settings are the normal case here.
    if (activeConfigurations) {
      setConfigurations(activeConfigurations);
    }
    refetch();
  };

  if (loading) {
    return (
      <Box
        sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '400px' }}
      >
        <CircularProgress />
      </Box>
    );
  }

  return (
    <GenericOverviewPage>
      {/* Page Header */}
      <PageHeader
        title="Document Numbers Settings"
        subtitle="Configure automatic numbering sequences for orders, invoices, and other documents"
      />
      {/* Error Alert */}
      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}
      <Paper sx={{ p: 4 }}>
        <Typography variant="body2" sx={{ color: 'text.secondary', mb: 1 }}>
          Configure document number prefixes for all business documents. Numbers are generated in
          the format
          <strong> PREFIX-YY-NNN</strong> (e.g. SO-26-001), where YY is the current year and the
          sequence resets each year.
        </Typography>
        <Typography variant="body2" sx={{ color: 'text.secondary', mb: 3, fontStyle: 'italic' }}>
          Note: The sequence auto-expands past 999 (e.g. SO-26-1000). Use the Sync button after
          changing prefixes.
        </Typography>

        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 600, width: '30%' }}>Document Name</TableCell>
                <TableCell sx={{ fontWeight: 600, width: '25%' }}>Prefix</TableCell>
                <TableCell sx={{ fontWeight: 600, width: '20%' }}>Next Number</TableCell>
                <TableCell sx={{ fontWeight: 600, width: '25%' }}>Preview</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {Object.entries(MODULE_GROUPS).map(([module, docNames]) => (
                <React.Fragment key={module}>
                  <TableRow>
                    <TableCell
                      colSpan={4}
                      sx={{
                        backgroundColor: 'action.hover',
                        fontWeight: 700,
                        py: 1,
                        fontSize: '0.75rem',
                        textTransform: 'uppercase',
                        letterSpacing: 1,
                      }}
                    >
                      {module}
                    </TableCell>
                  </TableRow>
                  {docNames.map((docName) => {
                    const index = configurations.findIndex((c) => c.documentName === docName);
                    if (index === -1) return null;
                    const config = configurations[index];
                    return (
                      <TableRow key={config.documentName}>
                        <TableCell>
                          <Typography variant="body2" sx={{ fontWeight: 500 }}>
                            {config.documentName}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <TextField
                            value={config.prefix}
                            onChange={(e) =>
                              handleConfigChange(index, 'prefix', e.target.value.toUpperCase())
                            }
                            size="small"
                            fullWidth
                            slotProps={{ htmlInput: { maxLength: 10 } }}
                          />
                        </TableCell>
                        <TableCell>
                          <TextField
                            type="number"
                            value={config.nextNumber}
                            onChange={(e) =>
                              handleConfigChange(index, 'nextNumber', e.target.value)
                            }
                            size="small"
                            fullWidth
                            slotProps={{ htmlInput: { min: 1 } }}
                          />
                        </TableCell>
                        <TableCell>
                          <Typography
                            variant="body2"
                            sx={{
                              color: 'primary.main',
                              fontWeight: 600,
                              backgroundColor: 'action.hover',
                              px: 2,
                              py: 1,
                              borderRadius: 1,
                            }}
                          >
                            {previews[config.documentName] || 'N/A'}
                          </Typography>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </React.Fragment>
              ))}
            </TableBody>
          </Table>
        </TableContainer>

        {/* Action Buttons */}
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 2, mt: 4 }}>
          <Button variant="outlined" onClick={handleCancel} disabled={submitting} size="large">
            Cancel
          </Button>
          <Button
            variant="contained"
            color="primary"
            startIcon={submitting ? <CircularProgress size={20} color="inherit" /> : <SaveIcon />}
            onClick={handleSubmit}
            disabled={submitting}
            size="large"
          >
            {submitting ? 'Saving...' : 'Save Changes'}
          </Button>
        </Box>
      </Paper>
    </GenericOverviewPage>
  );
};

export default DocumentNumbersPage;
