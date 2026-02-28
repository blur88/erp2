// @ts-nocheck
import {
  IsString,
  IsBoolean,
  IsOptional,
  IsEnum,
  IsArray,
  IsDecimal,
  IsInt,
  MaxLength,
  MinLength,
  Min,
  Max,
  IsDateString,
  IsUUID,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { SupplierType } from '../../../database/entities/supplier.entity';

export class CreateSupplierDto {
  @ApiProperty({ description: 'Supplier type', enum: SupplierType })
  @IsEnum(SupplierType)
  type!: SupplierType;

  @ApiProperty({ description: 'Company name', maxLength: 200 })
  @IsString()
  @MaxLength(200)
  @MinLength(2)
  companyName!: string;

  @ApiPropertyOptional({ description: 'Contact person name', maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  contactPerson?: string;

  @ApiPropertyOptional({ description: 'Primary phone number', maxLength: 20 })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;

  @ApiPropertyOptional({ description: 'Street address', maxLength: 255 })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  streetAddress?: string;

  @ApiPropertyOptional({ description: 'City', maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  city?: string;

  @ApiPropertyOptional({ description: 'State/Province', maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  state?: string;

  @ApiPropertyOptional({ description: 'Postal/ZIP code', maxLength: 20 })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  postalCode?: string;

  @ApiPropertyOptional({ description: 'Country', maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  country?: string;

  @ApiPropertyOptional({ description: 'Internal notes' })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateSupplierDto extends PartialType(CreateSupplierDto) {
  @ApiPropertyOptional({ description: 'Whether supplier is active', default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class SupplierQueryDto {
  @ApiPropertyOptional({ description: 'Page number', default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ description: 'Items per page', default: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  limit?: number = 10;

  @ApiPropertyOptional({ description: 'Search term' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ description: 'Filter by type', enum: SupplierType })
  @IsOptional()
  @IsEnum(SupplierType)
  type?: SupplierType;

  @ApiPropertyOptional({ description: 'Filter active suppliers only' })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ description: 'Sort by field', default: 'companyName' })
  @IsOptional()
  @IsString()
  sortBy?: string = 'companyName';

  @ApiPropertyOptional({ description: 'Sort order', enum: ['ASC', 'DESC'], default: 'ASC' })
  @IsOptional()
  @IsString()
  sortOrder?: 'ASC' | 'DESC' = 'ASC';
}

export class SupplierResponseDto {
  @ApiProperty({ description: 'Supplier ID' })
  id!: string;

  @ApiProperty({ description: 'Supplier type' })
  type!: SupplierType;

  @ApiProperty({ description: 'Company name' })
  companyName!: string;

  @ApiProperty({ description: 'Contact person name' })
  contactPerson?: string;

  @ApiProperty({ description: 'Primary phone number' })
  phone?: string;

  @ApiProperty({ description: 'Street address' })
  streetAddress?: string;

  @ApiProperty({ description: 'City' })
  city?: string;

  @ApiProperty({ description: 'State/Province' })
  state?: string;

  @ApiProperty({ description: 'Postal/ZIP code' })
  postalCode?: string;

  @ApiProperty({ description: 'Country' })
  country?: string;

  @ApiProperty({ description: 'Total purchases amount' })
  totalPurchases!: number;

  @ApiProperty({ description: 'Total number of orders' })
  totalOrders!: number;

  @ApiProperty({ description: 'Average order value' })
  averageOrderValue!: number;

  @ApiProperty({ description: 'Last purchase date' })
  lastPurchaseDate?: Date;

  @ApiProperty({ description: 'First purchase date' })
  firstPurchaseDate?: Date;

  @ApiProperty({ description: 'Internal notes' })
  notes?: string;

  @ApiProperty({ description: 'Created date' })
  createdAt!: Date;

  @ApiProperty({ description: 'Updated date' })
  updatedAt!: Date;

  @ApiProperty({ description: 'Deleted date (for soft-deleted suppliers)' })
  deletedAt?: Date;
}


class UpdateSupplierBalanceDto {
  @ApiProperty({ description: 'Amount to add or subtract' })
  @IsDecimal({ decimal_digits: '0,4' })
  @Min(0)
  @Transform(({ value }) => parseFloat(value))
  amount!: number;

  @ApiProperty({ description: 'Balance operation type', enum: ['increase', 'decrease'] })
  @IsEnum(['increase', 'decrease'])
  type!: 'increase' | 'decrease';

  @ApiPropertyOptional({ description: 'Reference or notes for the balance change' })
  @IsOptional()
  @IsString()
  reference?: string;
}

export class SupplierListResponseDto {
  @ApiProperty({ description: 'List of suppliers', type: [SupplierResponseDto] })
  suppliers!: SupplierResponseDto[];

  @ApiProperty({ description: 'Total count' })
  total!: number;

  @ApiProperty({ description: 'Current page' })
  page!: number;

  @ApiProperty({ description: 'Items per page' })
  limit!: number;

  @ApiProperty({ description: 'Total pages' })
  totalPages!: number;

  @ApiProperty({ description: 'Has next page' })
  hasNext!: boolean;

  @ApiProperty({ description: 'Has previous page' })
  hasPrev!: boolean;
}

class SupplierAnalyticsDto {
  @ApiPropertyOptional({ description: 'Start date for analytics' })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({ description: 'End date for analytics' })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({ description: 'Supplier IDs to include', type: [String] })
  @IsOptional()
  @IsArray()
  @IsUUID(4, { each: true })
  supplierIds?: string[];

  @ApiPropertyOptional({ description: 'Include performance metrics' })
  @IsOptional()
  @Transform(({ value }) => value === 'true')
  @IsBoolean()
  includePerformance?: boolean;

  @ApiPropertyOptional({ description: 'Include spending analysis' })
  @IsOptional()
  @Transform(({ value }) => value === 'true')
  @IsBoolean()
  includeSpending?: boolean;
}
