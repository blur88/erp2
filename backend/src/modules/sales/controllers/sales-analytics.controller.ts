import { Controller, Get, Query, ParseUUIDPipe, Param } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery, ApiParam } from '@nestjs/swagger';
import { SalesAnalyticsService } from '../services/sales-analytics.service';
import {
  SalesAnalyticsQueryDto,
  SalesAnalyticsResponseDto,
  SalesPipelineQueryDto,
  SalesPipelineResponseDto,
  CustomerAnalyticsQueryDto,
  CustomerMetricsDto,
  DateRange,
  GroupByPeriod,
} from '../dto/sales-analytics.dto';

@ApiTags('Sales Analytics')
@Controller('sales/analytics')
export class SalesAnalyticsController {
  constructor(
    private readonly salesAnalyticsService: SalesAnalyticsService,
  ) {}

  @Get('dashboard')
  @ApiOperation({ summary: 'Get comprehensive sales analytics for dashboard' })
  @ApiQuery({
    name: 'dateRange',
    required: false,
    enum: DateRange,
    description: 'Predefined date range',
  })
  @ApiQuery({
    name: 'startDate',
    required: false,
    description: 'Custom start date (YYYY-MM-DD)',
  })
  @ApiQuery({
    name: 'endDate',
    required: false,
    description: 'Custom end date (YYYY-MM-DD)',
  })
  @ApiQuery({
    name: 'customerId',
    required: false,
    description: 'Filter by customer ID',
  })
  @ApiQuery({
    name: 'salesRepId',
    required: false,
    description: 'Filter by sales representative ID',
  })
  @ApiQuery({
    name: 'groupBy',
    required: false,
    enum: ['day', 'week', 'month', 'quarter', 'year'],
    description: 'Group results by period',
  })
  @ApiQuery({
    name: 'compareWith',
    required: false,
    enum: ['previous_period', 'last_month', 'last_year'],
    description: 'Comparison period for delta metrics',
  })
  @ApiQuery({
    name: 'isFulfilled',
    required: false,
    description: 'Filter by fulfillment status (true/false)',
  })
  @ApiQuery({
    name: 'paymentStatus',
    required: false,
    description: 'Filter by invoice payment status',
  })
  @ApiResponse({
    status: 200,
    description: 'Sales analytics retrieved successfully',
    type: SalesAnalyticsResponseDto,
  })
  async getSalesAnalytics(
    @Query() query: SalesAnalyticsQueryDto,
  ): Promise<SalesAnalyticsResponseDto> {
    return this.salesAnalyticsService.getSalesAnalytics(query);
  }

