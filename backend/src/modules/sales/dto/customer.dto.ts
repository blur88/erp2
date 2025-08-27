import {
  IsString,
  IsEmail,
  IsBoolean,
  IsOptional,
  IsEnum,
  IsUUID,
  MaxLength,
  IsPhoneNumber,
  IsDecimal,
  Min,
  IsInt,
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
    description: 'Contact person name (for business customers)',
    maxLength: 200,
    example: 'John Smith',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  contactPerson?: string;

  @ApiPropertyOptional({
    description: 'Customer email address',
    maxLength: 100,
    example: 'john@acme.com',
  })
  @IsOptional()
  @IsEmail()
  @MaxLength(100)
  email?: string;

  @ApiPropertyOptional({
    description: 'Primary phone number',
    example: '+1234567890',
  })
  @IsOptional()
  @IsPhoneNumber()
  phone?: string;

  @ApiPropertyOptional({
    description: 'Alternative phone number',
    example: '+1234567891',
  })
  @IsOptional()
  @IsPhoneNumber()
  alternativePhone?: string;

  @ApiPropertyOptional({
    description: 'Tax ID or business registration number',
    maxLength: 30,
    example: 'TAX123456789',
  })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  taxId?: string;

  @ApiPropertyOptional({
    description: 'Billing address',
    example: '123 Main Street',
  })
  @IsOptional()
  @IsString()
  billingAddress?: string;

  @ApiPropertyOptional({
    description: 'Billing city',
    maxLength: 100,
    example: 'New York',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  billingCity?: string;

  @ApiPropertyOptional({
    description: 'Billing state/province',
    maxLength: 100,
    example: 'NY',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  billingState?: string;

  @ApiPropertyOptional({
    description: 'Billing postal code',
    maxLength: 20,
    example: '10001',
  })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  billingPostalCode?: string;

  @ApiPropertyOptional({
    description: 'Billing country',
    maxLength: 100,
    example: 'United States',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  billingCountry?: string;

  @ApiPropertyOptional({
    description: 'Shipping address (if different from billing)',
    example: '456 Oak Avenue',
  })
  @IsOptional()
  @IsString()
  shippingAddress?: string;

  @ApiPropertyOptional({
    description: 'Shipping city',
    maxLength: 100,
    example: 'Los Angeles',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  shippingCity?: string;

  @ApiPropertyOptional({
    description: 'Shipping state/province',
    maxLength: 100,
    example: 'CA',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  shippingState?: string;

  @ApiPropertyOptional({
    description: 'Shipping postal code',
    maxLength: 20,
    example: '90210',
  })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  shippingPostalCode?: string;

  @ApiPropertyOptional({
    description: 'Shipping country',
    maxLength: 100,
    example: 'United States',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  shippingCountry?: string;

  @ApiPropertyOptional({
    description: 'Default price level for this customer',
    enum: PriceLevel,
    example: PriceLevel.WHOLESALE,
  })
  @IsOptional()
  @IsEnum(PriceLevel)
  priceLevel?: PriceLevel;

  @ApiPropertyOptional({
    description: 'Credit limit for this customer',
    example: 10000.00,
  })
  @IsOptional()
  @IsDecimal({ decimal_digits: '0,4' })
  @Min(0)
  @Transform(({ value }) => parseFloat(value))
  creditLimit?: number;

  @ApiPropertyOptional({
    description: 'Payment terms in days',
    example: 30,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  paymentTermsDays?: number;

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
    description: 'Contact person name (for business customers)',
    maxLength: 200,
    example: 'Jane Doe',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  contactPerson?: string;

  @ApiPropertyOptional({
    description: 'Customer email address',
    maxLength: 100,
    example: 'jane@acme.com',
  })
  @IsOptional()
  @IsEmail()
  @MaxLength(100)
  email?: string;

  @ApiPropertyOptional({
    description: 'Primary phone number',
    example: '+1234567890',
  })
  @IsOptional()
  @IsPhoneNumber()
  phone?: string;

  @ApiPropertyOptional({
    description: 'Alternative phone number',
    example: '+1234567891',
  })
  @IsOptional()
  @IsPhoneNumber()
  alternativePhone?: string;

  @ApiPropertyOptional({
    description: 'Tax ID or business registration number',
    maxLength: 30,
    example: 'TAX123456789',
  })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  taxId?: string;

  @ApiPropertyOptional({
    description: 'Billing address',
    example: '123 Main Street Suite 100',
  })
  @IsOptional()
  @IsString()
  billingAddress?: string;

  @ApiPropertyOptional({
    description: 'Billing city',
    maxLength: 100,
    example: 'New York',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  billingCity?: string;

  @ApiPropertyOptional({
    description: 'Billing state/province',
    maxLength: 100,
    example: 'NY',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  billingState?: string;

  @ApiPropertyOptional({
    description: 'Billing postal code',
    maxLength: 20,
    example: '10001',
  })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  billingPostalCode?: string;

  @ApiPropertyOptional({
    description: 'Billing country',
    maxLength: 100,
    example: 'United States',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  billingCountry?: string;

  @ApiPropertyOptional({
    description: 'Shipping address (if different from billing)',
    example: '456 Oak Avenue',
  })
  @IsOptional()
  @IsString()
  shippingAddress?: string;

  @ApiPropertyOptional({
    description: 'Shipping city',
    maxLength: 100,
    example: 'Los Angeles',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  shippingCity?: string;

  @ApiPropertyOptional({
    description: 'Shipping state/province',
    maxLength: 100,
    example: 'CA',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  shippingState?: string;

  @ApiPropertyOptional({
    description: 'Shipping postal code',
    maxLength: 20,
    example: '90210',
  })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  shippingPostalCode?: string;

  @ApiPropertyOptional({
    description: 'Shipping country',
    maxLength: 100,
    example: 'United States',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  shippingCountry?: string;

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
    description: 'Credit limit for this customer',
    example: 15000.00,
  })
  @IsOptional()
  @IsDecimal({ decimal_digits: '0,4' })
  @Min(0)
  @Transform(({ value }) => parseFloat(value))
  creditLimit?: number;

  @ApiPropertyOptional({
    description: 'Payment terms in days',
    example: 45,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  paymentTermsDays?: number;

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
  @IsEnum(PriceLevel)
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

  @ApiProperty({ example: 'John Smith', nullable: true })
  contactPerson?: string;

  @ApiProperty({ example: 'john@acme.com', nullable: true })
  email?: string;

  @ApiProperty({ example: '+1234567890', nullable: true })
  phone?: string;

  @ApiProperty({ example: '+1234567891', nullable: true })
  alternativePhone?: string;

  @ApiProperty({ example: 'TAX123456789', nullable: true })
  taxId?: string;

  @ApiProperty({ example: '123 Main Street', nullable: true })
  billingAddress?: string;

  @ApiProperty({ example: 'New York', nullable: true })
  billingCity?: string;

  @ApiProperty({ example: 'NY', nullable: true })
  billingState?: string;

  @ApiProperty({ example: '10001', nullable: true })
  billingPostalCode?: string;

  @ApiProperty({ example: 'United States', nullable: true })
  billingCountry?: string;

  @ApiProperty({ example: '456 Oak Avenue', nullable: true })
  shippingAddress?: string;

  @ApiProperty({ example: 'Los Angeles', nullable: true })
  shippingCity?: string;

  @ApiProperty({ example: 'CA', nullable: true })
  shippingState?: string;

  @ApiProperty({ example: '90210', nullable: true })
  shippingPostalCode?: string;

  @ApiProperty({ example: 'United States', nullable: true })
  shippingCountry?: string;

  @ApiProperty({ enum: CustomerStatus, example: CustomerStatus.ACTIVE })
  status: CustomerStatus;

  @ApiProperty({ example: true })
  isActive: boolean;

  @ApiProperty({ enum: PriceLevel, example: PriceLevel.WHOLESALE })
  priceLevel: PriceLevel;

  @ApiProperty({ example: 10000.00 })
  creditLimit: number;

  @ApiProperty({ example: 2500.00 })
  currentBalance: number;

  @ApiProperty({ example: 30 })
  paymentTermsDays: number;

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
  @ApiProperty({ example: '123 Main Street, New York, NY, 10001, United States' })
  fullAddress: string;

  @ApiProperty({ example: '456 Oak Avenue, Los Angeles, CA, 90210, United States' })
  fullShippingAddress: string;

  @ApiProperty({ example: 7500.00 })
  availableCredit: number;

  @ApiProperty({ example: false })
  isOverCreditLimit: boolean;

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

  @ApiProperty({ example: 'john@acme.com', nullable: true })
  email?: string;

  @ApiProperty({ example: '+1234567890', nullable: true })
  phone?: string;

  @ApiProperty({ enum: CustomerStatus, example: CustomerStatus.ACTIVE })
  status: CustomerStatus;

  @ApiProperty({ example: 2500.00 })
  currentBalance: number;

  @ApiProperty({ example: 10000.00 })
  creditLimit: number;

  @ApiProperty({ example: 7500.00 })
  availableCredit: number;
}

export class CreditCheckDto {
  @ApiProperty({
    description: 'Customer ID to check credit for',
    example: 'uuid-string',
  })
  @IsUUID()
  customerId: string;

  @ApiProperty({
    description: 'Amount to check against credit limit',
    example: 5000.00,
  })
  @IsDecimal({ decimal_digits: '0,4' })
  @Min(0.01)
  @Transform(({ value }) => parseFloat(value))
  amount: number;
}

export class CreditCheckResponseDto {
  @ApiProperty({ example: true })
  approved: boolean;

  @ApiProperty({ example: 10000.00 })
  creditLimit: number;

  @ApiProperty({ example: 2500.00 })
  currentBalance: number;

  @ApiProperty({ example: 7500.00 })
  availableCredit: number;

  @ApiProperty({ example: 5000.00 })
  requestedAmount: number;

  @ApiProperty({ example: 2500.00 })
  remainingCreditAfterPurchase: number;

  @ApiProperty({ example: 'Credit approved', nullable: true })
  message?: string;
}