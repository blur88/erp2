import { ApiService } from './api';

export interface BackupLog {
  id: string;
  filename: string;
  filepath: string;
  backupType: 'manual' | 'scheduled';
  status: 'in_progress' | 'completed' | 'failed';
  size: number | null;
  databases: string[];
  startedAt: string;
  completedAt: string | null;
  createdBy: string;
  metadata: any;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BackupSchedule {
  id: string;
  name: string;
  frequency: 'hourly' | 'daily' | 'weekly' | 'monthly';
  cronExpression: string | null;
  time: string;
  dayOfWeek: number | null;
  dayOfMonth: number | null;
  databases: string[];
  includeSettings: boolean;
  retentionDays: number;
  enabled: boolean;
  lastRunAt: string | null;
  nextRunAt: string | null;
  createdBy: string;
  notifications: {
    enabled: boolean;
    email?: string;
    onSuccess?: boolean;
    onFailure?: boolean;
  } | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateBackupDto {
  backupType?: 'manual' | 'scheduled';
  databases?: string[];
  includeSettings?: boolean;
  createdBy?: string;
  description?: string;
}

export interface RestoreBackupDto {
  confirmed: boolean;
  restoredBy?: string;
  note?: string;
}

export interface CreateScheduleDto {
  name: string;
  frequency: 'hourly' | 'daily' | 'weekly' | 'monthly';
  cronExpression?: string;
  time: string;
  dayOfWeek?: number;
  dayOfMonth?: number;
  databases: string[];
  includeSettings?: boolean;
  retentionDays?: number;
  enabled?: boolean;
  createdBy?: string;
  notifications?: {
    enabled: boolean;
    email?: string;
    onSuccess?: boolean;
    onFailure?: boolean;
  };
}

export interface UpdateScheduleDto extends Partial<CreateScheduleDto> {}

class BackupService {
  // Backup operations
  async createBackup(dto: CreateBackupDto) {
    // ApiService.post() already returns response.data
    return await ApiService.post<BackupLog>('/backup/create', dto);
  }

  async listBackups() {
    // ApiService.get() already returns response.data, so 'response' here is the actual data
    const data = await ApiService.get<BackupLog[] | Record<string, BackupLog>>('/backup/list');

    // Handle null/undefined
    if (!data) {
      return [];
    }

    // Already an array
    if (Array.isArray(data)) {
      return data;
    }

    // Convert object to array (backend sometimes returns object with numeric keys)
    if (typeof data === 'object') {
      return Object.values(data).filter((item) => item != null);
    }

    console.error('Unexpected backup list format:', data);
    return [];
  }

  async getBackup(id: string) {
    return await ApiService.get<BackupLog>(`/backup/${id}`);
  }

  async downloadBackup(id: string, filename: string) {
    await ApiService.downloadFile(`/backup/download/${id}`, filename);
  }

  async restoreBackup(id: string, dto: RestoreBackupDto) {
    return await ApiService.post<{ message: string; backup: BackupLog }>(
      `/backup/restore/${id}`,
      dto
    );
  }

  async deleteBackup(id: string) {
    return await ApiService.delete<{ message: string }>(`/backup/${id}`);
  }

  // Schedule operations
  async createSchedule(dto: CreateScheduleDto) {
    return await ApiService.post<BackupSchedule>('/backup/schedule', dto);
  }

  async listSchedules() {
    const data = await ApiService.get<BackupSchedule[] | Record<string, BackupSchedule>>('/backup/schedule/list');

    // Handle null/undefined
    if (!data) {
      return [];
    }

    // Already an array
    if (Array.isArray(data)) {
      return data;
    }

    // Convert object to array (backend sometimes returns object with numeric keys)
    if (typeof data === 'object') {
      return Object.values(data).filter((item) => item != null);
    }

    console.error('Unexpected schedule list format:', data);
    return [];
  }

  async getSchedule(id: string) {
    return await ApiService.get<BackupSchedule>(`/backup/schedule/${id}`);
  }

  async updateSchedule(id: string, dto: UpdateScheduleDto) {
    return await ApiService.post<BackupSchedule>(`/backup/schedule/${id}`, dto);
  }

  async deleteSchedule(id: string) {
    return await ApiService.delete<{ message: string }>(`/backup/schedule/${id}`);
  }

  async toggleSchedule(id: string, enabled: boolean) {
    return await ApiService.post<BackupSchedule>(
      `/backup/schedule/${id}/toggle`,
      { enabled }
    );
  }

  async triggerSchedule(id: string) {
    return await ApiService.post<{ message: string }>(
      `/backup/schedule/${id}/trigger`,
      {}
    );
  }
}

export default new BackupService();
