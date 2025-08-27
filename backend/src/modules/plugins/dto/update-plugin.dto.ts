import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsBoolean, IsString, IsArray, IsObject } from 'class-validator';
import { Transform } from 'class-transformer';

/**
 * DTO for plugin update
 */
export class UpdatePluginDto {
  @ApiProperty({
    description: 'Target version to update to (latest if not specified)',
    example: '2.1.0',
    required: false,
  })
  @IsOptional()
  @IsString()
  version?: string;

  @ApiProperty({
    description: 'Force update even if there are compatibility issues',
    default: false,
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true' || value === true)
  force?: boolean = false;

  @ApiProperty({
    description: 'Create backup before update',
    default: true,
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true' || value === true)
  backup?: boolean = true;

  @ApiProperty({
    description: 'Run database migrations during update',
    default: true,
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true' || value === true)
  runMigrations?: boolean = true;

  @ApiProperty({
    description: 'Preserve current configuration during update',
    default: true,
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true' || value === true)
  preserveConfig?: boolean = true;

  @ApiProperty({
    description: 'Restart plugin after update',
    default: true,
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true' || value === true)
  restartAfterUpdate?: boolean = true;

  @ApiProperty({
    description: 'Update strategy',
    enum: ['in-place', 'blue-green', 'rolling'],
    default: 'in-place',
    required: false,
  })
  @IsOptional()
  @IsString()
  updateStrategy?: 'in-place' | 'blue-green' | 'rolling' = 'in-place';

  @ApiProperty({
    description: 'Configuration changes to apply during update',
    required: false,
  })
  @IsOptional()
  @IsObject()
  configUpdates?: Record<string, any>;

  @ApiProperty({
    description: 'Rollback configuration',
    required: false,
  })
  @IsOptional()
  @IsObject()
  rollbackConfig?: {
    enableAutoRollback?: boolean;
    rollbackOnFailure?: boolean;
    healthCheckTimeout?: number;
    maxRollbackAttempts?: number;
  };
}

/**
 * DTO for plugin rollback
 */
export class RollbackPluginDto {
  @ApiProperty({
    description: 'Target version to rollback to',
    example: '1.9.0',
  })
  @IsString()
  targetVersion: string;

  @ApiProperty({
    description: 'Restore configuration from backup',
    default: true,
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  restoreConfig?: boolean = true;

  @ApiProperty({
    description: 'Rollback database migrations',
    default: true,
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  rollbackMigrations?: boolean = true;

  @ApiProperty({
    description: 'Force rollback even if there are data compatibility issues',
    default: false,
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  force?: boolean = false;

  @ApiProperty({
    description: 'Reason for rollback',
    required: false,
  })
  @IsOptional()
  @IsString()
  reason?: string;
}

/**
 * DTO for bulk plugin update
 */
export class BulkUpdatePluginDto {
  @ApiProperty({
    description: 'Plugin IDs to update',
    type: [String],
  })
  @IsArray()
  @IsString({ each: true })
  pluginIds: string[];

  @ApiProperty({
    description: 'Target version for all plugins (latest if not specified)',
    required: false,
  })
  @IsOptional()
  @IsString()
  version?: string;

  @ApiProperty({
    description: 'Update options to apply to all plugins',
    required: false,
  })
  @IsOptional()
  @IsObject()
  options?: {
    force?: boolean;
    backup?: boolean;
    runMigrations?: boolean;
    preserveConfig?: boolean;
    restartAfterUpdate?: boolean;
    updateStrategy?: 'in-place' | 'blue-green' | 'rolling';
  };

  @ApiProperty({
    description: 'Continue updates even if some plugins fail',
    default: true,
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  continueOnError?: boolean = true;

  @ApiProperty({
    description: 'Update execution strategy',
    enum: ['sequential', 'parallel', 'dependency-order'],
    default: 'dependency-order',
    required: false,
  })
  @IsOptional()
  @IsString()
  executionStrategy?: 'sequential' | 'parallel' | 'dependency-order' = 'dependency-order';

  @ApiProperty({
    description: 'Maximum concurrent updates when using parallel strategy',
    default: 2,
    required: false,
  })
  @IsOptional()
  maxConcurrent?: number = 2;
}