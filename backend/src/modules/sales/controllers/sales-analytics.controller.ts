import { Controller, Get, Query, ParseUUIDPipe, Param, Res } from '@nestjs/common';
import { Response } from 'express';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery, ApiParam } from '@nestjs/swagger';
import { SalesAnalyticsService } from '../services/sales-analytics.service';
import { SalesOrderService } from '../services/sales-order.service';
import { ExportService } from '../../../common/services/export.service';
import { normalizeIds, toDate, sendExcel } from '../../../common/utils/export-controller.util';
import {
  SalesAnalyticsQueryDto,
  SalesAnalyticsResponseDto,
  SalesPipelineQueryDto,
  SalesPipelineResponseDto,
  CustomerAnalyticsQueryDto,
  CustomerMetricsDto,
  RevenueReportQueryDto,
  RevenueReportResponseDto,
  DateRange,
  GroupByPeriod,
} from '../dto/sales-analytics.dto';

@ApiTags('Sales Analytics')
@Controller('sales/analytics')
export class SalesAnalyticsController {
  constructor(
    private readonly salesAnalyticsService: SalesAnalyticsService,
    private readonly salesOrderService: SalesOrderService,
    private readonly exportService: ExportService,
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

  @Get('revenue-report')
  @ApiOperation({ summary: 'Get comprehensive revenue report' })
  @ApiQuery({
    name: 'period',
    required: false,
    enum: DateRange,
    description: 'Report period',
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
    name: 'groupBy',
    required: false,
    enum: ['day', 'week', 'month'],
    description: 'Group by period',
  })
  @ApiQuery({
    name: 'includeComparison',
    required: false,
    type: Boolean,
    description: 'Include comparison with previous period',
  })
  @ApiResponse({
    status: 200,
    description: 'Revenue report retrieved successfully',
    type: RevenueReportResponseDto,
  })
  async getRevenueReport(@Query() query: RevenueReportQueryDto): Promise<RevenueReportResponseDto> {
    return this.salesAnalyticsService.getRevenueReport(query);
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

  @Get('product-summary')
  @ApiOperation({
    summary: 'Get product summary report with sales and purchase data',
  })
  @ApiQuery({
    name: 'dateFrom',
    required: false,
    description: 'Start date (YYYY-MM-DD)',
  })
  @ApiQuery({
    name: 'dateTo',
    required: false,
    description: 'End date (YYYY-MM-DD)',
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
  @ApiResponse({
    status: 200,
    description: 'Product summary report retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        data: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              productId: { type: 'string', format: 'uuid' },
              productName: { type: 'string' },
              category: { type: 'string' },
              soldQty: { type: 'number' },
              totalSales: { type: 'number' },
              cost: { type: 'number' },
              salesProfit: { type: 'number' },
              purchaseQty: { type: 'number' },
              purchaseSubtotal: { type: 'number' },
              totalProfit: { type: 'number' },
            },
          },
        },
      },
    },
  })
  async getProductSummary(
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('categoryId') categoryId?: string,
    @Query('productIds') productIds?: string | string[],
  ) {
    return this.salesAnalyticsService.getProductSummary({
      dateFrom: dateFrom ? new Date(dateFrom) : undefined,
      dateTo: dateTo ? new Date(dateTo) : undefined,
      categoryId,
      productIds: Array.isArray(productIds) ? productIds : productIds ? [productIds] : undefined,
    });
  }

  @Get('product-details')
  @ApiOperation({
    summary: 'Get product details report with transaction-level data',
  })
  @ApiQuery({
    name: 'dateFrom',
    required: false,
    description: 'Start date (YYYY-MM-DD)',
  })
  @ApiQuery({
    name: 'dateTo',
    required: false,
    description: 'End date (YYYY-MM-DD)',
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
  @ApiResponse({
    status: 200,
    description: 'Product details report retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        data: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              transactionType: { type: 'string', enum: ['Sale', 'Purchase'] },
              transactionDate: { type: 'string', format: 'date-time' },
              documentNumber: { type: 'string' },
              customerSupplier: { type: 'string' },
              productId: { type: 'string', format: 'uuid' },
              productName: { type: 'string' },
              category: { type: 'string' },
              quantity: { type: 'number' },
              unitPrice: { type: 'number' },
              totalAmount: { type: 'number' },
              cost: { type: 'number' },
              profit: { type: 'number' },
            },
          },
        },
      },
    },
  })
  async getProductDetails(
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('categoryId') categoryId?: string,
    @Query('productIds') productIds?: string | string[],
  ) {
    return this.salesAnalyticsService.getProductDetails({
      dateFrom: dateFrom ? new Date(dateFrom) : undefined,
      dateTo: dateTo ? new Date(dateTo) : undefined,
      categoryId,
      productIds: Array.isArray(productIds) ? productIds : productIds ? [productIds] : undefined,
    });
  }

  @Get('sales-order-profit')
  @ApiOperation({ summary: 'Get sales order profit report' })
  @ApiQuery({
    name: 'dateFrom',
    required: false,
    description: 'Start date (YYYY-MM-DD)',
  })
  @ApiQuery({
    name: 'dateTo',
    required: false,
    description: 'End date (YYYY-MM-DD)',
  })
  @ApiQuery({
    name: 'customerId',
    required: false,
    description: 'Filter by customer ID',
  })
  @ApiQuery({
    name: 'status',
    required: false,
    description: 'Filter by inventory status (fulfilled/unfulfilled)',
  })
  @ApiQuery({
    name: 'paymentStatus',
    required: false,
    description: 'Filter by payment status (unpaid/partial/paid/overpaid)',
  })
  @ApiResponse({
    status: 200,
    description: 'Sales order profit report retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        data: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              orderNumber: { type: 'string' },
              orderDate: { type: 'string', format: 'date' },
              customerName: { type: 'string' },
              inventoryStatus: { type: 'string' },
              paymentStatus: { type: 'string' },
              totalRevenue: { type: 'number' },
              totalCost: { type: 'number' },
              grossProfit: { type: 'number' },
            },
          },
        },
      },
    },
  })
  async getSalesOrderProfitReport(
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('customerId') customerId?: string,
    @Query('status') status?: string,
    @Query('paymentStatus') paymentStatus?: string,
  ) {
    return this.salesAnalyticsService.getSalesOrderProfitReport({
      dateFrom: dateFrom ? new Date(dateFrom) : undefined,
      dateTo: dateTo ? new Date(dateTo) : undefined,
      customerId,
      status,
      paymentStatus,
    });
  }

  @Get('customer-payment-summary')
  @ApiOperation({ summary: 'Get customer payment summary report' })
  @ApiQuery({
    name: 'dateFrom',
    required: false,
    description: 'Start date (YYYY-MM-DD)',
  })
  @ApiQuery({
    name: 'dateTo',
    required: false,
    description: 'End date (YYYY-MM-DD)',
  })
  @ApiQuery({
    name: 'customerId',
    required: false,
    description: 'Filter by customer ID',
  })
  @ApiQuery({
    name: 'paymentStatus',
    required: false,
    description: 'Filter by payment status',
  })
  @ApiResponse({
    status: 200,
    description: 'Customer payment summary report retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        data: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              customerId: { type: 'string', format: 'uuid' },
              customerName: { type: 'string' },
              customerPhone: { type: 'string' },
              totalPayments: { type: 'number' },
              paymentCount: { type: 'number' },
              lastPaymentDate: { type: 'string', format: 'date' },
              firstPaymentDate: { type: 'string', format: 'date' },
              invoicesPaid: { type: 'number' },
              averagePaymentAmount: { type: 'number' },
            },
          },
        },
      },
    },
  })
  async getCustomerPaymentSummary(
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('customerId') customerId?: string,
    @Query('paymentStatus') paymentStatus?: string,
  ) {
    return this.salesAnalyticsService.getCustomerPaymentSummary({
      dateFrom: dateFrom ? new Date(dateFrom) : undefined,
      dateTo: dateTo ? new Date(dateTo) : undefined,
      customerId,
      paymentStatus,
    });
  }

  @Get('customer-payment-by-order')
  @ApiOperation({
    summary: 'Get customer payment by order report - shows payments grouped by sales order',
  })
  @ApiQuery({
    name: 'dateFrom',
    required: false,
    description: 'Start date (YYYY-MM-DD)',
  })
  @ApiQuery({
    name: 'dateTo',
    required: false,
    description: 'End date (YYYY-MM-DD)',
  })
  @ApiQuery({
    name: 'customerId',
    required: false,
    description: 'Filter by customer ID',
  })
  @ApiQuery({
    name: 'paymentStatus',
    required: false,
    description: 'Filter by payment status',
  })
  @ApiResponse({
    status: 200,
    description: 'Customer payment by order report retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        data: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              customerId: { type: 'string', format: 'uuid' },
              customerName: { type: 'string' },
              orderNumber: { type: 'string' },
              orderDate: { type: 'string', format: 'date' },
              invoiceNumber: { type: 'string' },
              invoiceDate: { type: 'string', format: 'date' },
              inventoryStatus: { type: 'string' },
              totalAmount: { type: 'number' },
              paidAmount: { type: 'number' },
              balance: { type: 'number' },
              paymentStatus: { type: 'string' },
              lastPaymentDate: { type: 'string', format: 'date' },
            },
          },
        },
      },
    },
  })
  async getCustomerPaymentByOrder(
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('customerId') customerId?: string,
    @Query('paymentStatus') paymentStatus?: string,
  ) {
    return this.salesAnalyticsService.getCustomerPaymentByOrder({
      dateFrom: dateFrom ? new Date(dateFrom) : undefined,
      dateTo: dateTo ? new Date(dateTo) : undefined,
      customerId,
      paymentStatus,
    });
  }

  @Get('customer-payment-details')
  @ApiOperation({
    summary: 'Get customer payment details report - shows individual payment transactions',
  })
  @ApiQuery({
    name: 'dateFrom',
    required: false,
    description: 'Start date for payment date (YYYY-MM-DD)',
  })
  @ApiQuery({
    name: 'dateTo',
    required: false,
    description: 'End date for payment date (YYYY-MM-DD)',
  })
  @ApiQuery({
    name: 'customerId',
    required: false,
    description: 'Filter by customer ID',
  })
  @ApiQuery({
    name: 'paymentStatus',
    required: false,
    description: 'Filter by payment status',
  })
  @ApiResponse({
    status: 200,
    description: 'Customer payment details report retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        data: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              paymentId: { type: 'string', format: 'uuid' },
              paymentNumber: { type: 'string' },
              paymentDate: { type: 'string', format: 'date' },
              paymentAmount: { type: 'number' },
              paymentMethod: { type: 'string' },
              customerId: { type: 'string', format: 'uuid' },
              customerName: { type: 'string' },
              orderNumber: { type: 'string' },
              orderDate: { type: 'string', format: 'date' },
              invoiceNumber: { type: 'string' },
              invoiceDate: { type: 'string', format: 'date' },
              invoiceTotal: { type: 'number' },
              invoicePaid: { type: 'number' },
              invoiceBalance: { type: 'number' },
              paymentStatus: { type: 'string' },
              inventoryStatus: { type: 'string' },
              notes: { type: 'string' },
            },
          },
        },
      },
    },
  })
  async getCustomerPaymentDetails(
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('customerId') customerId?: string,
    @Query('paymentStatus') paymentStatus?: string,
  ) {
    return this.salesAnalyticsService.getCustomerPaymentDetails({
      dateFrom: dateFrom ? new Date(dateFrom) : undefined,
      dateTo: dateTo ? new Date(dateTo) : undefined,
      customerId,
      paymentStatus,
    });
  }

  @Get('customer-order-history')
  @ApiOperation({
    summary: 'Get customer order history report - shows order line items with product details',
  })
  @ApiQuery({
    name: 'dateFrom',
    required: false,
    description: 'Start date for order date (YYYY-MM-DD)',
  })
  @ApiQuery({
    name: 'dateTo',
    required: false,
    description: 'End date for order date (YYYY-MM-DD)',
  })
  @ApiQuery({
    name: 'customerId',
    required: false,
    description: 'Filter by customer ID',
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
    name: 'inventoryStatus',
    required: false,
    description: 'Filter by inventory status (fulfilled/unfulfilled)',
  })
  @ApiQuery({
    name: 'paymentStatus',
    required: false,
    description: 'Filter by payment status (unpaid/partial/paid/overpaid)',
  })
  @ApiResponse({
    status: 200,
    description: 'Customer order history report retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        data: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              orderId: { type: 'string', format: 'uuid' },
              orderNumber: { type: 'string' },
              orderDate: { type: 'string', format: 'date' },
              customerId: { type: 'string', format: 'uuid' },
              customerName: { type: 'string' },
              productId: { type: 'string', format: 'uuid' },
              productName: { type: 'string' },
              categoryName: { type: 'string' },
              quantity: { type: 'number' },
              amount: { type: 'number' },
              cost: { type: 'number' },
              profit: { type: 'number' },
              paymentStatus: { type: 'string' },
              inventoryStatus: { type: 'string' },
            },
          },
        },
      },
    },
  })
  async getCustomerOrderHistory(
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('customerId') customerId?: string,
    @Query('categoryId') categoryId?: string,
    @Query('productIds') productIds?: string | string[],
    @Query('inventoryStatus') inventoryStatus?: string,
    @Query('paymentStatus') paymentStatus?: string,
  ) {
    return this.salesAnalyticsService.getCustomerOrderHistory({
      dateFrom: dateFrom ? new Date(dateFrom) : undefined,
      dateTo: dateTo ? new Date(dateTo) : undefined,
      customerId,
      categoryId,
      productIds: Array.isArray(productIds) ? productIds : productIds ? [productIds] : undefined,
      inventoryStatus,
      paymentStatus,
    });
  }

  @Get('product-customer-report')
  @ApiOperation({
    summary: 'Get product-customer report - shows which customers purchased which products',
  })
  @ApiQuery({
    name: 'dateFrom',
    required: false,
    description: 'Start date for order date (YYYY-MM-DD)',
  })
  @ApiQuery({
    name: 'dateTo',
    required: false,
    description: 'End date for order date (YYYY-MM-DD)',
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
    name: 'inventoryStatus',
    required: false,
    description: 'Filter by inventory status (fulfilled/unfulfilled)',
  })
  @ApiQuery({
    name: 'paymentStatus',
    required: false,
    description: 'Filter by payment status (unpaid/partial/paid/overpaid)',
  })
  @ApiResponse({
    status: 200,
    description: 'Product-customer report retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        data: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              productId: { type: 'string', format: 'uuid' },
              productName: { type: 'string' },
              categoryName: { type: 'string' },
              customerId: { type: 'string', format: 'uuid' },
              customerName: { type: 'string' },
              customerPhone: { type: 'string' },
              orderId: { type: 'string', format: 'uuid' },
              orderNumber: { type: 'string' },
              orderDate: { type: 'string', format: 'date' },
              quantity: { type: 'number' },
              unitPrice: { type: 'number' },
              amount: { type: 'number' },
              cost: { type: 'number' },
              profit: { type: 'number' },
              paymentStatus: { type: 'string' },
              inventoryStatus: { type: 'string' },
            },
          },
        },
      },
    },
  })
  async getProductCustomerReport(
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('productIds') productIds?: string | string[],
    @Query('categoryId') categoryId?: string,
    @Query('inventoryStatus') inventoryStatus?: string,
    @Query('paymentStatus') paymentStatus?: string,
  ) {
    return this.salesAnalyticsService.getProductCustomerReport({
      dateFrom: dateFrom ? new Date(dateFrom) : undefined,
      dateTo: dateTo ? new Date(dateTo) : undefined,
      productIds: Array.isArray(productIds) ? productIds : productIds ? [productIds] : undefined,
      categoryId,
      inventoryStatus,
      paymentStatus,
    });
  }

  @Get('sales-order-summary/export')
  @ApiOperation({ summary: 'Export sales order summary to Excel' })
  async exportSalesOrderSummary(
    @Query('dateFrom') dateFrom: string | undefined,
    @Query('dateTo') dateTo: string | undefined,
    @Query('customerId') customerId: string | undefined,
    // status and paymentStatus are not implemented in findSummaries — omitted intentionally
    @Res() res: Response,
  ): Promise<void> {
    const { data } = await this.salesOrderService.findSummaries({
      customerId,
      fromDate: dateFrom,
      toDate: dateTo,
    });
    const rows = data.map((o: any) => ({
      ...o,
      fulfillmentStatus: o.isFulfilled ? 'Fulfilled' : 'Pending',
    }));
    const columns = [
      {
        key: 'customerName',
        header: 'Customer',
        type: 'string' as const,
        width: 25,
      },
      {
        key: 'orderNumber',
        header: 'Order #',
        type: 'string' as const,
        width: 15,
      },
      { key: 'orderDate', header: 'Date', type: 'date' as const, width: 12 },
      {
        key: 'fulfillmentStatus',
        header: 'Fulfillment',
        type: 'string' as const,
        width: 14,
      },
      {
        key: 'itemsCount',
        header: 'Items',
        type: 'number' as const,
        width: 10,
      },
      {
        key: 'totalAmount',
        header: 'Total',
        type: 'currency' as const,
        width: 15,
      },
      {
        key: 'paidAmount',
        header: 'Paid',
        type: 'currency' as const,
        width: 15,
      },
      {
        key: 'balanceDue',
        header: 'Balance',
        type: 'currency' as const,
        width: 15,
      },
    ];
    const buffer = await this.exportService.exportGrouped(
      'Sales Order Summary',
      columns,
      rows as any[],
      {
        groupKey: 'customerName',
        groupLabel: 'Customer',
        subtotalColumns: ['totalAmount', 'paidAmount', 'balanceDue'],
      },
    );
    sendExcel(res, buffer, 'sales-order-summary');
  }

  @Get('product-summary/export')
  @ApiOperation({ summary: 'Export sales by product summary to Excel' })
  async exportProductSummary(
    @Query('dateFrom') dateFrom: string | undefined,
    @Query('dateTo') dateTo: string | undefined,
    @Query('categoryId') categoryId: string | undefined,
    @Query('productIds') productIds: string | string[] | undefined,
    @Res() res: Response,
  ): Promise<void> {
    const { data } = await this.salesAnalyticsService.getProductSummary({
      dateFrom: toDate(dateFrom),
      dateTo: toDate(dateTo),
      categoryId,
      productIds: normalizeIds(productIds),
    });
    const columns = [
      {
        key: 'category',
        header: 'Category',
        type: 'string' as const,
        width: 20,
      },
      {
        key: 'productName',
        header: 'Product',
        type: 'string' as const,
        width: 30,
      },
      {
        key: 'soldQty',
        header: 'Sold Qty',
        type: 'number' as const,
        width: 12,
      },
      {
        key: 'totalSales',
        header: 'Total Sales',
        type: 'currency' as const,
        width: 15,
      },
      { key: 'cost', header: 'Cost', type: 'currency' as const, width: 15 },
      {
        key: 'salesProfit',
        header: 'Sales Profit',
        type: 'currency' as const,
        width: 15,
      },
      {
        key: 'purchaseQty',
        header: 'Purchase Qty',
        type: 'number' as const,
        width: 14,
      },
      {
        key: 'purchaseSubtotal',
        header: 'Purchase Subtotal',
        type: 'currency' as const,
        width: 18,
      },
      {
        key: 'totalProfit',
        header: 'Total Profit',
        type: 'currency' as const,
        width: 15,
      },
    ];
    const buffer = await this.exportService.exportGrouped(
      'Sales by Product Summary',
      columns,
      data as any[],
      {
        groupKey: 'category',
        groupLabel: 'Category',
        subtotalColumns: [
          'soldQty',
          'totalSales',
          'cost',
          'salesProfit',
          'purchaseQty',
          'purchaseSubtotal',
          'totalProfit',
        ],
      },
    );
    sendExcel(res, buffer, 'sales-by-product-summary');
  }

  @Get('product-details/export')
  @ApiOperation({ summary: 'Export sales by product details to Excel' })
  async exportProductDetails(
    @Query('dateFrom') dateFrom: string | undefined,
    @Query('dateTo') dateTo: string | undefined,
    @Query('categoryId') categoryId: string | undefined,
    @Query('productIds') productIds: string | string[] | undefined,
    @Res() res: Response,
  ): Promise<void> {
    const { data } = await this.salesAnalyticsService.getProductDetails({
      dateFrom: toDate(dateFrom),
      dateTo: toDate(dateTo),
      categoryId,
      productIds: normalizeIds(productIds),
    });
    const columns = [
      {
        key: 'productName',
        header: 'Product',
        type: 'string' as const,
        width: 30,
      },
      {
        key: 'category',
        header: 'Category',
        type: 'string' as const,
        width: 20,
      },
      {
        key: 'transactionDate',
        header: 'Date',
        type: 'date' as const,
        width: 14,
      },
      {
        key: 'documentNumber',
        header: 'Document #',
        type: 'string' as const,
        width: 18,
      },
      {
        key: 'customerSupplier',
        header: 'Customer',
        type: 'string' as const,
        width: 25,
      },
      { key: 'quantity', header: 'Qty', type: 'number' as const, width: 10 },
      {
        key: 'unitPrice',
        header: 'Unit Price',
        type: 'currency' as const,
        width: 15,
      },
      {
        key: 'totalAmount',
        header: 'Total',
        type: 'currency' as const,
        width: 15,
      },
      { key: 'cost', header: 'Cost', type: 'currency' as const, width: 15 },
      { key: 'profit', header: 'Profit', type: 'currency' as const, width: 15 },
    ];
    const buffer = await this.exportService.exportGrouped(
      'Sales by Product Details',
      columns,
      data as any[],
      {
        groupKey: 'productName',
        groupLabel: 'Product',
        subtotalColumns: ['quantity', 'totalAmount', 'cost', 'profit'],
      },
    );
    sendExcel(res, buffer, 'sales-by-product-details');
  }

  @Get('customer-order-history/export')
  @ApiOperation({ summary: 'Export customer order history to Excel' })
  async exportCustomerOrderHistory(
    @Query('dateFrom') dateFrom: string | undefined,
    @Query('dateTo') dateTo: string | undefined,
    @Query('customerId') customerId: string | undefined,
    @Query('categoryId') categoryId: string | undefined,
    @Query('productIds') productIds: string | string[] | undefined,
    @Query('inventoryStatus') inventoryStatus: string | undefined,
    @Query('paymentStatus') paymentStatus: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    const { data } = await this.salesAnalyticsService.getCustomerOrderHistory({
      dateFrom: toDate(dateFrom),
      dateTo: toDate(dateTo),
      customerId,
      categoryId,
      productIds: normalizeIds(productIds),
      inventoryStatus,
      paymentStatus,
    });
    const columns = [
      {
        key: 'customerName',
        header: 'Customer',
        type: 'string' as const,
        width: 25,
      },
      {
        key: 'orderNumber',
        header: 'Order #',
        type: 'string' as const,
        width: 15,
      },
      { key: 'orderDate', header: 'Date', type: 'date' as const, width: 14 },
      {
        key: 'productName',
        header: 'Product',
        type: 'string' as const,
        width: 30,
      },
      {
        key: 'categoryName',
        header: 'Category',
        type: 'string' as const,
        width: 18,
      },
      { key: 'quantity', header: 'Qty', type: 'number' as const, width: 10 },
      { key: 'amount', header: 'Amount', type: 'currency' as const, width: 15 },
      { key: 'cost', header: 'Cost', type: 'currency' as const, width: 15 },
      { key: 'profit', header: 'Profit', type: 'currency' as const, width: 15 },
      {
        key: 'paymentStatus',
        header: 'Payment',
        type: 'string' as const,
        width: 14,
      },
      {
        key: 'inventoryStatus',
        header: 'Inventory',
        type: 'string' as const,
        width: 14,
      },
    ];
    const buffer = await this.exportService.exportGrouped(
      'Customer Order History',
      columns,
      data as any[],
      {
        groupKey: 'customerName',
        groupLabel: 'Customer',
        subtotalColumns: ['quantity', 'amount', 'cost', 'profit'],
      },
    );
    sendExcel(res, buffer, 'customer-order-history');
  }

  @Get('customer-payment-summary/export')
  @ApiOperation({ summary: 'Export customer payment summary to Excel' })
  async exportCustomerPaymentSummary(
    @Query('dateFrom') dateFrom: string | undefined,
    @Query('dateTo') dateTo: string | undefined,
    @Query('customerId') customerId: string | undefined,
    @Query('paymentStatus') paymentStatus: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    const { data } = await this.salesAnalyticsService.getCustomerPaymentSummary({
      dateFrom: toDate(dateFrom),
      dateTo: toDate(dateTo),
      customerId,
      paymentStatus,
    });
    const columns = [
      {
        key: 'customerName',
        header: 'Customer',
        type: 'string' as const,
        width: 25,
      },
      {
        key: 'customerPhone',
        header: 'Phone',
        type: 'string' as const,
        width: 18,
      },
      {
        key: 'orderCount',
        header: 'Orders',
        type: 'number' as const,
        width: 10,
      },
      {
        key: 'totalInvoiced',
        header: 'Invoiced',
        type: 'currency' as const,
        width: 15,
      },
      {
        key: 'totalPaid',
        header: 'Paid',
        type: 'currency' as const,
        width: 15,
      },
      {
        key: 'totalPayments',
        header: 'Payments',
        type: 'currency' as const,
        width: 15,
      },
      {
        key: 'paymentCount',
        header: 'Payment Count',
        type: 'number' as const,
        width: 15,
      },
      {
        key: 'paymentStatus',
        header: 'Status',
        type: 'string' as const,
        width: 12,
      },
    ];
    const buffer = await this.exportService.exportFlat(
      'Customer Payment Summary',
      columns,
      data as any[],
    );
    sendExcel(res, buffer, 'customer-payment-summary');
  }

  @Get('customer-payment-by-order/export')
  @ApiOperation({ summary: 'Export customer payment by order to Excel' })
  async exportCustomerPaymentByOrder(
    @Query('dateFrom') dateFrom: string | undefined,
    @Query('dateTo') dateTo: string | undefined,
    @Query('customerId') customerId: string | undefined,
    @Query('paymentStatus') paymentStatus: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    const { data } = await this.salesAnalyticsService.getCustomerPaymentByOrder({
      dateFrom: toDate(dateFrom),
      dateTo: toDate(dateTo),
      customerId,
      paymentStatus,
    });
    const columns = [
      {
        key: 'customerName',
        header: 'Customer',
        type: 'string' as const,
        width: 25,
      },
      {
        key: 'orderNumber',
        header: 'Order #',
        type: 'string' as const,
        width: 15,
      },
      {
        key: 'orderDate',
        header: 'Order Date',
        type: 'date' as const,
        width: 14,
      },
      {
        key: 'invoiceNumber',
        header: 'Invoice #',
        type: 'string' as const,
        width: 15,
      },
      {
        key: 'totalAmount',
        header: 'Invoice Total',
        type: 'currency' as const,
        width: 15,
      },
      {
        key: 'paidAmount',
        header: 'Paid',
        type: 'currency' as const,
        width: 15,
      },
      {
        key: 'balance',
        header: 'Balance',
        type: 'currency' as const,
        width: 15,
      },
      {
        key: 'paymentStatus',
        header: 'Status',
        type: 'string' as const,
        width: 12,
      },
    ];
    const buffer = await this.exportService.exportGrouped(
      'Customer Payment by Order',
      columns,
      data as any[],
      {
        groupKey: 'customerName',
        groupLabel: 'Customer',
        subtotalColumns: ['totalAmount', 'paidAmount', 'balance'],
      },
    );
    sendExcel(res, buffer, 'customer-payment-by-order');
  }

  @Get('customer-payment-details/export')
  @ApiOperation({ summary: 'Export customer payment details to Excel' })
  async exportCustomerPaymentDetails(
    @Query('dateFrom') dateFrom: string | undefined,
    @Query('dateTo') dateTo: string | undefined,
    @Query('customerId') customerId: string | undefined,
    @Query('paymentStatus') paymentStatus: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    const { data } = await this.salesAnalyticsService.getCustomerPaymentDetails({
      dateFrom: toDate(dateFrom),
      dateTo: toDate(dateTo),
      customerId,
      paymentStatus,
    });
    const columns = [
      {
        key: 'customerName',
        header: 'Customer',
        type: 'string' as const,
        width: 25,
      },
      {
        key: 'paymentNumber',
        header: 'Payment #',
        type: 'string' as const,
        width: 15,
      },
      { key: 'paymentDate', header: 'Date', type: 'date' as const, width: 14 },
      {
        key: 'paymentAmount',
        header: 'Amount',
        type: 'currency' as const,
        width: 15,
      },
      {
        key: 'paymentMethod',
        header: 'Method',
        type: 'string' as const,
        width: 14,
      },
      {
        key: 'orderNumber',
        header: 'Order #',
        type: 'string' as const,
        width: 15,
      },
      {
        key: 'invoiceNumber',
        header: 'Invoice #',
        type: 'string' as const,
        width: 15,
      },
      {
        key: 'invoiceBalance',
        header: 'Invoice Balance',
        type: 'currency' as const,
        width: 18,
      },
    ];
    const buffer = await this.exportService.exportGrouped(
      'Customer Payment Details',
      columns,
      data as any[],
      {
        groupKey: 'customerName',
        groupLabel: 'Customer',
        subtotalColumns: ['paymentAmount', 'invoiceBalance'],
      },
    );
    sendExcel(res, buffer, 'customer-payment-details');
  }

  @Get('product-customer-report/export')
  @ApiOperation({ summary: 'Export product-customer report to Excel' })
  async exportProductCustomerReport(
    @Query('dateFrom') dateFrom: string | undefined,
    @Query('dateTo') dateTo: string | undefined,
    @Query('productIds') productIds: string | string[] | undefined,
    @Query('categoryId') categoryId: string | undefined,
    @Query('inventoryStatus') inventoryStatus: string | undefined,
    @Query('paymentStatus') paymentStatus: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    const { data } = await this.salesAnalyticsService.getProductCustomerReport({
      dateFrom: toDate(dateFrom),
      dateTo: toDate(dateTo),
      productIds: normalizeIds(productIds),
      categoryId,
      inventoryStatus,
      paymentStatus,
    });
    const columns = [
      {
        key: 'productName',
        header: 'Product',
        type: 'string' as const,
        width: 30,
      },
      {
        key: 'categoryName',
        header: 'Category',
        type: 'string' as const,
        width: 18,
      },
      {
        key: 'customerName',
        header: 'Customer',
        type: 'string' as const,
        width: 25,
      },
      {
        key: 'orderNumber',
        header: 'Order #',
        type: 'string' as const,
        width: 15,
      },
      { key: 'orderDate', header: 'Date', type: 'date' as const, width: 14 },
      { key: 'quantity', header: 'Qty', type: 'number' as const, width: 10 },
      { key: 'amount', header: 'Amount', type: 'currency' as const, width: 15 },
      { key: 'cost', header: 'Cost', type: 'currency' as const, width: 15 },
      { key: 'profit', header: 'Profit', type: 'currency' as const, width: 15 },
    ];
    const buffer = await this.exportService.exportGrouped(
      'Product Customer Report',
      columns,
      data as any[],
      {
        groupKey: 'productName',
        groupLabel: 'Product',
        subtotalColumns: ['quantity', 'amount', 'cost', 'profit'],
      },
    );
    sendExcel(res, buffer, 'product-customer-report');
  }

  @Get('sales-order-profit/export')
  @ApiOperation({ summary: 'Export sales order profit report to Excel' })
  async exportSalesOrderProfitReport(
    @Query('dateFrom') dateFrom: string | undefined,
    @Query('dateTo') dateTo: string | undefined,
    @Query('customerId') customerId: string | undefined,
    @Query('status') status: string | undefined,
    @Query('paymentStatus') paymentStatus: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    const { data } = await this.salesAnalyticsService.getSalesOrderProfitReport({
      dateFrom: toDate(dateFrom),
      dateTo: toDate(dateTo),
      customerId,
      status,
      paymentStatus,
    });
    const columns = [
      {
        key: 'customerName',
        header: 'Customer',
        type: 'string' as const,
        width: 25,
      },
      {
        key: 'orderNumber',
        header: 'Order #',
        type: 'string' as const,
        width: 15,
      },
      { key: 'orderDate', header: 'Date', type: 'date' as const, width: 14 },
      {
        key: 'inventoryStatus',
        header: 'Inventory Status',
        type: 'string' as const,
        width: 18,
      },
      {
        key: 'paymentStatus',
        header: 'Payment Status',
        type: 'string' as const,
        width: 16,
      },
      {
        key: 'totalRevenue',
        header: 'Revenue',
        type: 'currency' as const,
        width: 15,
      },
      {
        key: 'totalCost',
        header: 'Cost',
        type: 'currency' as const,
        width: 15,
      },
      {
        key: 'grossProfit',
        header: 'Gross Profit',
        type: 'currency' as const,
        width: 15,
      },
    ];
    const buffer = await this.exportService.exportGrouped(
      'Sales Order Profit',
      columns,
      data as any[],
      {
        groupKey: 'customerName',
        groupLabel: 'Customer',
        subtotalColumns: ['totalRevenue', 'totalCost', 'grossProfit'],
      },
    );
    sendExcel(res, buffer, 'sales-order-profit');
  }
}
