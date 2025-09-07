import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  ParseUUIDPipe,
  HttpStatus,
  HttpCode,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
  ApiBody,
} from '@nestjs/swagger';
import { CategoryService } from '../services/category.service';
import { PricingService } from '../services/pricing.service';
import {
  CreateCategoryDto,
  UpdateCategoryDto,
  QueryCategoriesDto,
  CategoryResponseDto,
  CategoryListResponseDto,
  CategoryTreeResponseDto,
  MoveCategoryDto,
  BulkUpdateCategoriesDto,
  CategoryStatsDto,
  CategoryAncestorsDto,
} from '../dto/category.dto';

@ApiTags('Categories')
@Controller('inventory/categories')
export class CategoryController {
  constructor(
    private readonly categoryService: CategoryService,
    private readonly pricingService: PricingService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create a new category' })
  @ApiResponse({
    status: 201,
    description: 'Category created successfully',
    type: CategoryResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid input data' })
  @ApiResponse({ status: 409, description: 'Category name already exists at this level' })
  @ApiBody({ type: CreateCategoryDto })
  async create(
    @Body() createCategoryDto: CreateCategoryDto,
  ): Promise<CategoryResponseDto> {
    return this.categoryService.create(createCategoryDto);
  }

  @Get()
  @ApiOperation({ summary: 'Get all categories with filtering and pagination' })
  @ApiResponse({
    status: 200,
    description: 'Categories retrieved successfully',
    type: CategoryListResponseDto,
  })
  @ApiQuery({ name: 'page', required: false, description: 'Page number' })
  @ApiQuery({ name: 'limit', required: false, description: 'Items per page' })
  @ApiQuery({ name: 'search', required: false, description: 'Search term' })
  @ApiQuery({ name: 'parentId', required: false, description: 'Filter by parent category' })
  @ApiQuery({ name: 'isActive', required: false, description: 'Filter by active status' })
  @ApiQuery({ name: 'includeTree', required: false, description: 'Include full tree structure' })
  @ApiQuery({ name: 'includeProductCount', required: false, description: 'Include product count' })
  @ApiQuery({ name: 'sortBy', required: false, description: 'Sort field' })
  @ApiQuery({ name: 'sortOrder', required: false, description: 'Sort order' })
  async findAll(@Query() query: QueryCategoriesDto): Promise<CategoryListResponseDto> {
    return this.categoryService.findAll(query);
  }

  @Get('tree')
  @ApiOperation({ summary: 'Get complete category tree structure' })
  @ApiResponse({
    status: 200,
    description: 'Category tree retrieved successfully',
    type: CategoryTreeResponseDto,
  })
  @ApiQuery({ name: 'includeProductCount', required: false, description: 'Include product count for each category' })
  async getTree(
    @Query('includeProductCount') includeProductCount?: boolean,
  ): Promise<CategoryTreeResponseDto> {
    return this.categoryService.getTree(includeProductCount);
  }

  @Get('deleted')
  @ApiOperation({ summary: 'Get all soft-deleted categories' })
  @ApiResponse({
    status: 200,
    description: 'Deleted categories retrieved successfully',
    type: CategoryListResponseDto,
  })
  @ApiQuery({ name: 'page', required: false, description: 'Page number' })
  @ApiQuery({ name: 'limit', required: false, description: 'Items per page' })
  @ApiQuery({ name: 'search', required: false, description: 'Search term' })
  async findDeleted(@Query() query: QueryCategoriesDto): Promise<CategoryListResponseDto> {
    return this.categoryService.findDeleted(query);
  }

  @Get('roots')
  @ApiOperation({ summary: 'Get root level categories only' })
  @ApiResponse({
    status: 200,
    description: 'Root categories retrieved successfully',
    type: CategoryListResponseDto,
  })
  @ApiQuery({ name: 'includeProductCount', required: false, description: 'Include product count' })
  async getRootCategories(
    @Query('includeProductCount') includeProductCount?: boolean,
  ): Promise<CategoryListResponseDto> {
    return this.categoryService.findAll({
      parentId: null,
      includeProductCount,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a category by ID' })
  @ApiResponse({
    status: 200,
    description: 'Category retrieved successfully',
    type: CategoryResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Category not found' })
  @ApiParam({ name: 'id', description: 'Category ID' })
  @ApiQuery({ name: 'includeChildren', required: false, description: 'Include child categories' })
  @ApiQuery({ name: 'includeProductCount', required: false, description: 'Include product count' })
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('includeChildren') includeChildren?: boolean,
    @Query('includeProductCount') includeProductCount?: boolean,
  ): Promise<CategoryResponseDto> {
    return this.categoryService.findOne(id, includeChildren, includeProductCount);
  }

  @Get(':id/ancestors')
  @ApiOperation({ summary: 'Get category ancestors (breadcrumb path)' })
  @ApiResponse({
    status: 200,
    description: 'Category ancestors retrieved successfully',
    type: CategoryAncestorsDto,
  })
  @ApiResponse({ status: 404, description: 'Category not found' })
  @ApiParam({ name: 'id', description: 'Category ID' })
  async getAncestors(@Param('id', ParseUUIDPipe) id: string): Promise<CategoryAncestorsDto> {
    return this.categoryService.getAncestors(id);
  }

  @Get(':id/children')
  @ApiOperation({ summary: 'Get direct child categories' })
  @ApiResponse({
    status: 200,
    description: 'Child categories retrieved successfully',
    type: CategoryListResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Category not found' })
  @ApiParam({ name: 'id', description: 'Category ID' })
  @ApiQuery({ name: 'includeProductCount', required: false, description: 'Include product count' })
  async getChildren(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('includeProductCount') includeProductCount?: boolean,
  ): Promise<CategoryListResponseDto> {
    return this.categoryService.findAll({
      parentId: id,
      includeProductCount,
    });
  }

  @Get(':id/stats')
  @ApiOperation({ summary: 'Get category statistics' })
  @ApiResponse({
    status: 200,
    description: 'Category statistics retrieved successfully',
    type: CategoryStatsDto,
  })
  @ApiResponse({ status: 404, description: 'Category not found' })
  @ApiParam({ name: 'id', description: 'Category ID' })
  async getCategoryStats(@Param('id', ParseUUIDPipe) id: string): Promise<CategoryStatsDto> {
    return this.categoryService.getCategoryStats(id);
  }

  @Get(':id/pricing-recommendations')
  @ApiOperation({ summary: 'Get pricing recommendations for products in category' })
  @ApiResponse({
    status: 200,
    description: 'Pricing recommendations retrieved successfully',
  })
  @ApiParam({ name: 'id', description: 'Category ID' })
  async getPricingRecommendations(@Param('id', ParseUUIDPipe) id: string) {
    return this.pricingService.generateCategoryPricingRecommendations(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a category' })
  @ApiResponse({
    status: 200,
    description: 'Category updated successfully',
    type: CategoryResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid input data' })
  @ApiResponse({ status: 404, description: 'Category not found' })
  @ApiResponse({ status: 409, description: 'Category name conflict' })
  @ApiParam({ name: 'id', description: 'Category ID' })
  @ApiBody({ type: UpdateCategoryDto })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateCategoryDto: UpdateCategoryDto,
  ): Promise<CategoryResponseDto> {
    return this.categoryService.update(id, updateCategoryDto);
  }

  @Patch(':id/move')
  @ApiOperation({ summary: 'Move category to a new parent' })
  @ApiResponse({
    status: 200,
    description: 'Category moved successfully',
    type: CategoryResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid move operation (circular reference)' })
  @ApiResponse({ status: 404, description: 'Category or new parent not found' })
  @ApiParam({ name: 'id', description: 'Category ID' })
  @ApiBody({ type: MoveCategoryDto })
  async moveCategory(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() moveCategoryDto: MoveCategoryDto,
  ): Promise<CategoryResponseDto> {
    return this.categoryService.moveCategory(id, moveCategoryDto);
  }

  @Post('bulk-update')
  @ApiOperation({ summary: 'Bulk update categories' })
  @ApiResponse({
    status: 200,
    description: 'Categories updated successfully',
  })
  @ApiResponse({ status: 400, description: 'Invalid update data' })
  @ApiResponse({ status: 404, description: 'One or more categories not found' })
  @ApiBody({ type: BulkUpdateCategoriesDto })
  @HttpCode(HttpStatus.OK)
  async bulkUpdate(
    @Body() bulkUpdateDto: BulkUpdateCategoriesDto,
  ): Promise<{ message: string }> {
    await this.categoryService.bulkUpdate(bulkUpdateDto);
    return { message: `Successfully updated ${bulkUpdateDto.categories.length} categories` };
  }

  @Post('bulk-restore')
  @ApiOperation({ summary: 'Bulk restore soft-deleted categories' })
  @ApiResponse({
    status: 200,
    description: 'Categories restored successfully',
  })
  @ApiResponse({ status: 400, description: 'Invalid category IDs or categories are not deleted' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        categoryIds: {
          type: 'array',
          items: { type: 'string', format: 'uuid' },
          description: 'Array of category IDs to restore'
        }
      },
      required: ['categoryIds']
    }
  })
  @HttpCode(HttpStatus.OK)
  async bulkRestore(
    @Body() body: { categoryIds: string[] },
  ): Promise<{ message: string; restoredCount: number; failedIds: string[] }> {
    const result = await this.categoryService.bulkRestore(body.categoryIds);
    return {
      message: `Successfully restored ${result.restoredCount} of ${body.categoryIds.length} categories`,
      restoredCount: result.restoredCount,
      failedIds: result.failedIds,
    };
  }

  @Post(':id/restore')
  @ApiOperation({ summary: 'Restore a soft-deleted category' })
  @ApiResponse({
    status: 200,
    description: 'Category restored successfully',
    type: CategoryResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Category not found' })
  @ApiResponse({ status: 400, description: 'Category is not deleted' })
  @ApiParam({ name: 'id', description: 'Category ID' })
  async restore(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<CategoryResponseDto> {
    return this.categoryService.restore(id);
  }

  @Post('bulk-permanent-delete')
  @ApiOperation({ summary: 'Bulk permanently delete categories from database' })
  @ApiResponse({
    status: 200,
    description: 'Categories permanently deleted successfully',
  })
  @ApiResponse({ status: 400, description: 'Invalid category IDs or categories have active references' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        categoryIds: {
          type: 'array',
          items: { type: 'string', format: 'uuid' },
          description: 'Array of category IDs to permanently delete'
        }
      },
      required: ['categoryIds']
    }
  })
  @HttpCode(HttpStatus.OK)
  async bulkPermanentDelete(
    @Body() body: { categoryIds: string[] },
  ): Promise<{ message: string; deletedCount: number; failedIds: string[] }> {
    const result = await this.categoryService.bulkPermanentDelete(body.categoryIds);
    return {
      message: `Successfully permanently deleted ${result.deletedCount} of ${body.categoryIds.length} categories`,
      deletedCount: result.deletedCount,
      failedIds: result.failedIds,
    };
  }

  @Delete(':id/permanent')
  @ApiOperation({ summary: 'Permanently delete a category from database' })
  @ApiResponse({
    status: 204,
    description: 'Category permanently deleted successfully',
  })
  @ApiResponse({ status: 404, description: 'Category not found' })
  @ApiResponse({ 
    status: 400, 
    description: 'Category must be soft-deleted first or has active references' 
  })
  @ApiParam({ name: 'id', description: 'Category ID' })
  @HttpCode(HttpStatus.NO_CONTENT)
  async permanentDelete(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.categoryService.permanentDelete(id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a category' })
  @ApiResponse({
    status: 204,
    description: 'Category deleted successfully',
  })
  @ApiResponse({ status: 404, description: 'Category not found' })
  @ApiResponse({ 
    status: 400, 
    description: 'Cannot delete category with subcategories or products' 
  })
  @ApiParam({ name: 'id', description: 'Category ID' })
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.categoryService.remove(id);
  }
}