// @ts-nocheck
// TypeScript checking disabled for this file - PluginsModule is currently disabled
import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsBoolean, IsObject, IsString } from 'class-validator';
import { Transform } from 'class-transformer';

export class ConfigurePluginDto {
  @ApiProperty({
    description: 'Plugin configuration object',
    example: { apiKey: 'abc123', enableLogging: true },
  })
  @IsObject()
  config: Record<string, any>;

  @ApiProperty({
    description: 'Validate configuration against schema',
    default: true,
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true' || value === true)
  validate?: boolean = true;

  @ApiProperty({
    description: 'Merge with existing configuration',
    default: true,
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true' || value === true)
  merge?: boolean = true;

  @ApiProperty({
    description: 'Restart plugin after configuration change',
    default: false,
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  restartAfterChange?: boolean = false;

  @ApiProperty({
    description: 'Configuration change reason/description',
    required: false,
  })
  @IsOptional()
  @IsString()
  changeReason?: string;
}