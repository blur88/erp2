import {
  IsString,
  IsBoolean,
  IsOptional,
  IsEnum,
  IsArray,
  IsNumber,
  IsInt,
  MaxLength,
  MinLength,
  Min,
  Max,
  IsDateString,
  IsUUID,
  ValidateNested,
  ArrayMinSize,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';

export class CreatePurchaseOrderItemDto {
  @ApiProperty({ description: 'Product ID from catalog' })
  @IsUUID()
  productId: string;

  @ApiProperty({ description: 'Quantity ordered' })
  @Transform(({ value }) => parseFloat(value))
  @IsNumber()
  @Min(0.0001)
  quantity: number;

  @ApiProperty({ description: 'Unit price' })
  @Transform(({ value }) => parseFloat(value))
  @IsNumber()
  @Min(0)
  unitPrice: number;

  @ApiPropertyOptional({ description: 'Discount type: percentage or fixed_amount', default: 'percentage' })
  @IsOptional()
  @IsEnum(['percentage', 'fixed_amount'])
  discountType?: 'percentage' | 'fixed_amount';

  @ApiPropertyOptional({ description: 'Discount percentage (used when discountType is percentage)', default: 0 })
  @IsOptional()
  @Transform(({ value }) => value == null ? 0 : parseFloat(value))
  @IsNumber()
  @Min(0)
  @Max(100)
  discountPercent?: number;

  @ApiPropertyOptional({ description: 'Discount amount per unit (used when discountType is fixed_amount)', default: 0 })
  @IsOptional()
  @Transform(({ value }) => value == null ? 0 : parseFloat(value))
  @IsNumber()
  @Min(0)
  discountAmount?: number;
}

export class CreatePurchaseOrderDto {
  @ApiProperty({ description: 'Supplier ID' })
  @IsUUID()
  supplierId: string;

  @ApiProperty({ description: 'Order date' })
  @IsDateString()
  orderDate: string;

  @ApiPropertyOptional({ description: 'Delivery address' })
  @IsOptional()
  @IsString()
  deliveryAddress?: string;

  @ApiPropertyOptional({ description: 'Delivery city', maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  deliveryCity?: string;

  @ApiPropertyOptional({ description: 'Delivery state/province', maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  deliveryState?: string;

  @ApiPropertyOptional({ description: 'Delivery postal code', maxLength: 20 })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  deliveryPostalCode?: string;

  @ApiPropertyOptional({ description: 'Delivery country', maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  deliveryCountry?: string;

  @ApiPropertyOptional({ description: 'Delivery contact person', maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  deliveryContact?: string;

  @ApiPropertyOptional({ description: 'Delivery contact phone', maxLength: 20 })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  deliveryPhone?: string;

  @ApiPropertyOptional({ description: 'Discount percentage for entire order', default: 0 })
  @IsOptional()
  @Transform(({ value }) => value == null ? 0 : parseFloat(value))
  @IsNumber()
  @Min(0)
  @Max(100)
  discountPercent?: number;

  @ApiPropertyOptional({ description: 'Shipping/freight charges', default: 0 })
  @IsOptional()
  @Transform(({ value }) => value == null ? 0 : parseFloat(value))
  @IsNumber()
  @Min(0)
  shippingAmount?: number;

  @ApiPropertyOptional({ description: 'Payment terms in days', default: 30 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(365)
  paymentTermsDays?: number;

  @ApiPropertyOptional({ description: 'Payment terms description' })
  @IsOptional()
  @IsString()
  paymentTerms?: string;

  @ApiPropertyOptional({ description: 'Delivery terms (FOB, CIF, etc.)' })
  @IsOptional()
  @IsString()
  deliveryTerms?: string;

  @ApiPropertyOptional({ description: 'Special instructions or notes' })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ description: 'Internal notes' })
  @IsOptional()
  @IsString()
  internalNotes?: string;

  @ApiPropertyOptional({ description: 'Supplier quotation reference', maxLength: 50 })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  supplierQuoteRef?: string;

  @ApiProperty({ description: 'Order items', type: [CreatePurchaseOrderItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreatePurchaseOrderItemDto)
  items: CreatePurchaseOrderItemDto[];

  @ApiPropertyOptional({ description: 'Additional metadata' })
  @IsOptional()
  metadata?: Record<string, any>;
}

export class UpdatePurchaseOrderDto extends PartialType(CreatePurchaseOrderDto) {
  @ApiPropertyOptional({ description: 'Expected delivery date from supplier' })
  @IsOptional()
  @IsDateString()
  expectedDeliveryDate?: string;
}

export class PurchaseOrderQueryDto {
  @ApiPropertyOptional({ description: 'Page number', default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ description: 'Items per page', default: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 10;

  @ApiPropertyOptional({ description: 'Search term (order number, supplier name)' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ description: 'Filter by supplier ID' })
  @IsOptional()
  @IsUUID()
  supplierId?: string;

  @ApiPropertyOptional({ description: 'Filter by created user ID' })
  @IsOptional()
  @IsUUID()
  createdByUserId?: string;

  @ApiPropertyOptional({ description: 'Filter from order date' })
  @IsOptional()
  @IsDateString()
  orderDateFrom?: string;

  @ApiPropertyOptional({ description: 'Filter to order date' })
  @IsOptional()
  @IsDateString()
  orderDateTo?: string;

  @ApiPropertyOptional({ description: 'Filter from required date' })
  @IsOptional()
  @IsDateString()
  requiredDateFrom?: string;

  @ApiPropertyOptional({ description: 'Filter to required date' })
  @IsOptional()
  @IsDateString()
  requiredDateTo?: string;

  @ApiPropertyOptional({ description: 'Show overdue orders only' })
  @IsOptional()
  @Transform(({ value }) => value === 'true')
  @IsBoolean()
  isOverdue?: boolean;

  @ApiPropertyOptional({ description: 'Sort by field', default: 'orderDate' })
  @IsOptional()
  @IsString()
  sortBy?: string = 'orderDate';

  @ApiPropertyOptional({ description: 'Sort order', enum: ['ASC', 'DESC'], default: 'DESC' })
  @IsOptional()
  @IsString()
  sortOrder?: 'ASC' | 'DESC' = 'DESC';
}

export class PurchaseOrderItemResponseDto {
  @ApiProperty({ description: 'Item ID' })
  id: string;

  @ApiProperty({ description: 'Product information' })
  product?: {
    id: string;
    sku: string;
    name: string;
    unit?: string;
  };

  @ApiProperty({ description: 'Item description' })
  description: string;

  @ApiProperty({ description: 'Quantity ordered' })
  quantity: number;

  @ApiProperty({ description: 'Unit price' })
  unitPrice: number;

  @ApiProperty({ description: 'Unit of measurement' })
  unit?: string;

  @ApiProperty({ description: 'Discount percentage' })
  discountPercent: number;

  @ApiProperty({ description: 'Discount amount' })
  discountAmount: number;

  @ApiProperty({ description: 'Total amount for this line' })
  totalAmount: number;

  @ApiProperty({ description: 'Quantity received so far' })
  receivedQuantity: number;

  @ApiProperty({ description: 'Quantity rejected' })
  rejectedQuantity: number;

  @ApiProperty({ description: 'Is item fully received' })
  isFullyReceived: boolean;

  @ApiProperty({ description: 'Item status' })
  status: string;

  @ApiProperty({ description: 'Required date' })
  requiredDate?: Date;

  @ApiProperty({ description: 'Notes' })
  notes?: string;
}

export class PurchaseOrderResponseDto {
  @ApiProperty({ description: 'Purchase order ID' })
  id: string;

  @ApiProperty({ description: 'Order number' })
  orderNumber: string;

  @ApiProperty({ description: 'Supplier information' })
  supplier: {
    id: string;
    supplierCode: string;
    companyName: string;
    contactPerson?: string;
    email?: string;
    phone?: string;
  };

  @ApiPropertyOptional({ description: 'Created by user' })
  createdByUser?: {
    id: string;
    username: string;
    firstName?: string;
    lastName?: string;
  };

  @ApiProperty({ description: 'Approved by user' })
  approvedByUser?: {
    id: string;
    username: string;
    firstName?: string;
    lastName?: string;
  };

  @ApiProperty({ description: 'Order date' })
  orderDate: Date;

  @ApiProperty({ description: 'Required delivery date' })
  requiredDate?: Date;

  @ApiProperty({ description: 'Sent date' })
  sentDate?: Date;

  @ApiProperty({ description: 'Acknowledged date' })
  acknowledgedDate?: Date;

  @ApiProperty({ description: 'Expected delivery date' })
  expectedDeliveryDate?: Date;

  @ApiProperty({ description: 'Delivered date' })
  deliveredDate?: Date;

  @ApiProperty({ description: 'Full delivery address' })
  fullDeliveryAddress: string;

  @ApiProperty({ description: 'Delivery contact' })
  deliveryContact?: string;

  @ApiProperty({ description: 'Delivery phone' })
  deliveryPhone?: string;

  @ApiProperty({ description: 'Subtotal amount' })
  subtotal: number;

  @ApiProperty({ description: 'Discount percentage' })
  discountPercent: number;

  @ApiProperty({ description: 'Discount amount' })
  discountAmount: number;

  @ApiProperty({ description: 'Shipping amount' })
  shippingAmount: number;

  @ApiProperty({ description: 'Total amount' })
  totalAmount: number;

  @ApiProperty({ description: 'Payment terms in days' })
  paymentTermsDays: number;

  @ApiProperty({ description: 'Payment terms description' })
  paymentTerms?: string;

  @ApiProperty({ description: 'Delivery terms' })
  deliveryTerms?: string;

  @ApiProperty({ description: 'Notes' })
  notes?: string;

  @ApiProperty({ description: 'Internal notes' })
  internalNotes?: string;

  @ApiProperty({ description: 'Supplier quote reference' })
  supplierQuoteRef?: string;

  @ApiProperty({ description: 'Is overdue' })
  isOverdue: boolean;

  @ApiProperty({ description: 'Is fully received' })
  isFullyReceived: boolean;

  @ApiProperty({ description: 'Total received quantity' })
  totalReceivedQuantity: number;

  @ApiProperty({ description: 'Total ordered quantity' })
  totalOrderedQuantity: number;

  @ApiProperty({ description: 'Order items', type: [PurchaseOrderItemResponseDto] })
  items: PurchaseOrderItemResponseDto[];

  @ApiProperty({ description: 'Created date' })
  createdAt: Date;

  @ApiProperty({ description: 'Updated date' })
  updatedAt: Date;
}

export class ApprovePurchaseOrderDto {
  @ApiPropertyOptional({ description: 'Approval comments' })
  @IsOptional()
  @IsString()
  comments?: string;
}

export class AcknowledgePurchaseOrderDto {
  @ApiPropertyOptional({ description: 'Expected delivery date from supplier' })
  @IsOptional()
  @IsDateString()
  expectedDeliveryDate?: string;

  @ApiPropertyOptional({ description: 'Supplier acknowledgment notes' })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class CancelPurchaseOrderDto {
  @ApiProperty({ description: 'Reason for cancellation' })
  @IsString()
  @MinLength(5)
  @MaxLength(500)
  reason: string;
}

export class PurchaseOrderListResponseDto {
  @ApiProperty({ description: 'List of purchase orders', type: [PurchaseOrderResponseDto] })
  orders: PurchaseOrderResponseDto[];

  @ApiProperty({ description: 'Total count' })
  total: number;

  @ApiProperty({ description: 'Current page' })
  page: number;

  @ApiProperty({ description: 'Items per page' })
  limit: number;

  @ApiProperty({ description: 'Total pages' })
  totalPages: number;

  @ApiProperty({ description: 'Has next page' })
  hasNext: boolean;

  @ApiProperty({ description: 'Has previous page' })
  hasPrev: boolean;
}

export class PurchaseOrderAnalyticsDto {
  @ApiPropertyOptional({ description: 'Start date for analytics' })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({ description: 'End date for analytics' })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({ description: 'Supplier IDs to include', type: [String] })
  @IsOptional()
  @IsArray()
  @IsUUID(4, { each: true })
  supplierIds?: string[];

  @ApiPropertyOptional({ description: 'Include department breakdown' })
  @IsOptional()
  @Transform(({ value }) => value === 'true')
  @IsBoolean()
  includeDepartments?: boolean;

  @ApiPropertyOptional({ description: 'Include product category breakdown' })
  @IsOptional()
  @Transform(({ value }) => value === 'true')
  @IsBoolean()
  includeCategories?: boolean;
}

export class PurchaseOrderSummaryDto {
  @ApiProperty({ description: 'Total orders count' })
  totalOrders: number;

  @ApiProperty({ description: 'Total purchase amount' })
  totalAmount: number;

  @ApiProperty({ description: 'Average order value' })
  averageOrderValue: number;

  @ApiProperty({ description: 'Overdue orders count' })
  overdueOrders: number;

  @ApiProperty({ description: 'Top suppliers by volume' })
  topSuppliers: Array<{
    supplierId: string;
    companyName: string;
    orderCount: number;
    totalAmount: number;
  }>;
}