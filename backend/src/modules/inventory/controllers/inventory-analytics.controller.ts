import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery, ApiResponse } from '@nestjs/swagger';
import { InventoryAnalyticsService } from '../services/inventory-analytics.service';
import {
  InventoryAnalyticsQueryDto,
  InventoryAnalyticsResponseDto,
} from '../dto/inventory-analytics.dto';

@ApiTags('Inventory Analytics')
@Controller('inventory/analytics')
export class InventoryAnalyticsController {
  constructor(
    private readonly inventoryAnalyticsService: InventoryAnalyticsService,
  ) {}

  @Get('dashboard')
  @ApiOperation({ summary: 'Get inventory analytics for the overview dashboard' })
  @ApiResponse({ status: 200, type: InventoryAnalyticsResponseDto })
  async getDashboardAnalytics(
    @Query() query: InventoryAnalyticsQueryDto,
  ): Promise<InventoryAnalyticsResponseDto> {
    return this.inventoryAnalyticsService.getInventoryDashboardAnalytics(query);
  }

  @Get('inventory-summary')
  @ApiOperation({
    summary:
      'Get inventory summary report - shows product-level inventory data with values and profit potential',
  })
  @ApiQuery({
    name: 'productIds',
    required: false,
    type: [String],
    description: 'Filter by product IDs',
  })
  @ApiQuery({
    name: 'categoryId',
    required: false,
    description: 'Filter by category ID',
  })
  @ApiQuery({
    name: 'priceListId',
    required: false,
    description: 'Price list ID to use for unit price calculation',
  })
  @ApiResponse({
    status: 200,
    description: 'Inventory summary report retrieved successfully',
  })
  async getInventorySummary(
    @Query('productIds') productIds?: string | string[],
    @Query('categoryId') categoryId?: string,
    @Query('priceListId') priceListId?: string,
  ) {
    return this.inventoryAnalyticsService.getInventorySummary({
      productIds: Array.isArray(productIds)
        ? productIds
        : productIds
          ? [productIds]
          : undefined,
      categoryId,
      priceListId,
    });
  }

  @Get('historical-inventory')
  @ApiOperation({
    summary:
      'Get historical inventory report - shows aggregated inventory by product based on stock movements',
  })
  @ApiQuery({
    name: 'productIds',
    required: false,
    type: [String],
    description: 'Filter by product IDs',
  })
  @ApiQuery({
    name: 'categoryId',
    required: false,
    description: 'Filter by category ID',
  })
  @ApiQuery({
    name: 'startDate',
    required: false,
    type: String,
    description: 'Start date for filtering (ISO 8601 format)',
  })
  @ApiQuery({
    name: 'endDate',
    required: false,
    type: String,
    description: 'End date for filtering (ISO 8601 format)',
  })
  @ApiResponse({
    status: 200,
    description: 'Historical inventory report retrieved successfully',
  })
  async getHistoricalInventory(
    @Query('productIds') productIds?: string | string[],
    @Query('categoryId') categoryId?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.inventoryAnalyticsService.getHistoricalInventory({
      productIds: Array.isArray(productIds)
        ? productIds
        : productIds
          ? [productIds]
          : undefined,
      categoryId,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
    });
  }

  @Get('movement-summary')
  @ApiOperation({
    summary:
      'Get inventory movement summary - shows quantity in, out, and on hand by product',
  })
  @ApiQuery({
    name: 'productIds',
    required: false,
    type: [String],
    description: 'Filter by product IDs',
  })
  @ApiQuery({
    name: 'categoryId',
    required: false,
    description: 'Filter by category ID',
  })
  @ApiQuery({
    name: 'startDate',
    required: false,
    type: String,
    description: 'Start date for filtering movements (ISO 8601 format)',
  })
  @ApiQuery({
    name: 'endDate',
    required: false,
    type: String,
    description: 'End date for filtering movements (ISO 8601 format)',
  })
  @ApiResponse({
    status: 200,
    description: 'Movement summary report retrieved successfully',
  })
  async getMovementSummary(
    @Query('productIds') productIds?: string | string[],
    @Query('categoryId') categoryId?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.inventoryAnalyticsService.getMovementSummary({
      productIds: Array.isArray(productIds)
        ? productIds
        : productIds
          ? [productIds]
          : undefined,
      categoryId,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
    });
  }

  @Get('price-list')
  @ApiOperation({
    summary:
      'Get product price list report - shows products with prices, discounts, and sales costs',
  })
  @ApiQuery({
    name: 'productIds',
    required: false,
    type: [String],
    description: 'Filter by product IDs',
  })
  @ApiQuery({
    name: 'categoryId',
    required: false,
    description: 'Filter by category ID',
  })
  @ApiQuery({
    name: 'priceListId',
    required: false,
    type: String,
    description: 'Price list ID to use for pricing (uses default if not specified)',
  })
  @ApiQuery({
    name: 'discountPercent',
    required: false,
    type: Number,
    description: 'Discount percentage to apply (0-100)',
  })
  @ApiResponse({
    status: 200,
    description: 'Price list report retrieved successfully',
  })
  async getPriceList(
    @Query('productIds') productIds?: string | string[],
    @Query('categoryId') categoryId?: string,
    @Query('priceListId') priceListId?: string,
    @Query('discountPercent') discountPercent?: string,
  ) {
    return this.inventoryAnalyticsService.getPriceList({
      productIds: Array.isArray(productIds)
        ? productIds
        : productIds
          ? [productIds]
          : undefined,
      categoryId,
      priceListId,
      discountPercent: discountPercent ? parseFloat(discountPercent) : undefined,
    });
  }

  @Get('product-cost')
  @ApiOperation({
    summary:
      'Get product cost report - shows cost changes based on stock movements with running average',
  })
  @ApiQuery({
    name: 'productIds',
    required: false,
    type: [String],
    description: 'Filter by product IDs',
  })
  @ApiQuery({
    name: 'startDate',
    required: false,
    type: String,
    description: 'Start date for filtering movements (ISO 8601 format)',
  })
  @ApiQuery({
    name: 'endDate',
    required: false,
    type: String,
    description: 'End date for filtering movements (ISO 8601 format)',
  })
  @ApiResponse({
    status: 200,
    description: 'Product cost report retrieved successfully',
  })
  async getProductCost(
    @Query('productIds') productIds?: string | string[],
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.inventoryAnalyticsService.getProductCost({
      productIds: Array.isArray(productIds)
        ? productIds
        : productIds
          ? [productIds]
          : undefined,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
    });
  }
}
