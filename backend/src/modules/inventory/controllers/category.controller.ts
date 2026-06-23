import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
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
  CategoryProductDto,
  SetCategoryEnabledDto,
} from '../dto/category.dto';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';

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
    @CurrentUser('userId') currentUserId: string,
    @CurrentUser('username') currentUsername: string,
  ): Promise<CategoryResponseDto> {
    return this.categoryService.create(createCategoryDto, currentUserId, currentUsername);
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
  @ApiQuery({ name: 'sortOrder', required: false, description: 'Sort direction (ASC/DESC)' })
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

  @Get('check-duplicate')
  @ApiOperation({ summary: 'Check if category name already exists (including soft-deleted)' })
  @ApiResponse({
    status: 200,
    description: 'Duplicate check completed',
  })
  @ApiQuery({ name: 'name', required: false, description: 'Category name to check' })
  @ApiQuery({ name: 'parentId', required: false, description: 'Parent category ID' })
  @ApiQuery({ name: 'excludeId', required: false, description: 'Category ID to exclude from check (for updates)' })
  async checkDuplicate(
    @Query('name') name?: string,
    @Query('parentId') parentId?: string,
    @Query('excludeId') excludeId?: string,
  ) {
    return this.categoryService.checkDuplicate({ name, parentId, excludeId });
  }

  @Get(':id/products')
  @ApiOperation({ summary: 'Get products in a category' })
  @ApiResponse({
    status: 200,
    description: 'Category products retrieved successfully',
  })
  @ApiResponse({ status: 404, description: 'Category not found' })
  @ApiParam({ name: 'id', description: 'Category ID' })
  async getCategoryProducts(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<{ data: CategoryProductDto[] }> {
    return this.categoryService.getCategoryProducts(id);
  }

  @Get('slug/:slug')
  @ApiOperation({ summary: 'Get a category by slug' })
  @ApiResponse({ status: 200, type: CategoryResponseDto })
  @ApiResponse({ status: 404, description: 'Category not found' })
  @ApiParam({ name: 'slug', description: 'Category slug' })
  async findBySlug(@Param('slug') slug: string): Promise<CategoryResponseDto> {
    return this.categoryService.findBySlug(slug);
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
    @CurrentUser('userId') currentUserId: string,
    @CurrentUser('username') currentUsername: string,
  ): Promise<CategoryResponseDto> {
    return this.categoryService.update(id, updateCategoryDto, currentUserId, currentUsername);
  }

  @Patch(':id/enabled')
  @ApiOperation({ summary: 'Set category active/inactive status' })
  @ApiResponse({ status: 200, type: CategoryResponseDto })
  @ApiResponse({ status: 400, description: 'Has active subcategories' })
  @ApiResponse({ status: 404, description: 'Category not found' })
  @ApiParam({ name: 'id', description: 'Category ID' })
  @ApiBody({ type: SetCategoryEnabledDto })
  async setEnabled(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetCategoryEnabledDto,
  ): Promise<CategoryResponseDto> {
    return this.categoryService.setEnabled(id, dto.enabled);
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

}
