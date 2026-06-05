import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Logger } from "@nestjs/common";
import { Job } from "bullmq";
import { BackupService } from "./backup.service";
import { CreateBackupDto } from "./dto/create-backup.dto";

export interface BackupJobData {
  scheduleId?: string;
  backupDto: CreateBackupDto;
}

export interface CleanupJobData {
  retentionDays: number;
}

@Processor("backup-queue")
export class BackupProcessor extends WorkerHost {
  private readonly logger = new Logger(BackupProcessor.name);

  constructor(private readonly backupService: BackupService) {
    super();
  }

  async process(job: Job): Promise<any> {
    switch (job.name) {
      case "create-backup":
        return this.handleBackupJob(job as Job<BackupJobData>);
      case "cleanup-old-backups":
        return this.handleCleanupJob(job as Job<CleanupJobData>);
      case "cleanup-with-settings":
        return this.handleCleanupWithSettingsJob(job);
      default:
        this.logger.warn(`Unknown job name: ${job.name}`);
    }
  }

  private async handleBackupJob(job: Job<BackupJobData>) {
    this.logger.log(`Processing backup job ${job.id}`);
    this.logger.log(`Job data: ${JSON.stringify(job.data)}`);

    try {
      const backup = await this.backupService.createBackup(job.data.backupDto);

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

  private async handleCleanupJob(job: Job<CleanupJobData>) {
    this.logger.log(`Processing cleanup job ${job.id}`);
    this.logger.log(`Retention days: ${job.data.retentionDays}`);

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

  private async handleCleanupWithSettingsJob(job: Job) {
    this.logger.log(`Processing cleanup with settings job ${job.id}`);

    try {
      const deletedCount =
        await this.backupService.cleanupBackupsWithSettings();

      this.logger.log(
        `Cleanup with settings job ${job.id} completed: ${deletedCount} backups deleted`,
      );

      return { success: true, deletedCount };
    } catch (error) {
      this.logger.error(
        `Cleanup with settings job ${job.id} failed: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }
}
