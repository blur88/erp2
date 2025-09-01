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
@Controller('inventory/products')
export class ProductController {
  constructor(
    private readonly productService: ProductService,
    private readonly pricingService: PricingService,
  ) {}

  @Post()
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
  ): Promise<ProductResponseDto> {
    return this.productService.create(createProductDto, null);
  }

  @Get()
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

  @Get('deleted')
  @ApiOperation({ summary: 'Get all soft-deleted products' })
  @ApiResponse({
    status: 200,
    description: 'Deleted products retrieved successfully',
    type: ProductListResponseDto,
  })
  @ApiQuery({ name: 'page', required: false, description: 'Page number' })
  @ApiQuery({ name: 'limit', required: false, description: 'Items per page' })
  @ApiQuery({ name: 'search', required: false, description: 'Search term' })
  async findDeleted(@Query() query: QueryProductsDto): Promise<ProductListResponseDto> {
    return this.productService.findDeleted(query);
  }

  @Get(':id')
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
  ): Promise<ProductResponseDto> {
    return this.productService.update(id, updateProductDto, null);
  }

  @Post('bulk-update-prices')
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
  ): Promise<{ message: string }> {
    await this.productService.bulkUpdatePrices(bulkUpdateDto, null);
    return { message: `Successfully updated prices for ${bulkUpdateDto.products.length} products` };
  }

  @Post(':id/reserve-stock')
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
  ): Promise<{ success: boolean; message: string }> {
    const success = await this.productService.reserveStock(
      id,
      body.quantity,
      body.reason,
      null,
    );
    
    return {
      success,
      message: success 
        ? `Successfully reserved ${body.quantity} units` 
        : 'Insufficient stock available for reservation',
    };
  }

  @Post(':id/release-reserved-stock')
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
  ): Promise<{ message: string }> {
    await this.productService.releaseReservedStock(
      id,
      body.quantity,
      body.reason,
      null,
    );
    
    return { message: `Successfully released ${body.quantity} reserved units` };
  }

  @Post('calculate-price')
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

  @Post(':id/restore')
  @ApiOperation({ summary: 'Restore a soft-deleted product' })
  @ApiResponse({
    status: 200,
    description: 'Product restored successfully',
    type: ProductResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Product not found' })
  @ApiResponse({ status: 400, description: 'Product is not deleted' })
  @ApiParam({ name: 'id', description: 'Product ID' })
  @HttpCode(HttpStatus.OK)
  async restore(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ProductResponseDto> {
    return this.productService.restore(id, null);
  }

  @Delete(':id/permanent')
  @ApiOperation({ summary: 'Permanently delete a product from database' })
  @ApiResponse({
    status: 204,
    description: 'Product permanently deleted successfully',
  })
  @ApiResponse({ status: 404, description: 'Product not found' })
  @ApiResponse({ 
    status: 400, 
    description: 'Product must be soft-deleted first or has active references' 
  })
  @ApiParam({ name: 'id', description: 'Product ID' })
  @HttpCode(HttpStatus.NO_CONTENT)
  async permanentDelete(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.productService.permanentDelete(id, null);
  }

  @Delete(':id')
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
  ): Promise<void> {
    await this.productService.remove(id, null);
  }
}