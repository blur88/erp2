import React, { useEffect, useState } from 'react';
import {
  Box,
  Card,
  CardContent,
  Grid,
  TextField,
  Typography,
  Button,
  Switch,
  FormControlLabel,
  Alert,
  Snackbar,
  CircularProgress,
  InputAdornment,
} from '@mui/material';
import { Save as SaveIcon, Refresh as RefreshIcon } from '@mui/icons-material';
import type { BackupSettings, UpdateBackupSettingsDto } from '@/store/api/backupApi';
import {
  useGetBackupSettingsQuery,
  useGetBackupsQuery,
  useUpdateBackupSettingsMutation,
  useCleanupWithSettingsMutation,
} from '@/store/api/backupApi';

interface BackupSettingsPanelProps {
  onCleanupComplete?: () => void;
}

const BackupSettingsPanel: React.FC<BackupSettingsPanelProps> = ({ onCleanupComplete }) => {
  const { data: remoteSettings, isLoading: loading } = useGetBackupSettingsQuery();
  const { data: backups = [] } = useGetBackupsQuery();
  const [updateBackupSettings, { isLoading: isSaving }] = useUpdateBackupSettingsMutation();
  const [cleanupWithSettings, { isLoading: isCleaning }] = useCleanupWithSettingsMutation();

  const [settings, setSettings] = useState<BackupSettings | null>(null);
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({
    open: false,
    message: '',
    severity: 'success',
  });

  const saving = isSaving || isCleaning;

  useEffect(() => {
    if (remoteSettings) {
      setSettings(remoteSettings);
    }
  }, [remoteSettings]);

  const currentTotalSize = backups.reduce((sum, backup) => {
    // Convert string to number (size is returned as string from bigint PostgreSQL type)
    const size = typeof backup.size === 'string' ? parseInt(backup.size, 10) : (backup.size || 0);
    return sum + size;
  }, 0);

  const handleSave = async () => {
    if (!settings) return;

    try {
      const updateDto: UpdateBackupSettingsDto = {
        retentionDays: settings.retentionDays,
        autoCleanupEnabled: settings.autoCleanupEnabled,
        cleanupTime: settings.cleanupTime,
        maximumBackupsToKeep: settings.maximumBackupsToKeep,
        maximumTotalSize: settings.maximumTotalSize,
      };

      await updateBackupSettings(updateDto).unwrap();
      setSnackbar({
        open: true,
        message: 'Backup settings saved successfully',
        severity: 'success',
      });
    } catch (error: any) {
      setSnackbar({
        open: true,
        message: error?.message || 'Failed to save backup settings',
        severity: 'error',
      });
    }
  };

  const handleRunCleanup = async () => {
    try {
      const result = await cleanupWithSettings().unwrap();
      setSnackbar({
        open: true,
        message: `Cleanup completed: ${result.deletedCount} backup(s) deleted`,
        severity: 'success',
      });
      // Notify parent component to refresh backup list
      if (onCleanupComplete) {
        onCleanupComplete();
      }
    } catch (error: any) {
      setSnackbar({
        open: true,
        message: error?.message || 'Failed to run cleanup',
        severity: 'error',
      });
    }
  };

  const formatBytes = (bytes: number | null): string => {
    if (!bytes) return 'Unlimited';
    const gb = bytes / (1024 * 1024 * 1024);
    return `${gb.toFixed(2)} GB`;
  };

  const bytesToGB = (bytes: number | null): number => {
    if (!bytes) return 0;
    return bytes / (1024 * 1024 * 1024);
  };

  const gbToBytes = (gb: number | null): number | null => {
    if (!gb || gb <= 0) return null;
    return Math.round(gb * 1024 * 1024 * 1024);
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (!settings) {
    return (
      <Alert severity="error">Failed to load backup settings</Alert>
    );
  }

  return (
    <Box>
      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Backup Retention Settings
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            Configure automatic backup cleanup and retention policies
          </Typography>

          <Grid container spacing={3}>
            {/* Auto Cleanup Toggle */}
            <Grid size={{ xs: 12 }}>
              <FormControlLabel
                control={
                  <Switch
                    checked={settings.autoCleanupEnabled}
                    onChange={(e) => setSettings({ ...settings, autoCleanupEnabled: e.target.checked })}
                    color="primary"
                  />
                }
                label="Enable Automatic Cleanup"
              />
              <Typography variant="caption" display="block" color="text.secondary" sx={{ ml: 4 }}>
                Automatically delete old backups based on retention policies
              </Typography>
            </Grid>

            {/* Cleanup Time */}
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField
                fullWidth
                label="Cleanup Time"
                type="time"
                value={settings.cleanupTime}
                onChange={(e) => setSettings({ ...settings, cleanupTime: e.target.value })}
                disabled={!settings.autoCleanupEnabled}
                helperText="Time of day to run automatic cleanup (24-hour format)"
                InputLabelProps={{ shrink: true }}
              />
            </Grid>

            {/* Retention Days */}
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField
                fullWidth
                label="Retention Days"
                type="number"
                value={settings.retentionDays}
                onChange={(e) => setSettings({ ...settings, retentionDays: parseInt(e.target.value) || 30 })}
                disabled={!settings.autoCleanupEnabled}
                helperText="Delete backups older than this many days (1-365)"
                InputProps={{ inputProps: { min: 1, max: 365 } }}
              />
            </Grid>

            {/* Maximum Backups to Keep */}
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField
                fullWidth
                label="Maximum Backups to Keep"
                type="number"
                value={settings.maximumBackupsToKeep || ''}
                onChange={(e) => {
                  const val = parseInt(e.target.value);
                  setSettings({ ...settings, maximumBackupsToKeep: val > 0 ? val : null });
                }}
                disabled={!settings.autoCleanupEnabled}
                helperText="Maximum number of backups to keep (leave empty for unlimited)"
                InputProps={{ inputProps: { min: 1 } }}
              />
            </Grid>

            {/* Current Usage Display */}
            <Grid size={{ xs: 12 }}>
              <Box sx={{ p: 2, bgcolor: 'background.default', borderRadius: 1 }}>
                <Grid container spacing={2}>
                  <Grid size={{ xs: 12, md: 4 }}>
                    <Typography variant="caption" color="text.secondary">
                      Current Total Size
                    </Typography>
                    <Typography variant="h6" color={currentTotalSize > 0 ? 'primary' : 'text.secondary'}>
                      {currentTotalSize > 0 ? `${(currentTotalSize / (1024 * 1024)).toFixed(2)} MB` : '0 MB'}
                    </Typography>
                  </Grid>
                  <Grid size={{ xs: 12, md: 4 }}>
                    <Typography variant="caption" color="text.secondary">
                      Maximum Limit
                    </Typography>
                    <Typography variant="h6" color="primary">
                      10.00 MB
                    </Typography>
                  </Grid>
                  <Grid size={{ xs: 12, md: 4 }}>
                    <Typography variant="caption" color="text.secondary">
                      Space Left
                    </Typography>
                    <Typography
                      variant="h6"
                      color={
                        (10 * 1024 * 1024 - currentTotalSize) > (2 * 1024 * 1024)
                          ? 'success.main'
                          : (10 * 1024 * 1024 - currentTotalSize) > 0
                            ? 'warning.main'
                            : 'error.main'
                      }
                    >
                      {((10 * 1024 * 1024 - currentTotalSize) / (1024 * 1024)).toFixed(2)} MB
                    </Typography>
                  </Grid>
                  <Grid size={{ xs: 12 }}>
                    <Box sx={{ position: 'relative', pt: 1 }}>
                      <Box
                        sx={{
                          height: 8,
                          bgcolor: 'grey.300',
                          borderRadius: 1,
                          overflow: 'hidden',
                        }}
                      >
                        <Box
                          sx={{
                            height: '100%',
                            width: `${Math.min((currentTotalSize / (10 * 1024 * 1024)) * 100, 100)}%`,
                            bgcolor: currentTotalSize > (10 * 1024 * 1024) ? 'error.main' : 'primary.main',
                            transition: 'width 0.3s ease',
                          }}
                        />
                      </Box>
                      <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
                        {((currentTotalSize / (10 * 1024 * 1024)) * 100).toFixed(1)}% used
                        {currentTotalSize > (10 * 1024 * 1024) && ' - Over limit!'}
                      </Typography>
                    </Box>
                  </Grid>
                </Grid>
              </Box>
            </Grid>

            {/* Action Buttons */}
            <Grid size={{ xs: 12 }}>
              <Box sx={{ display: 'flex', gap: 2, justifyContent: 'flex-end' }}>
                <Button
                  variant="outlined"
                  startIcon={<RefreshIcon />}
                  onClick={handleRunCleanup}
                  disabled={saving || !settings.autoCleanupEnabled}
                >
                  Run Cleanup Now
                </Button>
                <Button
                  variant="contained"
                  startIcon={saving ? <CircularProgress size={20} color="inherit" /> : <SaveIcon />}
                  onClick={handleSave}
                  disabled={saving}
                >
                  {saving ? 'Saving...' : 'Save Settings'}
                </Button>
              </Box>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      <Snackbar
        open={snackbar.open}
        autoHideDuration={6000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <Alert
          onClose={() => setSnackbar({ ...snackbar, open: false })}
          severity={snackbar.severity}
          sx={{ width: '100%' }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default BackupSettingsPanel;
