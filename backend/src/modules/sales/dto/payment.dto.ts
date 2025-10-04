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
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { 
  PaymentMethod, 
  PaymentStatus, 
  PaymentType 
} from '../../../database/entities/payment.entity';

export class CreatePaymentDto {
  @ApiProperty({
    description: 'Customer ID',
    example: 'uuid-string',
  })
  @IsUUID()
  customerId: string;

  @ApiPropertyOptional({
    description: 'Invoice ID (optional for advance payments)',
    example: 'uuid-string',
  })
  @IsOptional()
  @IsUUID()
  invoiceId?: string;

  @ApiProperty({
    description: 'Payment method',
    enum: PaymentMethod,
    example: PaymentMethod.CREDIT_CARD,
  })
  @IsEnum(PaymentMethod)
  paymentMethod: PaymentMethod;

  @ApiProperty({
    description: 'Payment date',
    example: '2023-12-01',
  })
  @IsDate()
  @Transform(({ value }) => new Date(value))
  paymentDate: Date;

  @ApiProperty({
    description: 'Payment amount',
    example: 1500.50,
  })
  @IsDecimal({ decimal_digits: '0,4' })
  @Min(0.01)
  @Transform(({ value }) => parseFloat(value))
  amount: number;

  @ApiPropertyOptional({
    description: 'Payment type',
    enum: PaymentType,
    example: PaymentType.PAYMENT,
  })
  @IsOptional()
  @IsEnum(PaymentType)
  type?: PaymentType;

