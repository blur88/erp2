import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { PurchasingAnalyticsService } from '../services/purchasing-analytics.service';
import {
  PurchasingAnalyticsQueryDto,
  PurchasingAnalyticsResponseDto,
} from '../dto/purchasing-analytics.dto';

@ApiTags('Purchasing Analytics')
@Controller('purchasing/analytics')
export class PurchasingAnalyticsController {
  constructor(
    private readonly purchasingAnalyticsService: PurchasingAnalyticsService,
  ) {}

  @Get('dashboard')
  @ApiOperation({ summary: 'Get purchasing analytics for the overview dashboard' })
  @ApiResponse({ status: 200, type: PurchasingAnalyticsResponseDto })
  async getDashboardAnalytics(
    @Query() query: PurchasingAnalyticsQueryDto,
  ): Promise<PurchasingAnalyticsResponseDto> {
    return this.purchasingAnalyticsService.getPurchasingAnalytics(query);
  }
}
