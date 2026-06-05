import { ApiProperty } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
} from 'class-validator';

export class CreateBackupScheduleDto {
  @ApiProperty({
    description: 'Unique name for the backup schedule',
    example: 'Daily Production Backup',
  })
  @IsString()
  name: string;

  @ApiProperty({
    description: 'Backup frequency',
    enum: ['hourly', 'daily', 'weekly', 'monthly'],
    default: 'daily',
  })
  @IsEnum(['hourly', 'daily', 'weekly', 'monthly'])
  frequency: 'hourly' | 'daily' | 'weekly' | 'monthly';

  @ApiProperty({
    description: 'Custom cron expression (overrides frequency)',
    example: '0 2 * * *',
    required: false,
  })
  @IsString()
  @IsOptional()
  cronExpression?: string;

  @ApiProperty({
    description: 'Time of day to run backup (HH:MM format)',
    example: '02:00',
    default: '02:00',
  })
  @IsString()
  @Matches(/^([0-1][0-9]|2[0-3]):[0-5][0-9]$/, {
    message: 'Time must be in HH:MM format',
  })
  time: string;

  @ApiProperty({
    description: 'Day of week for weekly backups (0-6, Sunday=0)',
    required: false,
    minimum: 0,
    maximum: 6,
  })
  @IsInt()
  @Min(0)
  @Max(6)
  @IsOptional()
  dayOfWeek?: number;

  @ApiProperty({
    description: 'Day of month for monthly backups (1-31)',
    required: false,
    minimum: 1,
    maximum: 31,
  })
  @IsInt()
  @Min(1)
  @Max(31)
  @IsOptional()
  dayOfMonth?: number;

  @ApiProperty({
    description: 'Databases to include in backup',
    isArray: true,
    default: ['postgresql', 'redis'],
  })
  @IsArray()
  databases: string[];

  @ApiProperty({
    description: 'Include system settings in backup',
    default: true,
  })
  @IsBoolean()
  @IsOptional()
  includeSettings?: boolean;

  @ApiProperty({
    description: 'Number of days to retain backups',
    default: 30,
    minimum: 1,
  })
  @IsInt()
  @Min(1)
  @IsOptional()
  retentionDays?: number;

  @ApiProperty({
    description: 'Enable the schedule immediately',
    default: false,
  })
  @IsBoolean()
  @IsOptional()
  enabled?: boolean;

  @ApiProperty({
    description: 'User creating the schedule',
    default: 'system',
  })
  @IsString()
  @IsOptional()
  createdBy?: string;

  @ApiProperty({
    description: 'Notification settings',
    required: false,
  })
  @IsOptional()
  notifications?: {
    enabled: boolean;
    email?: string;
    onSuccess?: boolean;
    onFailure?: boolean;
  };
}

export class UpdateBackupScheduleDto {
  @ApiProperty({
    description: 'Unique name for the backup schedule',
    required: false,
  })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiProperty({
    description: 'Backup frequency',
    enum: ['hourly', 'daily', 'weekly', 'monthly'],
    required: false,
  })
  @IsEnum(['hourly', 'daily', 'weekly', 'monthly'])
  @IsOptional()
  frequency?: 'hourly' | 'daily' | 'weekly' | 'monthly';

  @ApiProperty({
    description: 'Custom cron expression',
    required: false,
  })
  @IsString()
  @IsOptional()
  cronExpression?: string;

  @ApiProperty({
    description: 'Time of day to run backup (HH:MM format)',
    required: false,
  })
  @IsString()
  @Matches(/^([0-1][0-9]|2[0-3]):[0-5][0-9]$/, {
    message: 'Time must be in HH:MM format',
  })
  @IsOptional()
  time?: string;

  @ApiProperty({
    description: 'Day of week for weekly backups (0-6)',
    required: false,
  })
  @IsInt()
  @Min(0)
  @Max(6)
  @IsOptional()
  dayOfWeek?: number;

  @ApiProperty({
    description: 'Day of month for monthly backups (1-31)',
    required: false,
  })
  @IsInt()
  @Min(1)
  @Max(31)
  @IsOptional()
  dayOfMonth?: number;

  @ApiProperty({
    description: 'Databases to include',
    required: false,
  })
  @IsArray()
  @IsOptional()
  databases?: string[];

  @ApiProperty({
    description: 'Include system settings',
    required: false,
  })
  @IsBoolean()
  @IsOptional()
  includeSettings?: boolean;

  @ApiProperty({
    description: 'Retention days',
    required: false,
  })
  @IsInt()
  @Min(1)
  @IsOptional()
  retentionDays?: number;

  @ApiProperty({
    description: 'Enable/disable the schedule',
    required: false,
  })
  @IsBoolean()
  @IsOptional()
  enabled?: boolean;

  @ApiProperty({
    description: 'Notification settings',
    required: false,
  })
  @IsOptional()
  notifications?: {
    enabled: boolean;
    email?: string;
    onSuccess?: boolean;
    onFailure?: boolean;
  };
}
