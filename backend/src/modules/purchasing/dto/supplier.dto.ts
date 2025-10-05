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
  IsPhoneNumber,
  Min,
  Max,
  IsDateString,
  IsUUID,
  ValidateNested,
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

  @ApiPropertyOptional({ description: 'Contact person title', maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  contactTitle?: string;

  @ApiPropertyOptional({ description: 'Primary phone number' })
  @IsOptional()
  @IsPhoneNumber()
  phone?: string;

  @ApiPropertyOptional({ description: 'Alternative phone number' })
  @IsOptional()
  @IsPhoneNumber()
  alternativePhone?: string;

  @ApiPropertyOptional({ description: 'Fax number', maxLength: 20 })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  fax?: string;

  @ApiPropertyOptional({ description: 'Website URL', maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  website?: string;

  @ApiPropertyOptional({ description: 'Tax ID', maxLength: 30 })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  taxId?: string;

  @ApiPropertyOptional({ description: 'Address' })
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional({ description: 'City', maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  city?: string;

  @ApiPropertyOptional({ description: 'State/province', maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  state?: string;

  @ApiPropertyOptional({ description: 'Postal code', maxLength: 20 })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  postalCode?: string;

  @ApiPropertyOptional({ description: 'Country', maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  country?: string;

  @ApiPropertyOptional({ description: 'Preferred currency', default: 'USD' })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  currency?: string;

  @ApiPropertyOptional({ description: 'Product categories', type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  categories?: string[];

  @ApiPropertyOptional({ description: 'Certifications', type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  certifications?: string[];

  @ApiPropertyOptional({ description: 'Internal notes' })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ description: 'Additional metadata' })
  @IsOptional()
  metadata?: Record<string, any>;
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
  @Max(100)
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

  @ApiProperty({ description: 'Contact person title' })
  contactTitle?: string;

  @ApiProperty({ description: 'Primary phone number' })
  phone?: string;

  @ApiProperty({ description: 'Alternative phone number' })
  alternativePhone?: string;

  @ApiProperty({ description: 'Fax number' })
  fax?: string;

  @ApiProperty({ description: 'Website URL' })
  website?: string;

  @ApiProperty({ description: 'Tax ID' })
  taxId?: string;

  @ApiProperty({ description: 'Full address' })
  fullAddress!: string;

  @ApiProperty({ description: 'Currency' })
  currency!: string;

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

  @ApiProperty({ description: 'Product categories', type: [String] })
  categories?: string[];

  @ApiProperty({ description: 'Certifications', type: [String] })
  certifications?: string[];

  @ApiProperty({ description: 'Internal notes' })
  notes?: string;

  @ApiProperty({ description: 'Created date' })
  createdAt!: Date;

  @ApiProperty({ description: 'Updated date' })
  updatedAt!: Date;

  @ApiProperty({ description: 'Deleted date (for soft-deleted suppliers)' })
  deletedAt?: Date;
}


export class UpdateSupplierBalanceDto {
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

export class SupplierAnalyticsDto {
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

