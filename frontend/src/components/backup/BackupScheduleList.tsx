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
  Switch,
} from '@mui/material';
import {
  Edit as EditIcon,
  Delete as DeleteIcon,
  PlayArrow as PlayIcon,
} from '@mui/icons-material';
import { useAppDispatch } from '@/hooks/useRedux';
import type { BackupSchedule } from '@/store/api/backupApi';
import {
  useDeleteScheduleMutation,
  useToggleScheduleMutation,
  useTriggerScheduleMutation,
} from '@/store/api/backupApi';
import {
  setCurrentSchedule,
} from '@/store/slices/backupSlice';
import BackupScheduleDialog from './BackupScheduleDialog';
import { format } from 'date-fns';

interface BackupScheduleListProps {
  schedules: BackupSchedule[]
}

const BackupScheduleList: React.FC<BackupScheduleListProps> = ({ schedules }) => {
  const dispatch = useAppDispatch();
  const [deleteSchedule] = useDeleteScheduleMutation();
  const [toggleSchedule] = useToggleScheduleMutation();
  const [triggerSchedule] = useTriggerScheduleMutation();
  const [editDialogOpen, setEditDialogOpen] = useState(false);

  const handleToggle = async (id: string, enabled: boolean) => {
    await toggleSchedule({ id, enabled: !enabled });
  };

  const handleTrigger = async (id: string) => {
    if (window.confirm('Are you sure you want to trigger this backup schedule now?')) {
      await triggerSchedule(id);
    }
  };

  const handleEdit = (schedule: BackupSchedule) => {
    dispatch(setCurrentSchedule(schedule));
    setEditDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (window.confirm('Are you sure you want to delete this schedule?')) {
      await deleteSchedule(id);
    }
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'Never';
    try {
      return format(new Date(dateString), 'MMM dd, yyyy HH:mm');
    } catch {
      return dateString;
    }
  };

  const getFrequencyColor = (frequency: string) => {
    switch (frequency) {
      case 'hourly':
        return 'error';
      case 'daily':
        return 'primary';
      case 'weekly':
        return 'success';
      case 'monthly':
        return 'warning';
      default:
        return 'default';
    }
  };

  return (
    <>
      <TableContainer>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Name</TableCell>
              <TableCell>Frequency</TableCell>
              <TableCell>Time</TableCell>
              <TableCell>Databases</TableCell>
              <TableCell>Retention (Days)</TableCell>
              <TableCell>Last Run</TableCell>
              <TableCell>Next Run</TableCell>
              <TableCell>Enabled</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {!schedules || schedules.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} align="center">
                  <Typography variant="body2" color="textSecondary" sx={{ py: 4 }}>
                    No schedules configured. Create a schedule to automate backups.
                  </Typography>
                </TableCell>
              </TableRow>
            ) : (
              schedules.filter((schedule) => schedule != null).map((schedule) => (
                <TableRow key={schedule.id} hover>
                  <TableCell>
                    <Typography variant="body2" fontWeight="medium">
                      {schedule.name}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={schedule.frequency}
                      size="small"
                      color={getFrequencyColor(schedule.frequency) as any}
                    />
                  </TableCell>
                  <TableCell>{schedule.time}</TableCell>
                  <TableCell>
                    <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                      {schedule.databases.map((db: string) => (
                        <Chip key={db} label={db} size="small" variant="outlined" />
                      ))}
                    </Box>
                  </TableCell>
                  <TableCell>{schedule.retentionDays}</TableCell>
                  <TableCell>{formatDate(schedule.lastRunAt)}</TableCell>
                  <TableCell>{formatDate(schedule.nextRunAt)}</TableCell>
                  <TableCell>
                    <Switch
                      checked={schedule.enabled}
                      onChange={() => handleToggle(schedule.id, schedule.enabled)}
                      color="primary"
                    />
                  </TableCell>
                  <TableCell align="right">
                    <Tooltip title="Trigger Now">
                      <IconButton
                        size="small"
                        onClick={() => handleTrigger(schedule.id)}
                        disabled={!schedule.enabled}
                        color="primary"
                      >
                        <PlayIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Edit">
                      <IconButton
                        size="small"
                        onClick={() => handleEdit(schedule)}
                      >
                        <EditIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Delete">
                      <IconButton
                        size="small"
                        onClick={() => handleDelete(schedule.id)}
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

      <BackupScheduleDialog
        open={editDialogOpen}
        onClose={() => {
          setEditDialogOpen(false);
          dispatch(setCurrentSchedule(null));
        }}
      />
    </>
  );
};

export default BackupScheduleList;
