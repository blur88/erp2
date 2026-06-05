import {
  IsString,
  IsOptional,
  IsNumber,
  IsBoolean,
  IsEnum,
  IsUUID,
  IsArray,
  Min,
  Max,
  MaxLength,
  ArrayMinSize,
  ValidateNested,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { ProductType } from '../../../database/entities/product.entity';
import { BaseQueryDto } from '../../../common/dto/base-query.dto';


export class CreateProductDto {
  @ApiProperty({ description: 'Product name', maxLength: 200 })
  @IsString()
  @MaxLength(200)
  name: string;

  @ApiPropertyOptional({ description: 'Detailed product description' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'Product barcode - unique product identifier', maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  barcode?: string;

  @ApiPropertyOptional({ description: 'Product type', enum: ProductType, default: ProductType.GOODS })
  @IsOptional()
  @IsEnum(ProductType)
  type?: ProductType;

  @ApiProperty({ description: 'Product category ID' })
  @IsUUID(4)
  categoryId: string;

  @ApiProperty({ description: 'Base cost price', minimum: 0 })
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  baseCost: number;

  @ApiPropertyOptional({ description: 'Current stock quantity', minimum: 0, default: 0 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  stockQuantity?: number;

  @ApiPropertyOptional({ description: 'Internal notes about the product' })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ description: 'Whether the product is active for sales', default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

}

export class UpdateProductDto extends PartialType(CreateProductDto) {}

export class QueryProductsDto extends BaseQueryDto {
  @ApiPropertyOptional({ description: 'Filter by category ID' })
  @IsOptional()
  @IsUUID(4)
  categoryId?: string;

  @ApiPropertyOptional({ description: 'Filter by product type', enum: ProductType })
  @IsOptional()
  @IsEnum(ProductType)
  type?: ProductType;


  @ApiPropertyOptional({ description: 'Filter by low stock items only' })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;
  })
  @IsBoolean()
  lowStock?: boolean;

  @ApiPropertyOptional({ description: 'Filter by out of stock items only' })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;
  })
  @IsBoolean()
  outOfStock?: boolean;

  @ApiPropertyOptional({ description: 'Filter by brand' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  brand?: string;

  @ApiPropertyOptional({ description: 'Minimum stock quantity filter' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minStock?: number;

  @ApiPropertyOptional({ description: 'Maximum stock quantity filter' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  maxStock?: number;

  @ApiPropertyOptional({ description: 'Minimum price filter' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minPrice?: number;

  @ApiPropertyOptional({ description: 'Maximum price filter' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  maxPrice?: number;
}

export class ProductResponseDto {
  @ApiProperty({ description: 'Product ID' })
  id: string;

  @ApiProperty({ example: 'steel-bolt-m6' })
  slug: string;

  @ApiProperty({ description: 'Product name' })
  name: string;

  @ApiPropertyOptional({ description: 'Product description' })
  description?: string;

  @ApiPropertyOptional({ description: 'Product barcode' })
  barcode?: string;

  @ApiProperty({ description: 'Product type', enum: ProductType })
  type: ProductType;

  @ApiProperty({ description: 'Active status' })
  isActive: boolean;

  @ApiProperty({ description: 'Base cost price' })
  baseCost: number;

  @ApiProperty({ description: 'Current stock quantity' })
  stockQuantity: number;

  @ApiPropertyOptional({ description: 'Internal notes' })
  notes?: string;

  @ApiProperty({ description: 'Category ID' })
  categoryId: string;

  @ApiProperty({ description: 'Category information' })
  category: {
    id: string;
    name: string;
    fullPath: string;
  };

  @ApiProperty({ description: 'Out of stock indicator' })
  isOutOfStock: boolean;

  @ApiProperty({ description: 'Creation date' })
  createdAt: Date;

  @ApiProperty({ description: 'Last update date' })
  updatedAt: Date;

  @ApiPropertyOptional({ description: 'Deletion date (only for soft-deleted products)' })
  deletedAt?: Date;
}

export class ProductListResponseDto {
  @ApiProperty({ description: 'List of products', type: [ProductResponseDto] })
  data: ProductResponseDto[];

  @ApiProperty({ description: 'Response metadata' })
  meta: {
    total: number;
  };
}

export class BulkUpdatePricesDto {
  @ApiProperty({ description: 'List of product IDs and their new prices', type: 'array' })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ProductPriceUpdateDto)
  products: ProductPriceUpdateDto[];
}

export class ProductPriceUpdateDto {
  @ApiProperty({ description: 'Product ID' })
  @IsUUID(4)
  productId: string;

  @ApiPropertyOptional({ description: 'New base cost' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  baseCost?: number;

}

export class ProductStockSummaryDto {
  @ApiProperty({ description: 'Product ID' })
  id: string;

  @ApiProperty({ description: 'Product barcode' })
  barcode: string;

  @ApiProperty({ description: 'Product name' })
  name: string;

  @ApiProperty({ description: 'Current stock quantity' })
  stockQuantity: number;

  @ApiProperty({ description: 'Available stock quantity' })
  availableQuantity: number;

  @ApiProperty({ description: 'Reserved stock quantity' })
  reservedQuantity: number;

  @ApiProperty({ description: 'Stock status' })
  stockStatus: string;

  @ApiProperty({ description: 'Low stock indicator' })
  isLowStock: boolean;

  @ApiProperty({ description: 'Out of stock indicator' })
  isOutOfStock: boolean;

  @ApiProperty({ description: 'Category name' })
  categoryName: string;

  @ApiProperty({ description: 'Last stock movement date' })
  lastMovementDate?: Date;
}

export class ProductImportDto {
  @ApiProperty({ description: 'Import format', enum: ['csv', 'excel'] })
  @IsEnum(['csv', 'excel'])
  format: 'csv' | 'excel';
  
  @ApiPropertyOptional({ description: 'Skip duplicate products', default: false })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  skipDuplicates?: boolean;
  
  @ApiPropertyOptional({ description: 'Update existing products', default: false })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  updateExisting?: boolean;
}

export class ProductImportErrorDto {
  @ApiProperty({ description: 'Row number where error occurred' })
  row: number;
  
  @ApiProperty({ description: 'Field that caused the error' })
  field: string;
  
  @ApiProperty({ description: 'Error message' })
  message: string;
  
  @ApiPropertyOptional({ description: 'Value that caused the error' })
  value?: any;
}

export class ProductImportWarningDto {
  @ApiProperty({ description: 'Row number where warning occurred' })
  row: number;
  
  @ApiProperty({ description: 'Warning message' })
  message: string;
}

export class ProductImportResultDto {
  @ApiProperty({ description: 'Total rows processed' })
  totalRows: number;
  
  @ApiProperty({ description: 'Successfully imported products' })
  successCount: number;
  
  @ApiProperty({ description: 'Failed imports' })
  failureCount: number;
  
  @ApiProperty({ description: 'Updated existing products' })
  updatedCount: number;
  
  @ApiProperty({ description: 'Skipped duplicates' })
  skippedCount: number;
  
  @ApiProperty({ description: 'Validation errors by row', type: [ProductImportErrorDto] })
  errors: ProductImportErrorDto[];
  
  @ApiProperty({ description: 'Import warnings', type: [ProductImportWarningDto] })
  warnings: ProductImportWarningDto[];
  
  @ApiProperty({ description: 'List of successfully imported product IDs' })
  importedProductIds: string[];
}

class ProductImportRowDto {
  @ApiProperty({ description: 'Product name' })
  @IsString()
  @MaxLength(200)
  name: string;

  @ApiPropertyOptional({ description: 'Product description' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'Product barcode' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  barcode?: string;

  @ApiProperty({ description: 'Product type', enum: ['goods', 'service'] })
  @IsEnum(['goods', 'service'])
  type: string;

  @ApiProperty({ description: 'Category name (will be mapped to categoryId)' })
  @IsString()
  categoryName: string;

  @ApiProperty({ description: 'Base cost price', minimum: 0 })
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  baseCost: number;

  @ApiPropertyOptional({ description: 'Current stock quantity', minimum: 0, default: 0 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  stockQuantity?: number;

  @ApiPropertyOptional({ description: 'Internal notes' })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ description: 'Whether the product is active for sales', default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
