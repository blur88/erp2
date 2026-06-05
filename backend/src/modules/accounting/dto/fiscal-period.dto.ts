import {
  IsString,
  IsEnum,
  IsOptional,
  IsDate,
  IsNumber,
  IsBoolean,
  MaxLength,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { FiscalPeriodStatus } from '../../../database/entities/fiscal-period.entity';

export class CreateFiscalPeriodDto {
  @ApiProperty({ description: 'Unique period code (e.g., "2026-01", "Q1-2026")', maxLength: 50 })
  @IsString()
  @MaxLength(50)
  code: string;

  @ApiProperty({ description: 'Period name (e.g., "January 2026")', maxLength: 255 })
  @IsString()
  @MaxLength(255)
  name: string;

  @ApiProperty({ description: 'Period start date', type: Date })
  @Type(() => Date)
  @IsDate()
  startDate: Date;

  @ApiProperty({ description: 'Period end date', type: Date })
  @Type(() => Date)
  @IsDate()
  endDate: Date;

  @ApiPropertyOptional({
    description: 'Period status',
    enum: FiscalPeriodStatus,
    default: FiscalPeriodStatus.OPEN
  })
  @IsOptional()
  @IsEnum(FiscalPeriodStatus)
  status?: FiscalPeriodStatus;
}

export class UpdateFiscalPeriodDto extends PartialType(CreateFiscalPeriodDto) {
  @ApiPropertyOptional({ description: 'Unique period code', maxLength: 50 })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  code?: string;

  @ApiPropertyOptional({ description: 'Period name', maxLength: 255 })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @ApiPropertyOptional({ description: 'Period start date', type: Date })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  startDate?: Date;

  @ApiPropertyOptional({ description: 'Period end date', type: Date })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  endDate?: Date;

  @ApiPropertyOptional({ description: 'Period status', enum: FiscalPeriodStatus })
  @IsOptional()
  @IsEnum(FiscalPeriodStatus)
  status?: FiscalPeriodStatus;
}

export class QueryFiscalPeriodsDto {
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

  @ApiPropertyOptional({ description: 'Search term (period code or name)' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;

  @ApiPropertyOptional({ description: 'Filter by status', enum: FiscalPeriodStatus })
  @IsOptional()
  @IsEnum(FiscalPeriodStatus)
  status?: FiscalPeriodStatus;

  @ApiPropertyOptional({ description: 'Filter by year (e.g., 2026)' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(2000)
  @Max(2100)
  year?: number;

  @ApiPropertyOptional({ description: 'Sort field', enum: ['code', 'name', 'startDate', 'createdAt'] })
  @IsOptional()
  @IsString()
  sortBy?: string;

  @ApiPropertyOptional({ description: 'Sort direction', enum: ['ASC', 'DESC'] })
  @IsOptional()
  @IsString()
  sortOrder?: 'ASC' | 'DESC';
}

export class GenerateFiscalPeriodsDto {
  @ApiProperty({ description: 'Fiscal year (e.g., 2026)', minimum: 2000, maximum: 2100 })
  @Type(() => Number)
  @IsNumber()
  @Min(2000)
  @Max(2100)
  year: number;

  @ApiPropertyOptional({ description: 'Start month (1-12, default: 1)', minimum: 1, maximum: 12, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(12)
  startMonth?: number;
}

export class ValidatePeriodDto {
  @ApiProperty({ description: 'Date to validate', type: Date })
  @Type(() => Date)
  @IsDate()
  date: Date;
}

export class FiscalPeriodResponseDto {
  @ApiProperty({ description: 'Period ID' })
  id: string;

  @ApiProperty({ description: 'Period code' })
  code: string;

  @ApiProperty({ description: 'Period name' })
  name: string;

  @ApiProperty({ description: 'Period start date', type: Date })
  startDate: Date;

  @ApiProperty({ description: 'Period end date', type: Date })
  endDate: Date;

  @ApiProperty({ description: 'Period status', enum: FiscalPeriodStatus })
  status: FiscalPeriodStatus;

  @ApiProperty({ description: 'Whether period is open' })
  isOpen: boolean;

  @ApiProperty({ description: 'Whether period is closed' })
  isClosed: boolean;

  @ApiProperty({ description: 'Duration in days' })
  durationDays: number;

  @ApiProperty({ description: 'Creation date' })
  createdAt: Date;

  @ApiProperty({ description: 'Last update date' })
  updatedAt: Date;

  @ApiPropertyOptional({ description: 'Soft delete date' })
  deletedAt?: Date;
}

export class FiscalPeriodListResponseDto {
  @ApiProperty({ description: 'List of fiscal periods', type: [FiscalPeriodResponseDto] })
  data: FiscalPeriodResponseDto[];

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

export class FiscalPeriodValidationResponseDto {
  @ApiProperty({ description: 'Whether the date is valid' })
  isValid: boolean;

  @ApiProperty({ description: 'Validation message' })
  message: string;

  @ApiPropertyOptional({ description: 'Matched fiscal period', type: FiscalPeriodResponseDto })
  period?: FiscalPeriodResponseDto;
}
