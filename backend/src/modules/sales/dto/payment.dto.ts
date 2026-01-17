import {
  IsString,
  IsOptional,
  IsEnum,
  IsUUID,
  IsNumber,
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
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0.01)
  @Transform(({ value }) => parseFloat(value))
  amount: number;

  @ApiPropertyOptional({
    description: 'Payment notes or description',
    example: 'Payment for invoice INV-2023-001',
  })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdatePaymentDto {
  @ApiPropertyOptional({
    description: 'Payment notes or description',
    example: 'Payment confirmed by bank',
  })
  @IsOptional()
  @IsString()
  notes?: string;
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

  @ApiProperty({ enum: PaymentStatus, example: PaymentStatus.COMPLETED })
  status: PaymentStatus;

  @ApiProperty({ enum: PaymentMethod, example: PaymentMethod.CASH })
  paymentMethod: PaymentMethod;

  @ApiProperty({ example: '2023-12-01T00:00:00Z' })
  paymentDate: Date;

  @ApiProperty({ example: 1500.50 })
  amount: number;

  @ApiProperty({ example: 'Payment for invoice INV-2023-001', nullable: true })
  notes?: string;

  @ApiProperty({ example: 'uuid-string' })
  customerId: string;

  @ApiProperty({ example: 'uuid-string', nullable: true })
  invoiceId?: string;

  
  @ApiProperty({ example: '2023-12-01T00:00:00Z' })
  createdAt: Date;

  @ApiProperty({ example: '2023-12-01T00:00:00Z' })
  updatedAt: Date;

  @ApiProperty({ example: '2024-01-01T00:00:00Z', nullable: true })
  deletedAt?: Date;

  // Computed properties
  @ApiProperty({ example: true })
  isCompleted: boolean;

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
    totalAmount: number;
    shippingAmount: number;
    items?: Array<{
      id: string;
      quantity: number;
      unitPrice: number;
      discount: number;
      totalAmount: number;
      product?: {
        id: string;
        name: string;
      };
    }>;
    customer?: {
      id: string;
      name: string;
      phone?: string;
      streetAddress?: string;
      city?: string;
      state?: string;
      postalCode?: string;
      country?: string;
    };
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
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0.01)
  @Transform(({ value }) => parseFloat(value))
  amount: number;

  @ApiPropertyOptional({
    description: 'Payment notes or description',
    example: 'Payment for invoice INV-2023-001',
  })
  @IsOptional()
  @IsString()
  notes?: string;
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
  @IsNumber({ maxDecimalPlaces: 4 })
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

  @ApiProperty({ enum: PaymentMethod, example: PaymentMethod.CASH })
  paymentMethod: PaymentMethod;

  @ApiProperty({ enum: PaymentStatus, example: PaymentStatus.COMPLETED })
  status: PaymentStatus;
}

export class RefundPaymentDto {
  @ApiProperty({
    description: 'Payment ID to refund',
    example: 'uuid-string',
  })
  @IsUUID()
  paymentId: string;

  @ApiProperty({
    description: 'Refund amount',
    example: 1500.50,
  })
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0.01)
  @Transform(({ value }) => parseFloat(value))
  amount: number;

  @ApiPropertyOptional({
    description: 'Reason for refund',
    example: 'Customer requested refund',
  })
  @IsOptional()
  @IsString()
  reason?: string;
}