import {
  IsString,
  IsOptional,
  IsNumber,
  IsEnum,
  IsUUID,
  IsDate,
  IsArray,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { StockAdjustmentStatus } from '../../../database/entities/stock-adjustment.entity';

// DTO for creating/updating adjustment line items
export class StockAdjustmentItemDto {
  @ApiProperty({ description: 'Product ID' })
  @IsUUID(4)
  productId: string;

  @ApiProperty({ description: 'Stock snapshot at adjustment time; can be negative (e.g. oversell)' })
  @IsNumber({ maxDecimalPlaces: 4 })
  oldQuantity: number;

  @ApiProperty({ description: 'Quantity after adjustment' })
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  newQuantity: number;

  @ApiProperty({ description: 'Difference (newQuantity - oldQuantity)' })
  @IsNumber({ maxDecimalPlaces: 4 })
  difference: number;

  @ApiPropertyOptional({ description: 'Unit cost at time of adjustment' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  unitCost?: number;

  @ApiPropertyOptional({ description: 'Notes for this specific item' })
  @IsOptional()
  @IsString()
  notes?: string;
}

// DTO for creating a stock adjustment
export class CreateStockAdjustmentDto {
  @ApiProperty({ description: 'Adjustment date' })
  @Transform(({ value }) => value ? new Date(value) : new Date())
  @IsDate()
  adjustmentDate: Date;

  @ApiPropertyOptional({ description: 'Adjustment notes/reason' })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiProperty({ description: 'Adjustment items', type: [StockAdjustmentItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => StockAdjustmentItemDto)
  items: StockAdjustmentItemDto[];
}

// DTO for updating a stock adjustment (draft only)
export class UpdateStockAdjustmentDto {
  @ApiPropertyOptional({ description: 'Adjustment date' })
  @IsOptional()
  @Transform(({ value }) => value ? new Date(value) : undefined)
  @IsDate()
  adjustmentDate?: Date;

  @ApiPropertyOptional({ description: 'Adjustment notes/reason' })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ description: 'Adjustment items', type: [StockAdjustmentItemDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => StockAdjustmentItemDto)
  items?: StockAdjustmentItemDto[];
}

// DTO for querying stock adjustments
export class QueryStockAdjustmentsDto {
  @ApiPropertyOptional({ description: 'Page number', minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ description: 'Items per page', minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  limit?: number;

  @ApiPropertyOptional({ description: 'Filter by status', enum: StockAdjustmentStatus })
  @IsOptional()
  @IsEnum(StockAdjustmentStatus)
  status?: StockAdjustmentStatus;

  @ApiPropertyOptional({ description: 'Filter adjustments from this date' })
  @IsOptional()
  @Transform(({ value }) => value ? new Date(value) : undefined)
  @IsDate()
  fromDate?: Date;

  @ApiPropertyOptional({ description: 'Filter adjustments to this date' })
  @IsOptional()
  @Transform(({ value }) => value ? new Date(value) : undefined)
  @IsDate()
  toDate?: Date;

  @ApiPropertyOptional({ description: 'Search term (adjustment number, notes)' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ description: 'Sort field', enum: ['adjustmentDate', 'adjustmentNumber', 'totalValue', 'itemCount'] })
  @IsOptional()
  @IsString()
  sortBy?: string;

  @ApiPropertyOptional({ description: 'Sort order', enum: ['ASC', 'DESC'] })
  @IsOptional()
  @IsString()
  sortOrder?: 'ASC' | 'DESC';
}

// Response DTOs
export class StockAdjustmentItemResponseDto {
  @ApiProperty({ description: 'Item ID' })
  id: string;

  @ApiProperty({ description: 'Product information' })
  product: {
    id: string;
    name: string;
    barcode: string;
  };

  @ApiProperty({ description: 'Quantity before adjustment' })
  oldQuantity: number;

  @ApiProperty({ description: 'Quantity after adjustment' })
  newQuantity: number;

  @ApiProperty({ description: 'Difference' })
  difference: number;

  @ApiPropertyOptional({ description: 'Unit cost' })
  unitCost?: number;

  @ApiPropertyOptional({ description: 'Total value' })
  totalValue?: number;

  @ApiPropertyOptional({ description: 'Item notes' })
  notes?: string;

  @ApiProperty({ description: 'Is increase' })
  isIncrease: boolean;

  @ApiProperty({ description: 'Is decrease' })
  isDecrease: boolean;

  @ApiProperty({ description: 'Absolute difference' })
  absoluteDifference: number;
}

export class StockAdjustmentResponseDto {
  @ApiProperty({ description: 'Adjustment ID' })
  id: string;

  @ApiProperty({ description: 'Adjustment number' })
  adjustmentNumber: string;

  @ApiProperty({ description: 'Adjustment date' })
  adjustmentDate: Date;

  @ApiProperty({ description: 'Adjustment status', enum: StockAdjustmentStatus })
  status: StockAdjustmentStatus;

  @ApiPropertyOptional({ description: 'Adjustment notes' })
  notes?: string;

  @ApiProperty({ description: 'Number of items' })
  itemCount: number;

  @ApiProperty({ description: 'Total value' })
  totalValue: number;

  @ApiProperty({ description: 'Adjustment items', type: [StockAdjustmentItemResponseDto] })
  items: StockAdjustmentItemResponseDto[];

  @ApiProperty({ description: 'Is editable' })
  isEditable: boolean;

  @ApiProperty({ description: 'Can complete' })
  canComplete: boolean;

  @ApiProperty({ description: 'Creation date' })
  createdAt: Date;

  @ApiProperty({ description: 'Last update date' })
  updatedAt: Date;
}

export class StockAdjustmentListResponseDto {
  @ApiProperty({ description: 'Adjustment ID' })
  id: string;

  @ApiProperty({ description: 'Adjustment number' })
  adjustmentNumber: string;

  @ApiProperty({ description: 'Adjustment date' })
  adjustmentDate: Date;

  @ApiProperty({ description: 'Adjustment status', enum: StockAdjustmentStatus })
  status: StockAdjustmentStatus;

  @ApiPropertyOptional({ description: 'Adjustment notes (truncated)' })
  notes?: string;

  @ApiProperty({ description: 'Number of items' })
  itemCount: number;

  @ApiProperty({ description: 'Total value' })
  totalValue: number;

  @ApiProperty({ description: 'Creation date' })
  createdAt: Date;
}
