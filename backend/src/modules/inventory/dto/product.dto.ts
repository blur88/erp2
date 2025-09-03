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
  IsObject,
  ValidateNested,
  ArrayMinSize,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { ProductStatus, ProductType } from '../../../database/entities/product.entity';

export class ProductDimensionsDto {
  @ApiPropertyOptional({ description: 'Product length in cm' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  length?: number;

  @ApiPropertyOptional({ description: 'Product width in cm' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  width?: number;

  @ApiPropertyOptional({ description: 'Product height in cm' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  height?: number;
}

export class CreateProductDto {
  @ApiProperty({ description: 'Product barcode - unique product identifier', maxLength: 100 })
  @IsString()
  @MaxLength(100)
  barcode: string;

  @ApiProperty({ description: 'Product name', maxLength: 200 })
  @IsString()
  @MaxLength(200)
  name: string;

  @ApiPropertyOptional({ description: 'Detailed product description' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'Product type', enum: ProductType, default: ProductType.GOODS })
  @IsOptional()
  @IsEnum(ProductType)
  type?: ProductType;

  @ApiPropertyOptional({ description: 'Product status', enum: ProductStatus, default: ProductStatus.ACTIVE })
  @IsOptional()
  @IsEnum(ProductStatus)
  status?: ProductStatus;

  @ApiPropertyOptional({ description: 'Whether the product is active for sales', default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiProperty({ description: 'Base cost price', minimum: 0 })
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  baseCost: number;

  @ApiProperty({ description: 'Retail selling price', minimum: 0 })
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  retailPrice: number;

  @ApiProperty({ description: 'Wholesale selling price', minimum: 0 })
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  wholesalePrice: number;

  @ApiProperty({ description: 'Special/promotional selling price', minimum: 0 })
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  specialPrice: number;

  @ApiPropertyOptional({ description: 'Current stock quantity', minimum: 0, default: 0 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  currentStock?: number;

  @ApiPropertyOptional({ description: 'Product weight in kg', minimum: 0 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  weight?: number;

  @ApiPropertyOptional({ description: 'Product dimensions', type: ProductDimensionsDto })
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => ProductDimensionsDto)
  dimensions?: ProductDimensionsDto;

  @ApiPropertyOptional({ description: 'Product brand', maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  brand?: string;

  @ApiPropertyOptional({ description: 'Product model', maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  model?: string;

  @ApiPropertyOptional({ description: 'Product image URL or path', maxLength: 255 })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  imageUrl?: string;

  @ApiPropertyOptional({ description: 'Additional product images', type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  additionalImages?: string[];

  @ApiPropertyOptional({ description: 'Custom product attributes/specifications', type: 'object' })
  @IsOptional()
  @IsObject()
  attributes?: Record<string, any>;

  @ApiPropertyOptional({ description: 'Internal notes about the product' })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiProperty({ description: 'Product category ID' })
  @IsUUID(4)
  categoryId: string;
}

export class UpdateProductDto extends PartialType(CreateProductDto) {
  @ApiPropertyOptional({ description: 'Product barcode - unique product identifier', maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  barcode?: string;

  @ApiPropertyOptional({ description: 'Product name', maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @ApiPropertyOptional({ description: 'Product category ID' })
  @IsOptional()
  @IsUUID(4)
  categoryId?: string;
}

export class QueryProductsDto {
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

  @ApiPropertyOptional({ description: 'Search term (product name, barcode, brand)' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;

  @ApiPropertyOptional({ description: 'Filter by category ID' })
  @IsOptional()
  @IsUUID(4)
  categoryId?: string;


  @ApiPropertyOptional({ description: 'Filter by product status', enum: ProductStatus })
  @IsOptional()
  @IsEnum(ProductStatus)
  status?: ProductStatus;

  @ApiPropertyOptional({ description: 'Filter by active status' })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;
  })
  @IsBoolean()
  isActive?: boolean;

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

  @ApiPropertyOptional({ description: 'Sort field', enum: ['name', 'barcode', 'createdAt', 'stockQuantity', 'retailPrice'] })
  @IsOptional()
  @IsString()
  sortBy?: string;

  @ApiPropertyOptional({ description: 'Sort order', enum: ['ASC', 'DESC'] })
  @IsOptional()
  @IsString()
  sortOrder?: 'ASC' | 'DESC';

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

  @ApiProperty({ description: 'Product barcode' })
  barcode: string;

  @ApiProperty({ description: 'Product name' })
  name: string;

  @ApiPropertyOptional({ description: 'Product description' })
  description?: string;

  @ApiProperty({ description: 'Product type', enum: ProductType })
  type: ProductType;

  @ApiProperty({ description: 'Product unit' })
  unit: string;

  @ApiProperty({ description: 'Product status', enum: ProductStatus })
  status: ProductStatus;

  @ApiProperty({ description: 'Active status' })
  isActive: boolean;

  @ApiProperty({ description: 'Base cost price' })
  baseCost: number;

  @ApiProperty({ description: 'Retail selling price' })
  retailPrice: number;

  @ApiProperty({ description: 'Wholesale selling price' })
  wholesalePrice: number;

  @ApiProperty({ description: 'Special selling price' })
  specialPrice: number;

  @ApiProperty({ description: 'Current stock quantity' })
  stockQuantity: number;

  @ApiProperty({ description: 'Reserved stock quantity' })
  reservedQuantity: number;

  @ApiProperty({ description: 'Available stock quantity' })
  availableQuantity: number;

  @ApiProperty({ description: 'Stock status' })
  stockStatus: string;

  @ApiPropertyOptional({ description: 'Product weight' })
  weight?: number;

  @ApiPropertyOptional({ description: 'Product dimensions' })
  dimensions?: ProductDimensionsDto;

  @ApiPropertyOptional({ description: 'Product brand' })
  brand?: string;

  @ApiPropertyOptional({ description: 'Product model' })
  model?: string;

  @ApiPropertyOptional({ description: 'Product image URL' })
  imageUrl?: string;

  @ApiPropertyOptional({ description: 'Additional images' })
  additionalImages?: string[];

  @ApiPropertyOptional({ description: 'Product attributes' })
  attributes?: Record<string, any>;

  @ApiPropertyOptional({ description: 'Internal notes' })
  notes?: string;

  @ApiProperty({ description: 'Category ID' })
  categoryId: string;

  @ApiProperty({ description: 'Category information' })
  category: {
    id: string;
    name: string;
    code?: string;
    fullPath: string;
  };

  @ApiProperty({ description: 'Low stock indicator' })
  isLowStock: boolean;

  @ApiProperty({ description: 'Out of stock indicator' })
  isOutOfStock: boolean;

  @ApiProperty({ description: 'Retail margin percentage' })
  grossMarginRetail: number;

  @ApiProperty({ description: 'Wholesale margin percentage' })
  grossMarginWholesale: number;

  @ApiProperty({ description: 'Special price margin percentage' })
  grossMarginSpecial: number;

  @ApiProperty({ description: 'Creation date' })
  createdAt: Date;

  @ApiProperty({ description: 'Last update date' })
  updatedAt: Date;
}

export class ProductListResponseDto {
  @ApiProperty({ description: 'List of products', type: [ProductResponseDto] })
  data: ProductResponseDto[];

  @ApiProperty({ description: 'Pagination metadata' })
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
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

  @ApiPropertyOptional({ description: 'New retail price' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  retailPrice?: number;

  @ApiPropertyOptional({ description: 'New wholesale price' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  wholesalePrice?: number;

  @ApiPropertyOptional({ description: 'New special price' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  specialPrice?: number;

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