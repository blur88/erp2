import {
  IsString,
  IsOptional,
  IsEnum,
  IsUUID,
  MaxLength,
  IsDecimal,
  IsDateString,
  Min,
  IsArray,
  ValidateNested,
  IsInt,
  IsBoolean,
  IsNumber,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  InvoiceStatus
} from '../../../database/entities/invoice.entity';


export class CreateInvoiceDto {
  @ApiProperty({
    description: 'Customer ID',
    example: 'uuid-string',
  })
  @IsUUID()
  customerId: string;

  @ApiPropertyOptional({
    description: 'Related sales order ID (if applicable)',
    example: 'uuid-string',
  })
  @IsOptional()
  @IsUUID()
  salesOrderId?: string;

  
  @ApiPropertyOptional({
    description: 'Invoice date (defaults to today)',
    example: '2024-01-01',
  })
  @IsOptional()
  @IsDateString()
  invoiceDate?: string;

  @ApiPropertyOptional({
    description: 'Payment due date (calculated from payment terms if not provided)',
    example: '2024-01-31',
  })
  @IsOptional()
  @IsDateString()
  dueDate?: string;

  
  @ApiProperty({
    description: 'Total invoice amount',
    example: 1000.00,
  })
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  @Transform(({ value }) => parseFloat(value))
  totalAmount: number;

  }

export class UpdateInvoiceDto {
  @ApiPropertyOptional({
    description: 'Invoice status',
    enum: InvoiceStatus,
    example: InvoiceStatus.DRAFT,
  })
  @IsOptional()
  @IsEnum(InvoiceStatus)
  status?: InvoiceStatus;

  @ApiPropertyOptional({
    description: 'Payment due date',
    example: '2024-02-15',
  })
  @IsOptional()
  @IsDateString()
  dueDate?: string;

  }

export class QueryInvoicesDto {
  @ApiPropertyOptional({
    description: 'Search term for invoice number or customer name',
    example: 'INV-2024',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    description: 'Filter by customer ID',
    example: 'uuid-string',
  })
  @IsOptional()
  @IsUUID()
  customerId?: string;

  @ApiPropertyOptional({
    description: 'Filter by sales order ID',
    example: 'uuid-string',
  })
  @IsOptional()
  @IsUUID()
  salesOrderId?: string;

  @ApiPropertyOptional({
    description: 'Filter by invoice status',
    enum: InvoiceStatus,
    example: InvoiceStatus.DRAFT,
  })
  @IsOptional()
  @IsEnum(InvoiceStatus)
  status?: InvoiceStatus;

  
  @ApiPropertyOptional({
    description: 'Filter invoices from date',
    example: '2024-01-01',
  })
  @IsOptional()
  @IsDateString()
  fromDate?: string;

  @ApiPropertyOptional({
    description: 'Filter invoices to date',
    example: '2024-12-31',
  })
  @IsOptional()
  @IsDateString()
  toDate?: string;

  @ApiPropertyOptional({
    description: 'Filter by overdue invoices',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true' || value === true)
  overdue?: boolean;

  @ApiPropertyOptional({
    description: 'Filter by unpaid invoices',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true' || value === true)
  unpaid?: boolean;

  @ApiPropertyOptional({
    description: 'Sort field',
    example: 'invoiceDate',
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

export class InvoiceResponseDto {
  @ApiProperty({ example: 'uuid-string' })
  id: string;

  @ApiProperty({ example: 'INV-2024-001' })
  invoiceNumber: string;

  
  @ApiProperty({ enum: InvoiceStatus, example: InvoiceStatus.DRAFT })
  status: InvoiceStatus;

  @ApiProperty({ example: '2024-01-01' })
  invoiceDate: Date;

  @ApiProperty({ example: '2024-01-31' })
  dueDate: Date;

  @ApiProperty({ example: '2024-01-30', nullable: true })
  paidDate?: Date;

  @ApiProperty({ example: 1000.00 })
  totalAmount: number;

  @ApiProperty({ example: 500.00 })
  paidAmount: number;

  @ApiProperty({ example: 491.50 })
  balanceDue: number;

  @ApiProperty({ example: 'Acme Corporation' })
  customerName: string;

  @ApiProperty({ example: 'uuid-string' })
  customerId: string;

  @ApiProperty({ example: 'uuid-string', nullable: true })
  salesOrderId?: string;

  @ApiProperty()
  customer: {
    id: string;
    name: string;
    email?: string;
    phone?: string;
  };

  @ApiProperty({ nullable: true })
  salesOrder?: {
    id: string;
    orderNumber: string;
    orderDate: Date;
    status: string;
  };

  @ApiProperty({ example: '2024-01-01T00:00:00Z' })
  createdAt: Date;

  @ApiProperty({ example: '2024-01-01T00:00:00Z' })
  updatedAt: Date;

  @ApiProperty({ example: '2024-01-01T00:00:00Z', nullable: true })
  deletedAt?: Date;

  @ApiProperty({ type: 'array', required: false })
  payments?: Array<{
    id: string;
    paymentNumber: string;
    paymentDate: Date;
    amount: number;
    paymentMethod: string;
    status: string;
  }>;

  // Computed properties
  @ApiProperty({ example: false })
  isOverdue: boolean;

  @ApiProperty({ example: 5 })
  daysPastDue: number;

  @ApiProperty({ example: true })
  isPartiallyPaid: boolean;

  @ApiProperty({ example: false })
  isFullyPaid: boolean;

  @ApiProperty({ example: 50.4 })
  paymentProgress: number;
}

export class InvoiceSummaryDto {
  @ApiProperty({ example: 'uuid-string' })
  id: string;

  @ApiProperty({ example: 'INV-2024-001' })
  invoiceNumber: string;

  @ApiProperty({ enum: InvoiceStatus, example: InvoiceStatus.DRAFT })
  status: InvoiceStatus;

  @ApiProperty({ example: '2024-01-01' })
  invoiceDate: Date;

  @ApiProperty({ example: '2024-01-31' })
  dueDate: Date;

  @ApiProperty({ example: 'Acme Corporation' })
  customerName: string;

  @ApiProperty({ example: 991.50 })
  totalAmount: number;

  @ApiProperty({ example: 491.50 })
  balanceDue: number;

  @ApiProperty({ example: false })
  isOverdue: boolean;

  @ApiProperty({ example: 5 })
  daysPastDue: number;
}

export class SendInvoiceDto {
  @ApiPropertyOptional({
    description: 'Email addresses to send to (defaults to customer email)',
    example: ['customer@example.com', 'billing@example.com'],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  emailAddresses?: string[];

  @ApiPropertyOptional({
    description: 'Email subject',
    example: 'Invoice INV-2024-001 from Your Company',
  })
  @IsOptional()
  @IsString()
  subject?: string;

  @ApiPropertyOptional({
    description: 'Email message body',
    example: 'Please find attached your invoice. Payment is due within 30 days.',
  })
  @IsOptional()
  @IsString()
  message?: string;

  // Mark as sent functionality removed
}

export class InvoicePaymentAllocationDto {
  @ApiProperty({
    description: 'Payment ID to allocate',
    example: 'uuid-string',
  })
  @IsUUID()
  paymentId: string;

  @ApiProperty({
    description: 'Amount to allocate to this invoice',
    example: 500.00,
  })
  @IsDecimal({ decimal_digits: '0,4' })
  @Min(0.01)
  @Transform(({ value }) => parseFloat(value))
  amount: number;
}

export class VoidInvoiceDto {
  @ApiProperty({
    description: 'Reason for voiding the invoice',
    example: 'Customer returned all items',
  })
  @IsString()
  reason: string;
}