  @ApiPropertyOptional({
    description: 'Reference number (check number, transaction ID, etc.)',
    maxLength: 100,
    example: 'CHK001234',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  referenceNumber?: string;

  @ApiPropertyOptional({
    description: 'Bank name for checks or transfers',
    maxLength: 100,
    example: 'First National Bank',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  bankName?: string;

  @ApiPropertyOptional({
    description: 'Account number (last 4 digits for cards)',
    maxLength: 50,
    example: '****1234',
  })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  accountNumber?: string;

  @ApiPropertyOptional({
    description: 'Check date or transaction date',
    example: '2023-12-01',
  })
  @IsOptional()
  @IsDate()
  @Transform(({ value }) => value ? new Date(value) : undefined)
  transactionDate?: Date;

  @ApiPropertyOptional({
    description: 'Payment currency',
    maxLength: 10,
    example: 'USD',
  })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  currency?: string;

  @ApiPropertyOptional({
    description: 'Exchange rate to base currency',
    example: 1.0,
  })
  @IsOptional()
  @IsDecimal({ decimal_digits: '0,6' })
  @Min(0)
  @Transform(({ value }) => parseFloat(value))
  exchangeRate?: number;

  @ApiPropertyOptional({
    description: 'Payment processor (Stripe, PayPal, etc.)',
    maxLength: 100,
    example: 'Stripe',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  processor?: string;

  @ApiPropertyOptional({
    description: 'Processor transaction ID',
    maxLength: 100,
    example: 'txn_1234567890',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  processorTransactionId?: string;

  @ApiPropertyOptional({
    description: 'Processing fees charged',
    example: 45.50,
  })
  @IsOptional()
  @IsDecimal({ decimal_digits: '0,4' })
  @Min(0)
  @Transform(({ value }) => parseFloat(value))
  processingFee?: number;

  @ApiPropertyOptional({
    description: 'Payment notes or description',
    example: 'Payment for invoice INV-2023-001',
  })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({
    description: 'Internal notes',
    example: 'Customer called to confirm payment',
  })
  @IsOptional()
  @IsString()
  internalNotes?: string;
}

export class UpdatePaymentDto {
  @ApiPropertyOptional({
    description: 'Payment status',
    enum: PaymentStatus,
    example: PaymentStatus.COMPLETED,
  })
  @IsOptional()
  @IsEnum(PaymentStatus)
  status?: PaymentStatus;

  @ApiPropertyOptional({
    description: 'Reference number (check number, transaction ID, etc.)',
    maxLength: 100,
    example: 'CHK001234',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  referenceNumber?: string;

  @ApiPropertyOptional({
    description: 'Date when payment was cleared/processed',
    example: '2023-12-02',
  })
  @IsOptional()
  @IsDate()
  @Transform(({ value }) => value ? new Date(value) : undefined)
  clearedDate?: Date;

  @ApiPropertyOptional({
    description: 'Payment notes or description',
    example: 'Payment confirmed by bank',
  })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({
    description: 'Internal notes',
    example: 'Payment cleared successfully',
  })
  @IsOptional()
  @IsString()
  internalNotes?: string;
}

export class QueryPaymentsDto {
  @ApiPropertyOptional({
    description: 'Filter by customer ID',
    example: 'uuid-string',
  })
  @IsOptional()
  @IsUUID()
  customerId?: string;

  @ApiPropertyOptional({
    description: 'Filter by invoice ID',
    example: 'uuid-string',
  })
  @IsOptional()
  @IsUUID()
  invoiceId?: string;

  @ApiPropertyOptional({
    description: 'Filter by payment method',
    enum: PaymentMethod,
    example: PaymentMethod.CREDIT_CARD,
  })
  @IsOptional()
  @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod;

  @ApiPropertyOptional({
    description: 'Filter by payment status',
    enum: PaymentStatus,
    example: PaymentStatus.COMPLETED,
  })
  @IsOptional()
  @IsEnum(PaymentStatus)
  status?: PaymentStatus;

  @ApiPropertyOptional({
    description: 'Filter by payment type',
    enum: PaymentType,
    example: PaymentType.PAYMENT,
  })
  @IsOptional()
  @IsEnum(PaymentType)
  type?: PaymentType;

  @ApiPropertyOptional({
    description: 'Filter payments from date',
    example: '2023-01-01',
  })
  @IsOptional()
  @IsDate()
  @Transform(({ value }) => value ? new Date(value) : undefined)
  fromDate?: Date;

  @ApiPropertyOptional({
    description: 'Filter payments to date',
    example: '2023-12-31',
  })
  @IsOptional()
  @IsDate()
  @Transform(({ value }) => value ? new Date(value) : undefined)
  toDate?: Date;

  @ApiPropertyOptional({
    description: 'Search by reference number',
    example: 'CHK001',
  })
  @IsOptional()
  @IsString()
  referenceNumber?: string;

  @ApiPropertyOptional({
    description: 'Search by payment number or customer name',
    example: 'PAY-000001',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    description: 'Sort field',
    example: 'paymentDate',
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

export class PaymentResponseDto {
  @ApiProperty({ example: 'uuid-string' })
  id: string;

  @ApiProperty({ example: 'PAY-ABC123' })
  paymentNumber: string;

  @ApiProperty({ enum: PaymentType, example: PaymentType.PAYMENT })
  type: PaymentType;

  @ApiProperty({ enum: PaymentStatus, example: PaymentStatus.COMPLETED })
  status: PaymentStatus;

  @ApiProperty({ enum: PaymentMethod, example: PaymentMethod.CREDIT_CARD })
  paymentMethod: PaymentMethod;

  @ApiProperty({ example: '2023-12-01T00:00:00Z' })
  paymentDate: Date;

  @ApiProperty({ example: 1500.50 })
  amount: number;

  @ApiProperty({ example: 'CHK001234', nullable: true })
  referenceNumber?: string;

  @ApiProperty({ example: 'First National Bank', nullable: true })
  bankName?: string;

  @ApiProperty({ example: '****1234', nullable: true })
  accountNumber?: string;

  @ApiProperty({ example: '2023-12-01T00:00:00Z', nullable: true })
  transactionDate?: Date;

  @ApiProperty({ example: '2023-12-02T00:00:00Z', nullable: true })
  clearedDate?: Date;

  @ApiProperty({ example: 'USD' })
  currency: string;

  @ApiProperty({ example: 1.0 })
  exchangeRate: number;

  @ApiProperty({ example: 1500.50, nullable: true })
  baseCurrencyAmount?: number;

  @ApiProperty({ example: 'Stripe', nullable: true })
  processor?: string;

  @ApiProperty({ example: 'txn_1234567890', nullable: true })
  processorTransactionId?: string;

  @ApiProperty({ example: 45.50 })
  processingFee: number;

  @ApiProperty({ example: 1455.00, nullable: true })
  netAmount?: number;

  @ApiProperty({ example: 'Payment for invoice INV-2023-001', nullable: true })
  notes?: string;

  @ApiProperty({ example: 'uuid-string' })
  customerId: string;

  @ApiProperty({ example: 'uuid-string', nullable: true })
  invoiceId?: string;

  @ApiProperty({ example: 'uuid-string' })
  recordedByUserId: string;

  @ApiProperty({ example: '2023-12-01T00:00:00Z' })
  createdAt: Date;

  @ApiProperty({ example: '2023-12-01T00:00:00Z' })
  updatedAt: Date;

  @ApiProperty({ example: '2024-01-01T00:00:00Z', nullable: true })
  deletedAt?: Date;

  // Computed properties
  @ApiProperty({ example: true })
  isCompleted: boolean;

  @ApiProperty({ example: false })
  isPending: boolean;

  @ApiProperty({ example: false })
  isFailed: boolean;

  @ApiProperty({ example: false })
  isRefund: boolean;

  @ApiProperty({ example: 1500.50 })
  effectiveAmount: number;

  // Relationship data
  @ApiProperty({ example: 'John Doe' })
  customerName: string;

  @ApiProperty({ type: () => Object, nullable: true })
  customer?: {
    id: string;
    name: string;
    phone?: string;
  };

  @ApiProperty({ type: () => Object, nullable: true })
  invoice?: {
    id: string;
    invoiceNumber: string;
  };

  @ApiProperty({ example: 'uuid-string', nullable: true })
  relatedInvoiceId?: string;

  @ApiProperty({ example: 'INV-2023-001', nullable: true })
  relatedInvoiceNumber?: string;

  @ApiProperty({ example: 'uuid-string', nullable: true })
  relatedOrderId?: string;

  @ApiProperty({ example: 'SO-2023-001', nullable: true })
  relatedOrderNumber?: string;
}

export class ProcessPaymentDto {
  @ApiProperty({
    description: 'Customer ID',
    example: 'uuid-string',
  })
  @IsUUID()
  customerId: string;

  @ApiPropertyOptional({
    description: 'Invoice ID (optional for advance payments)',
    example: 'uuid-string',
  })
  @IsOptional()
  @IsUUID()
  invoiceId?: string;

  @ApiProperty({
    description: 'Payment amount',
    example: 1500.50,
  })
  @IsDecimal({ decimal_digits: '0,4' })
  @Min(0.01)
  @Transform(({ value }) => parseFloat(value))
  amount: number;

  @ApiProperty({
    description: 'Payment method',
    enum: PaymentMethod,
    example: PaymentMethod.CREDIT_CARD,
  })
  @IsEnum(PaymentMethod)
  paymentMethod: PaymentMethod;

  @ApiPropertyOptional({
    description: 'Payment processor specific data',
    example: {
      cardToken: 'tok_1234567890',
      paymentIntentId: 'pi_1234567890',
    },
  })
  @IsOptional()
  processorData?: Record<string, any>;
}

export class RefundPaymentDto {
  @ApiProperty({
    description: 'Payment ID to refund',
    example: 'uuid-string',
  })
  @IsUUID()
  paymentId: string;

  @ApiPropertyOptional({
    description: 'Refund amount (defaults to full amount)',
    example: 500.00,
  })
  @IsOptional()
  @IsDecimal({ decimal_digits: '0,4' })
  @Min(0.01)
  @Transform(({ value }) => parseFloat(value))
  amount?: number;

  @ApiPropertyOptional({
    description: 'Reason for refund',
    example: 'Customer requested refund due to defective product',
  })
  @IsOptional()
  @IsString()
  reason?: string;
}

export class AllocationDto {
  @ApiProperty({
    description: 'Invoice ID to allocate payment to',
    example: 'uuid-string',
  })
  @IsUUID()
  invoiceId: string;

  @ApiProperty({
    description: 'Amount to allocate to this invoice',
    example: 750.25,
  })
  @IsDecimal({ decimal_digits: '0,4' })
  @Min(0.01)
  @Transform(({ value }) => parseFloat(value))
  amount: number;
}

export class AllocatePaymentDto {
  @ApiProperty({
    description: 'Payment ID to allocate',
    example: 'uuid-string',
  })
  @IsUUID()
  paymentId: string;

  @ApiProperty({
    description: 'Invoice allocations',
    type: [AllocationDto],
    example: [
      { invoiceId: 'uuid-1', amount: 750.25 },
      { invoiceId: 'uuid-2', amount: 750.25 },
    ],
  })
  @Type(() => AllocationDto)
  allocations: AllocationDto[];
}

export class PaymentSummaryDto {
  @ApiProperty({ example: 'uuid-string' })
  id: string;

  @ApiProperty({ example: 'PAY-ABC123' })
  paymentNumber: string;

  @ApiProperty({ example: '2023-12-01T00:00:00Z' })
  paymentDate: Date;

  @ApiProperty({ example: 1500.50 })
  amount: number;

  @ApiProperty({ enum: PaymentMethod, example: PaymentMethod.CREDIT_CARD })
  paymentMethod: PaymentMethod;

  @ApiProperty({ enum: PaymentStatus, example: PaymentStatus.COMPLETED })
  status: PaymentStatus;

  @ApiProperty({ example: 'CHK001234', nullable: true })
  referenceNumber?: string;
}