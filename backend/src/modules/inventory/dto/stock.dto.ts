import {
  IsString,
  IsOptional,
  IsNumber,
  IsEnum,
  IsUUID,
  IsDate,
  IsArray,
  IsBoolean,
  MaxLength,
  Min,
  Max,
  ValidateNested,
  ArrayMinSize,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  StockMovementType,
  StockMovementStatus,
} from '../../../database/entities/stock-movement.entity';
import {
  StockAdjustmentType,
  StockAdjustmentStatus,
} from '../../../database/entities/stock-adjustment.entity';

export class CreateStockMovementDto {
  @ApiProperty({ description: 'Product ID' })
  @IsUUID(4)
  productId: string;

  @ApiProperty({ description: 'Type of stock movement', enum: StockMovementType })
  @IsEnum(StockMovementType)
  movementType: StockMovementType;

  @ApiProperty({ description: 'Movement quantity (positive for inward, negative for outward)' })
  @IsNumber({ maxDecimalPlaces: 4 })
  quantity: number;

  @ApiPropertyOptional({ description: 'Unit cost/price at time of movement' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  unitValue?: number;

  @ApiPropertyOptional({ description: 'Reference type (sales_order, purchase_order, etc.)' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  referenceType?: string;

  @ApiPropertyOptional({ description: 'Reference document ID' })
  @IsOptional()
  @IsUUID(4)
  referenceId?: string;

  @ApiPropertyOptional({ description: 'Reference number (order number, etc.)' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  referenceNumber?: string;

  @ApiPropertyOptional({ description: 'Warehouse/location code', maxLength: 50, default: 'MAIN' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  locationCode?: string;

  @ApiPropertyOptional({ description: 'Bin/shelf location within warehouse' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  binLocation?: string;

  @ApiPropertyOptional({ description: 'Batch or lot number' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  batchNumber?: string;

  @ApiPropertyOptional({ description: 'Expiry date for batch/lot' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  expiryDate?: Date;

  @ApiPropertyOptional({ description: 'Reason or notes for this movement' })
  @IsOptional()
  @IsString()
  reason?: string;

  @ApiPropertyOptional({ description: 'Additional notes' })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ description: 'Additional metadata', type: 'object' })
  @IsOptional()
  metadata?: Record<string, any>;
}

export class QueryStockMovementsDto {
  @ApiPropertyOptional({ description: 'Page number', minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ description: 'Items per page', minimum: 1, maximum: 100, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @ApiPropertyOptional({ description: 'Filter by product ID' })
  @IsOptional()
  @IsUUID(4)
  productId?: string;

  @ApiPropertyOptional({ description: 'Filter by movement type', enum: StockMovementType })
  @IsOptional()
  @IsEnum(StockMovementType)
  movementType?: StockMovementType;

  @ApiPropertyOptional({ description: 'Filter by movement status', enum: StockMovementStatus })
  @IsOptional()
  @IsEnum(StockMovementStatus)
  status?: StockMovementStatus;

  @ApiPropertyOptional({ description: 'Filter movements from this date' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  fromDate?: Date;

  @ApiPropertyOptional({ description: 'Filter movements to this date' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  toDate?: Date;

  @ApiPropertyOptional({ description: 'Filter by reference type' })
  @IsOptional()
  @IsString()
  referenceType?: string;

  @ApiPropertyOptional({ description: 'Filter by reference ID' })
  @IsOptional()
  @IsUUID(4)
  referenceId?: string;

  @ApiPropertyOptional({ description: 'Filter by location code' })
  @IsOptional()
  @IsString()
  locationCode?: string;

  @ApiPropertyOptional({ description: 'Filter by batch number' })
  @IsOptional()
  @IsString()
  batchNumber?: string;

  @ApiPropertyOptional({ description: 'Filter by user who made the movement' })
  @IsOptional()
  @IsUUID(4)
  movedByUserId?: string;

  @ApiPropertyOptional({ description: 'Search term (product name, SKU, reference number)' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ description: 'Sort field', enum: ['movementDate', 'quantity', 'totalValue'] })
  @IsOptional()
  @IsString()
  sortBy?: string;

  @ApiPropertyOptional({ description: 'Sort order', enum: ['ASC', 'DESC'] })
  @IsOptional()
  @IsString()
  sortOrder?: 'ASC' | 'DESC';
}

export class CreateStockAdjustmentDto {
  @ApiProperty({ description: 'Product ID' })
  @IsUUID(4)
  productId: string;

  @ApiProperty({ description: 'Type of stock adjustment', enum: StockAdjustmentType })
  @IsEnum(StockAdjustmentType)
  type: StockAdjustmentType;

  @ApiProperty({ description: 'Current system stock quantity' })
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  systemQuantity: number;

  @ApiProperty({ description: 'Actual physical quantity counted/found' })
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  physicalQuantity: number;

  @ApiPropertyOptional({ description: 'Unit cost at time of adjustment' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  unitCost?: number;

  @ApiPropertyOptional({ description: 'Warehouse/location code', default: 'MAIN' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  locationCode?: string;

  @ApiPropertyOptional({ description: 'Bin/shelf location within warehouse' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  binLocation?: string;

  @ApiPropertyOptional({ description: 'Batch or lot number being adjusted' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  batchNumber?: string;

  @ApiPropertyOptional({ description: 'Expiry date of batch/lot' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  expiryDate?: Date;

  @ApiProperty({ description: 'Reason for adjustment' })
  @IsString()
  reason: string;

  @ApiPropertyOptional({ description: 'Additional notes and details' })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ description: 'Name of person who performed physical count' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  countedBy?: string;

  @ApiPropertyOptional({ description: 'When physical count was performed' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  countedAt?: Date;

  @ApiPropertyOptional({ description: 'Count verification details', type: 'object' })
  @IsOptional()
  countDetails?: {
    countMethod: string;
    countTeam?: string[];
    verifiedCount?: boolean;
    recountPerformed?: boolean;
    discrepancyInvestigated?: boolean;
  };

  @ApiPropertyOptional({ description: 'Supporting documents or photos', type: 'array' })
  @IsOptional()
  @IsArray()
  attachments?: Array<{
    filename: string;
    url: string;
    type: 'photo' | 'document';
    description?: string;
  }>;

  @ApiPropertyOptional({ description: 'Additional metadata', type: 'object' })
  @IsOptional()
  metadata?: Record<string, any>;
}

export class UpdateStockAdjustmentDto extends PartialType(CreateStockAdjustmentDto) {
  @ApiPropertyOptional({ description: 'Approval or rejection notes' })
  @IsOptional()
  @IsString()
  approvalNotes?: string;
}

export class QueryStockAdjustmentsDto {
  @ApiPropertyOptional({ description: 'Page number', minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ description: 'Items per page', minimum: 1, maximum: 100, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @ApiPropertyOptional({ description: 'Filter by product ID' })
  @IsOptional()
  @IsUUID(4)
  productId?: string;

  @ApiPropertyOptional({ description: 'Filter by adjustment type', enum: StockAdjustmentType })
  @IsOptional()
  @IsEnum(StockAdjustmentType)
  type?: StockAdjustmentType;

  @ApiPropertyOptional({ description: 'Filter by adjustment status', enum: StockAdjustmentStatus })
  @IsOptional()
  @IsEnum(StockAdjustmentStatus)
  status?: StockAdjustmentStatus;

  @ApiPropertyOptional({ description: 'Filter adjustments from this date' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  fromDate?: Date;

  @ApiPropertyOptional({ description: 'Filter adjustments to this date' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  toDate?: Date;

  @ApiPropertyOptional({ description: 'Filter by user who made the adjustment' })
  @IsOptional()
  @IsUUID(4)
  adjustedByUserId?: string;

  @ApiPropertyOptional({ description: 'Filter by user who approved the adjustment' })
  @IsOptional()
  @IsUUID(4)
  approvedByUserId?: string;

  @ApiPropertyOptional({ description: 'Filter by location code' })
  @IsOptional()
  @IsString()
  locationCode?: string;

  @ApiPropertyOptional({ description: 'Show only adjustments requiring approval' })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;
  })
  @IsBoolean()
  requiresApproval?: boolean;

  @ApiPropertyOptional({ description: 'Search term (adjustment number, product name, reason)' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ description: 'Sort field', enum: ['adjustmentDate', 'adjustmentQuantity', 'totalValueImpact'] })
  @IsOptional()
  @IsString()
  sortBy?: string;

  @ApiPropertyOptional({ description: 'Sort order', enum: ['ASC', 'DESC'] })
  @IsOptional()
  @IsString()
  sortOrder?: 'ASC' | 'DESC';
}

export class StockAdjustmentActionDto {
  @ApiPropertyOptional({ description: 'Approval or rejection notes' })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ description: 'Force approval even if business rules suggest otherwise' })
  @IsOptional()
  @IsBoolean()
  forceApproval?: boolean;
}

export class BulkStockAdjustmentDto {
  @ApiProperty({ description: 'List of stock adjustments', type: 'array' })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateStockAdjustmentDto)
  adjustments: CreateStockAdjustmentDto[];

  @ApiPropertyOptional({ description: 'Global reason for all adjustments' })
  @IsOptional()
  @IsString()
  globalReason?: string;

  @ApiPropertyOptional({ description: 'Global count details for all adjustments' })
  @IsOptional()
  globalCountDetails?: {
    countMethod: string;
    countTeam?: string[];
    verifiedCount?: boolean;
    recountPerformed?: boolean;
    discrepancyInvestigated?: boolean;
  };
}

export class StockTransferDto {
  @ApiProperty({ description: 'Product ID' })
  @IsUUID(4)
  productId: string;

  @ApiProperty({ description: 'Transfer quantity' })
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0.0001)
  quantity: number;

  @ApiProperty({ description: 'Source location code' })
  @IsString()
  @MaxLength(50)
  fromLocationCode: string;

  @ApiProperty({ description: 'Target location code' })
  @IsString()
  @MaxLength(50)
  toLocationCode: string;

  @ApiPropertyOptional({ description: 'Source bin location' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  fromBinLocation?: string;

  @ApiPropertyOptional({ description: 'Target bin location' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  toBinLocation?: string;

  @ApiPropertyOptional({ description: 'Batch number to transfer' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  batchNumber?: string;

  @ApiProperty({ description: 'Reason for transfer' })
  @IsString()
  reason: string;

  @ApiPropertyOptional({ description: 'Transfer notes' })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ description: 'Transfer reference number' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  referenceNumber?: string;
}

export class StockReservationDto {
  @ApiProperty({ description: 'Product ID' })
  @IsUUID(4)
  productId: string;

  @ApiProperty({ description: 'Quantity to reserve' })
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0.0001)
  quantity: number;

  @ApiProperty({ description: 'Reason for reservation' })
  @IsString()
  reason: string;

  @ApiPropertyOptional({ description: 'Reference type (sales_order, etc.)' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  referenceType?: string;

  @ApiPropertyOptional({ description: 'Reference document ID' })
  @IsOptional()
  @IsUUID(4)
  referenceId?: string;

  @ApiPropertyOptional({ description: 'Expiry date for reservation (auto-release after this date)' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  expiryDate?: Date;

  @ApiPropertyOptional({ description: 'Additional metadata', type: 'object' })
  @IsOptional()
  metadata?: Record<string, any>;
}

export class StockMovementResponseDto {
  @ApiProperty({ description: 'Movement ID' })
  id: string;

  @ApiProperty({ description: 'Movement type', enum: StockMovementType })
  movementType: StockMovementType;

  @ApiProperty({ description: 'Movement status', enum: StockMovementStatus })
  status: StockMovementStatus;

  @ApiProperty({ description: 'Movement date' })
  movementDate: Date;

  @ApiProperty({ description: 'Movement quantity' })
  quantity: number;

  @ApiProperty({ description: 'Stock before movement' })
  previousBalance: number;

  @ApiProperty({ description: 'Stock after movement' })
  newBalance: number;

  @ApiPropertyOptional({ description: 'Unit value' })
  unitValue?: number;

  @ApiPropertyOptional({ description: 'Total value' })
  totalValue?: number;

  @ApiPropertyOptional({ description: 'Reference type' })
  referenceType?: string;

  @ApiPropertyOptional({ description: 'Reference ID' })
  referenceId?: string;

  @ApiPropertyOptional({ description: 'Reference number' })
  referenceNumber?: string;

  @ApiProperty({ description: 'Location code' })
  locationCode: string;

  @ApiPropertyOptional({ description: 'Bin location' })
  binLocation?: string;

  @ApiPropertyOptional({ description: 'Batch number' })
  batchNumber?: string;

  @ApiPropertyOptional({ description: 'Expiry date' })
  expiryDate?: Date;

  @ApiPropertyOptional({ description: 'Movement reason' })
  reason?: string;

  @ApiPropertyOptional({ description: 'Movement notes' })
  notes?: string;

  @ApiProperty({ description: 'Product information' })
  product: {
    id: string;
    sku: string;
    name: string;
    unit: string;
  };

  @ApiPropertyOptional({ description: 'User who made the movement' })
  movedByUser?: {
    id: string;
    email: string;
    firstName?: string;
    lastName?: string;
  };

  @ApiProperty({ description: 'Movement direction' })
  isInward: boolean;

  @ApiProperty({ description: 'Movement direction' })
  isOutward: boolean;

  @ApiProperty({ description: 'Is adjustment' })
  isAdjustment: boolean;

  @ApiProperty({ description: 'Movement description' })
  description: string;

  @ApiProperty({ description: 'Creation date' })
  createdAt: Date;

  @ApiProperty({ description: 'Last update date' })
  updatedAt: Date;
}

export class StockAdjustmentResponseDto {
  @ApiProperty({ description: 'Adjustment ID' })
  id: string;

  @ApiProperty({ description: 'Adjustment number' })
  adjustmentNumber: string;

  @ApiProperty({ description: 'Adjustment type', enum: StockAdjustmentType })
  type: StockAdjustmentType;

  @ApiProperty({ description: 'Adjustment status', enum: StockAdjustmentStatus })
  status: StockAdjustmentStatus;

  @ApiProperty({ description: 'Adjustment date' })
  adjustmentDate: Date;

  @ApiPropertyOptional({ description: 'Approved date' })
  approvedDate?: Date;

  @ApiProperty({ description: 'System quantity before adjustment' })
  systemQuantity: number;

  @ApiProperty({ description: 'Physical quantity found' })
  physicalQuantity: number;

  @ApiProperty({ description: 'Adjustment quantity (difference)' })
  adjustmentQuantity: number;

  @ApiPropertyOptional({ description: 'Unit cost' })
  unitCost?: number;

  @ApiPropertyOptional({ description: 'Total value impact' })
  totalValueImpact?: number;

  @ApiProperty({ description: 'Location code' })
  locationCode: string;

  @ApiPropertyOptional({ description: 'Bin location' })
  binLocation?: string;

  @ApiPropertyOptional({ description: 'Batch number' })
  batchNumber?: string;

  @ApiPropertyOptional({ description: 'Expiry date' })
  expiryDate?: Date;

  @ApiProperty({ description: 'Adjustment reason' })
  reason: string;

  @ApiPropertyOptional({ description: 'Additional notes' })
  notes?: string;

  @ApiPropertyOptional({ description: 'Approval notes' })
  approvalNotes?: string;

  @ApiPropertyOptional({ description: 'Counted by' })
  countedBy?: string;

  @ApiPropertyOptional({ description: 'Counted at' })
  countedAt?: Date;

  @ApiPropertyOptional({ description: 'Count details' })
  countDetails?: {
    countMethod: string;
    countTeam?: string[];
    verifiedCount?: boolean;
    recountPerformed?: boolean;
    discrepancyInvestigated?: boolean;
  };

  @ApiPropertyOptional({ description: 'Attachments' })
  attachments?: Array<{
    filename: string;
    url: string;
    type: 'photo' | 'document';
    description?: string;
  }>;

  @ApiProperty({ description: 'Product information' })
  product: {
    id: string;
    sku: string;
    name: string;
    unit: string;
  };

  @ApiProperty({ description: 'User who made the adjustment' })
  adjustedByUser: {
    id: string;
    email: string;
    firstName?: string;
    lastName?: string;
  };

  @ApiPropertyOptional({ description: 'User who approved the adjustment' })
  approvedByUser?: {
    id: string;
    email: string;
    firstName?: string;
    lastName?: string;
  };

  @ApiProperty({ description: 'Is increase' })
  isIncrease: boolean;

  @ApiProperty({ description: 'Is decrease' })
  isDecrease: boolean;

  @ApiProperty({ description: 'Adjustment percentage' })
  adjustmentPercent: number;

  @ApiProperty({ description: 'Is pending' })
  isPending: boolean;

  @ApiProperty({ description: 'Is completed' })
  isCompleted: boolean;

  @ApiProperty({ description: 'Can approve' })
  canApprove: boolean;

  @ApiProperty({ description: 'Can reject' })
  canReject: boolean;

  @ApiProperty({ description: 'Requires approval' })
  requiresApproval: boolean;

  @ApiProperty({ description: 'Is significant adjustment' })
  isSignificant: boolean;

  @ApiProperty({ description: 'Creation date' })
  createdAt: Date;

  @ApiProperty({ description: 'Last update date' })
  updatedAt: Date;
}

export class StockSummaryDto {
  @ApiProperty({ description: 'Product ID' })
  productId: string;

  @ApiProperty({ description: 'Product SKU' })
  sku: string;

  @ApiProperty({ description: 'Product name' })
  name: string;

  @ApiProperty({ description: 'Current stock quantity' })
  stockQuantity: number;

  @ApiProperty({ description: 'Reserved quantity' })
  reservedQuantity: number;

  @ApiProperty({ description: 'Available quantity' })
  availableQuantity: number;

  @ApiProperty({ description: 'Stock value (based on cost)' })
  stockValue: number;

  @ApiProperty({ description: 'Last movement date' })
  lastMovementDate?: Date;

  @ApiProperty({ description: 'Last adjustment date' })
  lastAdjustmentDate?: Date;

  @ApiProperty({ description: 'Total inward movements in period' })
  totalInward: number;

  @ApiProperty({ description: 'Total outward movements in period' })
  totalOutward: number;

  @ApiProperty({ description: 'Net movement in period' })
  netMovement: number;
}

export class LowStockAlertDto {
  @ApiProperty({ description: 'Product ID' })
  productId: string;

  @ApiProperty({ description: 'Product SKU' })
  sku: string;

  @ApiProperty({ description: 'Product name' })
  name: string;

  @ApiProperty({ description: 'Current stock quantity' })
  currentStock: number;

  @ApiProperty({ description: 'Reorder level' })
  reorderLevel: number;

  @ApiProperty({ description: 'Recommended order quantity' })
  recommendedOrderQuantity: number;

  @ApiProperty({ description: 'Days since last restock' })
  daysSinceLastRestock: number;

  @ApiProperty({ description: 'Average daily usage' })
  averageDailyUsage: number;

  @ApiProperty({ description: 'Estimated days until out of stock' })
  estimatedDaysUntilOutOfStock: number;

  @ApiProperty({ description: 'Alert severity', enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] })
  alertSeverity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

  @ApiProperty({ description: 'Category name' })
  categoryName: string;

  @ApiProperty({ description: 'Last movement date' })
  lastMovementDate?: Date;
}