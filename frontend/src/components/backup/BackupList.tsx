import React, { useState } from 'react';
import {
  Box,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  IconButton,
  Chip,
  Typography,
  Tooltip,
  TablePagination,
} from '@mui/material';
import { default as DownloadIcon } from '@mui/icons-material/Download'
import { default as RestoreIcon } from '@mui/icons-material/Restore'
import { default as DeleteIcon } from '@mui/icons-material/Delete'
import { default as InfoIcon } from '@mui/icons-material/Info';
import { useAppDispatch } from '@/hooks/useRedux';
import { StatusChip } from '@/components/common/StatusChip';
import type { BackupLog } from '@/store/api/backupApi';
import { useDeleteBackupMutation } from '@/store/api/backupApi';
import { setCurrentBackup } from '@/store/slices/backupSlice';
import { ApiService } from '@/services/api';
import RestoreConfirmationDialog from './RestoreConfirmationDialog';
import BackupDetailsDialog from './BackupDetailsDialog';
import { format } from 'date-fns';

interface BackupListProps {
  backups: BackupLog[]
}

const BackupList: React.FC<BackupListProps> = ({ backups }) => {
  const dispatch = useAppDispatch();
  const [deleteBackup] = useDeleteBackupMutation();
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [restoreDialogOpen, setRestoreDialogOpen] = useState(false);
  const [detailsDialogOpen, setDetailsDialogOpen] = useState(false);

  const handleChangePage = (_event: unknown, newPage: number) => {
    setPage(newPage);
  };

  const handleChangeRowsPerPage = (event: React.ChangeEvent<HTMLInputElement>) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  };

  const handleDownload = async (id: string, filename: string) => {
    try {
      await ApiService.downloadFile(`/backup/download/${id}`, filename);
    } catch (error) {
      console.error('Download failed:', error);
    }
  };

  const handleRestore = (backup: BackupLog) => {
    dispatch(setCurrentBackup(backup));
    setRestoreDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (window.confirm('Are you sure you want to delete this backup? This action cannot be undone.')) {
      await deleteBackup(id);
    }
  };

  const handleViewDetails = (backup: BackupLog) => {
    dispatch(setCurrentBackup(backup));
    setDetailsDialogOpen(true);
  };

  const formatBytes = (bytes: number | null) => {
    if (!bytes) return 'N/A';
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    if (bytes === 0) return '0 Bytes';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round((bytes / Math.pow(1024, i)) * 100) / 100 + ' ' + sizes[i];
  };

  const formatDate = (dateString: string) => {
    try {
      return format(new Date(dateString), 'MMM dd, yyyy HH:mm:ss');
    } catch {
      return dateString;
    }
  };

  const paginatedBackups = (backups || [])
    .filter((backup) => backup != null)
    .slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage);

  return (
    <>
      <TableContainer>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Filename</TableCell>
              <TableCell>Type</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Size</TableCell>
              <TableCell>Databases</TableCell>
              <TableCell>Created</TableCell>
              <TableCell>Created By</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {paginatedBackups.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} align="center">
                  <Typography variant="body2" color="textSecondary" sx={{ py: 4 }}>
                    No backups found. Create your first backup to get started.
                  </Typography>
                </TableCell>
              </TableRow>
            ) : (
              paginatedBackups.map((backup) => (
                <TableRow key={backup.id} hover>
                  <TableCell>
                    <Typography variant="body2">
                      {backup.filename}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={backup.backupType}
                      size="small"
                      color={backup.backupType === 'scheduled' ? 'primary' : 'default'}
                    />
                  </TableCell>
                  <TableCell>
                    <StatusChip status={backup.status} />
                  </TableCell>
                  <TableCell>{formatBytes(typeof backup.size === 'string' ? parseInt(backup.size, 10) : backup.size)}</TableCell>
                  <TableCell>
                    <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                      {backup.databases.map((db: string) => (
                        <Chip key={db} label={db} size="small" variant="outlined" />
                      ))}
                    </Box>
                  </TableCell>
                  <TableCell>{formatDate(backup.startedAt)}</TableCell>
                  <TableCell>{backup.createdBy}</TableCell>
                  <TableCell align="right">
                    <Tooltip title="View Details">
                      <IconButton
                        size="small"
                        onClick={() => handleViewDetails(backup)}
                      >
                        <InfoIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Download">
                      <IconButton
                        size="small"
                        onClick={() => handleDownload(backup.id, backup.filename)}
                        disabled={backup.status !== 'completed'}
                      >
                        <DownloadIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Restore">
                      <IconButton
                        size="small"
                        onClick={() => handleRestore(backup)}
                        disabled={backup.status !== 'completed'}
                      >
                        <RestoreIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Delete">
                      <IconButton
                        size="small"
                        onClick={() => handleDelete(backup.id)}
                        color="error"
                      >
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>

      <TablePagination
        rowsPerPageOptions={[5, 10, 25, 50]}
        component="div"
        count={backups?.length || 0}
        rowsPerPage={rowsPerPage}
        page={page}
        onPageChange={handleChangePage}
        onRowsPerPageChange={handleChangeRowsPerPage}
      />

      <RestoreConfirmationDialog
        open={restoreDialogOpen}
        onClose={() => setRestoreDialogOpen(false)}
      />

      <BackupDetailsDialog
        open={detailsDialogOpen}
        onClose={() => setDetailsDialogOpen(false)}
      />
    </>
  );
};

export default BackupList;
