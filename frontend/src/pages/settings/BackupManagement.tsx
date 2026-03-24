import React, { useEffect, useState } from 'react';
import {
  Paper,
  Box,
  Tabs,
  Tab,
  Button,
  Alert,
  Snackbar,
  CircularProgress,
} from '@mui/material';
import { Add as AddIcon, Backup as BackupIcon, CloudUpload as UploadIcon } from '@mui/icons-material';
import PageHeader from '@/components/common/PageHeader';
import { useGetBackupsQuery, useGetSchedulesQuery } from '@/store/api/backupApi';
import BackupList from '@/components/backup/BackupList';
import BackupScheduleList from '@/components/backup/BackupScheduleList';
import BackupSettingsPanel from '@/components/backup/BackupSettingsPanel';
import CreateBackupDialog from '@/components/backup/CreateBackupDialog';
import BackupScheduleDialog from '@/components/backup/BackupScheduleDialog';
import UploadBackupDialog from '@/components/backup/UploadBackupDialog';

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;

  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`backup-tabpanel-${index}`}
      aria-labelledby={`backup-tab-${index}`}
      {...other}
    >
      {value === index && <Box sx={{ py: 3 }}>{children}</Box>}
    </div>
  );
}

const BackupManagement: React.FC = () => {
  const { data: backups = [], isLoading: backupsLoading, error: backupsError, refetch: refetchBackups } = useGetBackupsQuery();
  const { data: schedules = [], isLoading: schedulesLoading, error: schedulesError } = useGetSchedulesQuery();
  const loading = backupsLoading || schedulesLoading;
  const error = (backupsError || schedulesError) ? 'Failed to load backup data' : null;
  const [tabValue, setTabValue] = useState(0);
  const [createBackupOpen, setCreateBackupOpen] = useState(false);
  const [createScheduleOpen, setCreateScheduleOpen] = useState(false);
  const [uploadBackupOpen, setUploadBackupOpen] = useState(false);
  const [snackbarOpen, setSnackbarOpen] = useState(false);

  useEffect(() => {
    if (error) {
      setSnackbarOpen(true);
    }
  }, [error]);

  const handleTabChange = (_event: React.SyntheticEvent, newValue: number) => {
    setTabValue(newValue);
  };

  const handleCreateBackup = () => {
    setCreateBackupOpen(true);
  };

  const handleCreateSchedule = () => {
    setCreateScheduleOpen(true);
  };

  const handleUploadBackup = () => {
    setUploadBackupOpen(true);
  };

  const handleSnackbarClose = () => {
    setSnackbarOpen(false);
  };

  return (
    <Box sx={{ p: 3 }}>
      <PageHeader
        variant="system"
        title="Backup & Restore Management"
        subtitle="Create, manage, and restore database backups"
        toolbar={
          <Box sx={{ display: 'flex', gap: 2 }}>
            {tabValue === 0 && (
              <>
                <Button
                  variant="outlined"
                  color="primary"
                  startIcon={<UploadIcon />}
                  onClick={handleUploadBackup}
                  disabled={loading}
                >
                  Upload Backup
                </Button>
                <Button
                  variant="contained"
                  color="primary"
                  startIcon={loading ? <CircularProgress size={20} color="inherit" /> : <BackupIcon />}
                  onClick={handleCreateBackup}
                  disabled={loading}
                >
                  {loading ? 'Processing...' : 'Create Backup'}
                </Button>
              </>
            )}
            {tabValue === 1 && (
              <Button
                variant="contained"
                color="primary"
                startIcon={<AddIcon />}
                onClick={handleCreateSchedule}
              >
                Create Schedule
              </Button>
            )}
          </Box>
        }
      />

      <Paper sx={{ p: 3 }}>
        <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
          <Tabs value={tabValue} onChange={handleTabChange} aria-label="backup tabs">
            <Tab label="Backups" id="backup-tab-0" aria-controls="backup-tabpanel-0" />
            <Tab label="Schedules" id="backup-tab-1" aria-controls="backup-tabpanel-1" />
            <Tab label="Settings" id="backup-tab-2" aria-controls="backup-tabpanel-2" />
          </Tabs>
        </Box>

        <TabPanel value={tabValue} index={0}>
          {loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
              <CircularProgress />
            </Box>
          ) : (
            <BackupList backups={backups} />
          )}
        </TabPanel>

        <TabPanel value={tabValue} index={1}>
          {loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
              <CircularProgress />
            </Box>
          ) : (
            <BackupScheduleList schedules={schedules} />
          )}
        </TabPanel>

        <TabPanel value={tabValue} index={2}>
          <BackupSettingsPanel onCleanupComplete={() => refetchBackups()} />
        </TabPanel>
      </Paper>

      <CreateBackupDialog
        open={createBackupOpen}
        onClose={() => setCreateBackupOpen(false)}
      />

      <BackupScheduleDialog
        open={createScheduleOpen}
        onClose={() => setCreateScheduleOpen(false)}
      />

      <UploadBackupDialog
        open={uploadBackupOpen}
        onClose={() => setUploadBackupOpen(false)}
      />

      <Snackbar
        open={snackbarOpen}
        autoHideDuration={6000}
        onClose={handleSnackbarClose}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <Alert onClose={handleSnackbarClose} severity="error" sx={{ width: '100%' }}>
          {error}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default BackupManagement;
