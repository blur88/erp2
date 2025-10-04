import {
  IsString,
  IsBoolean,
  IsOptional,
  IsEnum,
  IsArray,
  IsDecimal,
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
import {
  SupplierInvoiceStatus,
  SupplierInvoiceType,
  InvoiceMatchingStatus
} from '../../../database/entities/supplier-invoice.entity';

export class CreateSupplierInvoiceItemDto {
  @ApiProperty({ description: 'Line number in the invoice' })
  @IsInt()
  @Min(1)
  lineNumber: number;

  @ApiProperty({ description: 'Item description from invoice', maxLength: 500 })
  @IsString()
  @MaxLength(500)
  @MinLength(3)
  description: string;

  @ApiProperty({ description: 'Invoiced quantity' })
  @IsDecimal({ decimal_digits: '0,4' })
  @Min(0)
  @Transform(({ value }) => parseFloat(value))
  quantity: number;

  @ApiPropertyOptional({ description: 'Unit of measurement', maxLength: 50 })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  unit?: string;

  @ApiProperty({ description: 'Unit price from invoice' })
  @IsDecimal({ decimal_digits: '0,4' })
  @Min(0)
  @Transform(({ value }) => parseFloat(value))
  unitPrice: number;

  @ApiPropertyOptional({ description: 'Discount percentage for this line', default: 0 })
  @IsOptional()
  @IsDecimal({ decimal_digits: '0,2' })
  @Min(0)
  @Max(100)
  @Transform(({ value }) => parseFloat(value))
  discountPercent?: number;

  @ApiPropertyOptional({ description: 'Tax percentage for this line', default: 0 })
  @IsOptional()
  @IsDecimal({ decimal_digits: '0,2' })
  @Min(0)
  @Max(100)
  @Transform(({ value }) => parseFloat(value))
  taxPercent?: number;

  @ApiPropertyOptional({ description: 'Product ID if matched to catalog' })
  @IsOptional()
  @IsUUID()
  productId?: string;

  @ApiPropertyOptional({ description: 'Related purchase order item ID' })
  @IsOptional()
  @IsUUID()
  purchaseOrderItemId?: string;

  @ApiPropertyOptional({ description: 'Product code from invoice', maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  supplierProductCode?: string;

  @ApiPropertyOptional({ description: 'Batch or lot number', maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  batchNumber?: string;

  @ApiPropertyOptional({ description: 'Line item notes' })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class CreateSupplierInvoiceDto {
  @ApiProperty({ description: 'Supplier invoice number', maxLength: 50 })
  @IsString()
  @MaxLength(50)
  @MinLength(1)
  invoiceNumber: string;

  @ApiProperty({ description: 'Supplier ID' })
  @IsUUID()
  supplierId: string;

  @ApiPropertyOptional({ description: 'Invoice type', enum: SupplierInvoiceType, default: SupplierInvoiceType.STANDARD })
  @IsOptional()
  @IsEnum(SupplierInvoiceType)
  type?: SupplierInvoiceType;

  @ApiProperty({ description: 'Invoice date from supplier' })
  @IsDateString()
  invoiceDate: string;

  @ApiProperty({ description: 'Invoice due date' })
  @IsDateString()
  dueDate: string;

  @ApiProperty({ description: 'Date when invoice was received by us' })
  @IsDateString()
  receivedDate: string;

  @ApiPropertyOptional({ description: 'Related purchase order ID' })
  @IsOptional()
  @IsUUID()
  purchaseOrderId?: string;

  @ApiPropertyOptional({ description: 'Related goods received note ID' })
  @IsOptional()
  @IsUUID()
  goodsReceivedNoteId?: string;

  @ApiProperty({ description: 'Gross amount from invoice' })
  @IsDecimal({ decimal_digits: '0,4' })
  @Min(0)
  @Transform(({ value }) => parseFloat(value))
  grossAmount: number;

  @ApiPropertyOptional({ description: 'Tax amount', default: 0 })
  @IsOptional()
  @IsDecimal({ decimal_digits: '0,4' })
  @Min(0)
  @Transform(({ value }) => parseFloat(value))
  taxAmount?: number;

  @ApiPropertyOptional({ description: 'Discount amount', default: 0 })
  @IsOptional()
  @IsDecimal({ decimal_digits: '0,4' })
  @Min(0)
  @Transform(({ value }) => parseFloat(value))
  discountAmount?: number;

  @ApiPropertyOptional({ description: 'Invoice currency', default: 'USD' })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  currency?: string;

  @ApiPropertyOptional({ description: 'Exchange rate to base currency', default: 1 })
  @IsOptional()
  @IsDecimal({ decimal_digits: '0,6' })
  @Min(0)
  @Transform(({ value }) => parseFloat(value))
  exchangeRate?: number;

  @ApiPropertyOptional({ description: 'Allowed variance percentage', default: 5 })
  @IsOptional()
  @IsDecimal({ decimal_digits: '0,2' })
  @Min(0)
  @Max(100)
  @Transform(({ value }) => parseFloat(value))
  allowedVariancePercent?: number;

  @ApiPropertyOptional({ description: 'Payment terms', maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  paymentTerms?: string;

  @ApiPropertyOptional({ description: 'Invoice description or notes' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'Internal processing notes' })
  @IsOptional()
  @IsString()
  internalNotes?: string;

  @ApiPropertyOptional({ description: 'Supplier delivery note reference', maxLength: 50 })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  deliveryNoteRef?: string;

  @ApiProperty({ description: 'Invoice items', type: [CreateSupplierInvoiceItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateSupplierInvoiceItemDto)
  items: CreateSupplierInvoiceItemDto[];

  @ApiPropertyOptional({ description: 'Additional metadata' })
  @IsOptional()
  metadata?: Record<string, any>;
}

export class UpdateSupplierInvoiceDto extends PartialType(CreateSupplierInvoiceDto) {
  @ApiPropertyOptional({ description: 'Invoice status', enum: SupplierInvoiceStatus })
  @IsOptional()
  @IsEnum(SupplierInvoiceStatus)
  status?: SupplierInvoiceStatus;

  @ApiPropertyOptional({ description: 'Matching status', enum: InvoiceMatchingStatus })
  @IsOptional()
  @IsEnum(InvoiceMatchingStatus)
  matchingStatus?: InvoiceMatchingStatus;
}

export class SupplierInvoiceQueryDto {
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

  @ApiPropertyOptional({ description: 'Search term (invoice number, supplier name)' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ description: 'Filter by supplier ID' })
  @IsOptional()
  @IsUUID()
  supplierId?: string;

  @ApiPropertyOptional({ description: 'Filter by status', enum: SupplierInvoiceStatus })
  @IsOptional()
  @IsEnum(SupplierInvoiceStatus)
  status?: SupplierInvoiceStatus;

  @ApiPropertyOptional({ description: 'Filter by type', enum: SupplierInvoiceType })
  @IsOptional()
  @IsEnum(SupplierInvoiceType)
  type?: SupplierInvoiceType;

  @ApiPropertyOptional({ description: 'Filter by matching status', enum: InvoiceMatchingStatus })
  @IsOptional()
  @IsEnum(InvoiceMatchingStatus)
  matchingStatus?: InvoiceMatchingStatus;

  @ApiPropertyOptional({ description: 'Filter by purchase order ID' })
  @IsOptional()
  @IsUUID()
  purchaseOrderId?: string;

  @ApiPropertyOptional({ description: 'Filter by received user ID' })
  @IsOptional()
  @IsUUID()
  receivedByUserId?: string;

  @ApiPropertyOptional({ description: 'Filter from invoice date' })
  @IsOptional()
  @IsDateString()
  invoiceDateFrom?: string;

  @ApiPropertyOptional({ description: 'Filter to invoice date' })
  @IsOptional()
  @IsDateString()
  invoiceDateTo?: string;

  @ApiPropertyOptional({ description: 'Filter from due date' })
  @IsOptional()
  @IsDateString()
  dueDateFrom?: string;

  @ApiPropertyOptional({ description: 'Filter to due date' })
  @IsOptional()
  @IsDateString()
  dueDateTo?: string;

  @ApiPropertyOptional({ description: 'Show overdue invoices only' })
  @IsOptional()
  @Transform(({ value }) => value === 'true')
  isOverdue?: boolean;

  @ApiPropertyOptional({ description: 'Show invoices requiring attention only' })
  @IsOptional()
  @Transform(({ value }) => value === 'true')
  requiresAttention?: boolean;

  @ApiPropertyOptional({ description: 'Show unmatched invoices only' })
  @IsOptional()
  @Transform(({ value }) => value === 'true')
  isUnmatched?: boolean;

  @ApiPropertyOptional({ description: 'Sort by field', default: 'invoiceDate' })
  @IsOptional()
  @IsString()
  sortBy?: string = 'invoiceDate';

  @ApiPropertyOptional({ description: 'Sort order', enum: ['ASC', 'DESC'], default: 'DESC' })
  @IsOptional()
  @IsString()
  sortOrder?: 'ASC' | 'DESC' = 'DESC';
}

export class SupplierInvoiceItemResponseDto {
  @ApiProperty({ description: 'Item ID' })
  id: string;

  @ApiProperty({ description: 'Line number' })
  lineNumber: number;

  @ApiProperty({ description: 'Item description' })
  description: string;

  @ApiProperty({ description: 'Invoiced quantity' })
  quantity: number;

  @ApiProperty({ description: 'Unit of measurement' })
  unit?: string;

  @ApiProperty({ description: 'Unit price' })
  unitPrice: number;

  @ApiProperty({ description: 'Line total' })
  lineTotal: number;

  @ApiProperty({ description: 'Discount percentage' })
  discountPercent: number;

  @ApiProperty({ description: 'Discount amount' })
  discountAmount: number;

  @ApiProperty({ description: 'Tax percentage' })
  taxPercent: number;

  @ApiProperty({ description: 'Tax amount' })
  taxAmount: number;

  @ApiProperty({ description: 'Net amount' })
  netAmount: number;

  @ApiProperty({ description: 'Product information' })
  product?: {
    id: string;
    sku: string;
    name: string;
  };

  @ApiProperty({ description: 'Purchase order item information' })
  purchaseOrderItem?: {
    id: string;
    description: string;
    quantity: number;
    unitPrice: number;
  };

  @ApiProperty({ description: 'PO quantity' })
  poQuantity: number;

  @ApiProperty({ description: 'PO unit price' })
  poUnitPrice: number;

  @ApiProperty({ description: 'GRN quantity' })
  grnQuantity: number;

  @ApiProperty({ description: 'Price variance' })
  priceVariance: number;

  @ApiProperty({ description: 'Quantity variance' })
  quantityVariance: number;

  @ApiProperty({ description: 'Price variance percentage' })
  priceVariancePercent: number;

  @ApiProperty({ description: 'Quantity variance percentage' })
  quantityVariancePercent: number;

  @ApiProperty({ description: 'Is matched' })
  isMatched: boolean;

  @ApiProperty({ description: 'Has variance' })
  hasVariance: boolean;

  @ApiProperty({ description: 'Effective unit price' })
  effectiveUnitPrice: number;

  @ApiProperty({ description: 'Matching notes' })
  matchingNotes?: string;

  @ApiProperty({ description: 'Supplier product code' })
  supplierProductCode?: string;

  @ApiProperty({ description: 'Batch number' })
  batchNumber?: string;

  @ApiProperty({ description: 'Notes' })
  notes?: string;
}

export class SupplierInvoiceResponseDto {
  @ApiProperty({ description: 'Invoice ID' })
  id: string;

  @ApiProperty({ description: 'Invoice number' })
  invoiceNumber: string;

  @ApiProperty({ description: 'Status' })
  status: SupplierInvoiceStatus;

  @ApiProperty({ description: 'Type' })
  type: SupplierInvoiceType;

  @ApiProperty({ description: 'Matching status' })
  matchingStatus: InvoiceMatchingStatus;

  @ApiProperty({ description: 'Supplier information' })
  supplier: {
    id: string;
    supplierCode: string;
    companyName: string;
    contactPerson?: string;
  };

  @ApiProperty({ description: 'Purchase order information' })
  purchaseOrder?: {
    id: string;
    orderNumber: string;
    status: string;
    totalAmount: number;
  };

  @ApiProperty({ description: 'Goods received note information' })
  goodsReceivedNote?: {
    id: string;
    grnNumber: string;
    status: string;
    totalAmount: number;
  };

  @ApiProperty({ description: 'Received by user' })
  receivedByUser: {
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

  @ApiProperty({ description: 'Invoice date' })
  invoiceDate: Date;

  @ApiProperty({ description: 'Due date' })
  dueDate: Date;

  @ApiProperty({ description: 'Received date' })
  receivedDate: Date;

  @ApiProperty({ description: 'Approved date' })
  approvedDate?: Date;

  @ApiProperty({ description: 'Paid date' })
  paidDate?: Date;

  @ApiProperty({ description: 'Gross amount' })
  grossAmount: number;

  @ApiProperty({ description: 'Tax amount' })
  taxAmount: number;

  @ApiProperty({ description: 'Discount amount' })
  discountAmount: number;

  @ApiProperty({ description: 'Net amount' })
  netAmount: number;

  @ApiProperty({ description: 'Paid amount' })
  paidAmount: number;

  @ApiProperty({ description: 'Outstanding amount' })
  outstandingAmount: number;

  @ApiProperty({ description: 'Remaining amount' })
  remainingAmount: number;

  @ApiProperty({ description: 'Currency' })
  currency: string;

  @ApiProperty({ description: 'Exchange rate' })
  exchangeRate: number;

  @ApiProperty({ description: 'PO matched amount' })
  poMatchedAmount: number;

  @ApiProperty({ description: 'GRN matched amount' })
  grnMatchedAmount: number;

  @ApiProperty({ description: 'Variance amount' })
  varianceAmount: number;

  @ApiProperty({ description: 'Allowed variance percentage' })
  allowedVariancePercent: number;

  @ApiProperty({ description: 'Matching issues' })
  matchingIssues?: Array<{
    type: string;
    description: string;
    invoiceValue: number;
    poValue?: number;
    grnValue?: number;
    variance: number;
    isResolved: boolean;
  }>;

  @ApiProperty({ description: 'Payment terms' })
  paymentTerms?: string;

  @ApiProperty({ description: 'Payment reference' })
  paymentReference?: string;

  @ApiProperty({ description: 'Payment method' })
  paymentMethod?: string;

  @ApiProperty({ description: 'Description' })
  description?: string;

  @ApiProperty({ description: 'Internal notes' })
  internalNotes?: string;

  @ApiProperty({ description: 'Approval comments' })
  approvalComments?: string;

  @ApiProperty({ description: 'Delivery note reference' })
  deliveryNoteRef?: string;

  @ApiProperty({ description: 'Is paid' })
  isPaid: boolean;

  @ApiProperty({ description: 'Is overdue' })
  isOverdue: boolean;

  @ApiProperty({ description: 'Days until due' })
  daysUntilDue: number;

  @ApiProperty({ description: 'Is fully matched' })
  isFullyMatched: boolean;

  @ApiProperty({ description: 'Can approve' })
  canApprove: boolean;

  @ApiProperty({ description: 'Can pay' })
  canPay: boolean;

  @ApiProperty({ description: 'Requires attention' })
  requiresAttention: boolean;

  @ApiProperty({ description: 'Aging information' })
  aging: {
    category: string;
    days: number;
  };

  @ApiProperty({ description: 'Items', type: [SupplierInvoiceItemResponseDto] })
  items: SupplierInvoiceItemResponseDto[];

  @ApiProperty({ description: 'Created date' })
  createdAt: Date;

  @ApiProperty({ description: 'Updated date' })
  updatedAt: Date;
}

export class PerformThreeWayMatchingDto {
  @ApiPropertyOptional({ description: 'Force matching despite variances' })
  @IsOptional()
  @IsBoolean()
  forceMatch?: boolean;

  @ApiPropertyOptional({ description: 'Override allowed variance percentage' })
  @IsOptional()
  @IsDecimal({ decimal_digits: '0,2' })
  @Min(0)
  @Max(100)
  @Transform(({ value }) => parseFloat(value))
  overrideVariancePercent?: number;

  @ApiPropertyOptional({ description: 'Matching notes' })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class ApproveSupplierInvoiceDto {
  @ApiPropertyOptional({ description: 'Approval comments' })
  @IsOptional()
  @IsString()
  comments?: string;

  @ApiPropertyOptional({ description: 'Override matching requirements' })
  @IsOptional()
  @IsBoolean()
  overrideMatching?: boolean;
}

export class RejectSupplierInvoiceDto {
  @ApiProperty({ description: 'Rejection reason' })
  @IsString()
  @MinLength(5)
  @MaxLength(500)
  reason: string;
}

export class MarkInvoiceAsPaidDto {
  @ApiProperty({ description: 'Paid amount' })
  @IsDecimal({ decimal_digits: '0,4' })
  @Min(0.01)
  @Transform(({ value }) => parseFloat(value))
  paidAmount: number;

  @ApiPropertyOptional({ description: 'Payment reference' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  paymentReference?: string;

  @ApiPropertyOptional({ description: 'Payment method' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  paymentMethod?: string;

  @ApiPropertyOptional({ description: 'Payment notes' })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class DisputeInvoiceDto {
  @ApiProperty({ description: 'Dispute reason' })
  @IsString()
  @MinLength(5)
  @MaxLength(1000)
  reason: string;

  @ApiPropertyOptional({ description: 'Dispute category' })
  @IsOptional()
  @IsEnum(['pricing', 'quantity', 'quality', 'delivery', 'other'])
  category?: string;

  @ApiPropertyOptional({ description: 'Expected resolution date' })
  @IsOptional()
  @IsDateString()
  expectedResolutionDate?: string;
}

export class ResolveDisputeDto {
  @ApiProperty({ description: 'Resolution notes' })
  @IsString()
  @MinLength(5)
  @MaxLength(1000)
  resolutionNotes: string;

  @ApiPropertyOptional({ description: 'Adjusted amount' })
  @IsOptional()
  @IsDecimal({ decimal_digits: '0,4' })
  @Min(0)
  @Transform(({ value }) => parseFloat(value))
  adjustedAmount?: number;
}

export class SupplierInvoiceListResponseDto {
  @ApiProperty({ description: 'List of invoices', type: [SupplierInvoiceResponseDto] })
  invoices: SupplierInvoiceResponseDto[];

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

export class SupplierInvoiceSummaryDto {
  @ApiProperty({ description: 'Total invoices count' })
  totalInvoices: number;

  @ApiProperty({ description: 'Total invoice amount' })
  totalAmount: number;

  @ApiProperty({ description: 'Total paid amount' })
  totalPaidAmount: number;

  @ApiProperty({ description: 'Total outstanding amount' })
  totalOutstandingAmount: number;

  @ApiProperty({ description: 'Overdue invoices count' })
  overdueInvoicesCount: number;

  @ApiProperty({ description: 'Overdue amount' })
  overdueAmount: number;

  @ApiProperty({ description: 'Pending approval count' })
  pendingApprovalCount: number;

  @ApiProperty({ description: 'Disputed invoices count' })
  disputedInvoicesCount: number;

  @ApiProperty({ description: 'Unmatched invoices count' })
  unmatchedInvoicesCount: number;

  @ApiProperty({ description: 'Average processing time in days' })
  averageProcessingTime: number;

  @ApiProperty({ description: 'Invoices by status' })
  invoicesByStatus: Record<string, number>;

  @ApiProperty({ description: 'Invoices by aging category' })
  invoicesByAging: Record<string, { count: number; amount: number }>;

  @ApiProperty({ description: 'Top suppliers by invoice volume' })
  topSuppliers: Array<{
    supplierId: string;
    companyName: string;
    invoiceCount: number;
    totalAmount: number;
    averageProcessingDays: number;
  }>;
}