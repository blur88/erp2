import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import backupService, {
  BackupLog,
  BackupSchedule,
  CreateBackupDto,
  RestoreBackupDto,
  CreateScheduleDto,
  UpdateScheduleDto,
} from '../../services/backupService';

interface BackupState {
  backups: BackupLog[];
  schedules: BackupSchedule[];
  currentBackup: BackupLog | null;
  currentSchedule: BackupSchedule | null;
  loading: boolean;
  error: string | null;
  restoreInProgress: boolean;
  backupInProgress: boolean;
}

const initialState: BackupState = {
  backups: [],
  schedules: [],
  currentBackup: null,
  currentSchedule: null,
  loading: false,
  error: null,
  restoreInProgress: false,
  backupInProgress: false,
};

// Backup thunks
export const createBackup = createAsyncThunk(
  'backup/create',
  async (dto: CreateBackupDto, { rejectWithValue }) => {
    try {
      return await backupService.createBackup(dto);
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to create backup');
    }
  }
);

export const fetchBackups = createAsyncThunk(
  'backup/fetchAll',
  async (_, { rejectWithValue }) => {
    try {
      return await backupService.listBackups();
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to fetch backups');
    }
  }
);

export const restoreBackup = createAsyncThunk(
  'backup/restore',
  async ({ id, dto }: { id: string; dto: RestoreBackupDto }, { rejectWithValue }) => {
    try {
      return await backupService.restoreBackup(id, dto);
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to restore backup');
    }
  }
);

export const deleteBackup = createAsyncThunk(
  'backup/delete',
  async (id: string, { rejectWithValue }) => {
    try {
      await backupService.deleteBackup(id);
      return id;
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to delete backup');
    }
  }
);

// Schedule thunks
export const createSchedule = createAsyncThunk(
  'backup/createSchedule',
  async (dto: CreateScheduleDto, { rejectWithValue }) => {
    try {
      return await backupService.createSchedule(dto);
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to create schedule');
    }
  }
);

export const fetchSchedules = createAsyncThunk(
  'backup/fetchSchedules',
  async (_, { rejectWithValue }) => {
    try {
      return await backupService.listSchedules();
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to fetch schedules');
    }
  }
);

export const updateSchedule = createAsyncThunk(
  'backup/updateSchedule',
  async ({ id, dto }: { id: string; dto: UpdateScheduleDto }, { rejectWithValue }) => {
    try {
      return await backupService.updateSchedule(id, dto);
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to update schedule');
    }
  }
);

export const deleteSchedule = createAsyncThunk(
  'backup/deleteSchedule',
  async (id: string, { rejectWithValue }) => {
    try {
      await backupService.deleteSchedule(id);
      return id;
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to delete schedule');
    }
  }
);

export const toggleSchedule = createAsyncThunk(
  'backup/toggleSchedule',
  async ({ id, enabled }: { id: string; enabled: boolean }, { rejectWithValue }) => {
    try {
      return await backupService.toggleSchedule(id, enabled);
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to toggle schedule');
    }
  }
);

export const triggerSchedule = createAsyncThunk(
  'backup/triggerSchedule',
  async (id: string, { rejectWithValue }) => {
    try {
      await backupService.triggerSchedule(id);
      return id;
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to trigger schedule');
    }
  }
);

const backupSlice = createSlice({
  name: 'backup',
  initialState,
  reducers: {
    clearError: (state) => {
      state.error = null;
    },
    setCurrentBackup: (state, action: PayloadAction<BackupLog | null>) => {
      state.currentBackup = action.payload;
    },
    setCurrentSchedule: (state, action: PayloadAction<BackupSchedule | null>) => {
      state.currentSchedule = action.payload;
    },
  },
  extraReducers: (builder) => {
    // Create backup
    builder
      .addCase(createBackup.pending, (state) => {
        state.backupInProgress = true;
        state.error = null;
      })
      .addCase(createBackup.fulfilled, (state, action) => {
        state.backupInProgress = false;
        if (state.backups) {
          state.backups.unshift(action.payload);
        } else {
          state.backups = [action.payload];
        }
      })
      .addCase(createBackup.rejected, (state, action) => {
        state.backupInProgress = false;
        state.error = action.payload as string;
      });

    // Fetch backups
    builder
      .addCase(fetchBackups.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchBackups.fulfilled, (state, action) => {
        state.loading = false;
        state.backups = action.payload;
      })
      .addCase(fetchBackups.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      });

    // Restore backup
    builder
      .addCase(restoreBackup.pending, (state) => {
        state.restoreInProgress = true;
        state.error = null;
      })
      .addCase(restoreBackup.fulfilled, (state) => {
        state.restoreInProgress = false;
      })
      .addCase(restoreBackup.rejected, (state, action) => {
        state.restoreInProgress = false;
        state.error = action.payload as string;
      });

    // Delete backup
    builder
      .addCase(deleteBackup.fulfilled, (state, action) => {
        state.backups = state.backups.filter((b) => b.id !== action.payload);
      })
      .addCase(deleteBackup.rejected, (state, action) => {
        state.error = action.payload as string;
      });

    // Fetch schedules
    builder
      .addCase(fetchSchedules.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchSchedules.fulfilled, (state, action) => {
        state.loading = false;
        state.schedules = action.payload;
      })
      .addCase(fetchSchedules.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      });

    // Create schedule
    builder
      .addCase(createSchedule.fulfilled, (state, action) => {
        if (state.schedules) {
          state.schedules.unshift(action.payload);
        } else {
          state.schedules = [action.payload];
        }
      })
      .addCase(createSchedule.rejected, (state, action) => {
        state.error = action.payload as string;
      });

    // Update schedule
    builder
      .addCase(updateSchedule.fulfilled, (state, action) => {
        const index = state.schedules.findIndex((s) => s.id === action.payload.id);
        if (index !== -1) {
          state.schedules[index] = action.payload;
        }
      })
      .addCase(updateSchedule.rejected, (state, action) => {
        state.error = action.payload as string;
      });

    // Delete schedule
    builder
      .addCase(deleteSchedule.fulfilled, (state, action) => {
        state.schedules = state.schedules.filter((s) => s.id !== action.payload);
      })
      .addCase(deleteSchedule.rejected, (state, action) => {
        state.error = action.payload as string;
      });

    // Toggle schedule
    builder
      .addCase(toggleSchedule.fulfilled, (state, action) => {
        const index = state.schedules.findIndex((s) => s.id === action.payload.id);
        if (index !== -1) {
          state.schedules[index] = action.payload;
        }
      })
      .addCase(toggleSchedule.rejected, (state, action) => {
        state.error = action.payload as string;
      });

    // Trigger schedule
    builder
      .addCase(triggerSchedule.fulfilled, (state) => {
        // Optionally refresh backups list
      })
      .addCase(triggerSchedule.rejected, (state, action) => {
        state.error = action.payload as string;
      });
  },
});

export const { clearError, setCurrentBackup, setCurrentSchedule } = backupSlice.actions;
export default backupSlice.reducer;
