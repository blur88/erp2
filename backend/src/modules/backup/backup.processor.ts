import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { BackupService } from './backup.service';
import { CreateBackupDto } from './dto/create-backup.dto';

export interface BackupJobData {
  scheduleId?: string;
  backupDto: CreateBackupDto;
}

export interface CleanupJobData {
  retentionDays: number;
}

@Processor('backup-queue')
export class BackupProcessor {
  private readonly logger = new Logger(BackupProcessor.name);

  constructor(private readonly backupService: BackupService) {}

  @Process('create-backup')
  async handleBackupJob(job: Job<BackupJobData>) {
    this.logger.log(`Processing backup job ${job.id}`);
    this.logger.log(`Job data: ${JSON.stringify(job.data)}`);

    try {
      // Update job progress
      await job.progress(10);

      const backup = await this.backupService.createBackup(job.data.backupDto);

      await job.progress(100);

      this.logger.log(
        `Backup job ${job.id} completed successfully: ${backup.filename}`,
      );

      return { success: true, backupId: backup.id, filename: backup.filename };
    } catch (error) {
      this.logger.error(
        `Backup job ${job.id} failed: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  @Process('cleanup-old-backups')
  async handleCleanupJob(job: Job<CleanupJobData>) {
    this.logger.log(`Processing cleanup job ${job.id}`);
    this.logger.log(
      `Retention days: ${job.data.retentionDays}`,
    );

    try {
      const deletedCount = await this.backupService.cleanupOldBackups(
        job.data.retentionDays,
      );

      this.logger.log(
        `Cleanup job ${job.id} completed: ${deletedCount} backups deleted`,
      );

      return { success: true, deletedCount };
    } catch (error) {
      this.logger.error(
        `Cleanup job ${job.id} failed: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }
}
