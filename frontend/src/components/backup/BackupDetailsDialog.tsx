import React from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Box,
  Chip,
  Divider,
  Stack,
} from '@mui/material';
import { StatusChip } from '@/components/common/StatusChip';
import { useAppSelector } from '@/hooks/useRedux';
import { format } from 'date-fns';

interface BackupDetailsDialogProps {
  open: boolean;
  onClose: () => void;
}

const BackupDetailsDialog: React.FC<BackupDetailsDialogProps> = ({ open, onClose }) => {
  const { currentBackup } = useAppSelector((state) => state.backup);

  if (!currentBackup) return null;

  const formatBytes = (bytes: number | null) => {
    if (!bytes) return 'N/A';
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    if (bytes === 0) return '0 Bytes';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round((bytes / Math.pow(1024, i)) * 100) / 100 + ' ' + sizes[i];
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'N/A';
    try {
      return format(new Date(dateString), 'PPpp');
    } catch {
      return dateString;
    }
  };

  const duration =
    currentBackup.completedAt && currentBackup.startedAt
      ? Math.round(
          (new Date(currentBackup.completedAt).getTime() -
            new Date(currentBackup.startedAt).getTime()) /
            1000
        )
      : null;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>Backup Details</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 2 }}>
          <Box>
            <Typography variant="subtitle2" color="textSecondary" gutterBottom>
              Filename
            </Typography>
            <Typography
              variant="body1"
              sx={{ wordBreak: 'break-all' }}
            >
              {currentBackup.filename}
            </Typography>
          </Box>

          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
            <Box sx={{ flex: '1 1 200px' }}>
              <Typography variant="subtitle2" color="textSecondary" gutterBottom>
                Status
              </Typography>
              <StatusChip status={currentBackup.status} />
            </Box>

            <Box sx={{ flex: '1 1 200px' }}>
              <Typography variant="subtitle2" color="textSecondary" gutterBottom>
                Type
              </Typography>
              <Chip
                label={currentBackup.backupType}
                size="small"
                color={currentBackup.backupType === 'scheduled' ? 'primary' : 'default'}
              />
            </Box>
          </Box>

          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
            <Box sx={{ flex: '1 1 200px' }}>
              <Typography variant="subtitle2" color="textSecondary" gutterBottom>
                Size
              </Typography>
              <Typography variant="body1">{formatBytes(typeof currentBackup.size === 'number' ? currentBackup.size : Number(currentBackup.size))}</Typography>
            </Box>

            <Box sx={{ flex: '1 1 200px' }}>
              <Typography variant="subtitle2" color="textSecondary" gutterBottom>
                Duration
              </Typography>
              <Typography variant="body1">
                {duration ? `${duration} seconds` : 'N/A'}
              </Typography>
            </Box>
          </Box>

          <Divider sx={{ my: 1 }} />

          <Box>
            <Typography variant="subtitle2" color="textSecondary" gutterBottom>
              Databases Included
            </Typography>
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
              {currentBackup.databases.map((db) => (
                <Chip key={db} label={db} size="small" variant="outlined" />
              ))}
            </Box>
          </Box>

          <Divider sx={{ my: 1 }} />

          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
            <Box sx={{ flex: '1 1 200px' }}>
              <Typography variant="subtitle2" color="textSecondary" gutterBottom>
                Started At
              </Typography>
              <Typography variant="body1">{formatDate(currentBackup.startedAt)}</Typography>
            </Box>

            <Box sx={{ flex: '1 1 200px' }}>
              <Typography variant="subtitle2" color="textSecondary" gutterBottom>
                Completed At
              </Typography>
              <Typography variant="body1">{formatDate(currentBackup.completedAt)}</Typography>
            </Box>
          </Box>

          <Box>
            <Typography variant="subtitle2" color="textSecondary" gutterBottom>
              Created By
            </Typography>
            <Typography variant="body1">{currentBackup.createdBy}</Typography>
          </Box>

          <Divider sx={{ my: 1 }} />

          <Box>
            <Typography variant="subtitle2" color="textSecondary" gutterBottom>
              File Path
            </Typography>
            <Typography
              variant="body2"
              sx={{ wordBreak: 'break-all' }}
            >
              {currentBackup.filepath}
            </Typography>
          </Box>

          {currentBackup.metadata && (
            <>
              <Divider sx={{ my: 1 }} />
              <Box>
                <Typography variant="subtitle2" color="textSecondary" gutterBottom>
                  Metadata
                </Typography>
                <Box
                  sx={{
                    fontSize: '0.875rem',
                    backgroundColor: 'grey.100',
                    color: 'grey.900',
                    p: 2,
                    borderRadius: 1,
                    overflow: 'auto',
                    maxHeight: 200,
                  }}
                >
                  <pre style={{ margin: 0, color: 'inherit' }}>
                    {JSON.stringify(currentBackup.metadata, null, 2)}
                  </pre>
                </Box>
              </Box>
            </>
          )}

          {currentBackup.error && (
            <>
              <Divider sx={{ my: 1 }} />
              <Box>
                <Typography variant="subtitle2" color="error" gutterBottom>
                  Error Details
                </Typography>
                <Typography
                  variant="body2"
                  color="error"
                  sx={{
                    backgroundColor: 'error.light',
                    p: 2,
                    borderRadius: 1,
                  }}
                >
                  {currentBackup.error}
                </Typography>
              </Box>
            </>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
};

export default BackupDetailsDialog;
