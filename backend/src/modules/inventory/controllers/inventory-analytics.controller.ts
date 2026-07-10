import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
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

  }
