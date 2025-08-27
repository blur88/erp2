import {
  IsString,
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
  PurchaseRequisitionStatus, 
  PurchaseRequisitionPriority,
  PurchaseRequisitionType 
} from '../../../database/entities';

export class CreatePurchaseRequisitionItemDto {
  @ApiPropertyOptional({ description: 'Product ID if from catalog' })
  @IsOptional()
  @IsUUID()
  productId?: string;

  @ApiProperty({ description: 'Item description', maxLength: 500 })
  @IsString()
  @MaxLength(500)
  @MinLength(3)
  description: string;

  @ApiProperty({ description: 'Requested quantity' })
  @IsDecimal({ decimal_digits: '0,4' })
  @Min(0.0001)
  @Transform(({ value }) => parseFloat(value))
  quantity: number;

  @ApiPropertyOptional({ description: 'Unit of measurement', maxLength: 50 })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  unit?: string;

  @ApiProperty({ description: 'Estimated unit price' })
  @IsDecimal({ decimal_digits: '0,4' })
  @Min(0)
  @Transform(({ value }) => parseFloat(value))
  estimatedUnitPrice: number;

  @ApiPropertyOptional({ description: 'Suggested supplier name', maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  suggestedSupplier?: string;

  @ApiPropertyOptional({ description: 'Preferred brand', maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  preferredBrand?: string;

  @ApiPropertyOptional({ description: 'Technical specifications' })
  @IsOptional()
  @IsString()
  specifications?: string;

  @ApiPropertyOptional({ description: 'Item-specific notes' })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ description: 'Category or classification', maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  category?: string;

  @ApiPropertyOptional({ description: 'Item priority (1=highest, 5=lowest)', default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  priority?: number;
}

export class CreatePurchaseRequisitionDto {
  @ApiPropertyOptional({ description: 'Requisition priority', enum: PurchaseRequisitionPriority, default: PurchaseRequisitionPriority.NORMAL })
  @IsOptional()
  @IsEnum(PurchaseRequisitionPriority)
  priority?: PurchaseRequisitionPriority;

  @ApiProperty({ description: 'Type of purchase requisition', enum: PurchaseRequisitionType })
  @IsEnum(PurchaseRequisitionType)
  type: PurchaseRequisitionType;

  @ApiProperty({ description: 'Request date' })
  @IsDateString()
  requestDate: string;

  @ApiProperty({ description: 'Required delivery date' })
  @IsDateString()
  requiredDate: string;

  @ApiProperty({ description: 'Department or cost center', maxLength: 200 })
  @IsString()
  @MaxLength(200)
  @MinLength(2)
  department: string;

  @ApiPropertyOptional({ description: 'Project code or reference', maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  projectCode?: string;

  @ApiProperty({ description: 'Justification for the purchase request' })
  @IsString()
  @MinLength(10)
  @MaxLength(2000)
  justification: string;

  @ApiPropertyOptional({ description: 'Budget code or account', maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  budgetCode?: string;

  @ApiPropertyOptional({ description: 'Approved budget amount', default: 0 })
  @IsOptional()
  @IsDecimal({ decimal_digits: '0,4' })
  @Min(0)
  @Transform(({ value }) => parseFloat(value))
  approvedBudget?: number;

  @ApiPropertyOptional({ description: 'Suggested supplier ID' })
  @IsOptional()
  @IsUUID()
  suggestedSupplierId?: string;

  @ApiPropertyOptional({ description: 'Suggested supplier name (if not in system)', maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  suggestedSupplierName?: string;

  @ApiPropertyOptional({ description: 'Additional notes' })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ description: 'Special delivery instructions' })
  @IsOptional()
  @IsString()
  deliveryInstructions?: string;

  @ApiPropertyOptional({ description: 'Required approval levels', default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  requiredApprovalLevels?: number;

  @ApiProperty({ description: 'Requisition items', type: [CreatePurchaseRequisitionItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreatePurchaseRequisitionItemDto)
  items: CreatePurchaseRequisitionItemDto[];

  @ApiPropertyOptional({ description: 'Additional metadata' })
  @IsOptional()
  metadata?: Record<string, any>;
}

export class UpdatePurchaseRequisitionDto extends PartialType(CreatePurchaseRequisitionDto) {
  @ApiPropertyOptional({ description: 'Requisition status', enum: PurchaseRequisitionStatus })
  @IsOptional()
  @IsEnum(PurchaseRequisitionStatus)
  status?: PurchaseRequisitionStatus;
}

export class PurchaseRequisitionQueryDto {
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

  @ApiPropertyOptional({ description: 'Search term (requisition number, department)' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ description: 'Filter by status', enum: PurchaseRequisitionStatus })
  @IsOptional()
  @IsEnum(PurchaseRequisitionStatus)
  status?: PurchaseRequisitionStatus;

  @ApiPropertyOptional({ description: 'Filter by type', enum: PurchaseRequisitionType })
  @IsOptional()
  @IsEnum(PurchaseRequisitionType)
  type?: PurchaseRequisitionType;

  @ApiPropertyOptional({ description: 'Filter by priority', enum: PurchaseRequisitionPriority })
  @IsOptional()
  @IsEnum(PurchaseRequisitionPriority)
  priority?: PurchaseRequisitionPriority;

  @ApiPropertyOptional({ description: 'Filter by requested user ID' })
  @IsOptional()
  @IsUUID()
  requestedByUserId?: string;

  @ApiPropertyOptional({ description: 'Filter by department' })
  @IsOptional()
  @IsString()
  department?: string;

  @ApiPropertyOptional({ description: 'Filter from request date' })
  @IsOptional()
  @IsDateString()
  requestDateFrom?: string;

  @ApiPropertyOptional({ description: 'Filter to request date' })
  @IsOptional()
  @IsDateString()
  requestDateTo?: string;

  @ApiPropertyOptional({ description: 'Filter from required date' })
  @IsOptional()
  @IsDateString()
  requiredDateFrom?: string;

  @ApiPropertyOptional({ description: 'Filter to required date' })
  @IsOptional()
  @IsDateString()
  requiredDateTo?: string;

  @ApiPropertyOptional({ description: 'Show overdue requisitions only' })
  @IsOptional()
  @Transform(({ value }) => value === 'true')
  isOverdue?: boolean;

  @ApiPropertyOptional({ description: 'Show pending approval only' })
  @IsOptional()
  @Transform(({ value }) => value === 'true')
  isPendingApproval?: boolean;

  @ApiPropertyOptional({ description: 'Sort by field', default: 'requestDate' })
  @IsOptional()
  @IsString()
  sortBy?: string = 'requestDate';

  @ApiPropertyOptional({ description: 'Sort order', enum: ['ASC', 'DESC'], default: 'DESC' })
  @IsOptional()
  @IsString()
  sortOrder?: 'ASC' | 'DESC' = 'DESC';
}

export class PurchaseRequisitionItemResponseDto {
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

  @ApiProperty({ description: 'Requested quantity' })
  quantity: number;

  @ApiProperty({ description: 'Unit of measurement' })
  unit?: string;

  @ApiProperty({ description: 'Estimated unit price' })
  estimatedUnitPrice: number;

  @ApiProperty({ description: 'Estimated total' })
  estimatedTotal: number;

  @ApiProperty({ description: 'Item status' })
  status: string;

  @ApiProperty({ description: 'Suggested supplier' })
  suggestedSupplier?: string;

  @ApiProperty({ description: 'Preferred brand' })
  preferredBrand?: string;

  @ApiProperty({ description: 'Technical specifications' })
  specifications?: string;

  @ApiProperty({ description: 'Notes' })
  notes?: string;

  @ApiProperty({ description: 'Category' })
  category?: string;

  @ApiProperty({ description: 'Priority' })
  priority: number;

  @ApiProperty({ description: 'Is from catalog' })
  isFromCatalog: boolean;

  @ApiProperty({ description: 'Formatted description' })
  formattedDescription: string;

  @ApiProperty({ description: 'Unit of measurement' })
  unitOfMeasurement: string;
}

export class PurchaseRequisitionResponseDto {
  @ApiProperty({ description: 'Requisition ID' })
  id: string;

  @ApiProperty({ description: 'Requisition number' })
  requisitionNumber: string;

  @ApiProperty({ description: 'Status' })
  status: PurchaseRequisitionStatus;

  @ApiProperty({ description: 'Priority' })
  priority: PurchaseRequisitionPriority;

  @ApiProperty({ description: 'Type' })
  type: PurchaseRequisitionType;

  @ApiProperty({ description: 'Request date' })
  requestDate: Date;

  @ApiProperty({ description: 'Required date' })
  requiredDate: Date;

  @ApiProperty({ description: 'Department' })
  department: string;

  @ApiProperty({ description: 'Project code' })
  projectCode?: string;

  @ApiProperty({ description: 'Justification' })
  justification: string;

  @ApiProperty({ description: 'Estimated total' })
  estimatedTotal: number;

  @ApiProperty({ description: 'Approved budget' })
  approvedBudget: number;

  @ApiProperty({ description: 'Budget code' })
  budgetCode?: string;

  @ApiProperty({ description: 'Requested by user' })
  requestedByUser: {
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

  @ApiProperty({ description: 'Purchase order' })
  purchaseOrder?: {
    id: string;
    orderNumber: string;
    status: string;
  };

  @ApiProperty({ description: 'Submitted date' })
  submittedDate?: Date;

  @ApiProperty({ description: 'Approval date' })
  approvalDate?: Date;

  @ApiProperty({ description: 'Approval comments' })
  approvalComments?: string;

  @ApiProperty({ description: 'Current approval level' })
  approvalLevel: number;

  @ApiProperty({ description: 'Required approval levels' })
  requiredApprovalLevels: number;

  @ApiProperty({ description: 'Approval history' })
  approvalHistory?: Array<{
    level: number;
    approvedBy: string;
    approvedAt: Date;
    comments?: string;
    action: 'approved' | 'rejected' | 'returned';
  }>;

  @ApiProperty({ description: 'Suggested supplier ID' })
  suggestedSupplierId?: string;

  @ApiProperty({ description: 'Suggested supplier name' })
  suggestedSupplierName?: string;

  @ApiProperty({ description: 'Notes' })
  notes?: string;

  @ApiProperty({ description: 'Delivery instructions' })
  deliveryInstructions?: string;

  @ApiProperty({ description: 'Is approval required' })
  isApprovalRequired: boolean;

  @ApiProperty({ description: 'Is pending approval' })
  isPendingApproval: boolean;

  @ApiProperty({ description: 'Is approved' })
  isApproved: boolean;

  @ApiProperty({ description: 'Can approve' })
  canApprove: boolean;

  @ApiProperty({ description: 'Can convert to PO' })
  canConvertToPO: boolean;

  @ApiProperty({ description: 'Is overdue' })
  isOverdue: boolean;

  @ApiProperty({ description: 'Days until required' })
  daysUntilRequired: number;

  @ApiProperty({ description: 'Total item count' })
  totalItemCount: number;

  @ApiProperty({ description: 'Total quantity' })
  totalQuantity: number;

  @ApiProperty({ description: 'Is fully approved' })
  isFullyApproved: boolean;

  @ApiProperty({ description: 'Approval status description' })
  approvalStatus: string;

  @ApiProperty({ description: 'Items', type: [PurchaseRequisitionItemResponseDto] })
  items: PurchaseRequisitionItemResponseDto[];

  @ApiProperty({ description: 'Created date' })
  createdAt: Date;

  @ApiProperty({ description: 'Updated date' })
  updatedAt: Date;
}

export class ApprovePurchaseRequisitionDto {
  @ApiPropertyOptional({ description: 'Approval comments' })
  @IsOptional()
  @IsString()
  comments?: string;

  @ApiPropertyOptional({ description: 'Approval level', default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  level?: number;
}

export class RejectPurchaseRequisitionDto {
  @ApiProperty({ description: 'Rejection reason' })
  @IsString()
  @MinLength(5)
  @MaxLength(500)
  reason: string;

  @ApiPropertyOptional({ description: 'Approval level', default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  level?: number;
}

export class CancelPurchaseRequisitionDto {
  @ApiProperty({ description: 'Reason for cancellation' })
  @IsString()
  @MinLength(5)
  @MaxLength(500)
  reason: string;
}

export class ConvertToPurchaseOrderDto {
  @ApiProperty({ description: 'Supplier ID for the purchase order' })
  @IsUUID()
  supplierId: string;

  @ApiPropertyOptional({ description: 'Delivery address override' })
  @IsOptional()
  @IsString()
  deliveryAddress?: string;

  @ApiPropertyOptional({ description: 'Special instructions' })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ description: 'Expected delivery date' })
  @IsOptional()
  @IsDateString()
  expectedDeliveryDate?: string;

  @ApiPropertyOptional({ description: 'Item selections (if not converting all items)', type: [String] })
  @IsOptional()
  @IsArray()
  @IsUUID(4, { each: true })
  selectedItemIds?: string[];
}

export class PurchaseRequisitionListResponseDto {
  @ApiProperty({ description: 'List of requisitions', type: [PurchaseRequisitionResponseDto] })
  requisitions: PurchaseRequisitionResponseDto[];

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

export class PurchaseRequisitionSummaryDto {
  @ApiProperty({ description: 'Total requisitions count' })
  totalRequisitions: number;

  @ApiProperty({ description: 'Pending approval count' })
  pendingApprovalCount: number;

  @ApiProperty({ description: 'Approved count' })
  approvedCount: number;

  @ApiProperty({ description: 'Rejected count' })
  rejectedCount: number;

  @ApiProperty({ description: 'Converted to PO count' })
  convertedToPOCount: number;

  @ApiProperty({ description: 'Overdue count' })
  overdueCount: number;

  @ApiProperty({ description: 'Total estimated amount' })
  totalEstimatedAmount: number;

  @ApiProperty({ description: 'Average processing time in days' })
  averageProcessingTime: number;

  @ApiProperty({ description: 'Requisitions by department' })
  byDepartment: Record<string, number>;

  @ApiProperty({ description: 'Requisitions by type' })
  byType: Record<string, number>;

  @ApiProperty({ description: 'Requisitions by priority' })
  byPriority: Record<string, number>;
}