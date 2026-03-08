import React, { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  LinearProgress,
  Alert,
  Paper,
} from '@mui/material';
import {
  CloudUpload as UploadIcon,
  CheckCircle as CheckIcon,
} from '@mui/icons-material';
import { useUploadBackupMutation } from '@/store/api/backupApi';

interface UploadBackupDialogProps {
  open: boolean;
  onClose: () => void;
}

const UploadBackupDialog: React.FC<UploadBackupDialogProps> = ({ open, onClose }) => {
  const [uploadBackup, { isLoading: backupInProgress }] = useUploadBackupMutation();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      validateAndSetFile(file);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) return;

    setUploadSuccess(false);
    setUploadError(null);

    try {
      await uploadBackup(selectedFile).unwrap();
      setUploadSuccess(true);
      setTimeout(() => {
        handleClose();
      }, 1500);
    } catch (error: any) {
      setUploadError(error || 'Failed to upload backup');
    }
  };

  const handleClose = () => {
    setSelectedFile(null);
    setUploadSuccess(false);
    setUploadError(null);
    onClose();
  };

  const validateAndSetFile = (file: File) => {
    if (file.name.endsWith('.tar.gz') || file.name.endsWith('.tgz')) {
      setSelectedFile(file);
      setUploadError(null);
    } else {
      setUploadError('Please select a valid backup file (.tar.gz or .tgz)');
      setSelectedFile(null);
    }
  };

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragActive(true);
  };

  const handleDragLeave = () => {
    setDragActive(false);
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragActive(false);
    const file = event.dataTransfer?.files?.[0];
    if (file) {
      validateAndSetFile(file);
    }
  };

  const formatFileSize = (bytes: number) => {
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    if (bytes === 0) return '0 Bytes';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round((bytes / Math.pow(1024, i)) * 100) / 100 + ' ' + sizes[i];
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>Upload Backup File</DialogTitle>
      <DialogContent>
        <Box sx={{ mt: 2 }}>
          {uploadSuccess ? (
            <Alert severity="success" icon={<CheckIcon />}>
              Backup uploaded successfully! The file has been added to your backup list.
            </Alert>
          ) : (
            <>
              <Typography variant="body2" color="textSecondary" sx={{ mb: 2 }}>
                Upload a previously downloaded backup file (.tar.gz or .tgz) to restore your data.
              </Typography>

              {uploadError && (
                <Alert severity="error" sx={{ mb: 2 }}>
                  {uploadError}
                </Alert>
              )}

              <Paper
                variant="outlined"
                data-drag-active={String(dragActive)}
                sx={{
                  p: 3,
                  textAlign: 'center',
                  cursor: 'pointer',
                  bgcolor: dragActive ? 'primary.light' : selectedFile ? 'action.hover' : 'background.paper',
                  border: dragActive ? 2 : 1,
                  borderColor: dragActive ? 'primary.main' : 'divider',
                  '&:hover': {
                    bgcolor: 'action.hover',
                  },
                }}
                onClick={() => document.getElementById('backup-file-input')?.click()}
                onDragOver={handleDragOver}
                onDragEnter={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
              >
                <input
                  id="backup-file-input"
                  type="file"
                  accept=".tar.gz,.tgz"
                  style={{ display: 'none' }}
                  onChange={handleFileSelect}
                />

                <UploadIcon sx={{ fontSize: 48, color: 'primary.main', mb: 1 }} />

                {selectedFile ? (
                  <Box>
                    <Typography variant="body1" sx={{ fontWeight: 'medium' }}>
                      {selectedFile.name}
                    </Typography>
                    <Typography variant="body2" color="textSecondary">
                      {formatFileSize(selectedFile.size)}
                    </Typography>
                  </Box>
                ) : (
                  <Box>
                    <Typography variant="body1" sx={{ mb: 1 }}>
                      Click to select a backup file
                    </Typography>
                    <Typography variant="body2" color="textSecondary">
                      or drag and drop here
                    </Typography>
                  </Box>
                )}
              </Paper>

              {backupInProgress && (
                <Box sx={{ mt: 2 }}>
                  <Typography variant="body2" color="textSecondary" sx={{ mb: 1 }}>
                    Uploading and processing backup file...
                  </Typography>
                  <LinearProgress />
                </Box>
              )}
            </>
          )}
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} disabled={backupInProgress}>
          {uploadSuccess ? 'Close' : 'Cancel'}
        </Button>
        {!uploadSuccess && (
          <Button
            onClick={handleUpload}
            variant="contained"
            color="primary"
            disabled={!selectedFile || backupInProgress}
            startIcon={<UploadIcon />}
          >
            {backupInProgress ? 'Uploading...' : 'Upload'}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
};

export default UploadBackupDialog;
