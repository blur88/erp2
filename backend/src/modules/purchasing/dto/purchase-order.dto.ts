import {
  IsString,
  IsNotEmpty,
  IsBoolean,
  IsOptional,
  IsEnum,
  IsIn,
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
import { BaseQueryDto } from '../../../common/dto/base-query.dto';
import {
  PurchaseOrderPaymentStatus,
  PurchaseOrderStatus,
} from '../../../database/entities/purchase-order.entity';

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

  @ApiPropertyOptional({ description: 'Special instructions or notes' })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiProperty({ description: 'Order items', type: [CreatePurchaseOrderItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreatePurchaseOrderItemDto)
  items: CreatePurchaseOrderItemDto[];
}

export class UpdatePurchaseOrderDto extends PartialType(CreatePurchaseOrderDto) {}

export class PurchaseOrderQueryDto extends BaseQueryDto {
  @ApiPropertyOptional({ description: 'Filter by supplier ID' })
  @IsOptional()
  @IsUUID()
  supplierId?: string;

  @ApiPropertyOptional({ description: 'Filter from order date' })
  @IsOptional()
  @IsDateString()
  orderDateFrom?: string;

  @ApiPropertyOptional({ description: 'Filter to order date' })
  @IsOptional()
  @IsDateString()
  orderDateTo?: string;

  @ApiPropertyOptional({
    description: 'Filter by PO status',
    enum: ['DRAFT', 'READY', 'RECEIVED', 'CANCELLED'],
  })
  @IsOptional()
  @IsIn(['DRAFT', 'READY', 'RECEIVED', 'CANCELLED'])
  status?: PurchaseOrderStatus;

  @ApiPropertyOptional({
    description: 'Filter by payment status',
    enum: ['UNPAID', 'PARTIAL', 'PAID', 'OVERPAID'],
  })
  @IsOptional()
  @IsIn(['UNPAID', 'PARTIAL', 'PAID', 'OVERPAID'])
  paymentStatus?: PurchaseOrderPaymentStatus;

  @ApiPropertyOptional({ description: 'Sort by field', default: 'orderNumber' })
  @IsOptional()
  @IsString()
  sortBy?: string = 'orderNumber';

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
  };

  @ApiProperty({ description: 'Item description' })
  description: string;

  @ApiProperty({ description: 'Quantity ordered' })
  quantity: number;

  @ApiProperty({ description: 'Unit price' })
  unitPrice: number;

  @ApiPropertyOptional({ description: 'Discount type', enum: ['percentage', 'fixed_amount'] })
  discountType?: 'percentage' | 'fixed_amount';

  @ApiProperty({ description: 'Discount percentage' })
  discountPercent: number;

  @ApiProperty({ description: 'Discount amount' })
  discountAmount: number;

  @ApiProperty({ description: 'Total amount for this line' })
  totalAmount: number;

  @ApiProperty({ description: 'Quantity received so far' })
  receivedQuantity: number;

  @ApiProperty({ description: 'Quantity rejected (deprecated - always 0)' })
  rejectedQuantity: number;

  @ApiProperty({ description: 'Is item fully received' })
  isFullyReceived: boolean;

  @ApiProperty({ description: 'Item status' })
  status: string;
}

export class PurchaseOrderResponseDto {
  @ApiProperty({ description: 'Purchase order ID' })
  id: string;

  @ApiProperty({ description: 'Order number' })
  orderNumber: string;

  @ApiProperty({ description: 'Supplier information' })
  supplier?: {
    id: string;
    slug?: string;
    supplierCode: string;
    companyName: string;
    contactPerson?: string;
    email?: string;
    phone?: string;
    address?: string;
    city?: string;
    state?: string;
    postalCode?: string;
    country?: string;
  };

  @ApiProperty({ description: 'Order date' })
  orderDate: Date;

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

  @ApiProperty({ description: 'Total amount paid' })
  paidAmount: number;

  @ApiProperty({ description: 'Lifecycle status' })
  status: PurchaseOrderStatus;

  @ApiProperty({ description: 'Payment status' })
  paymentStatus: PurchaseOrderPaymentStatus;

  @ApiProperty({ description: 'Notes' })
  notes?: string;

  @ApiProperty({ description: 'Is fully received' })
  isFullyReceived: boolean;

  @ApiProperty({ description: 'Total received quantity' })
  totalReceivedQuantity: number;

  @ApiProperty({ description: 'Total ordered quantity' })
  totalOrderedQuantity: number;

  @ApiProperty({ description: 'Order items', type: [PurchaseOrderItemResponseDto] })
  items: PurchaseOrderItemResponseDto[];

  @ApiPropertyOptional({ description: 'Vendor Payments associated with this order' })
  vendorPayments?: Array<{
    id: string;
    paymentNumber: string;
    amount: number;
    paymentDate: Date;
    paymentMethodId?: string;
    status: string;
  }>;

  @ApiProperty({ description: 'Created date' })
  createdAt: Date;

  @ApiProperty({ description: 'Updated date' })
  updatedAt: Date;

  @ApiPropertyOptional({ description: 'Deleted date (for soft-deleted records)' })
  deletedAt?: Date;
}

class ApprovePurchaseOrderDto {
  @ApiPropertyOptional({ description: 'Approval comments' })
  @IsOptional()
  @IsString()
  comments?: string;
}

class AcknowledgePurchaseOrderDto {
  @ApiPropertyOptional({ description: 'Supplier acknowledgment notes' })
  @IsOptional()
  @IsString()
  notes?: string;
}

class CancelPurchaseOrderDto {
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

class PurchaseOrderAnalyticsDto {
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

export class RecordOrderPaymentLineDto {
  @IsString()
  @IsNotEmpty()
  paymentMethodId: string;

  @IsNumber()
  @Min(0.01)
  amount: number;

  @IsOptional()
  @IsString()
  reference?: string;
}

export class RecordVendorPaymentsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RecordOrderPaymentLineDto)
  payments: RecordOrderPaymentLineDto[];
}

export class RecordOrderPaymentsDto extends RecordVendorPaymentsDto {}

export class RefundLineDto {
  @ApiProperty({ description: 'Original vendor payment to reverse' })
  @IsUUID()
  vendorPaymentId: string;

  @ApiProperty({ description: 'Refund amount (positive)' })
  @Transform(({ value }) => parseFloat(value))
  @IsNumber()
  @Min(0.01)
  amount: number;

  @ApiPropertyOptional({ description: 'Refund reason' })
  @IsOptional()
  @IsString()
  reason?: string;
}

export class RecordPurchaseOrderRefundsDto {
  @ApiProperty({ description: 'Refund lines', type: [RefundLineDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => RefundLineDto)
  refunds: RefundLineDto[];
}