  @Get('dashboard/metrics')
  @ApiOperation({
    summary: 'Get key dashboard metrics for today, this month, and this year',
  })
  @ApiResponse({
    status: 200,
    description: 'Dashboard metrics retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        today: {
          type: 'object',
          description: "Today's metrics",
        },
        thisMonth: {
          type: 'object',
          description: "This month's metrics",
        },
        thisYear: {
          type: 'object',
          description: "This year's metrics",
        },
      },
    },
  })
  async getDashboardMetrics() {
    return this.salesAnalyticsService.getDashboardMetrics();
  }

  @Get('pipeline')
  @ApiOperation({ summary: 'Get sales pipeline analytics' })
  @ApiQuery({
    name: 'dateRange',
    required: false,
    enum: DateRange,
    description: 'Predefined date range',
  })
  @ApiQuery({
    name: 'startDate',
    required: false,
    description: 'Custom start date (YYYY-MM-DD)',
  })
  @ApiQuery({
    name: 'endDate',
    required: false,
    description: 'Custom end date (YYYY-MM-DD)',
  })
  @ApiQuery({
    name: 'customerId',
    required: false,
    description: 'Filter by customer ID',
  })
  @ApiQuery({
    name: 'salesRepId',
    required: false,
    description: 'Filter by sales representative ID',
  })
  @ApiResponse({
    status: 200,
    description: 'Sales pipeline analytics retrieved successfully',
    type: SalesPipelineResponseDto,
  })
  async getSalesPipeline(@Query() query: SalesPipelineQueryDto): Promise<SalesPipelineResponseDto> {
    return this.salesAnalyticsService.getSalesPipeline(query);
  }

  @Get('customer/:customerId')
  @ApiOperation({ summary: 'Get detailed customer analytics' })
  @ApiParam({ name: 'customerId', description: 'Customer ID', type: 'string' })
  @ApiQuery({
    name: 'dateRange',
    required: false,
    enum: DateRange,
    description: 'Predefined date range',
  })
  @ApiQuery({
    name: 'startDate',
    required: false,
    description: 'Custom start date (YYYY-MM-DD)',
  })
  @ApiQuery({
    name: 'endDate',
    required: false,
    description: 'Custom end date (YYYY-MM-DD)',
  })
  @ApiQuery({
    name: 'includeDetails',
    required: false,
    type: Boolean,
    description: 'Include detailed transaction history',
  })
  @ApiResponse({
    status: 200,
    description: 'Customer analytics retrieved successfully',
    type: CustomerMetricsDto,
  })
  @ApiResponse({ status: 404, description: 'Customer not found' })
  async getCustomerAnalytics(
    @Param('customerId', ParseUUIDPipe) customerId: string,
    @Query() query: Omit<CustomerAnalyticsQueryDto, 'customerId'>,
  ): Promise<CustomerMetricsDto> {
    return this.salesAnalyticsService.getCustomerAnalytics({
      ...query,
      customerId,
    });
  }

  

  @Get('top-customers')
  @ApiOperation({ summary: 'Get top customers by revenue' })
  @ApiQuery({
    name: 'dateRange',
    required: false,
    enum: DateRange,
    description: 'Predefined date range',
  })
  @ApiQuery({
    name: 'startDate',
    required: false,
    description: 'Custom start date (YYYY-MM-DD)',
  })
  @ApiQuery({
    name: 'endDate',
    required: false,
    description: 'Custom end date (YYYY-MM-DD)',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Number of top customers to return',
  })
  @ApiResponse({
    status: 200,
    description: 'Top customers retrieved successfully',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          customerId: { type: 'string', format: 'uuid' },
          customerName: { type: 'string' },
          customerEmail: { type: 'string' },
          totalRevenue: { type: 'number' },
          totalOrders: { type: 'number' },
          averageOrderValue: { type: 'number' },
          lastOrderDate: { type: 'string', format: 'date-time' },
        },
      },
    },
  })
  async getTopCustomers(
    @Query('dateRange') dateRange?: DateRange,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('limit') limit: number = 10,
  ) {
    const analytics = await this.salesAnalyticsService.getSalesAnalytics({
      dateRange,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
    });

    return analytics.topCustomers.slice(0, limit);
  }

  @Get('top-products')
  @ApiOperation({ summary: 'Get top products by sales volume' })
  @ApiQuery({
    name: 'dateRange',
    required: false,
    enum: DateRange,
    description: 'Predefined date range',
  })
  @ApiQuery({
    name: 'startDate',
    required: false,
    description: 'Custom start date (YYYY-MM-DD)',
  })
  @ApiQuery({
    name: 'endDate',
    required: false,
    description: 'Custom end date (YYYY-MM-DD)',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Number of top products to return',
  })
  @ApiResponse({
    status: 200,
    description: 'Top products retrieved successfully',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          productId: { type: 'string', format: 'uuid' },
          productSku: { type: 'string' },
          productName: { type: 'string' },
          quantitySold: { type: 'number' },
          totalRevenue: { type: 'number' },
          averagePrice: { type: 'number' },
          orderCount: { type: 'number' },
        },
      },
    },
  })
  async getTopProducts(
    @Query('dateRange') dateRange?: DateRange,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('limit') limit: number = 10,
  ) {
    const analytics = await this.salesAnalyticsService.getSalesAnalytics({
      dateRange,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
    });

    return analytics.topProducts.slice(0, limit);
  }

  @Get('trends/:period')
  @ApiOperation({ summary: 'Get sales trends for a specific period' })
  @ApiParam({
    name: 'period',
    enum: ['daily', 'weekly', 'monthly'],
    description: 'Trend period',
  })
  @ApiQuery({
    name: 'days',
    required: false,
    type: Number,
    description: 'Number of days to analyze (default: 30)',
  })
  @ApiResponse({
    status: 200,
    description: 'Sales trends retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        period: { type: 'string' },
        trends: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              period: { type: 'string' },
              revenue: { type: 'number' },
              orders: { type: 'number' },
              averageOrderValue: { type: 'number' },
              growthPercentage: { type: 'number' },
            },
          },
        },
        summary: {
          type: 'object',
          properties: {
            totalRevenue: { type: 'number' },
            totalOrders: { type: 'number' },
            averageGrowth: { type: 'number' },
            trend: { enum: ['upward', 'downward', 'stable'] },
          },
        },
      },
    },
  })
  async getSalesTrends(
    @Param('period') period: 'daily' | 'weekly' | 'monthly',
    @Query('days') days: number = 30,
  ) {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    let groupBy: GroupByPeriod;
    switch (period) {
      case 'daily':
        groupBy = GroupByPeriod.DAY;
        break;
      case 'weekly':
        groupBy = GroupByPeriod.WEEK;
        break;
      case 'monthly':
        groupBy = GroupByPeriod.MONTH;
        break;
      default:
        groupBy = GroupByPeriod.DAY;
    }

    const analytics = await this.salesAnalyticsService.getSalesAnalytics({
      startDate,
      endDate,
      groupBy,
    });

    // Calculate trends and growth
    const trends = analytics.current.periodData.map((current, index) => {
      const previous = analytics.current.periodData[index - 1];
      const growthPercentage = previous?.revenue
        ? ((current.revenue - previous.revenue) / previous.revenue) * 100
        : 0;

      return {
        ...current,
        growthPercentage,
      };
    });

    const totalRevenue = trends.reduce((sum, trend) => sum + trend.revenue, 0);
    const totalOrders = trends.reduce((sum, trend) => sum + trend.orders, 0);
    const growthRates = trends.map((t) => t.growthPercentage).filter((g) => g !== 0);
    const averageGrowth =
      growthRates.length > 0
        ? growthRates.reduce((sum, rate) => sum + rate, 0) / growthRates.length
        : 0;

    let trend: 'upward' | 'downward' | 'stable';
    if (averageGrowth > 5) {
      trend = 'upward';
    } else if (averageGrowth < -5) {
      trend = 'downward';
    } else {
      trend = 'stable';
    }

    return {
      period,
      trends,
      summary: {
        totalRevenue,
        totalOrders,
        averageGrowth,
        trend,
      },
    };
  }

  @Get('performance/sales-rep/:salesRepId')
  @ApiOperation({ summary: 'Get sales representative performance analytics' })
  @ApiParam({
    name: 'salesRepId',
    description: 'Sales representative user ID',
    type: 'string',
  })
  @ApiQuery({
    name: 'dateRange',
    required: false,
    enum: DateRange,
    description: 'Predefined date range',
  })
  @ApiQuery({
    name: 'startDate',
    required: false,
    description: 'Custom start date (YYYY-MM-DD)',
  })
  @ApiQuery({
    name: 'endDate',
    required: false,
    description: 'Custom end date (YYYY-MM-DD)',
  })
  @ApiResponse({
    status: 200,
    description: 'Sales rep performance retrieved successfully',
  })
  async getSalesRepPerformance(
    @Param('salesRepId', ParseUUIDPipe) salesRepId: string,
    @Query() query: Omit<SalesAnalyticsQueryDto, 'salesRepId'>,
  ) {
    return this.salesAnalyticsService.getSalesAnalytics({
      ...query,
      salesRepId,
    });
  }

  

  

  

  

  

  

  

  

  

  

  

  

  

  

  

  

  
}
