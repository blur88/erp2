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
    name: 'categoryId',
    required: false,
    description: 'Filter by category ID',
  })
  @ApiQuery({
    name: 'productIds',
    required: false,
    type: [String],
    description: 'Filter by product IDs',
  })
  @ApiQuery({
    name: 'type',
    required: false,
    description: 'Filter by product type (product/service/bundle)',
  })
  @ApiQuery({
    name: 'status',
    required: false,
    description: 'Filter by status (active/discontinued)',
  })
  @ApiResponse({
    status: 200,
    description: 'Inventory summary report retrieved successfully',
  })
  async getInventorySummary(
    @Query('categoryId') categoryId?: string,
    @Query('productIds') productIds?: string | string[],
    @Query('type') type?: string,
    @Query('status') status?: string,
  ) {
    return this.inventoryAnalyticsService.getInventorySummary({
      categoryId,
      productIds: Array.isArray(productIds)
        ? productIds
        : productIds
          ? [productIds]
          : undefined,
      type,
      status,
    });
  }
}
