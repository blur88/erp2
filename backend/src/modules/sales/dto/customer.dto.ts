import {
  IsString,
  IsBoolean,
  IsOptional,
  IsEnum,
  MaxLength,
  IsInt,
  Min,
  ValidateIf,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { CustomerType, CustomerStatus, PriceLevel } from '../../../database/entities/customer.entity';

export class CreateCustomerDto {
  @ApiProperty({
    description: 'Customer type (individual/business)',
    enum: CustomerType,
    example: CustomerType.BUSINESS,
  })
  @IsEnum(CustomerType)
  type: CustomerType;

  @ApiProperty({
    description: 'Customer name or business name',
    maxLength: 200,
    example: 'Acme Corporation',
  })
  @IsString()
  @MaxLength(200)
  name: string;

  @ApiPropertyOptional({
    description: 'Primary phone number',
    example: '+1234567890',
  })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;


  @ApiPropertyOptional({
    description: 'Default price level for this customer',
    enum: PriceLevel,
    example: PriceLevel.WHOLESALE,
  })
  @IsOptional()
  @IsEnum(PriceLevel)
  priceLevel?: PriceLevel;


  @ApiPropertyOptional({
    description: 'Internal notes about the customer',
    example: 'VIP customer, requires special handling',
  })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateCustomerDto {
  @ApiPropertyOptional({
    description: 'Customer name or business name',
    maxLength: 200,
    example: 'Acme Corporation Ltd.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @ApiPropertyOptional({
    description: 'Primary phone number',
    example: '+1234567890',
  })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;


  @ApiPropertyOptional({
    description: 'Customer status',
    enum: CustomerStatus,
    example: CustomerStatus.ACTIVE,
  })
  @IsOptional()
  @IsEnum(CustomerStatus)
  status?: CustomerStatus;

  @ApiPropertyOptional({
    description: 'Whether the customer is active',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({
    description: 'Default price level for this customer',
    enum: PriceLevel,
    example: PriceLevel.WHOLESALE,
  })
  @IsOptional()
  @IsEnum(PriceLevel)
  priceLevel?: PriceLevel;


  @ApiPropertyOptional({
    description: 'Internal notes about the customer',
    example: 'Customer upgraded to premium tier',
  })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class QueryCustomersDto {
  @ApiPropertyOptional({
    description: 'Search term for customer name, email, or phone',
    example: 'acme',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    description: 'Filter by customer type',
    enum: CustomerType,
    example: CustomerType.BUSINESS,
  })
  @IsOptional()
  @IsEnum(CustomerType)
  type?: CustomerType;

  @ApiPropertyOptional({
    description: 'Filter by customer status',
    enum: CustomerStatus,
    example: CustomerStatus.ACTIVE,
  })
  @IsOptional()
  @IsEnum(CustomerStatus)
  status?: CustomerStatus;

  @ApiPropertyOptional({
    description: 'Filter by price level',
    enum: PriceLevel,
    example: PriceLevel.WHOLESALE,
  })
  @IsOptional()
  @Transform(({ value }) => value === '' ? undefined : value)
  @ValidateIf(o => o.priceLevel !== '' && o.priceLevel !== undefined)
  @IsEnum(PriceLevel, { message: 'priceLevel must be one of: retail, wholesale, special' })
  priceLevel?: PriceLevel;

  @ApiPropertyOptional({
    description: 'Filter by active status',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true' || value === true)
  isActive?: boolean;

  @ApiPropertyOptional({
    description: 'Sort field',
    example: 'name',
  })
  @IsOptional()
  @IsString()
  sortBy?: string;

  @ApiPropertyOptional({
    description: 'Sort order',
    enum: ['ASC', 'DESC'],
    example: 'ASC',
  })
  @IsOptional()
  @IsEnum(['ASC', 'DESC'])
  sortOrder?: 'ASC' | 'DESC';

  @ApiPropertyOptional({
    description: 'Page number',
    example: 1,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Transform(({ value }) => parseInt(value))
  page?: number;

  @ApiPropertyOptional({
    description: 'Items per page',
    example: 20,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Transform(({ value }) => parseInt(value))
  limit?: number;
}

export class CustomerResponseDto {
  @ApiProperty({ example: 'uuid-string' })
  id: string;

  @ApiProperty({ example: 'CUST001' })
  customerCode: string;

  @ApiProperty({ enum: CustomerType, example: CustomerType.BUSINESS })
  type: CustomerType;

  @ApiProperty({ example: 'Acme Corporation' })
  name: string;

  @ApiProperty({ example: '+1234567890', nullable: true })
  phone?: string;

  @ApiProperty({ enum: CustomerStatus, example: CustomerStatus.ACTIVE })
  status: CustomerStatus;

  @ApiProperty({ example: true })
  isActive: boolean;

  @ApiProperty({ enum: PriceLevel, example: PriceLevel.WHOLESALE })
  priceLevel: PriceLevel;

  @ApiProperty({ example: 50000.00 })
  totalSales: number;

  @ApiProperty({ example: 25 })
  totalOrders: number;

  @ApiProperty({ example: '2023-12-01T00:00:00Z', nullable: true })
  lastPurchaseDate?: Date;

  @ApiProperty({ example: '2023-01-15T00:00:00Z', nullable: true })
  firstPurchaseDate?: Date;

  @ApiProperty({ example: 'VIP customer, requires special handling', nullable: true })
  notes?: string;

  @ApiProperty({ example: '2023-01-01T00:00:00Z' })
  createdAt: Date;

  @ApiProperty({ example: '2023-12-01T00:00:00Z' })
  updatedAt: Date;

  // Computed properties
  @ApiProperty({ example: 2000.00 })
  averageOrderValue: number;
}

export class CustomerSummaryDto {
  @ApiProperty({ example: 'uuid-string' })
  id: string;

  @ApiProperty({ example: 'CUST001' })
  customerCode: string;

  @ApiProperty({ example: 'Acme Corporation' })
  name: string;

  @ApiProperty({ example: '+1234567890', nullable: true })
  phone?: string;

  @ApiProperty({ enum: CustomerStatus, example: CustomerStatus.ACTIVE })
  status: CustomerStatus;
}

