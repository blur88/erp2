import {
  IsString,
  IsBoolean,
  IsOptional,
  IsEnum,
  IsArray,
  IsDecimal,
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
import { GrnStatus, GrnType } from '../../../database/entities/goods-received-note.entity';

export class CreateGrnItemDto {
  @ApiProperty({ description: 'Purchase order item ID' })
  @IsUUID()
  purchaseOrderItemId: string;

  @ApiProperty({ description: 'Quantity received' })
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  @Transform(({ value }) => typeof value === 'string' ? parseFloat(value) : value)
  receivedQuantity: number;

  @ApiPropertyOptional({ description: 'Quantity rejected', default: 0 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  @Transform(({ value }) => typeof value === 'string' ? parseFloat(value) : value)
  rejectedQuantity?: number;

  @ApiPropertyOptional({ description: 'Quantity accepted', default: 0 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  @Transform(({ value }) => typeof value === 'string' ? parseFloat(value) : value)
  acceptedQuantity?: number;

  @ApiPropertyOptional({ description: 'Unit price at receipt' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  @Transform(({ value }) => typeof value === 'string' ? parseFloat(value) : value)
  unitPrice?: number;

  @ApiPropertyOptional({ description: 'Batch or lot number', maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  batchNumber?: string;

  @ApiPropertyOptional({ description: 'Expiry date' })
  @IsOptional()
  @IsDateString()
  expiryDate?: string;

  @ApiPropertyOptional({ description: 'Quality inspection result' })
  @IsOptional()
  @IsEnum(['passed', 'failed', 'pending'])
  qualityResult?: 'passed' | 'failed' | 'pending';

  @ApiPropertyOptional({ description: 'Quality inspection notes' })
  @IsOptional()
  @IsString()
  qualityNotes?: string;

  @ApiPropertyOptional({ description: 'Storage location', maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  storageLocation?: string;

  @ApiPropertyOptional({ description: 'Item condition at receipt' })
  @IsOptional()
  @IsEnum(['good', 'damaged', 'defective'])
  condition?: 'good' | 'damaged' | 'defective';

  @ApiPropertyOptional({ description: 'Rejection reason if applicable' })
  @IsOptional()
  @IsString()
  rejectionReason?: string;

  @ApiPropertyOptional({ description: 'Item-specific notes' })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class CreateGoodsReceivedNoteDto {
  @ApiProperty({ description: 'Purchase order ID' })
  @IsUUID()
  purchaseOrderId: string;

  @ApiPropertyOptional({ description: 'GRN type', enum: GrnType, default: GrnType.STANDARD })
  @IsOptional()
  @IsEnum(GrnType)
  type?: GrnType;

  @ApiProperty({ description: 'Receipt date' })
  @IsDateString()
  receiptDate: string;

  @ApiPropertyOptional({ description: 'Delivery note reference', maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  deliveryNoteRef?: string;

  @ApiPropertyOptional({ description: 'Vehicle/transport details', maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  vehicleDetails?: string;

  @ApiPropertyOptional({ description: 'Delivery person name', maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  deliveryPerson?: string;

  @ApiPropertyOptional({ description: 'Supplier invoice reference', maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  supplierInvoiceRef?: string;

  @ApiPropertyOptional({ description: 'Inspection required', default: false })
  @IsOptional()
  @IsBoolean()
  inspectionRequired?: boolean;

  @ApiPropertyOptional({ description: 'Inspection date' })
  @IsOptional()
  @IsDateString()
  inspectionDate?: string;

  @ApiPropertyOptional({ description: 'Inspector user ID' })
  @IsOptional()
  @IsUUID()
  inspectedByUserId?: string;

  @ApiPropertyOptional({ description: 'Overall inspection result' })
  @IsOptional()
  @IsEnum(['passed', 'failed', 'partial', 'pending'])
  inspectionResult?: 'passed' | 'failed' | 'partial' | 'pending';

  @ApiPropertyOptional({ description: 'General inspection notes' })
  @IsOptional()
  @IsString()
  inspectionNotes?: string;

  @ApiPropertyOptional({ description: 'General receipt notes' })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ description: 'Internal processing notes' })
  @IsOptional()
  @IsString()
  internalNotes?: string;

  @ApiPropertyOptional({ description: 'GRN items (optional - will be auto-generated from PO if not provided)', type: [CreateGrnItemDto] })
  @IsOptional()
  items?: CreateGrnItemDto[];

  @ApiPropertyOptional({ description: 'Additional metadata' })
  @IsOptional()
  metadata?: Record<string, any>;
}

export class UpdateGoodsReceivedNoteDto extends PartialType(CreateGoodsReceivedNoteDto) {
  @ApiPropertyOptional({ description: 'GRN status', enum: GrnStatus })
  @IsOptional()
  @IsEnum(GrnStatus)
  status?: GrnStatus;
}

export class GoodsReceivedNoteQueryDto {
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

  @ApiPropertyOptional({ description: 'Search term (GRN number, PO number, supplier)' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ description: 'Filter by supplier ID' })
  @IsOptional()
  @IsUUID()
  supplierId?: string;

  @ApiPropertyOptional({ description: 'Filter by purchase order ID' })
  @IsOptional()
  @IsUUID()
  purchaseOrderId?: string;

  @ApiPropertyOptional({ description: 'Filter by status', enum: GrnStatus })
  @IsOptional()
  @IsEnum(GrnStatus)
  status?: GrnStatus;

  @ApiPropertyOptional({ description: 'Filter by type', enum: GrnType })
  @IsOptional()
  @IsEnum(GrnType)
  type?: GrnType;

  @ApiPropertyOptional({ description: 'Filter by received user ID' })
  @IsOptional()
  @IsUUID()
  receivedByUserId?: string;

  @ApiPropertyOptional({ description: 'Filter by inspector user ID' })
  @IsOptional()
  @IsUUID()
  inspectedByUserId?: string;

  @ApiPropertyOptional({ description: 'Filter from receipt date' })
  @IsOptional()
  @IsDateString()
  receiptDateFrom?: string;

  @ApiPropertyOptional({ description: 'Filter to receipt date' })
  @IsOptional()
  @IsDateString()
  receiptDateTo?: string;

  @ApiPropertyOptional({ description: 'Show items requiring inspection only' })
  @IsOptional()
  @Transform(({ value }) => value === 'true')
  requiresInspection?: boolean;

  @ApiPropertyOptional({ description: 'Show items with quality issues only' })
  @IsOptional()
  @Transform(({ value }) => value === 'true')
  hasQualityIssues?: boolean;

  @ApiPropertyOptional({ description: 'Sort by field', default: 'receiptDate' })
  @IsOptional()
  @IsString()
  sortBy?: string = 'receiptDate';

  @ApiPropertyOptional({ description: 'Sort order', enum: ['ASC', 'DESC'], default: 'DESC' })
  @IsOptional()
  @IsString()
  sortOrder?: 'ASC' | 'DESC' = 'DESC';
}

export class GrnItemResponseDto {
  @ApiProperty({ description: 'GRN item ID' })
  id: string;

  @ApiProperty({ description: 'Purchase order item information' })
  purchaseOrderItem: {
    id: string;
    description: string;
    quantity: number;
    unitPrice: number;
    unit?: string;
    product?: {
      id: string;
      sku: string;
      name: string;
    };
  };

  @ApiProperty({ description: 'Received quantity' })
  receivedQuantity: number;

  @ApiProperty({ description: 'Rejected quantity' })
  rejectedQuantity: number;

  @ApiProperty({ description: 'Accepted quantity' })
  acceptedQuantity: number;

  @ApiProperty({ description: 'Unit price at receipt' })
  unitPrice: number;

  @ApiProperty({ description: 'Total amount for this line' })
  totalAmount: number;

  @ApiProperty({ description: 'Batch or lot number' })
  batchNumber?: string;

  @ApiProperty({ description: 'Expiry date' })
  expiryDate?: Date;

  @ApiProperty({ description: 'Quality inspection result' })
  qualityResult?: string;

  @ApiProperty({ description: 'Quality inspection notes' })
  qualityNotes?: string;

  @ApiProperty({ description: 'Storage location' })
  storageLocation?: string;

  @ApiProperty({ description: 'Item condition' })
  condition?: string;

  @ApiProperty({ description: 'Rejection reason' })
  rejectionReason?: string;

  @ApiProperty({ description: 'Is fully received' })
  isFullyReceived: boolean;

  @ApiProperty({ description: 'Has quality issues' })
  hasQualityIssues: boolean;

  @ApiProperty({ description: 'Acceptance rate percentage' })
  acceptanceRate: number;

  @ApiProperty({ description: 'Notes' })
  notes?: string;
}

export class GoodsReceivedNoteResponseDto {
  @ApiProperty({ description: 'GRN ID' })
  id: string;

  @ApiProperty({ description: 'GRN number' })
  grnNumber: string;

  @ApiProperty({ description: 'Status' })
  status: GrnStatus;

  @ApiProperty({ description: 'Type' })
  type: GrnType;

  @ApiProperty({ description: 'Purchase order information' })
  purchaseOrder: {
    id: string;
    orderNumber: string;
    status: string;
    totalAmount: number;
  };

  @ApiProperty({ description: 'Supplier information' })
  supplier: {
    id: string;
    supplierCode: string;
    companyName: string;
    contactPerson?: string;
  };

  @ApiProperty({ description: 'Received by user' })
  receivedByUser: {
    id: string;
    username: string;
    firstName?: string;
    lastName?: string;
  };

  @ApiProperty({ description: 'Inspected by user' })
  inspectedByUser?: {
    id: string;
    username: string;
    firstName?: string;
    lastName?: string;
  };

  @ApiProperty({ description: 'Receipt date' })
  receiptDate: Date;

  @ApiProperty({ description: 'Inspection date' })
  inspectionDate?: Date;

  @ApiProperty({ description: 'Delivery note reference' })
  deliveryNoteRef?: string;

  @ApiProperty({ description: 'Vehicle details' })
  vehicleDetails?: string;

  @ApiProperty({ description: 'Delivery person' })
  deliveryPerson?: string;

  @ApiProperty({ description: 'Supplier invoice reference' })
  supplierInvoiceRef?: string;

  @ApiProperty({ description: 'Inspection required' })
  inspectionRequired: boolean;

  @ApiProperty({ description: 'Overall inspection result' })
  inspectionResult?: string;

  @ApiProperty({ description: 'Inspection notes' })
  inspectionNotes?: string;

  @ApiProperty({ description: 'Total amount received' })
  totalAmount: number;

  @ApiProperty({ description: 'Total quantity received' })
  totalReceivedQuantity: number;

  @ApiProperty({ description: 'Total quantity accepted' })
  totalAcceptedQuantity: number;

  @ApiProperty({ description: 'Total quantity rejected' })
  totalRejectedQuantity: number;

  @ApiProperty({ description: 'Overall acceptance rate percentage' })
  overallAcceptanceRate: number;

  @ApiProperty({ description: 'Has quality issues' })
  hasQualityIssues: boolean;

  @ApiProperty({ description: 'Requires inspection' })
  requiresInspection: boolean;

  @ApiProperty({ description: 'Is completed' })
  isCompleted: boolean;

  @ApiProperty({ description: 'Can approve' })
  canApprove: boolean;

  @ApiProperty({ description: 'Notes' })
  notes?: string;

  @ApiProperty({ description: 'Internal notes' })
  internalNotes?: string;

  @ApiProperty({ description: 'Items', type: [GrnItemResponseDto] })
  items: GrnItemResponseDto[];

  @ApiProperty({ description: 'Created date' })
  createdAt: Date;

  @ApiProperty({ description: 'Updated date' })
  updatedAt: Date;
}

export class InspectGoodsReceivedNoteDto {
  @ApiProperty({ description: 'Inspection date' })
  @IsDateString()
  inspectionDate: string;

  @ApiPropertyOptional({ description: 'Inspector user ID' })
  @IsOptional()
  @IsUUID()
  inspectedByUserId?: string;

  @ApiProperty({ description: 'Overall inspection result' })
  @IsEnum(['passed', 'failed', 'partial'])
  inspectionResult: 'passed' | 'failed' | 'partial';

  @ApiPropertyOptional({ description: 'Inspection notes' })
  @IsOptional()
  @IsString()
  inspectionNotes?: string;

  @ApiProperty({ description: 'Item inspection results' })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => InspectItemDto)
  itemResults: InspectItemDto[];
}

export class InspectItemDto {
  @ApiProperty({ description: 'GRN item ID' })
  @IsUUID()
  itemId: string;

  @ApiProperty({ description: 'Quality inspection result' })
  @IsEnum(['passed', 'failed'])
  qualityResult: 'passed' | 'failed';

  @ApiPropertyOptional({ description: 'Quality inspection notes' })
  @IsOptional()
  @IsString()
  qualityNotes?: string;

  @ApiPropertyOptional({ description: 'Final accepted quantity' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  @Transform(({ value }) => typeof value === 'string' ? parseFloat(value) : value)
  acceptedQuantity?: number;

  @ApiPropertyOptional({ description: 'Final rejected quantity' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  @Transform(({ value }) => typeof value === 'string' ? parseFloat(value) : value)
  rejectedQuantity?: number;

  @ApiPropertyOptional({ description: 'Rejection reason' })
  @IsOptional()
  @IsString()
  rejectionReason?: string;

  @ApiPropertyOptional({ description: 'Storage location' })
  @IsOptional()
  @IsString()
  storageLocation?: string;
}

export class ApproveGoodsReceivedNoteDto {
  @ApiPropertyOptional({ description: 'Approval comments' })
  @IsOptional()
  @IsString()
  comments?: string;

  @ApiPropertyOptional({ description: 'Auto-update inventory', default: true })
  @IsOptional()
  @IsBoolean()
  updateInventory?: boolean;
}

export class RejectGoodsReceivedNoteDto {
  @ApiProperty({ description: 'Rejection reason' })
  @IsString()
  @MinLength(5)
  @MaxLength(500)
  reason: string;
}

export class GoodsReceivedNoteListResponseDto {
  @ApiProperty({ description: 'List of GRNs', type: [GoodsReceivedNoteResponseDto] })
  grns: GoodsReceivedNoteResponseDto[];

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

export class GrnSummaryDto {
  @ApiProperty({ description: 'Total GRNs count' })
  totalGrns: number;

  @ApiProperty({ description: 'Pending inspection count' })
  pendingInspectionCount: number;

  @ApiProperty({ description: 'Quality issues count' })
  qualityIssuesCount: number;

  @ApiProperty({ description: 'Completed count' })
  completedCount: number;

  @ApiProperty({ description: 'Total received amount' })
  totalReceivedAmount: number;

  @ApiProperty({ description: 'Total accepted amount' })
  totalAcceptedAmount: number;

  @ApiProperty({ description: 'Total rejected amount' })
  totalRejectedAmount: number;

  @ApiProperty({ description: 'Overall acceptance rate' })
  overallAcceptanceRate: number;

  @ApiProperty({ description: 'GRNs by status' })
  grnsByStatus: Record<string, number>;

  @ApiProperty({ description: 'Top suppliers by receipt volume' })
  topSuppliers: Array<{
    supplierId: string;
    companyName: string;
    grnCount: number;
    totalAmount: number;
    acceptanceRate: number;
  }>;
}

export class QualityIssueDto {
  @ApiProperty({ description: 'GRN ID' })
  grnId: string;

  @ApiProperty({ description: 'GRN number' })
  grnNumber: string;

  @ApiProperty({ description: 'Supplier name' })
  supplierName: string;

  @ApiProperty({ description: 'Issue description' })
  issueDescription: string;

  @ApiProperty({ description: 'Severity level' })
  @IsEnum(['low', 'medium', 'high', 'critical'])
  severity: 'low' | 'medium' | 'high' | 'critical';

  @ApiProperty({ description: 'Affected quantity' })
  affectedQuantity: number;

  @ApiProperty({ description: 'Financial impact' })
  financialImpact: number;

  @ApiProperty({ description: 'Receipt date' })
  receiptDate: Date;

  @ApiProperty({ description: 'Is resolved' })
  isResolved: boolean;

  @ApiProperty({ description: 'Resolution notes' })
  resolutionNotes?: string;
}