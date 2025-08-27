import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, IsUrl, IsBoolean, IsArray, IsNumber, Min, Max } from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { PluginType } from '../../../database/entities/plugin.entity';

export class MarketplaceSearchDto {
  @ApiProperty({
    description: 'Search query',
    example: 'inventory management',
    required: false,
  })
  @IsOptional()
  @IsString()
  query?: string;

  @ApiProperty({
    description: 'Plugin category/type filter',
    enum: PluginType,
    required: false,
  })
  @IsOptional()
  category?: PluginType;

  @ApiProperty({
    description: 'Tags to filter by',
    type: [String],
    required: false,
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @ApiProperty({
    description: 'Minimum rating (1-5)',
    minimum: 1,
    maximum: 5,
    required: false,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(5)
  minRating?: number;

  @ApiProperty({
    description: 'Show only free plugins',
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true' || value === true)
  freeOnly?: boolean;

  @ApiProperty({
    description: 'Sort by field',
    enum: ['name', 'rating', 'downloads', 'updated', 'price'],
    default: 'name',
    required: false,
  })
  @IsOptional()
  @IsString()
  sortBy?: 'name' | 'rating' | 'downloads' | 'updated' | 'price' = 'name';

  @ApiProperty({
    description: 'Number of results to return',
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
    description: 'Number of results to skip',
    default: 0,
    minimum: 0,
    required: false,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  offset?: number = 0;
}

export class MarketplaceConfigDto {
  @ApiProperty({
    description: 'Marketplace registry URL',
    example: 'https://plugins.erp-system.com',
  })
  @IsUrl()
  registryUrl: string;

  @ApiProperty({
    description: 'Authentication token',
    required: false,
  })
  @IsOptional()
  @IsString()
  authToken?: string;

  @ApiProperty({
    description: 'Enable automatic updates from marketplace',
    default: false,
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  enableAutoUpdates?: boolean = false;

  @ApiProperty({
    description: 'Trust level for marketplace plugins',
    enum: ['strict', 'moderate', 'permissive'],
    default: 'moderate',
    required: false,
  })
  @IsOptional()
  @IsString()
  trustLevel?: 'strict' | 'moderate' | 'permissive' = 'moderate';
}