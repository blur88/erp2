import {
  IsString,
  IsBoolean,
  IsOptional,
  IsEnum,
  MaxLength,
  IsInt,
  Min,
  Matches,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { CustomerType } from '../../../database/entities/customer.entity';

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
  @Matches(/^[\+]?[\d\s\-\(\)]+$/, {
    message: 'Phone number must contain only digits, spaces, hyphens, parentheses, and an optional plus sign'
  })
  phone?: string;

  @ApiPropertyOptional({
    description: 'Street address',
    example: '123 Main Street',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  streetAddress?: string;

  @ApiPropertyOptional({
    description: 'City',
    example: 'New York',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  city?: string;

  @ApiPropertyOptional({
    description: 'State or province',
    example: 'NY',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  state?: string;

  @ApiPropertyOptional({
    description: 'Postal or ZIP code',
    example: '10001',
  })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  postalCode?: string;

  @ApiPropertyOptional({
    description: 'Country',
    example: 'United States',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  country?: string;

  @ApiPropertyOptional({
    description: 'Price list ID for this customer',
    example: 'uuid-string',
  })
  @IsOptional()
  @IsString()
  priceListId?: string;


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
  @Matches(/^[\+]?[\d\s\-\(\)]+$/, {
    message: 'Phone number must contain only digits, spaces, hyphens, parentheses, and an optional plus sign'
  })
  phone?: string;

  @ApiPropertyOptional({
    description: 'Street address',
    example: '123 Main Street',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  streetAddress?: string;

  @ApiPropertyOptional({
    description: 'City',
    example: 'New York',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  city?: string;

  @ApiPropertyOptional({
    description: 'State or province',
    example: 'NY',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  state?: string;

  @ApiPropertyOptional({
    description: 'Postal or ZIP code',
    example: '10001',
  })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  postalCode?: string;

  @ApiPropertyOptional({
    description: 'Country',
    example: 'United States',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  country?: string;

  @ApiPropertyOptional({
    description: 'Whether the customer is active',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({
    description: 'Price list ID for this customer',
    example: 'uuid-string',
  })
  @IsOptional()
  @IsString()
  priceListId?: string;

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
    description: 'Filter by price list ID',
    example: 'uuid-string',
  })
  @IsOptional()
  @IsString()
  priceListId?: string;

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
  @Transform(({ value }) => value?.toUpperCase())
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

  @ApiProperty({ enum: CustomerType, example: CustomerType.BUSINESS })
  type: CustomerType;

  @ApiProperty({ example: 'Acme Corporation' })
  name: string;

  @ApiProperty({ example: '+1234567890', nullable: true })
  phone?: string;

  @ApiProperty({ example: '123 Main Street', nullable: true })
  streetAddress?: string;

  @ApiProperty({ example: 'New York', nullable: true })
  city?: string;

  @ApiProperty({ example: 'NY', nullable: true })
  state?: string;

  @ApiProperty({ example: '10001', nullable: true })
  postalCode?: string;

  @ApiProperty({ example: 'United States', nullable: true })
  country?: string;

  @ApiProperty({ example: true })
  isActive: boolean;

  @ApiProperty({ example: 'uuid-string', nullable: true })
  priceListId?: string;

  @ApiProperty({ example: { id: 'uuid', name: 'Retail', code: 'RETAIL', isDefault: true, isActive: true }, nullable: true })
  priceList?: {
    id: string;
    name: string;
    code: string;
    isDefault: boolean;
    isActive: boolean;
  };

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

  @ApiProperty({ example: '2023-12-15T00:00:00Z', nullable: true })
  deletedAt?: Date;

  // Computed properties
  @ApiProperty({ example: 2000.00 })
  averageOrderValue: number;
}

export class CustomerSummaryDto {
  @ApiProperty({ example: 'uuid-string' })
  id: string;

  @ApiProperty({ example: 'Acme Corporation' })
  name: string;

  @ApiProperty({ example: '+1234567890', nullable: true })
  phone?: string;

}
