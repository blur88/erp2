import {
  IsEnum,
  IsUUID,
  IsString,
  IsOptional,
  IsBoolean,
  IsNumber,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { MappingType } from '../../../database/entities/account-mapping.entity';

export class CreateAccountMappingDto {
  @ApiProperty({
    description: 'Mapping type (e.g., SALES_REVENUE, SALES_AR)',
    enum: MappingType,
    example: MappingType.SALES_REVENUE,
  })
  @IsEnum(MappingType)
  mappingType: MappingType;

  @ApiProperty({
    description: 'Chart of account ID to map to',
    format: 'uuid',
  })
  @IsUUID()
  accountId: string;

  @ApiPropertyOptional({
    description: 'Description of the account mapping',
  })
  @IsOptional()
  @IsString()
  description?: string;
}

export class UpdateAccountMappingDto {
  @ApiPropertyOptional({
    description: 'Chart of account ID to map to',
    format: 'uuid',
  })
  @IsOptional()
  @IsUUID()
  accountId?: string;

  @ApiPropertyOptional({
    description: 'Description of the account mapping',
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({
    description: 'Whether the mapping is active',
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class QueryAccountMappingsDto {
  @ApiPropertyOptional({ description: 'Page number', minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ description: 'Items per page', minimum: 1, maximum: 100, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @ApiPropertyOptional({ description: 'Filter by mapping type', enum: MappingType })
  @IsOptional()
  @IsEnum(MappingType)
  mappingType?: MappingType;

  @ApiPropertyOptional({ description: 'Filter by active status' })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ description: 'Sort field', enum: ['mappingType', 'createdAt'] })
  @IsOptional()
  @IsString()
  sortBy?: string;

  @ApiPropertyOptional({ description: 'Sort direction', enum: ['ASC', 'DESC'] })
  @IsOptional()
  @IsString()
  sortOrder?: 'ASC' | 'DESC';
}

export class AccountMappingResponseDto {
  @ApiProperty({ description: 'Mapping ID' })
  id: string;

  @ApiProperty({ description: 'Mapping type', enum: MappingType })
  mappingType: MappingType;

  @ApiProperty({ description: 'Account ID' })
  accountId: string;

  @ApiPropertyOptional({ description: 'Description' })
  description?: string;

  @ApiProperty({ description: 'Whether the mapping is active' })
  isActive: boolean;

  @ApiPropertyOptional({ description: 'Associated account details' })
  account?: {
    id: string;
    code: string;
    name: string;
    type: string;
  };

  @ApiProperty({ description: 'Creation date' })
  createdAt: Date;

  @ApiProperty({ description: 'Last update date' })
  updatedAt: Date;
}

export class AccountMappingListResponseDto {
  @ApiProperty({ description: 'List of account mappings', type: [AccountMappingResponseDto] })
  data: AccountMappingResponseDto[];

  @ApiProperty({ description: 'Pagination metadata' })
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
}

export class MappingValidationResponseDto {
  @ApiProperty({ description: 'Whether all required mappings are configured' })
  isValid: boolean;

  @ApiProperty({ description: 'List of missing mapping types', type: [String] })
  missingMappings: string[];

  @ApiProperty({ description: 'List of configured mapping types', type: [String] })
  configuredMappings: string[];

  @ApiProperty({ description: 'Total required mappings' })
  totalRequired: number;

  @ApiProperty({ description: 'Total configured mappings' })
  totalConfigured: number;
}
