import React, { useEffect, useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  FormControl,
  FormControlLabel,
  Checkbox,
  Select,
  MenuItem,
  InputLabel,
  Box,
  Stack,
  Typography,
} from '@mui/material';
import { useAppDispatch, useAppSelector } from '@/hooks/useRedux';
import {
  createSchedule,
  updateSchedule,
  fetchSchedules,
} from '@/store/slices/backupSlice';

interface BackupScheduleDialogProps {
  open: boolean;
  onClose: () => void;
}

const BackupScheduleDialog: React.FC<BackupScheduleDialogProps> = ({ open, onClose }) => {
  const dispatch = useAppDispatch();
  const { currentSchedule } = useAppSelector((state) => state.backup);
  const isEditMode = !!currentSchedule;

  const [formData, setFormData] = useState({
    name: '',
    frequency: 'daily' as 'hourly' | 'daily' | 'weekly' | 'monthly',
    time: '02:00',
    dayOfWeek: 0,
    dayOfMonth: 1,
    includeSettings: true,
    retentionDays: 30,
    enabled: false,
  });

  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (currentSchedule) {
      setFormData({
        name: currentSchedule.name,
        frequency: currentSchedule.frequency,
        time: currentSchedule.time,
        dayOfWeek: currentSchedule.dayOfWeek ?? 0,
        dayOfMonth: currentSchedule.dayOfMonth ?? 1,
        includeSettings: currentSchedule.includeSettings,
        retentionDays: currentSchedule.retentionDays,
        enabled: currentSchedule.enabled,
      });
    } else {
      setFormData({
        name: '',
        frequency: 'daily',
        time: '02:00',
        dayOfWeek: 0,
        dayOfMonth: 1,
        includeSettings: true,
        retentionDays: 30,
        enabled: false,
      });
    }
  }, [currentSchedule]);

  const handleSubmit = async () => {
    setLoading(true);
    try {
      const scheduleData = {
        name: formData.name,
        frequency: formData.frequency,
        time: formData.time,
        dayOfWeek: formData.frequency === 'weekly' ? formData.dayOfWeek : undefined,
        dayOfMonth: formData.frequency === 'monthly' ? formData.dayOfMonth : undefined,
        databases: ['postgresql'],
        includeSettings: formData.includeSettings,
        retentionDays: formData.retentionDays,
        enabled: formData.enabled,
        createdBy: 'system',
      };

      if (isEditMode && currentSchedule) {
        await dispatch(
          updateSchedule({
            id: currentSchedule.id,
            dto: scheduleData,
          })
        ).unwrap();
      } else {
        await dispatch(createSchedule(scheduleData)).unwrap();
      }

      // Refresh the schedule list
      await dispatch(fetchSchedules());

      onClose();
    } catch (error) {
      console.error('Failed to save schedule:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    if (!loading) {
      onClose();
    }
  };

  const isValid = formData.name.trim() !== '';

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="md" fullWidth>
      <DialogTitle>
        {isEditMode ? 'Edit Backup Schedule' : 'Create Backup Schedule'}
      </DialogTitle>
      <DialogContent>
        <Stack spacing={3} sx={{ pt: 2 }}>
          <TextField
            fullWidth
            required
            label="Schedule Name"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            placeholder="e.g., Daily Production Backup"
          />

          <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
            <Box sx={{ flex: '1 1 200px' }}>
              <FormControl fullWidth>
                <InputLabel>Frequency</InputLabel>
                <Select
                  value={formData.frequency}
                  label="Frequency"
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      frequency: e.target.value as any,
                    })
                  }
                >
                  <MenuItem value="hourly">Hourly</MenuItem>
                  <MenuItem value="daily">Daily</MenuItem>
                  <MenuItem value="weekly">Weekly</MenuItem>
                  <MenuItem value="monthly">Monthly</MenuItem>
                </Select>
              </FormControl>
            </Box>

            <Box sx={{ flex: '1 1 200px' }}>
              <TextField
                fullWidth
                required
                type="time"
                label="Time"
                value={formData.time}
                onChange={(e) => setFormData({ ...formData, time: e.target.value })}
                slotProps={{ inputLabel: { shrink: true } }}
              />
            </Box>
          </Box>

          {formData.frequency === 'weekly' && (
            <Box sx={{ flex: '1 1 200px' }}>
              <FormControl fullWidth>
                <InputLabel>Day of Week</InputLabel>
                <Select
                  value={formData.dayOfWeek}
                  label="Day of Week"
                  onChange={(e) =>
                    setFormData({ ...formData, dayOfWeek: e.target.value as number })
                  }
                >
                  <MenuItem value={0}>Sunday</MenuItem>
                  <MenuItem value={1}>Monday</MenuItem>
                  <MenuItem value={2}>Tuesday</MenuItem>
                  <MenuItem value={3}>Wednesday</MenuItem>
                  <MenuItem value={4}>Thursday</MenuItem>
                  <MenuItem value={5}>Friday</MenuItem>
                  <MenuItem value={6}>Saturday</MenuItem>
                </Select>
              </FormControl>
            </Box>
          )}

          {formData.frequency === 'monthly' && (
            <Box sx={{ flex: '1 1 200px' }}>
              <TextField
                fullWidth
                required
                type="number"
                label="Day of Month"
                value={formData.dayOfMonth}
                onChange={(e) =>
                  setFormData({ ...formData, dayOfMonth: parseInt(e.target.value) })
                }
                slotProps={{ htmlInput: { min: 1, max: 31 } }}
              />
            </Box>
          )}

          <Typography variant="body2" color="textSecondary">
            This schedule will backup your PostgreSQL database including all business data.
          </Typography>

          <FormControlLabel
            control={
              <Checkbox
                checked={formData.includeSettings}
                onChange={(e) =>
                  setFormData({ ...formData, includeSettings: e.target.checked })
                }
              />
            }
            label="Include System Settings"
          />

          <Box sx={{ flex: '1 1 200px' }}>
            <TextField
              fullWidth
              required
              type="number"
              label="Retention Days"
              value={formData.retentionDays}
              onChange={(e) =>
                setFormData({ ...formData, retentionDays: parseInt(e.target.value) })
              }
              slotProps={{ htmlInput: { min: 1, max: 365 } }}
              helperText="Automatically delete backups older than this"
            />
          </Box>

          <FormControlLabel
            control={
              <Checkbox
                checked={formData.enabled}
                onChange={(e) => setFormData({ ...formData, enabled: e.target.checked })}
              />
            }
            label="Enable Schedule Immediately"
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} disabled={loading}>
          Cancel
        </Button>
        <Button
          onClick={handleSubmit}
          variant="contained"
          color="primary"
          disabled={!isValid || loading}
        >
          {loading ? 'Saving...' : isEditMode ? 'Update Schedule' : 'Create Schedule'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default BackupScheduleDialog;
