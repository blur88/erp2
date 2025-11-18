import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery, ApiResponse } from '@nestjs/swagger';
import { InventoryAnalyticsService } from '../services/inventory-analytics.service';

@ApiTags('Inventory Analytics')
@Controller('inventory/analytics')
export class InventoryAnalyticsController {
  constructor(
    private readonly inventoryAnalyticsService: InventoryAnalyticsService,
  ) {}

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
  @ApiResponse({
    status: 200,
    description: 'Inventory summary report retrieved successfully',
  })
  async getInventorySummary(
    @Query('productIds') productIds?: string | string[],
    @Query('categoryId') categoryId?: string,
  ) {
    return this.inventoryAnalyticsService.getInventorySummary({
      productIds: Array.isArray(productIds)
        ? productIds
        : productIds
          ? [productIds]
          : undefined,
      categoryId,
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
}
