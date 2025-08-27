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
import { ProductService } from '../services/product.service';
import { PricingService } from '../services/pricing.service';
import {
  CreateProductDto,
  UpdateProductDto,
  QueryProductsDto,
  ProductResponseDto,
  ProductListResponseDto,
  BulkUpdatePricesDto,
  ProductStockSummaryDto,
} from '../dto/product.dto';

@ApiTags('Products')
@ApiBearerAuth()
@Controller('inventory/products')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
export class ProductController {
  constructor(
    private readonly productService: ProductService,
    private readonly pricingService: PricingService,
  ) {}

  @Post()
  @Roles('admin', 'inventory_manager', 'inventory_staff')
  @ApiOperation({ summary: 'Create a new product' })
  @ApiResponse({
    status: 201,
    description: 'Product created successfully',
    type: ProductResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid input data' })
  @ApiResponse({ status: 409, description: 'Product SKU already exists' })
  @ApiBody({ type: CreateProductDto })
  async create(
    @Body() createProductDto: CreateProductDto,
    @User('id') userId: string,
  ): Promise<ProductResponseDto> {
    return this.productService.create(createProductDto, userId);
  }

  @Get()
  @Roles('admin', 'inventory_manager', 'inventory_staff', 'sales_manager', 'sales_staff')
  @ApiOperation({ summary: 'Get all products with filtering and pagination' })
  @ApiResponse({
    status: 200,
    description: 'Products retrieved successfully',
    type: ProductListResponseDto,
  })
  @ApiQuery({ name: 'page', required: false, description: 'Page number' })
  @ApiQuery({ name: 'limit', required: false, description: 'Items per page' })
  @ApiQuery({ name: 'search', required: false, description: 'Search term' })
  @ApiQuery({ name: 'categoryId', required: false, description: 'Filter by category' })
  @ApiQuery({ name: 'type', required: false, description: 'Filter by product type' })
  @ApiQuery({ name: 'status', required: false, description: 'Filter by status' })
  @ApiQuery({ name: 'isActive', required: false, description: 'Filter by active status' })
  @ApiQuery({ name: 'lowStock', required: false, description: 'Filter low stock items' })
  @ApiQuery({ name: 'outOfStock', required: false, description: 'Filter out of stock items' })
  @ApiQuery({ name: 'sortBy', required: false, description: 'Sort field' })
  @ApiQuery({ name: 'sortOrder', required: false, description: 'Sort order' })
  async findAll(@Query() query: QueryProductsDto): Promise<ProductListResponseDto> {
    return this.productService.findAll(query);
  }

  @Get('stock-summary')
  @Roles('admin', 'inventory_manager', 'inventory_staff')
  @ApiOperation({ summary: 'Get stock summary for all products' })
  @ApiResponse({
    status: 200,
    description: 'Stock summary retrieved successfully',
    type: [ProductStockSummaryDto],
  })
  @ApiQuery({ name: 'categoryId', required: false, description: 'Filter by category' })
  @ApiQuery({ name: 'lowStock', required: false, description: 'Filter low stock items only' })
  @ApiQuery({ name: 'outOfStock', required: false, description: 'Filter out of stock items only' })
  async getStockSummary(
    @Query() filters: Partial<QueryProductsDto>,
  ): Promise<ProductStockSummaryDto[]> {
    return this.productService.getStockSummary(filters);
  }

  @Get('low-stock')
  @Roles('admin', 'inventory_manager', 'inventory_staff')
  @ApiOperation({ summary: 'Get products with low stock levels' })
  @ApiResponse({
    status: 200,
    description: 'Low stock products retrieved successfully',
    type: [ProductStockSummaryDto],
  })
  async getLowStockProducts(): Promise<ProductStockSummaryDto[]> {
    return this.productService.getLowStockProducts();
  }

  @Get('out-of-stock')
  @Roles('admin', 'inventory_manager', 'inventory_staff')
  @ApiOperation({ summary: 'Get products that are out of stock' })
  @ApiResponse({
    status: 200,
    description: 'Out of stock products retrieved successfully',
    type: [ProductStockSummaryDto],
  })
  async getOutOfStockProducts(): Promise<ProductStockSummaryDto[]> {
    return this.productService.getOutOfStockProducts();
  }

  @Get('sku/:sku')
  @Roles('admin', 'inventory_manager', 'inventory_staff', 'sales_manager', 'sales_staff')
  @ApiOperation({ summary: 'Get a product by SKU' })
  @ApiResponse({
    status: 200,
    description: 'Product retrieved successfully',
    type: ProductResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Product not found' })
  @ApiParam({ name: 'sku', description: 'Product SKU' })
  async findBySku(@Param('sku') sku: string): Promise<ProductResponseDto> {
    return this.productService.findBySku(sku);
  }

  @Get(':id')
  @Roles('admin', 'inventory_manager', 'inventory_staff', 'sales_manager', 'sales_staff')
  @ApiOperation({ summary: 'Get a product by ID' })
  @ApiResponse({
    status: 200,
    description: 'Product retrieved successfully',
    type: ProductResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Product not found' })
  @ApiParam({ name: 'id', description: 'Product ID' })
  async findOne(@Param('id', ParseUUIDPipe) id: string): Promise<ProductResponseDto> {
    return this.productService.findOne(id);
  }

  @Get(':id/pricing-analysis')
  @Roles('admin', 'inventory_manager', 'sales_manager')
  @ApiOperation({ summary: 'Get pricing analysis for a product' })
  @ApiResponse({
    status: 200,
    description: 'Pricing analysis retrieved successfully',
  })
  @ApiParam({ name: 'id', description: 'Product ID' })
  async getPricingAnalysis(@Param('id', ParseUUIDPipe) id: string) {
    return this.pricingService.analyzeMargins(id);
  }

  @Get(':id/dynamic-pricing')
  @Roles('admin', 'inventory_manager', 'sales_manager')
  @ApiOperation({ summary: 'Get dynamic pricing recommendations for a product' })
  @ApiResponse({
    status: 200,
    description: 'Dynamic pricing recommendations retrieved successfully',
  })
  @ApiParam({ name: 'id', description: 'Product ID' })
  async getDynamicPricing(@Param('id', ParseUUIDPipe) id: string) {
    return this.pricingService.applyDynamicPricing(id);
  }

  @Patch(':id')
  @Roles('admin', 'inventory_manager', 'inventory_staff')
  @ApiOperation({ summary: 'Update a product' })
  @ApiResponse({
    status: 200,
    description: 'Product updated successfully',
    type: ProductResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid input data' })
  @ApiResponse({ status: 404, description: 'Product not found' })
  @ApiResponse({ status: 409, description: 'SKU conflict' })
  @ApiParam({ name: 'id', description: 'Product ID' })
  @ApiBody({ type: UpdateProductDto })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateProductDto: UpdateProductDto,
    @User('id') userId: string,
  ): Promise<ProductResponseDto> {
    return this.productService.update(id, updateProductDto, userId);
  }

  @Post('bulk-update-prices')
  @Roles('admin', 'inventory_manager')
  @ApiOperation({ summary: 'Bulk update product prices' })
  @ApiResponse({
    status: 200,
    description: 'Prices updated successfully',
  })
  @ApiResponse({ status: 400, description: 'Invalid price data' })
  @ApiResponse({ status: 404, description: 'One or more products not found' })
  @ApiBody({ type: BulkUpdatePricesDto })
  @HttpCode(HttpStatus.OK)
  async bulkUpdatePrices(
    @Body() bulkUpdateDto: BulkUpdatePricesDto,
    @User('id') userId: string,
  ): Promise<{ message: string }> {
    await this.productService.bulkUpdatePrices(bulkUpdateDto, userId);
    return { message: `Successfully updated prices for ${bulkUpdateDto.products.length} products` };
  }

  @Post(':id/reserve-stock')
  @Roles('admin', 'inventory_manager', 'inventory_staff', 'sales_staff')
  @ApiOperation({ summary: 'Reserve stock for a product' })
  @ApiResponse({
    status: 200,
    description: 'Stock reserved successfully',
  })
  @ApiResponse({ status: 400, description: 'Insufficient stock available' })
  @ApiResponse({ status: 404, description: 'Product not found' })
  @ApiParam({ name: 'id', description: 'Product ID' })
  @HttpCode(HttpStatus.OK)
  async reserveStock(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { quantity: number; reason: string },
    @User('id') userId: string,
  ): Promise<{ success: boolean; message: string }> {
    const success = await this.productService.reserveStock(
      id,
      body.quantity,
      body.reason,
      userId,
    );
    
    return {
      success,
      message: success 
        ? `Successfully reserved ${body.quantity} units` 
        : 'Insufficient stock available for reservation',
    };
  }

  @Post(':id/release-reserved-stock')
  @Roles('admin', 'inventory_manager', 'inventory_staff', 'sales_staff')
  @ApiOperation({ summary: 'Release reserved stock for a product' })
  @ApiResponse({
    status: 200,
    description: 'Reserved stock released successfully',
  })
  @ApiResponse({ status: 404, description: 'Product not found' })
  @ApiParam({ name: 'id', description: 'Product ID' })
  @HttpCode(HttpStatus.OK)
  async releaseReservedStock(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { quantity: number; reason: string },
    @User('id') userId: string,
  ): Promise<{ message: string }> {
    await this.productService.releaseReservedStock(
      id,
      body.quantity,
      body.reason,
      userId,
    );
    
    return { message: `Successfully released ${body.quantity} reserved units` };
  }

  @Post('calculate-price')
  @Roles('admin', 'inventory_manager', 'sales_manager', 'sales_staff')
  @ApiOperation({ summary: 'Calculate price for a product with discounts' })
  @ApiResponse({
    status: 200,
    description: 'Price calculated successfully',
  })
  @ApiResponse({ status: 404, description: 'Product not found' })
  @HttpCode(HttpStatus.OK)
  async calculatePrice(
    @Body() body: {
      productId: string;
      customerId?: string;
      quantity?: number;
      customerType?: 'retail' | 'wholesale' | 'special';
      promotionCode?: string;
    },
  ) {
    return this.pricingService.calculatePrice(body.productId, {
      customerId: body.customerId,
      customerType: body.customerType,
      quantity: body.quantity,
      promotionCode: body.promotionCode,
      includeDiscounts: true,
    });
  }

  @Delete(':id')
  @Roles('admin', 'inventory_manager')
  @ApiOperation({ summary: 'Delete a product (soft delete - sets status to DISCONTINUED)' })
  @ApiResponse({
    status: 204,
    description: 'Product deleted successfully',
  })
  @ApiResponse({ status: 404, description: 'Product not found' })
  @ApiResponse({ 
    status: 400, 
    description: 'Cannot delete product with active orders' 
  })
  @ApiParam({ name: 'id', description: 'Product ID' })
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @User('id') userId: string,
  ): Promise<void> {
    await this.productService.remove(id, userId);
  }
}