import React, { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  FormControlLabel,
  Checkbox,
  TextField,
  Box,
  Typography,
} from '@mui/material';
import { useCreateBackupMutation } from '@/store/api/backupApi';

interface CreateBackupDialogProps {
  open: boolean;
  onClose: () => void;
}

const CreateBackupDialog: React.FC<CreateBackupDialogProps> = ({ open, onClose }) => {
  const [createBackup] = useCreateBackupMutation();
  const [includeSettings, setIncludeSettings] = useState(true);
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    setLoading(true);
    try {
      await createBackup({
        backupType: 'manual',
        databases: ['postgresql'],
        includeSettings,
        description: description || undefined,
        createdBy: 'system',
      }).unwrap();

      // Reset form and close
      setIncludeSettings(true);
      setDescription('');
      onClose();
    } catch (error) {
      console.error('Failed to create backup:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    if (!loading) {
      setIncludeSettings(true);
      setDescription('');
      onClose();
    }
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>Create Manual Backup</DialogTitle>
      <DialogContent>
        <Box sx={{ pt: 2 }}>
          <Typography variant="body2" color="textSecondary" sx={{ mb: 3 }}>
            This will create a full backup of your PostgreSQL database including all business data (products, sales, customers, suppliers, etc.).
          </Typography>

          <FormControlLabel
            control={
              <Checkbox
                checked={includeSettings}
                onChange={(e) => setIncludeSettings(e.target.checked)}
              />
            }
            label="Include System Settings"
            sx={{ mb: 2 }}
          />

          <TextField
            fullWidth
            multiline
            rows={3}
            label="Description (Optional)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Enter a description for this backup..."
            helperText="Add notes about why this backup was created"
          />
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} disabled={loading}>
          Cancel
        </Button>
        <Button
          onClick={handleSubmit}
          variant="contained"
          color="primary"
          disabled={loading}
        >
          {loading ? 'Creating...' : 'Create Backup'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default CreateBackupDialog;
