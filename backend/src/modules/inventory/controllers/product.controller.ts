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
  UseInterceptors,
  UploadedFile,
  Header,
  StreamableFile,
  Res,
} from '@nestjs/common';
import { Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
  ApiBody,
  ApiConsumes,
} from '@nestjs/swagger';
import { ProductService } from '../services/product.service';
import { PricingService } from '../services/pricing.service';
import { ExportService } from '../../../common/services/export.service';
import {
  CreateProductDto,
  UpdateProductDto,
  QueryProductsDto,
  ProductResponseDto,
  ProductListResponseDto,
  BulkUpdatePricesDto,
  ProductStockSummaryDto,
  ProductImportDto,
  ProductImportResultDto,
} from '../dto/product.dto';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';

@ApiTags('Products')
@Controller('inventory/products')
export class ProductController {
  constructor(
    private readonly productService: ProductService,
    private readonly pricingService: PricingService,
    private readonly exportService: ExportService,
  ) {}

  @Get('dashboard-stats')
  @ApiOperation({ summary: 'Get inventory dashboard statistics' })
  @ApiResponse({
    status: 200,
    description: 'Dashboard statistics retrieved successfully',
  })
  async getDashboardStats() {
    return this.productService.getDashboardStats();
  }

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
    @CurrentUser('userId') currentUserId: string,
    @CurrentUser('username') currentUsername: string,
  ): Promise<ProductResponseDto> {
    return this.productService.create(createProductDto, currentUserId, currentUsername);
  }

  @Get()
  @ApiOperation({ summary: 'Get all products with filtering' })
  @ApiResponse({
    status: 200,
    description: 'Products retrieved successfully',
    type: ProductListResponseDto,
  })
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

  @Get('check-duplicate')
  @ApiOperation({ summary: 'Check if product name or barcode already exists (including soft-deleted)' })
  @ApiResponse({
    status: 200,
    description: 'Duplicate check completed',
  })
  @ApiQuery({ name: 'name', required: false, description: 'Product name to check' })
  @ApiQuery({ name: 'barcode', required: false, description: 'Product barcode to check' })
  @ApiQuery({ name: 'excludeId', required: false, description: 'Product ID to exclude from check (for updates)' })
  async checkDuplicate(
    @Query('name') name?: string,
    @Query('barcode') barcode?: string,
    @Query('excludeId') excludeId?: string,
  ) {
    return this.productService.checkDuplicate({ name, barcode, excludeId });
  }

  @Get('deleted')
  @ApiOperation({ summary: 'Get all soft-deleted products' })
  @ApiResponse({
    status: 200,
    description: 'Deleted products retrieved successfully',
    type: ProductListResponseDto,
  })
  @ApiQuery({ name: 'search', required: false, description: 'Search term' })
  async findDeleted(@Query() query: QueryProductsDto): Promise<ProductListResponseDto> {
    return this.productService.findDeleted(query);
  }

  @Get('slug/:slug')
  @ApiOperation({ summary: 'Get product by slug' })
  @ApiParam({ name: 'slug', description: 'Product slug', type: 'string' })
  @ApiResponse({ status: 200, description: 'Product retrieved successfully', type: ProductResponseDto })
  @ApiResponse({ status: 404, description: 'Product not found' })
  async getProductBySlug(@Param('slug') slug: string): Promise<ProductResponseDto> {
    return this.productService.findBySlug(slug);
  }

  @Get('import-template')
  @ApiOperation({ summary: 'Download CSV template for product import' })
  @ApiResponse({
    status: 200,
    description: 'CSV template downloaded successfully',
  })
  @Header('Content-Type', 'text/csv')
  @Header('Content-Disposition', 'attachment; filename="product-import-template.csv"')
  async downloadImportTemplate(): Promise<StreamableFile> {
    return this.productService.generateImportTemplate();
  }

  @Get('export')
  @ApiOperation({ summary: 'Export products list to Excel' })
  async exportProducts(
    @Query() query: QueryProductsDto,
    @Res() res: Response,
  ): Promise<void> {
    const { data: products } = await this.productService.findAll(query);

    // Collect all price lists seen across products, sorted by name
    const priceListMap = new Map<string, string>(); // id -> name
    (products as any[]).forEach(p => {
      (p.priceListItems || []).forEach((item: any) => {
        if (item.priceList?.id && item.priceList?.name) {
          priceListMap.set(item.priceList.id, item.priceList.name);
        }
      });
    });
    const sortedPriceLists = [...priceListMap.entries()].sort((a, b) =>
      a[1].localeCompare(b[1]),
    );

    const columns = [
      { key: 'name', header: 'Product Name', type: 'string' as const, width: 30 },
      { key: 'barcode', header: 'Barcode', type: 'string' as const, width: 18 },
      { key: 'type', header: 'Type', type: 'string' as const, width: 15 },
      { key: 'categoryName', header: 'Category', type: 'string' as const, width: 20 },
      { key: 'description', header: 'Description', type: 'string' as const, width: 30 },
      { key: 'baseCost', header: 'Base Cost', type: 'currency' as const, width: 15 },
      ...sortedPriceLists.map(([id, name]) => ({
        key: `pl_${id}`,
        header: `${name} Price`,
        type: 'currency' as const,
        width: 15,
      })),
      { key: 'stockQuantity', header: 'Current Stock', type: 'number' as const, width: 14 },
      { key: 'stockStatus', header: 'Stock Status', type: 'string' as const, width: 14 },
      { key: 'isActive', header: 'Status', type: 'string' as const, width: 10 },
      { key: 'notes', header: 'Notes', type: 'string' as const, width: 25 },
      { key: 'createdAt', header: 'Created Date', type: 'string' as const, width: 14 },
      { key: 'updatedAt', header: 'Updated Date', type: 'string' as const, width: 14 },
    ];

    const LOW_STOCK_THRESHOLD = 10;
    const mappedProducts = (products as any[]).map(p => {
      const pricesByListId: Record<string, number> = {};
      (p.priceListItems || []).forEach((item: any) => {
        if (item.priceList?.id) {
          pricesByListId[`pl_${item.priceList.id}`] = Number(item.price);
        }
      });
      const stock = Number(p.stockQuantity || 0);
      const stockStatus = stock <= 0 ? 'Out of Stock' : stock <= LOW_STOCK_THRESHOLD ? 'Low Stock' : 'In Stock';
      return {
        ...p,
        categoryName: p.category?.name ?? '',
        isActive: p.isActive ? 'Active' : 'Inactive',
        stockStatus,
        createdAt: p.createdAt ? new Date(p.createdAt).toISOString().split('T')[0] : '',
        updatedAt: p.updatedAt ? new Date(p.updatedAt).toISOString().split('T')[0] : '',
        ...pricesByListId,
      };
    });
    const buffer = await this.exportService.exportFlat(
      'Products',
      columns,
      mappedProducts,
    );
    const date = new Date().toISOString().split('T')[0];
    res.set({
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="products-${date}.xlsx"`,
    });
    res.send(buffer);
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

  @Get(':id/order-history')
  @ApiOperation({ summary: 'Get order history for a product (sales and purchase orders)' })
  @ApiResponse({
    status: 200,
    description: 'Order history retrieved successfully',
  })
  @ApiResponse({ status: 404, description: 'Product not found' })
  @ApiParam({ name: 'id', description: 'Product ID' })
  @ApiQuery({ name: 'page', required: false, description: 'Page number', type: Number })
  @ApiQuery({ name: 'limit', required: false, description: 'Items per page', type: Number })
  async getOrderHistory(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.productService.getOrderHistory(
      id,
      page ? parseInt(String(page), 10) : 1,
      limit ? parseInt(String(limit), 10) : 20,
    );
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
    @CurrentUser('userId') currentUserId: string,
    @CurrentUser('username') currentUsername: string,
  ): Promise<ProductResponseDto> {
    return this.productService.update(id, updateProductDto, currentUserId, currentUsername);
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
    await this.productService.bulkUpdatePrices(bulkUpdateDto);
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
    @Body() body: { quantity: number },
  ): Promise<{ success: boolean; message: string }> {
    const success = await this.productService.reserveStock(
      id,
      body.quantity,
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
    @Body() body: { quantity: number },
  ): Promise<{ message: string }> {
    await this.productService.releaseReservedStock(
      id,
      body.quantity,
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

  @Post('bulk-restore')
  @ApiOperation({ summary: 'Bulk restore soft-deleted products' })
  @ApiResponse({
    status: 200,
    description: 'Products restored successfully',
  })
  @ApiResponse({ status: 400, description: 'Invalid product IDs or products are not deleted' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        productIds: {
          type: 'array',
          items: { type: 'string', format: 'uuid' },
          description: 'Array of product IDs to restore'
        }
      },
      required: ['productIds']
    }
  })
  @HttpCode(HttpStatus.OK)
  async bulkRestore(
    @Body() body: { productIds: string[] },
    @CurrentUser('userId') currentUserId: string,
    @CurrentUser('username') currentUsername: string,
  ): Promise<{ message: string; restoredCount: number; failedIds: string[] }> {
    const result = await this.productService.bulkRestore(
      body.productIds,
      currentUserId,
      currentUsername,
    );
    return {
      message: `Successfully restored ${result.successCount} of ${body.productIds.length} products`,
      restoredCount: result.successCount,
      failedIds: result.failedItems.map(item => item.id),
    };
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
    @CurrentUser('userId') currentUserId: string,
    @CurrentUser('username') currentUsername: string,
  ): Promise<ProductResponseDto> {
    return this.productService.restore(id, currentUserId, currentUsername);
  }

  @Post('import')
  @ApiOperation({ summary: 'Import products from CSV/Excel file' })
  @ApiResponse({
    status: 200,
    description: 'Products imported successfully',
    type: ProductImportResultDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid file format or validation errors' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'CSV or Excel file containing products'
        },
        format: {
          type: 'string',
          enum: ['csv', 'excel'],
          description: 'File format'
        },
        skipDuplicates: {
          type: 'boolean',
          default: false,
          description: 'Skip products with duplicate names/barcodes'
        },
        updateExisting: {
          type: 'boolean', 
          default: false,
          description: 'Update existing products if duplicates found'
        }
      },
      required: ['file', 'format']
    }
  })
  @UseInterceptors(FileInterceptor('file'))
  @HttpCode(HttpStatus.OK)
  async importProducts(
    @UploadedFile() file: Express.Multer.File,
    @Body() importDto: ProductImportDto
  ): Promise<ProductImportResultDto> {
    return this.productService.importProducts(file, importDto);
  }

  @Post('bulk-permanent-delete')
  @ApiOperation({ summary: 'Bulk permanently delete products from database' })
  @ApiResponse({
    status: 200,
    description: 'Products permanently deleted successfully',
  })
  @ApiResponse({ status: 400, description: 'Invalid product IDs or products have active references' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        productIds: {
          type: 'array',
          items: { type: 'string', format: 'uuid' },
          description: 'Array of product IDs to permanently delete'
        }
      },
      required: ['productIds']
    }
  })
  @HttpCode(HttpStatus.OK)
  async bulkPermanentDelete(
    @Body() body: { productIds: string[] },
    @CurrentUser('userId') currentUserId: string,
    @CurrentUser('username') currentUsername: string,
  ): Promise<{ message: string; deletedCount: number; failedIds: string[] }> {
    const result = await this.productService.bulkPermanentDelete(
      body.productIds,
      currentUserId,
      currentUsername,
    );
    return {
      message: `Successfully permanently deleted ${result.successCount} of ${body.productIds.length} products`,
      deletedCount: result.successCount,
      failedIds: result.failedItems.map(item => item.id),
    };
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
    @CurrentUser('userId') currentUserId: string,
    @CurrentUser('username') currentUsername: string,
  ): Promise<void> {
    await this.productService.permanentDelete(id, currentUserId, currentUsername);
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
    @CurrentUser('userId') currentUserId: string,
    @CurrentUser('username') currentUsername: string,
  ): Promise<void> {
    await this.productService.softDelete(id, currentUserId, currentUsername);
  }
}
