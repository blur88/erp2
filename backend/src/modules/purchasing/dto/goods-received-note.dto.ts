import {
  IsString,
  IsOptional,
  IsEnum,
  IsArray,
  IsNumber,
  IsInt,
  MaxLength,
  Min,
  Max,
  IsDateString,
  IsUUID,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { GrnStatus } from '../../../database/entities/goods-received-note.entity';

export class CreateGrnItemDto {
  @ApiProperty({ description: 'Purchase order item ID' })
  @IsUUID()
  purchaseOrderItemId: string;

  @ApiProperty({ description: 'Quantity received' })
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  @Transform(({ value }) => typeof value === 'string' ? parseFloat(value) : value)
  receivedQuantity: number;
}

export class CreateGoodsReceivedNoteDto {
  @ApiProperty({ description: 'Purchase order ID' })
  @IsUUID()
  purchaseOrderId: string;

  @ApiProperty({ description: 'Received date' })
  @IsDateString()
  receivedDate: string;

  @ApiPropertyOptional({ description: 'GRN items (optional - will be auto-generated from PO if not provided)', type: [CreateGrnItemDto] })
  @IsOptional()
  items?: CreateGrnItemDto[];
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

  @ApiPropertyOptional({ description: 'Filter from received date' })
  @IsOptional()
  @IsDateString()
  receivedDateFrom?: string;

  @ApiPropertyOptional({ description: 'Filter to received date' })
  @IsOptional()
  @IsDateString()
  receivedDateTo?: string;

  @ApiPropertyOptional({ description: 'Sort by field', default: 'receivedDate' })
  @IsOptional()
  @IsString()
  sortBy?: string = 'receivedDate';

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
    product?: {
      id: string;
      sku: string;
      name: string;
    };
  };

  @ApiProperty({ description: 'Ordered quantity' })
  orderedQuantity: number;

  @ApiProperty({ description: 'Received quantity' })
  receivedQuantity: number;

  @ApiProperty({ description: 'Is fully received' })
  isFullyReceived: boolean;
}

export class GoodsReceivedNoteResponseDto {
  @ApiProperty({ description: 'GRN ID' })
  id: string;

  @ApiProperty({ description: 'GRN number' })
  grnNumber: string;

  @ApiProperty({ description: 'Status' })
  status: GrnStatus;

  @ApiProperty({ description: 'Purchase order information' })
  purchaseOrder?: {
    id: string;
    orderNumber: string;
    totalAmount: number;
    vendorPayments?: Array<{
      id: string;
      paymentNumber: string;
      amount: number;
      paymentDate: Date;
      paymentMethodId?: string;
      status: string;
    }>;
  };

  @ApiProperty({ description: 'Supplier information' })
  supplier: {
    id: string;
    supplierCode: string;
    companyName: string;
    contactPerson?: string;
    phone?: string;
    address?: string;
    city?: string;
    state?: string;
    postalCode?: string;
    country?: string;
  };

  @ApiProperty({ description: 'Received date' })
  receivedDate: Date;

  @ApiProperty({ description: 'Total quantity received' })
  totalQuantityReceived: number;

  @ApiProperty({ description: 'Received percentage' })
  receivedPercentage: number;

  @ApiProperty({ description: 'Is fully received' })
  isFullyReceived: boolean;

  @ApiProperty({ description: 'Is partially received' })
  isPartiallyReceived: boolean;

  @ApiProperty({ description: 'Items', type: [GrnItemResponseDto] })
  items: GrnItemResponseDto[];

  @ApiProperty({ description: 'Created date' })
  createdAt: Date;

  @ApiProperty({ description: 'Updated date' })
  updatedAt: Date;

  @ApiProperty({ description: 'Deleted date (if soft deleted)' })
  deletedAt?: Date;
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
