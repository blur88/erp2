import React, { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Typography,
  Alert,
  Box,
  List,
  ListItem,
  ListItemText,
} from '@mui/material';
import { default as WarningIcon } from '@mui/icons-material/Warning';
import { useAppSelector } from '@/hooks/useRedux';
import { formatDateTime } from '@/utils/formatters';
import { useRestoreBackupMutation } from '@/store/api/backupApi';

interface RestoreConfirmationDialogProps {
  open: boolean;
  onClose: () => void;
}

const RestoreConfirmationDialog: React.FC<RestoreConfirmationDialogProps> = ({
  open,
  onClose,
}) => {
  const { currentBackup } = useAppSelector((state) => state.backup);
  const [restoreBackup, { isLoading: restoreInProgress }] = useRestoreBackupMutation();
  const [confirmText, setConfirmText] = useState('');
  const [note, setNote] = useState('');

  const handleRestore = async () => {
    if (!currentBackup) return;

    try {
      await restoreBackup({
        id: currentBackup.id,
        dto: {
          confirmed: true,
          restoredBy: 'system',
          note: note || undefined,
        },
      }).unwrap();

      // Reset and close
      setConfirmText('');
      setNote('');
      onClose();
    } catch (error) {
      console.error('Failed to restore backup:', error);
    }
  };

  const handleClose = (_event?: object, reason?: 'backdropClick' | 'escapeKeyDown') => {
    if (!restoreInProgress && reason !== 'escapeKeyDown') {
      setConfirmText('');
      setNote('');
      onClose();
    }
  };

  const isValid = confirmText === 'RESTORE';

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth="sm"
      fullWidth
    >
      <DialogTitle>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <WarningIcon color="error" />
          Restore Database Backup
        </Box>
      </DialogTitle>
      <DialogContent>
        <Alert severity="error" sx={{ mb: 3 }}>
          <Typography variant="body2" gutterBottom sx={{
            fontWeight: "bold"
          }}>
            WARNING: This action will overwrite your current data!
          </Typography>
          <Typography variant="body2">
            Restoring this backup will replace all current data in the selected databases. This
            action cannot be undone.
          </Typography>
        </Alert>

        {currentBackup && (
          <Box sx={{ mb: 3 }}>
            <Typography variant="subtitle2" gutterBottom>
              Backup Details:
            </Typography>
            <List dense>
              <ListItem>
                <ListItemText
                  primary="Filename"
                  secondary={currentBackup.filename}
                />
              </ListItem>
              <ListItem>
                <ListItemText
                  primary="Created"
                  secondary={formatDateTime(currentBackup.startedAt)}
                />
              </ListItem>
              <ListItem>
                <ListItemText
                  primary="Databases"
                  secondary={currentBackup.databases.join(', ')}
                />
              </ListItem>
              <ListItem>
                <ListItemText primary="Created By" secondary={currentBackup.createdBy} />
              </ListItem>
            </List>
          </Box>
        )}

        <Box sx={{ mb: 2 }}>
          <Typography variant="body2" color="error" gutterBottom>
            The following will be affected:
          </Typography>
          <List dense>
            {currentBackup?.databases.includes('postgresql') && (
              <ListItem>
                <ListItemText
                  primary="• PostgreSQL Database"
                  secondary="All business data (products, sales, customers, etc.) will be replaced"
                />
              </ListItem>
            )}
            {currentBackup?.databases.includes('redis') && (
              <ListItem>
                <ListItemText
                  primary="• Redis Cache"
                  secondary="Cache and queue data will be cleared and replaced"
                />
              </ListItem>
            )}
          </List>
        </Box>

        <TextField
          fullWidth
          multiline
          rows={2}
          label="Restore Note (Optional)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Enter a reason for this restore..."
          sx={{ mb: 2 }}
          disabled={restoreInProgress}
        />

        <TextField
          fullWidth
          required
          label="Type 'RESTORE' to confirm"
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value.toUpperCase())}
          placeholder="RESTORE"
          error={confirmText.length > 0 && confirmText !== 'RESTORE'}
          helperText="You must type RESTORE (in capital letters) to proceed"
          disabled={restoreInProgress}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} disabled={restoreInProgress}>
          Cancel
        </Button>
        <Button
          onClick={handleRestore}
          variant="contained"
          color="error"
          disabled={!isValid || restoreInProgress}
        >
          {restoreInProgress ? 'Restoring...' : 'Restore Backup'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default RestoreConfirmationDialog;
