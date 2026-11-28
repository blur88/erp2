import { Body, Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Auth } from '../auth/decorators/auth.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UserRole } from '@/database/entities/user.entity';
import { BackupService, type BackupStatusView, type BackupStartAccepted } from './backup.service';
import type { BackupListResult } from './backup.types';

/** Admin-only Backup routes (#2111). Every response is sanitised by its service. */
@ApiTags('Backups')
@Controller('backups')
export class BackupController {
  constructor(private readonly backups: BackupService) {}

  @Get('status')
  @Auth(UserRole.ADMIN)
  @ApiOperation({ summary: 'Get in-memory Backup status. Never lists the bucket.' })
  @ApiResponse({ status: 200, description: 'Current Backup status' })
  @ApiResponse({ status: 403, description: 'Administrator role required' })
  getStatus(): BackupStatusView {
    return this.backups.getStatus();
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
    return this.backups.start({ userId, username: user?.username });
  }
}
