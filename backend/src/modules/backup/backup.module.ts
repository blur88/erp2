import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bull';
import { BackupController } from './backup.controller';
import { BackupService } from './backup.service';
import { BackupSchedulerService } from './backup-scheduler.service';
import { BackupProcessor } from './backup.processor';
import { BackupLog } from '@database/entities/backup-log.entity';
import { BackupSchedule } from '@database/entities/backup-schedule.entity';
import { BackupRetentionSettings } from '@database/entities/backup-settings.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([BackupLog, BackupSchedule, BackupRetentionSettings]),
    BullModule.registerQueue({
      name: 'backup-queue',
    }),
  ],
  controllers: [BackupController],
  providers: [BackupService, BackupSchedulerService, BackupProcessor],
  exports: [BackupService, BackupSchedulerService],
})
export class BackupModule {}
