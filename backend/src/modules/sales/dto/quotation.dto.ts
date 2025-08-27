import {
  IsString,
  IsOptional,
  IsEnum,
  IsUUID,
  IsDecimal,
  Min,
  IsDate,
  MaxLength,
  IsInt,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';

export enum QuotationStatus {
  DRAFT = 'draft',
  SENT = 'sent',
  ACCEPTED = 'accepted',
  REJECTED = 'rejected',
  EXPIRED = 'expired',
  CONVERTED = 'converted',
}

export class QuotationItemDto {
  @ApiProperty({
    description: 'Product ID',
    example: 'uuid-string',
  })
  @IsUUID()
  productId: string;

  @ApiProperty({
    description: 'Quantity requested',
    example: 10,
  })
  @IsInt()
  @Min(1)
  quantity: number;

  @ApiProperty({
    description: 'Unit price for this quotation',
    example: 25.50,
  })
  @IsDecimal({ decimal_digits: '0,4' })
  @Min(0)
  @Transform(({ value }) => parseFloat(value))
  unitPrice: number;

  @ApiPropertyOptional({
    description: 'Discount percentage for this item',
    example: 5.0,
  })
  @IsOptional()
  @IsDecimal({ decimal_digits: '0,2' })
  @Min(0)
  @Transform(({ value }) => parseFloat(value))
  discountPercent?: number;

  @ApiPropertyOptional({
    description: 'Special notes for this item',
    example: 'Bulk discount applied',
  })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class CreateQuotationDto {
  @ApiProperty({
    description: 'Customer ID',
    example: 'uuid-string',
  })
  @IsUUID()
  customerId: string;

  @ApiPropertyOptional({
    description: 'Quotation reference number',
    maxLength: 50,
    example: 'RFQ-2023-001',
  })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  referenceNumber?: string;

  @ApiProperty({
    description: 'Quotation date',
    example: '2023-12-01',
  })
  @IsDate()
  @Type(() => Date)
  quotationDate: Date;

  @ApiProperty({
    description: 'Valid until date',
    example: '2023-12-31',
  })
  @IsDate()
  @Type(() => Date)
  validUntil: Date;

  @ApiProperty({
    description: 'Quotation items',
    type: [QuotationItemDto],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => QuotationItemDto)
  items: QuotationItemDto[];

  @ApiPropertyOptional({
    description: 'Discount percentage for entire quotation',
    example: 2.5,
  })
  @IsOptional()
  @IsDecimal({ decimal_digits: '0,2' })
  @Min(0)
  @Transform(({ value }) => parseFloat(value))
  discountPercent?: number;

  @ApiPropertyOptional({
    description: 'Tax percentage',
    example: 10.0,
  })
  @IsOptional()
  @IsDecimal({ decimal_digits: '0,2' })
  @Min(0)
  @Transform(({ value }) => parseFloat(value))
  taxPercent?: number;

  @ApiPropertyOptional({
    description: 'Shipping charges',
    example: 50.00,
  })
  @IsOptional()
  @IsDecimal({ decimal_digits: '0,4' })
  @Min(0)
  @Transform(({ value }) => parseFloat(value))
  shippingAmount?: number;

  @ApiPropertyOptional({
    description: 'Terms and conditions',
    example: 'Price valid for 30 days. Payment terms: Net 30.',
  })
  @IsOptional()
  @IsString()
  terms?: string;

  @ApiPropertyOptional({
    description: 'Special notes',
    example: 'Bulk order discount available for quantities over 100',
  })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateQuotationDto {
  @ApiPropertyOptional({
    description: 'Quotation reference number',
    maxLength: 50,
    example: 'RFQ-2023-001-REV1',
  })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  referenceNumber?: string;

  @ApiPropertyOptional({
    description: 'Valid until date',
    example: '2024-01-31',
  })
  @IsOptional()
  @IsDate()
  @Type(() => Date)
  validUntil?: Date;

  @ApiPropertyOptional({
    description: 'Quotation status',
    enum: QuotationStatus,
    example: QuotationStatus.SENT,
  })
  @IsOptional()
  @IsEnum(QuotationStatus)
  status?: QuotationStatus;

  @ApiPropertyOptional({
    description: 'Quotation items',
    type: [QuotationItemDto],
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => QuotationItemDto)
  items?: QuotationItemDto[];

  @ApiPropertyOptional({
    description: 'Discount percentage for entire quotation',
    example: 5.0,
  })
  @IsOptional()
  @IsDecimal({ decimal_digits: '0,2' })
  @Min(0)
  @Transform(({ value }) => parseFloat(value))
  discountPercent?: number;

  @ApiPropertyOptional({
    description: 'Tax percentage',
    example: 10.0,
  })
  @IsOptional()
  @IsDecimal({ decimal_digits: '0,2' })
  @Min(0)
  @Transform(({ value }) => parseFloat(value))
  taxPercent?: number;

  @ApiPropertyOptional({
    description: 'Shipping charges',
    example: 75.00,
  })
  @IsOptional()
  @IsDecimal({ decimal_digits: '0,4' })
  @Min(0)
  @Transform(({ value }) => parseFloat(value))
  shippingAmount?: number;

  @ApiPropertyOptional({
    description: 'Terms and conditions',
    example: 'Updated pricing valid for 45 days. Payment terms: Net 30.',
  })
  @IsOptional()
  @IsString()
  terms?: string;

  @ApiPropertyOptional({
    description: 'Special notes',
    example: 'Revised quotation based on customer feedback',
  })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class QueryQuotationsDto {
  @ApiPropertyOptional({
    description: 'Filter by customer ID',
    example: 'uuid-string',
  })
  @IsOptional()
  @IsUUID()
  customerId?: string;

  @ApiPropertyOptional({
    description: 'Filter by status',
    enum: QuotationStatus,
    example: QuotationStatus.SENT,
  })
  @IsOptional()
  @IsEnum(QuotationStatus)
  status?: QuotationStatus;

  @ApiPropertyOptional({
    description: 'Filter quotations from date',
    example: '2023-01-01',
  })
  @IsOptional()
  @IsDate()
  @Type(() => Date)
  fromDate?: Date;

  @ApiPropertyOptional({
    description: 'Filter quotations to date',
    example: '2023-12-31',
  })
  @IsOptional()
  @IsDate()
  @Type(() => Date)
  toDate?: Date;

  @ApiPropertyOptional({
    description: 'Search by quotation number or reference',
    example: 'QUO-2023',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    description: 'Filter by expiring quotations (days)',
    example: 7,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Transform(({ value }) => parseInt(value))
  expiringInDays?: number;

  @ApiPropertyOptional({
    description: 'Sort field',
    example: 'quotationDate',
  })
  @IsOptional()
  @IsString()
  sortBy?: string;

  @ApiPropertyOptional({
    description: 'Sort order',
    enum: ['ASC', 'DESC'],
    example: 'DESC',
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

export class QuotationItemResponseDto {
  @ApiProperty({ example: 'uuid-string' })
  id: string;

  @ApiProperty({ example: 'uuid-string' })
  productId: string;

  @ApiProperty({ example: 'Product Name' })
  productName: string;

  @ApiProperty({ example: 'PROD-001' })
  productSku: string;

  @ApiProperty({ example: 10 })
  quantity: number;

  @ApiProperty({ example: 25.50 })
  unitPrice: number;

  @ApiProperty({ example: 5.0 })
  discountPercent: number;

  @ApiProperty({ example: 12.75 })
  discountAmount: number;

  @ApiProperty({ example: 242.25 })
  totalAmount: number;

  @ApiProperty({ example: 'Bulk discount applied', nullable: true })
  notes?: string;
}

export class QuotationResponseDto {
  @ApiProperty({ example: 'uuid-string' })
  id: string;

  @ApiProperty({ example: 'QUO-2023-ABC123' })
  quotationNumber: string;

  @ApiProperty({ example: 'RFQ-2023-001', nullable: true })
  referenceNumber?: string;

  @ApiProperty({ enum: QuotationStatus, example: QuotationStatus.SENT })
  status: QuotationStatus;

  @ApiProperty({ example: '2023-12-01T00:00:00Z' })
  quotationDate: Date;

  @ApiProperty({ example: '2023-12-31T23:59:59Z' })
  validUntil: Date;

  @ApiProperty({ example: 1000.00 })
  subtotal: number;

  @ApiProperty({ example: 2.5 })
  discountPercent: number;

  @ApiProperty({ example: 25.00 })
  discountAmount: number;

  @ApiProperty({ example: 10.0 })
  taxPercent: number;

  @ApiProperty({ example: 97.50 })
  taxAmount: number;

  @ApiProperty({ example: 50.00 })
  shippingAmount: number;

  @ApiProperty({ example: 1122.50 })
  totalAmount: number;

  @ApiProperty({ example: 'Price valid for 30 days. Payment terms: Net 30.', nullable: true })
  terms?: string;

  @ApiProperty({ example: 'Bulk order discount available', nullable: true })
  notes?: string;

  @ApiProperty({ example: 'uuid-string' })
  customerId: string;

  @ApiProperty({ example: 'uuid-string' })
  createdByUserId: string;

  @ApiProperty({ example: '2023-12-01T00:00:00Z' })
  createdAt: Date;

  @ApiProperty({ example: '2023-12-01T00:00:00Z' })
  updatedAt: Date;

  @ApiProperty({ type: [QuotationItemResponseDto] })
  items: QuotationItemResponseDto[];

  // Computed properties
  @ApiProperty({ example: true })
  isExpired: boolean;

  @ApiProperty({ example: 15 })
  daysUntilExpiry: number;

  @ApiProperty({ example: true })
  canConvert: boolean;

  @ApiProperty({ example: false })
  canEdit: boolean;
}

export class ConvertQuotationDto {
  @ApiProperty({
    description: 'Quotation ID to convert',
    example: 'uuid-string',
  })
  @IsUUID()
  quotationId: string;

  @ApiPropertyOptional({
    description: 'Customer purchase order number',
    maxLength: 50,
    example: 'PO-2023-001',
  })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  customerPoNumber?: string;

  @ApiPropertyOptional({
    description: 'Required delivery date',
    example: '2024-01-15',
  })
  @IsOptional()
  @IsDate()
  @Type(() => Date)
  requiredDate?: Date;

  @ApiPropertyOptional({
    description: 'Special shipping instructions',
    example: 'Deliver to loading dock',
  })
  @IsOptional()
  @IsString()
  shippingInstructions?: string;
}

export class QuotationSummaryDto {
  @ApiProperty({ example: 'uuid-string' })
  id: string;

  @ApiProperty({ example: 'QUO-2023-ABC123' })
  quotationNumber: string;

  @ApiProperty({ example: 'Acme Corporation' })
  customerName: string;

  @ApiProperty({ example: '2023-12-01T00:00:00Z' })
  quotationDate: Date;

  @ApiProperty({ example: '2023-12-31T23:59:59Z' })
  validUntil: Date;

  @ApiProperty({ example: 1122.50 })
  totalAmount: number;

  @ApiProperty({ enum: QuotationStatus, example: QuotationStatus.SENT })
  status: QuotationStatus;

  @ApiProperty({ example: 15 })
  daysUntilExpiry: number;
}

export class SendQuotationDto {
  @ApiProperty({
    description: 'Quotation ID to send',
    example: 'uuid-string',
  })
  @IsUUID()
  quotationId: string;

  @ApiPropertyOptional({
    description: 'Email addresses to send to (overrides customer email)',
    example: ['customer@example.com', 'manager@example.com'],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  emailAddresses?: string[];

  @ApiPropertyOptional({
    description: 'Email subject (optional)',
    example: 'Your Quotation from Our Company',
  })
  @IsOptional()
  @IsString()
  subject?: string;

  @ApiPropertyOptional({
    description: 'Email message body (optional)',
    example: 'Please find attached your requested quotation. Feel free to contact us with any questions.',
  })
  @IsOptional()
  @IsString()
  message?: string;
}