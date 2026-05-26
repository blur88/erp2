import {
  IsString,
  IsOptional,
  IsUUID,
  MaxLength,
  Min,
  IsNumber,
  IsArray,
  ValidateNested,
  IsInt,
  Matches,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { DiscountType } from '../../../database/entities/sales-order-item.entity';
import { BaseQueryDto } from '../../../common/dto/base-query.dto';
import { SalesOrderStatus, SalesOrderPaymentStatus } from '../../../database/entities/sales-order.entity';

export class SalesOrderItemDto {
  @ApiProperty({
    description: 'Product ID',
    example: 'uuid-string',
  })
  @IsUUID()
  productId: string;

  @ApiProperty({
    description: 'Quantity ordered',
    example: 10,
  })
  @IsInt()
  @Min(1)
  quantity: number;

  @ApiPropertyOptional({
    description: 'Unit price (if different from product price)',
    example: 25.50,
  })
  @IsOptional()
  @Transform(({ value }) => value ? parseFloat(value) : undefined)
  unitPrice?: number;

  @ApiPropertyOptional({
    description: 'Type of discount: percentage or fixed amount',
    enum: DiscountType,
    example: DiscountType.PERCENTAGE,
  })
  @IsOptional()
  discountType?: DiscountType;

  @ApiPropertyOptional({
    description: 'Discount percentage for this item (0-100)',
    example: 5.0,
  })
  @IsOptional()
  @Transform(({ value }) => value ? parseFloat(value) : 0)
  discountPercent?: number;

  @ApiPropertyOptional({
    description: 'Discount amount for this item (fixed amount or calculated)',
    example: 12.75,
  })
  @IsOptional()
  @Transform(({ value }) => value ? parseFloat(value) : 0)
  discountAmount?: number;

  @ApiPropertyOptional({
    description: 'Item notes',
    example: 'Special packaging required',
  })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class CreateSalesOrderDto {
  @ApiProperty({
    description: 'Customer ID',
    example: 'uuid-string',
  })
  @IsUUID()
  customerId: string;

  @ApiPropertyOptional({
    description: 'Special instructions or notes',
    example: 'Fragile items, handle with care',
  })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({
    description: 'Shipping/freight charges',
    example: 50.00,
  })
  @IsOptional()
  @Transform(({ value }) => value ? parseFloat(value) : 0)
  shippingAmount?: number;

  @ApiProperty({
    description: 'Order items',
    type: [SalesOrderItemDto],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SalesOrderItemDto)
  items: SalesOrderItemDto[];
}

export class UpdateSalesOrderDto {
  @ApiPropertyOptional({
    description: 'Customer ID',
    example: 'uuid-string',
  })
  @IsOptional()
  @IsUUID()
  customerId?: string;

  @ApiPropertyOptional({
    description: 'Special instructions or notes',
    example: 'Updated delivery instructions',
  })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({
    description: 'Shipping/freight charges',
    example: 50.00,
  })
  @IsOptional()
  @Transform(({ value }) => value ? parseFloat(value) : 0)
  shippingAmount?: number;

  @ApiPropertyOptional({
    description: 'Order items',
    type: [SalesOrderItemDto],
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SalesOrderItemDto)
  items?: SalesOrderItemDto[];
}

export class QuerySalesOrdersDto extends BaseQueryDto {
  @ApiPropertyOptional({
    description: 'Filter by customer ID',
    example: 'uuid-string',
  })
  @IsOptional()
  @IsUUID()
  customerId?: string;


  @ApiPropertyOptional({
    description: 'Filter orders from date',
    example: '2024-01-01',
  })
  @IsOptional()
  @IsString()
  fromDate?: string;

  @ApiPropertyOptional({
    description: 'Filter orders to date',
    example: '2024-12-31',
  })
  @IsOptional()
  @IsString()
  toDate?: string;

  @ApiPropertyOptional({ enum: SalesOrderPaymentStatus })
  @IsOptional()
  paymentStatus?: SalesOrderPaymentStatus | 'all';

  @ApiPropertyOptional({ enum: SalesOrderStatus })
  @IsOptional()
  status?: SalesOrderStatus | 'all';
}

export class SalesOrderItemResponseDto {
  @ApiProperty({ example: 'uuid-string' })
  id: string;

  @ApiProperty({ example: 'uuid-string' })
  productId: string;

  @ApiProperty({ example: 10 })
  quantity: number;

  @ApiProperty({ example: 25.50 })
  unitPrice: number;

  @ApiProperty({ enum: DiscountType, example: DiscountType.PERCENTAGE })
  discountType: DiscountType;

  @ApiProperty({ example: 5.0 })
  discountPercent: number;

  @ApiProperty({ example: 12.75 })
  discountAmount: number;

  @ApiProperty({ example: 242.25 })
  totalAmount: number;

  @ApiProperty({ example: 'Special packaging required', nullable: true })
  notes?: string;

  @ApiProperty({ example: '2024-01-01T00:00:00Z' })
  createdAt: Date;

  @ApiProperty({ example: '2024-01-01T00:00:00Z' })
  updatedAt: Date;
}

export class SalesOrderResponseDto {
  @ApiProperty({ example: 'uuid-string' })
  id: string;

  @ApiProperty({ example: 'SO-2024-001' })
  orderNumber: string;

  @ApiProperty({ example: '2024-01-01' })
  orderDate: Date;

  @ApiProperty({ enum: SalesOrderStatus })
  status: SalesOrderStatus;

  @ApiProperty({ enum: SalesOrderPaymentStatus })
  paymentStatus: SalesOrderPaymentStatus;

  @ApiProperty({ example: 941.50 })
  subtotal: number;

  @ApiProperty({ example: 50.00 })
  shippingAmount: number;

  @ApiProperty({ example: 991.50 })
  totalAmount: number;

  @ApiProperty({ example: 'Fragile items, handle with care', nullable: true })
  notes?: string;

  @ApiProperty({ example: 'uuid-string' })
  customerId: string;

  @ApiProperty()
  customer: {
    id: string;
    name: string;
    email?: string;
    phone?: string;
    streetAddress?: string;
    city?: string;
    state?: string;
    postalCode?: string;
    country?: string;
  };

  @ApiProperty({ type: [SalesOrderItemResponseDto] })
  items: SalesOrderItemResponseDto[];

  @ApiProperty({ example: '2024-01-01T00:00:00Z' })
  createdAt: Date;

  @ApiProperty({ example: '2024-01-01T00:00:00Z' })
  updatedAt: Date;

  @ApiProperty({ type: 'array', items: { type: 'object' } })
  payments: {
    id: string;
    amount: number;
    paymentDate: string;
    referenceNumber?: string;
    notes?: string;
    paymentMethodId: string;
    paymentMethodName?: string;
  }[];
}

export class SalesOrderSummaryDto {
  @ApiProperty({ example: 'uuid-string' })
  id: string;

  @ApiProperty({ example: 'SO-2024-001' })
  orderNumber: string;

  @ApiProperty({ example: '2024-01-01' })
  orderDate: Date;

  @ApiProperty({ example: 'Acme Corporation' })
  customerName: string;

  @ApiProperty({ example: 991.50 })
  totalAmount: number;

  @ApiProperty({ example: false })
  isOverdue: boolean;

  @ApiProperty({ example: 3 })
  itemsCount: number;
}

export class RecordPaymentDto {
  @ApiProperty({ description: 'Payment method ID' })
  @IsUUID()
  paymentMethodId: string;

  @ApiProperty({ example: 500.00 })
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0.01)
  @Transform(({ value }) => parseFloat(value))
  amount: number;

  @ApiProperty({ example: '2026-05-26' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'paymentDate must be a valid date in YYYY-MM-DD format' })
  paymentDate: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  referenceNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

export class RecordRefundDto extends RecordPaymentDto {}
