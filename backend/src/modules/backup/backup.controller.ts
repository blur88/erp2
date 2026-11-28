import { Body, Controller, Get, HttpCode, HttpStatus, Post, Put } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Auth } from '../auth/decorators/auth.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UserRole } from '@/database/entities/user.entity';
import { BackupService, type BackupStatusView, type BackupStartAccepted } from './backup.service';
import { BackupScheduleService, type BackupSchedulingStatus } from './backup-schedule.service';
import { BackupSettingsService, type StoredBackupSettings } from './backup-settings.service';
import type { BackupSettingsValues } from './backup-settings';
import type { BackupListResult } from './backup.types';

export type BackupStatusResponse = BackupStatusView & { scheduling: BackupSchedulingStatus };

/** Admin-only Backup routes (#2111, #2112). Every response is sanitised by its service. */
@ApiTags('Backups')
@Controller('backups')
export class BackupController {
  constructor(
    private readonly backups: BackupService,
    private readonly schedule: BackupScheduleService,
    private readonly settings: BackupSettingsService,
  ) {}

  @Get('status')
  @Auth(UserRole.ADMIN)
  @ApiOperation({ summary: 'Get in-memory Backup status and scheduling. Never lists the bucket.' })
  @ApiResponse({ status: 200, description: 'Current Backup status' })
  @ApiResponse({ status: 403, description: 'Administrator role required' })
  getStatus(): BackupStatusResponse {
    return { ...this.backups.getStatus(), scheduling: this.schedule.getSchedulingStatus() };
  }

  @Get('settings')
  @Auth(UserRole.ADMIN)
  @ApiOperation({ summary: 'Get the stored Backup settings, or why they are missing or invalid' })
  @ApiResponse({ status: 200, description: 'Stored settings state' })
  @ApiResponse({ status: 403, description: 'Administrator role required' })
  getSettings(): Promise<StoredBackupSettings> {
    return this.settings.readStored();
  }

  @Put('settings')
  @Auth(UserRole.ADMIN)
  @ApiOperation({ summary: 'Save Backup settings. Invalid values are rejected and nothing is changed.' })
  @ApiResponse({ status: 200, description: 'Saved settings; scheduling is re-timed immediately' })
  @ApiResponse({ status: 400, description: 'Invalid settings; message lists the failing fields' })
  @ApiResponse({ status: 403, description: 'Administrator role required' })
  updateSettings(
    @Body() body: unknown,
    @CurrentUser('userId') userId: string,
    @CurrentUser() user: { username?: string } | null,
  ): Promise<BackupSettingsValues> {
    return this.schedule.updateSettings(body, { userId, username: user?.username });
  }

  @Get()
  @Auth(UserRole.ADMIN)
  @ApiOperation({ summary: 'List complete Backups from storage' })
  @ApiResponse({ status: 200, description: 'Backups, or state "unavailable"' })
  @ApiResponse({ status: 403, description: 'Administrator role required' })
  list(): Promise<BackupListResult> {
    return this.backups.listBackups();
  }

  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  @Auth(UserRole.ADMIN)
  @ApiOperation({ summary: 'Start a Backup now' })
  @ApiResponse({ status: 202, description: 'Accepted' })
  @ApiResponse({ status: 409, description: 'A Backup is already running' })
  @ApiResponse({ status: 503, description: 'Backups are not configured or not ready' })
  start(
    @CurrentUser('userId') userId: string,
    @CurrentUser() user: { username?: string } | null,
  ): Promise<BackupStartAccepted> {
    return this.backups.start({ kind: 'manual', userId, username: user?.username });
  }
}
