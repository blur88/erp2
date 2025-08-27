import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseGuards,
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
  ApiBearerAuth,
  ApiBody,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { Roles } from '../../../common/decorators/auth.decorator';
import { User } from '../../../common/decorators/user.decorator';
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
@ApiBearerAuth()
@Controller('inventory/categories')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
export class CategoryController {
  constructor(
    private readonly categoryService: CategoryService,
    private readonly pricingService: PricingService,
  ) {}

  @Post()
  @Roles('admin', 'inventory_manager')
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
    @User('id') userId: string,
  ): Promise<CategoryResponseDto> {
    return this.categoryService.create(createCategoryDto, userId);
  }

  @Get()
  @Roles('admin', 'inventory_manager', 'inventory_staff', 'sales_manager', 'sales_staff')
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
  @Roles('admin', 'inventory_manager', 'inventory_staff', 'sales_manager', 'sales_staff')
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
  @Roles('admin', 'inventory_manager', 'inventory_staff', 'sales_manager', 'sales_staff')
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
  @Roles('admin', 'inventory_manager', 'inventory_staff', 'sales_manager', 'sales_staff')
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
  @Roles('admin', 'inventory_manager', 'inventory_staff', 'sales_manager', 'sales_staff')
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
  @Roles('admin', 'inventory_manager', 'inventory_staff', 'sales_manager', 'sales_staff')
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
  @Roles('admin', 'inventory_manager', 'inventory_staff')
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
  @Roles('admin', 'inventory_manager', 'sales_manager')
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
  @Roles('admin', 'inventory_manager')
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
    @User('id') userId: string,
  ): Promise<CategoryResponseDto> {
    return this.categoryService.update(id, updateCategoryDto, userId);
  }

  @Patch(':id/move')
  @Roles('admin', 'inventory_manager')
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
    @User('id') userId: string,
  ): Promise<CategoryResponseDto> {
    return this.categoryService.moveCategory(id, moveCategoryDto, userId);
  }

  @Post('bulk-update')
  @Roles('admin', 'inventory_manager')
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
    @User('id') userId: string,
  ): Promise<{ message: string }> {
    await this.categoryService.bulkUpdate(bulkUpdateDto, userId);
    return { message: `Successfully updated ${bulkUpdateDto.categories.length} categories` };
  }

  @Delete(':id')
  @Roles('admin', 'inventory_manager')
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
    @User('id') userId: string,
  ): Promise<void> {
    await this.categoryService.remove(id, userId);
  }
}