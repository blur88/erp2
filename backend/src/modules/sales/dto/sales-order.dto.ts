import {
  IsString,
  IsOptional,
  IsUUID,
  MaxLength,
  Min,
  IsArray,
  ValidateNested,
  IsInt,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { DiscountType } from '../../../database/entities/sales-order-item.entity';

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
    description: 'Shipping address',
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
    description: 'Shipping method',
    maxLength: 100,
    example: 'Standard Delivery',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  shippingMethod?: string;

  @ApiPropertyOptional({
    description: 'Customer purchase order number',
    example: 'PO-2024-001',
  })
  @IsOptional()
  @IsString()
  customerPoNumber?: string;

  @ApiPropertyOptional({
    description: 'Special instructions or notes',
    example: 'Fragile items, handle with care',
  })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({
    description: 'Internal notes',
    example: 'Customer is VIP, expedite processing',
  })
  @IsOptional()
  @IsString()
  internalNotes?: string;

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
    description: 'Order items',
    type: [SalesOrderItemDto],
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SalesOrderItemDto)
  items?: SalesOrderItemDto[];
}

export class QuerySalesOrdersDto {
  @ApiPropertyOptional({
    description: 'Search term for order number or customer name',
    example: 'SO-2024',
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


  @ApiPropertyOptional({
    description: 'Sort field',
    example: 'orderDate',
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
  @IsString()
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

export class SalesOrderItemResponseDto {
  @ApiProperty({ example: 'uuid-string' })
  id: string;

  @ApiProperty({ example: 'uuid-string' })
  productId: string;

  @ApiProperty({ example: 'PROD001' })
  productSku: string;

  @ApiProperty({ example: 'Wireless Mouse' })
  productName: string;

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

  @ApiProperty({ example: '2024-01-14', nullable: true })
  shippedDate?: Date;

  @ApiProperty({ example: '2024-01-16', nullable: true })
  deliveredDate?: Date;

  @ApiProperty({ example: 991.50 })
  totalAmount: number;

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

  @ApiProperty({ example: 'Standard Delivery', nullable: true })
  shippingMethod?: string;

  @ApiProperty({ example: 'TRK123456789', nullable: true })
  trackingNumber?: string;

  @ApiProperty({ example: 'PO-2024-001', nullable: true })
  customerPoNumber?: string;

  @ApiProperty({ example: 'Fragile items, handle with care', nullable: true })
  notes?: string;

  @ApiProperty({ example: 'Customer is VIP, expedite processing', nullable: true })
  internalNotes?: string;

  @ApiProperty({ example: 'uuid-string' })
  customerId: string;

  @ApiProperty({ example: 'uuid-string' })
  createdByUserId: string;

  @ApiProperty()
  customer: {
    id: string;
    customerCode: string;
    name: string;
    email?: string;
    phone?: string;
  };

  @ApiProperty()
  createdByUser: {
    id: string;
    username: string;
    firstName: string;
    lastName: string;
  };

  @ApiProperty({ type: [SalesOrderItemResponseDto] })
  items: SalesOrderItemResponseDto[];

  @ApiProperty({ example: '2024-01-01T00:00:00Z' })
  createdAt: Date;

  @ApiProperty({ example: '2024-01-01T00:00:00Z' })
  updatedAt: Date;

  // Computed properties
  @ApiProperty({ example: '456 Oak Avenue, Los Angeles, CA, 90210, United States' })
  fullShippingAddress: string;

  @ApiProperty({ example: true })
  isShippable: boolean;

  @ApiProperty({ example: false })
  isCompleted: boolean;
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

export class ShipOrderDto {
  @ApiPropertyOptional({
    description: 'Tracking number',
    example: 'TRK123456789',
  })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  trackingNumber?: string;

  @ApiPropertyOptional({
    description: 'Shipping method',
    example: 'Express Delivery',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  shippingMethod?: string;

  @ApiPropertyOptional({
    description: 'Shipping notes',
    example: 'Shipped via FedEx Express',
  })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class CancelOrderDto {
  @ApiProperty({
    description: 'Cancellation reason',
    example: 'Customer requested cancellation',
  })
  @IsString()
  reason: string;
}