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
  IsIn,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { PaymentStatus } from '../../../database/entities/payment.entity';

/**
 * Columns a client may sort payments by. `sortBy` is interpolated into an
 * ORDER BY identifier, so anything outside this list must never reach SQL.
 * Deliberately excludes paymentNumber — the column is retired (issue #946).
 */
export const PAYMENT_SORT_FIELDS = [
  'paymentDate',
  'amount',
  'status',
  'createdAt',
] as const;

export class CreatePaymentDto {
  @ApiProperty({
    description: 'Customer ID',
    example: 'uuid-string',
  })
  @IsUUID()
  customerId: string;

  @ApiPropertyOptional({
    description: 'Sales order ID (optional for advance payments)',
    example: 'uuid-string',
  })
  @IsOptional()
  @IsUUID()
  salesOrderId?: string;

  @ApiProperty({
    description: 'Payment method ID',
    example: 'uuid-string',
  })
  @IsUUID()
  paymentMethodId: string;

  @ApiProperty({
    description: 'Payment date',
    example: '2023-12-01',
  })
  @IsDate()
  @Transform(({ value }) => new Date(value))
  paymentDate: Date;

  @ApiProperty({
    description: 'Payment amount',
    example: 1500.5,
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
    description: 'Filter by sales order ID',
    example: 'uuid-string',
  })
  @IsOptional()
  @IsUUID()
  salesOrderId?: string;

  @ApiPropertyOptional({
    description: 'Filter payments from date',
    example: '2023-01-01',
  })
  @IsOptional()
  @IsDate()
  @Transform(({ value }) => (value ? new Date(value) : undefined))
  fromDate?: Date;

  @ApiPropertyOptional({
    description: 'Filter payments to date',
    example: '2023-12-31',
  })
  @IsOptional()
  @IsDate()
  @Transform(({ value }) => (value ? new Date(value) : undefined))
  toDate?: Date;

  @ApiPropertyOptional({
    description: 'Filter by payment status',
    enum: PaymentStatus,
    example: 'completed',
  })
  @IsOptional()
  @IsEnum(PaymentStatus)
  status?: PaymentStatus;

  @ApiPropertyOptional({
    description: 'Search by customer name',
    example: 'Acme Corp',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    description: 'Sort field',
    example: 'paymentDate',
  })
  @IsOptional()
  @IsIn(PAYMENT_SORT_FIELDS as unknown as string[])
  sortBy?: string;

  @ApiPropertyOptional({
    description: 'Sort order',
    enum: ['ASC', 'DESC'],
    example: 'DESC',
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

export class PaymentResponseDto {
  @ApiProperty({ example: 'uuid-string' })
  id: string;

  @ApiProperty({ enum: PaymentStatus, example: PaymentStatus.COMPLETED })
  status: PaymentStatus;

  @ApiProperty({ example: 'uuid-string' })
  paymentMethodId: string;

  @ApiProperty({
    type: () => Object,
    nullable: true,
    example: { id: 'uuid-string', code: 'CASH', name: 'Cash' },
  })
  paymentMethodEntity?: {
    id: string;
    code: string;
    name: string;
  };

  @ApiProperty({ example: '2023-12-01T00:00:00Z' })
  paymentDate: Date;

  @ApiProperty({ example: 1500.5 })
  amount: number;

  @ApiProperty({ example: 'Payment for invoice INV-2023-001', nullable: true })
  notes?: string;

  @ApiProperty({ example: 'uuid-string' })
  customerId: string;

  @ApiProperty({ example: 'uuid-string', nullable: true })
  salesOrderId?: string;

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
  salesOrder?: {
    id: string;
    orderNumber: string;
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
  relatedSalesOrderId?: string;

  @ApiProperty({ example: 'SO-2023-001', nullable: true })
  relatedSalesOrderNumber?: string;
}

export class ProcessPaymentDto {
  @ApiProperty({
    description: 'Customer ID',
    example: 'uuid-string',
  })
  @IsUUID()
  customerId: string;

  @ApiPropertyOptional({
    description: 'Sales order ID (optional for advance payments)',
    example: 'uuid-string',
  })
  @IsOptional()
  @IsUUID()
  salesOrderId?: string;

  @ApiProperty({
    description: 'Payment method ID',
    example: 'uuid-string',
  })
  @IsUUID()
  paymentMethodId: string;

  @ApiProperty({
    description: 'Payment amount',
    example: 1500.5,
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
    description: 'Sales order ID to allocate payment to',
    example: 'uuid-string',
  })
  @IsUUID()
  salesOrderId: string;

  @ApiProperty({
    description: 'Amount to allocate to this sales order',
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
    description: 'Sales order allocations',
    type: [AllocationDto],
    example: [
      { salesOrderId: 'uuid-1', amount: 750.25 },
      { salesOrderId: 'uuid-2', amount: 750.25 },
    ],
  })
  @Type(() => AllocationDto)
  allocations: AllocationDto[];
}

export class PaymentSummaryDto {
  @ApiProperty({ example: 'uuid-string' })
  id: string;

  @ApiProperty({ example: '2023-12-01T00:00:00Z' })
  paymentDate: Date;

  @ApiProperty({ example: 1500.5 })
  amount: number;

  @ApiProperty({ example: 'uuid-string' })
  paymentMethodId: string;

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
    example: 1500.5,
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
