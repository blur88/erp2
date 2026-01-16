// @ts-nocheck
// TypeScript checking disabled for this file - PluginsModule is currently disabled
import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsBoolean, IsNumber, IsArray, IsString } from 'class-validator';
import { Transform, Type } from 'class-transformer';

export class PluginHealthCheckDto {
  @ApiProperty({
    description: 'Include detailed health information',
    default: false,
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true' || value === true)
  detailed?: boolean = false;

  @ApiProperty({
    description: 'Include resource usage metrics',
    default: true,
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true' || value === true)
  includeResources?: boolean = true;

  @ApiProperty({
    description: 'Include dependency health checks',
    default: false,
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true' || value === true)
  includeDependencies?: boolean = false;

  @ApiProperty({
    description: 'Health check timeout in milliseconds',
    default: 30000,
    required: false,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  timeout?: number = 30000;
}

export class BulkHealthCheckDto {
  @ApiProperty({
    description: 'Plugin IDs to check (all if not specified)',
    type: [String],
    required: false,
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  pluginIds?: string[];

  @ApiProperty({
    description: 'Include only unhealthy plugins in response',
    default: false,
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  unhealthyOnly?: boolean = false;

  @ApiProperty({
    description: 'Health check options',
    required: false,
  })
  @IsOptional()
  healthCheckOptions?: PluginHealthCheckDto;
}