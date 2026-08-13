import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { BackupController } from './backup.controller';
import { BackupService } from './backup.service';
import { BackupSchedulerService } from './backup-scheduler.service';
import { OrphanedSchedulerReconciler } from './orphaned-scheduler-reconciler.service';
import { BackupProcessor } from './backup.processor';
import { BackupLog } from '@database/entities/backup-log.entity';
import { BackupSchedule } from '@database/entities/backup-schedule.entity';
import { BackupRetentionSettings } from '@database/entities/backup-settings.entity';
import { CompanySettings } from '@database/entities/company-settings.entity';
import { RegionalSettings } from '@database/entities/regional-settings.entity';
import { DocumentNumberSetting } from '@database/entities/document-number-settings.entity';
import { PrintSettings } from '@database/entities/print-settings.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      BackupLog,
      BackupSchedule,
      BackupRetentionSettings,
      CompanySettings,
      RegionalSettings,
      DocumentNumberSetting,
      PrintSettings,
    ]),
    BullModule.registerQueue({
      name: 'backup-queue',
    }),
  ],
  controllers: [BackupController],
  providers: [BackupService, BackupSchedulerService, BackupProcessor, OrphanedSchedulerReconciler],
  exports: [BackupService, BackupSchedulerService, OrphanedSchedulerReconciler],
})
export class BackupModule {}
