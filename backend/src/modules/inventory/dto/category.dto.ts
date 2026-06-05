import {
  IsString,
  IsOptional,
  IsUUID,
  IsArray,
  IsBoolean,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { BaseQueryDto } from '../../../common/dto/base-query.dto';

export class CreateCategoryDto {
  @ApiProperty({ description: 'Category name', maxLength: 100 })
  @IsString()
  @MaxLength(100)
  name: string;

  @ApiPropertyOptional({ description: 'Parent category ID (for nested categories)' })
  @IsOptional()
  @IsUUID(4)
  parentId?: string;
}

export class UpdateCategoryDto extends PartialType(CreateCategoryDto) {
  @ApiPropertyOptional({ description: 'Category name', maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;
}

export class QueryCategoriesDto extends BaseQueryDto {
  @ApiPropertyOptional({ description: 'Filter by parent category ID (null for root categories)' })
  @IsOptional()
  @IsUUID(4)
  parentId?: string;

  @ApiPropertyOptional({ description: 'Include full tree structure (nested children)', default: false })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;
  })
  @IsBoolean()
  includeTree?: boolean;

  @ApiPropertyOptional({ description: 'Include product count for each category', default: false })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;
  })
  @IsBoolean()
  includeProductCount?: boolean;
}

export class CategoryResponseDto {
  @ApiProperty({ description: 'Category ID' })
  id: string;

  @ApiProperty({ description: 'Category name' })
  name: string;

  @ApiPropertyOptional({ description: 'Materialized path' })
  path?: string;

  @ApiProperty({ description: 'Tree level depth' })
  level: number;

  @ApiPropertyOptional({ description: 'Parent category ID' })
  parentId?: string;

  @ApiProperty({ description: 'Full category path' })
  fullPath: string;

  @ApiProperty({ description: 'Is root category' })
  isRoot: boolean;

  @ApiProperty({ description: 'Has child categories' })
  hasChildren: boolean;

  @ApiPropertyOptional({ description: 'Child categories (when includeTree is true)', type: [CategoryResponseDto] })
  children?: CategoryResponseDto[];

  @ApiPropertyOptional({ description: 'Parent category (when requested)' })
  parent?: Partial<CategoryResponseDto>;

  @ApiPropertyOptional({ description: 'Number of products in this category' })
  productCount?: number;

  @ApiProperty({ description: 'Creation date' })
  createdAt: Date;

  @ApiProperty({ description: 'Last update date' })
  updatedAt: Date;
}

export class CategoryListResponseDto {
  @ApiProperty({ description: 'List of categories', type: [CategoryResponseDto] })
  data: CategoryResponseDto[];

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

export class CategoryTreeResponseDto {
  @ApiProperty({ description: 'Tree structure of categories', type: [CategoryResponseDto] })
  data: CategoryResponseDto[];

  @ApiProperty({ description: 'Tree metadata' })
  meta: {
    totalCategories: number;
    maxDepth: number;
    rootCategories: number;
  };
}

export class MoveCategoryDto {
  @ApiProperty({ description: 'New parent category ID (null to move to root level)' })
  @IsOptional()
  @IsUUID(4)
  newParentId?: string;
}

export class BulkUpdateCategoriesDto {
  @ApiProperty({ description: 'List of category updates', type: 'array' })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CategoryBulkUpdateDto)
  categories: CategoryBulkUpdateDto[];
}

export class CategoryBulkUpdateDto {
  @ApiProperty({ description: 'Category ID' })
  @IsUUID(4)
  id: string;

  @ApiPropertyOptional({ description: 'New category name' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional({ description: 'New parent ID' })
  @IsOptional()
  @IsUUID(4)
  parentId?: string;
}

export class CategoryStatsDto {
  @ApiProperty({ description: 'Category ID' })
  id: string;

  @ApiProperty({ description: 'Category name' })
  name: string;

  @ApiProperty({ description: 'Full category path' })
  fullPath: string;

  @ApiProperty({ description: 'Total products in category (direct)' })
  directProductCount: number;

  @ApiProperty({ description: 'Total products including subcategories' })
  totalProductCount: number;

  @ApiProperty({ description: 'Number of subcategories (direct children)' })
  subcategoryCount: number;

  @ApiProperty({ description: 'Total subcategories including nested' })
  totalSubcategoryCount: number;

  @ApiProperty({ description: 'Total stock value in category' })
  totalStockValue: number;

  @ApiProperty({ description: 'Active products count' })
  activeProductCount: number;

  @ApiProperty({ description: 'Inactive products count' })
  inactiveProductCount: number;

  @ApiProperty({ description: 'Low stock products count' })
  lowStockProductCount: number;

  @ApiProperty({ description: 'Out of stock products count' })
  outOfStockProductCount: number;

  @ApiProperty({ description: 'Average product price (retail)' })
  averageRetailPrice: number;

  @ApiProperty({ description: 'Highest priced product in category' })
  highestPrice: number;

  @ApiProperty({ description: 'Lowest priced product in category' })
  lowestPrice: number;

  @ApiProperty({ description: 'Category creation date' })
  createdAt: Date;

  @ApiProperty({ description: 'Last update date' })
  updatedAt: Date;
}

export class CategoryAncestorsDto {
  @ApiProperty({ description: 'Category ID' })
  id: string;

  @ApiProperty({ description: 'List of ancestor categories from root to parent', type: [CategoryResponseDto] })
  ancestors: CategoryResponseDto[];

  @ApiProperty({ description: 'Current category details' })
  category: CategoryResponseDto;

  @ApiProperty({ description: 'Breadcrumb path as string array' })
  breadcrumbs: string[];
}

class CategoryPathUpdateDto {
  @ApiProperty({ description: 'Category ID' })
  @IsUUID(4)
  categoryId: string;

  @ApiProperty({ description: 'Force path recalculation for this category and all its descendants', default: false })
  @IsOptional()
  @IsBoolean()
  forceRecalculate?: boolean;
}

export class CategoryProductDto {
  @ApiProperty({ description: 'Product ID' })
  id: string;

  @ApiProperty({ description: 'Product name' })
  name: string;

  @ApiProperty({ description: 'Current stock quantity' })
  stockQuantity: number;
}
