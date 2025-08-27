import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsEnum, IsString, IsNumber, IsBoolean, Min, Max } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { PluginStatus, PluginType } from '../../../database/entities/plugin.entity';

export class PluginQueryDto {
  @ApiProperty({
    description: 'Filter by plugin status',
    enum: PluginStatus,
    required: false,
  })
  @IsOptional()
  @IsEnum(PluginStatus)
  status?: PluginStatus;

  @ApiProperty({
    description: 'Filter by plugin type',
    enum: PluginType,
    required: false,
  })
  @IsOptional()
  @IsEnum(PluginType)
  type?: PluginType;

  @ApiProperty({
    description: 'Search query for plugin name or description',
    required: false,
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiProperty({
    description: 'Filter by plugin author',
    required: false,
  })
  @IsOptional()
  @IsString()
  author?: string;

  @ApiProperty({
    description: 'Filter by plugin tags',
    required: false,
  })
  @IsOptional()
  @IsString()
  tags?: string;

  @ApiProperty({
    description: 'Include only active plugins',
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true' || value === true)
  activeOnly?: boolean;

  @ApiProperty({
    description: 'Include plugin health status',
    default: false,
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true' || value === true)
  includeHealth?: boolean = false;

  @ApiProperty({
    description: 'Include plugin configuration',
    default: false,
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true' || value === true)
  includeConfig?: boolean = false;

  @ApiProperty({
    description: 'Number of items to return',
    default: 20,
    minimum: 1,
    maximum: 100,
    required: false,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @ApiProperty({
    description: 'Number of items to skip',
    default: 0,
    minimum: 0,
    required: false,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  offset?: number = 0;

  @ApiProperty({
    description: 'Sort field',
    enum: ['name', 'author', 'version', 'installedDate', 'lastActivatedDate'],
    default: 'name',
    required: false,
  })
  @IsOptional()
  @IsString()
  sortBy?: 'name' | 'author' | 'version' | 'installedDate' | 'lastActivatedDate' = 'name';

  @ApiProperty({
    description: 'Sort direction',
    enum: ['ASC', 'DESC'],
    default: 'ASC',
    required: false,
  })
  @IsOptional()
  @IsString()
  sortDirection?: 'ASC' | 'DESC' = 'ASC';
}