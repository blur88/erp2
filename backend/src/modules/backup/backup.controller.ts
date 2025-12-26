import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  Res,
  StreamableFile,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Response } from 'express';
import * as fs from 'fs';
import { BackupService } from './backup.service';
import { BackupSchedulerService } from './backup-scheduler.service';
import { CreateBackupDto } from './dto/create-backup.dto';
import { RestoreBackupDto } from './dto/restore-backup.dto';
import {
  CreateBackupScheduleDto,
  UpdateBackupScheduleDto,
} from './dto/backup-schedule.dto';
import { BackupLog } from '@database/entities/backup-log.entity';
import { BackupSchedule } from '@database/entities/backup-schedule.entity';

@ApiTags('Backup')
@Controller('backup')
export class BackupController {
  constructor(
    private readonly backupService: BackupService,
    private readonly schedulerService: BackupSchedulerService,
  ) {}

  @Post('create')
  @ApiOperation({ summary: 'Create a new backup' })
  @ApiResponse({
    status: 201,
    description: 'Backup created successfully',
    type: BackupLog,
  })
  @ApiResponse({ status: 500, description: 'Backup creation failed' })
  async create(@Body() createBackupDto: CreateBackupDto): Promise<BackupLog> {
    return this.backupService.createBackup(createBackupDto);
  }

  @Get('list')
  @ApiOperation({ summary: 'Get all backups' })
  @ApiResponse({
    status: 200,
    description: 'List of all backups',
    type: [BackupLog],
  })
  async findAll(): Promise<BackupLog[]> {
    return this.backupService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get backup by ID' })
  @ApiResponse({ status: 200, description: 'Backup found', type: BackupLog })
  @ApiResponse({ status: 404, description: 'Backup not found' })
  async findOne(@Param('id') id: string): Promise<BackupLog> {
    return this.backupService.findOne(id);
  }

  @Get('download/:id')
  @ApiOperation({ summary: 'Download backup file' })
  @ApiResponse({ status: 200, description: 'Backup file downloaded' })
  @ApiResponse({ status: 404, description: 'Backup not found' })
  async download(
    @Param('id') id: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const backup = await this.backupService.findOne(id);
    const filepath = await this.backupService.getBackupFilePath(id);

    const file = fs.createReadStream(filepath);
    res.set({
      'Content-Type': 'application/gzip',
      'Content-Disposition': `attachment; filename="${backup.filename}"`,
    });

    return new StreamableFile(file);
  }

  @Post('restore/:id')
  @ApiOperation({ summary: 'Restore from a backup' })
  @ApiResponse({
    status: 200,
    description: 'Restore completed successfully',
    type: BackupLog,
  })
  @ApiResponse({ status: 400, description: 'Invalid restore request' })
  @ApiResponse({ status: 404, description: 'Backup not found' })
  @ApiResponse({ status: 500, description: 'Restore failed' })
  async restore(
    @Param('id') id: string,
    @Body() restoreBackupDto: RestoreBackupDto,
  ): Promise<{ message: string; backup: BackupLog }> {
    if (!restoreBackupDto.confirmed) {
      throw new Error('Restore operation must be confirmed');
    }

    const backup = await this.backupService.restoreBackup(
      id,
      restoreBackupDto.restoredBy,
    );

    return {
      message: 'Restore completed successfully',
      backup,
    };
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a backup' })
  @ApiResponse({ status: 200, description: 'Backup deleted successfully' })
  @ApiResponse({ status: 404, description: 'Backup not found' })
  async remove(@Param('id') id: string): Promise<{ message: string }> {
    await this.backupService.remove(id);
    return { message: 'Backup deleted successfully' };
  }

  // Schedule Management Endpoints

  @Post('schedule')
  @ApiOperation({ summary: 'Create a backup schedule' })
  @ApiResponse({
    status: 201,
    description: 'Schedule created successfully',
    type: BackupSchedule,
  })
  async createSchedule(
    @Body() createScheduleDto: CreateBackupScheduleDto,
  ): Promise<BackupSchedule> {
    return this.schedulerService.createSchedule(createScheduleDto);
  }

  @Get('schedule/list')
  @ApiOperation({ summary: 'Get all backup schedules' })
  @ApiResponse({
    status: 200,
    description: 'List of schedules',
    type: [BackupSchedule],
  })
  async findAllSchedules(): Promise<BackupSchedule[]> {
    return this.schedulerService.findAll();
  }

  @Get('schedule/:id')
  @ApiOperation({ summary: 'Get schedule by ID' })
  @ApiResponse({
    status: 200,
    description: 'Schedule found',
    type: BackupSchedule,
  })
  @ApiResponse({ status: 404, description: 'Schedule not found' })
  async findOneSchedule(@Param('id') id: string): Promise<BackupSchedule> {
    return this.schedulerService.findOne(id);
  }

  @Post('schedule/:id')
  @ApiOperation({ summary: 'Update a backup schedule' })
  @ApiResponse({
    status: 200,
    description: 'Schedule updated successfully',
    type: BackupSchedule,
  })
  @ApiResponse({ status: 404, description: 'Schedule not found' })
  async updateSchedule(
    @Param('id') id: string,
    @Body() updateScheduleDto: UpdateBackupScheduleDto,
  ): Promise<BackupSchedule> {
    return this.schedulerService.update(id, updateScheduleDto);
  }

  @Delete('schedule/:id')
  @ApiOperation({ summary: 'Delete a backup schedule' })
  @ApiResponse({ status: 200, description: 'Schedule deleted successfully' })
  @ApiResponse({ status: 404, description: 'Schedule not found' })
  async removeSchedule(@Param('id') id: string): Promise<{ message: string }> {
    await this.schedulerService.remove(id);
    return { message: 'Schedule deleted successfully' };
  }

  @Post('schedule/:id/toggle')
  @ApiOperation({ summary: 'Enable or disable a schedule' })
  @ApiResponse({
    status: 200,
    description: 'Schedule toggled successfully',
    type: BackupSchedule,
  })
  async toggleSchedule(
    @Param('id') id: string,
    @Body('enabled') enabled: boolean,
  ): Promise<BackupSchedule> {
    return this.schedulerService.toggleSchedule(id, enabled);
  }

  @Post('schedule/:id/trigger')
  @ApiOperation({ summary: 'Manually trigger a scheduled backup' })
  @ApiResponse({ status: 200, description: 'Backup triggered successfully' })
  @ApiResponse({ status: 404, description: 'Schedule not found' })
  async triggerSchedule(
    @Param('id') id: string,
  ): Promise<{ message: string }> {
    await this.schedulerService.triggerSchedule(id);
    return { message: 'Backup triggered successfully' };
  }

  @Post('cleanup')
  @ApiOperation({ summary: 'Manually trigger backup cleanup with retention policy' })
  @ApiResponse({ status: 200, description: 'Cleanup completed successfully' })
  async cleanup(
    @Body() body: { retentionDays: number },
  ): Promise<{ message: string; deletedCount: number }> {
    const deletedCount = await this.backupService.cleanupOldBackups(
      body.retentionDays,
    );
    return {
      message: 'Cleanup completed successfully',
      deletedCount,
    };
  }
}
