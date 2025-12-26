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
import backupService, { BackupSettings, UpdateBackupSettingsDto } from '@/services/backupService';

const BackupSettingsPanel: React.FC = () => {
  const [settings, setSettings] = useState<BackupSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [currentTotalSize, setCurrentTotalSize] = useState<number>(0);
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({
    open: false,
    message: '',
    severity: 'success',
  });

  const loadSettings = async () => {
    try {
      setLoading(true);
      const data = await backupService.getBackupSettings();
      setSettings(data);

      // Load current total size of all backups
      const backups = await backupService.listBackups();
      const totalSize = backups.reduce((sum, backup) => {
        // Convert string to number (size is returned as string from bigint PostgreSQL type)
        const size = typeof backup.size === 'string' ? parseInt(backup.size, 10) : (backup.size || 0);
        return sum + size;
      }, 0);
      setCurrentTotalSize(totalSize);
    } catch (error: any) {
      setSnackbar({
        open: true,
        message: error?.message || 'Failed to load backup settings',
        severity: 'error',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSettings();
  }, []);

  const handleSave = async () => {
    if (!settings) return;

    try {
      setSaving(true);
      const updateDto: UpdateBackupSettingsDto = {
        retentionDays: settings.retentionDays,
        autoCleanupEnabled: settings.autoCleanupEnabled,
        cleanupTime: settings.cleanupTime,
        maximumBackupsToKeep: settings.maximumBackupsToKeep,
        maximumTotalSize: settings.maximumTotalSize,
      };

      const updated = await backupService.updateBackupSettings(updateDto);
      setSettings(updated);
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
    } finally {
      setSaving(false);
    }
  };

  const handleRunCleanup = async () => {
    try {
      setSaving(true);
      const result = await backupService.cleanupWithSettings();
      setSnackbar({
        open: true,
        message: `Cleanup completed: ${result.deletedCount} backup(s) deleted`,
        severity: 'success',
      });
      await loadSettings();
    } catch (error: any) {
      setSnackbar({
        open: true,
        message: error?.message || 'Failed to run cleanup',
        severity: 'error',
      });
    } finally {
      setSaving(false);
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
            <Grid item xs={12}>
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
            <Grid item xs={12} md={6}>
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
            <Grid item xs={12} md={6}>
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
            <Grid item xs={12} md={6}>
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

            {/* Maximum Total Size */}
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                label="Maximum Total Size (MB)"
                type="number"
                value={settings.maximumTotalSize ? (settings.maximumTotalSize / (1024 * 1024)).toFixed(2) : ''}
                onChange={(e) => {
                  const mb = parseFloat(e.target.value);
                  setSettings({
                    ...settings,
                    maximumTotalSize: mb > 0 ? Math.round(mb * 1024 * 1024) : null
                  });
                }}
                disabled={!settings.autoCleanupEnabled}
                helperText="Maximum total size of all backups in MB (max 100 MB, leave empty for unlimited)"
                InputProps={{
                  inputProps: { min: 1, max: 100, step: 1 },
                  endAdornment: <InputAdornment position="end">MB</InputAdornment>,
                }}
              />
            </Grid>

            {/* Current Usage and Limit Display */}
            <Grid item xs={12}>
              <Box sx={{ p: 2, bgcolor: 'background.default', borderRadius: 1 }}>
                <Grid container spacing={2}>
                  <Grid item xs={12} md={6}>
                    <Typography variant="caption" color="text.secondary">
                      Current Total Size (Usage)
                    </Typography>
                    <Typography variant="h6" color={currentTotalSize > 0 ? 'primary' : 'text.secondary'}>
                      {currentTotalSize > 0 ? `${(currentTotalSize / (1024 * 1024)).toFixed(2)} MB` : '0 MB'}
                    </Typography>
                  </Grid>
                  <Grid item xs={12} md={6}>
                    <Typography variant="caption" color="text.secondary">
                      Maximum Allowed Size (Limit)
                    </Typography>
                    <Typography variant="h6" color="primary">
                      {settings.maximumTotalSize ? `${(settings.maximumTotalSize / (1024 * 1024)).toFixed(2)} MB` : 'Unlimited'}
                    </Typography>
                  </Grid>
                  {settings.maximumTotalSize && currentTotalSize > 0 && (
                    <Grid item xs={12}>
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
                              width: `${Math.min((currentTotalSize / settings.maximumTotalSize) * 100, 100)}%`,
                              bgcolor: currentTotalSize > settings.maximumTotalSize ? 'error.main' : 'primary.main',
                              transition: 'width 0.3s ease',
                            }}
                          />
                        </Box>
                        <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
                          {((currentTotalSize / settings.maximumTotalSize) * 100).toFixed(1)}% used
                          {currentTotalSize > settings.maximumTotalSize && ' - Over limit!'}
                        </Typography>
                      </Box>
                    </Grid>
                  )}
                </Grid>
              </Box>
            </Grid>

            {/* Action Buttons */}
            <Grid item xs={12}>
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
