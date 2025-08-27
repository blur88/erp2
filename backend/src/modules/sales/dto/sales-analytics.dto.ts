import {
  IsOptional,
  IsEnum,
  IsUUID,
  IsDate,
  IsInt,
  Min,
  IsString,
} from 'class-validator';
import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { CustomerStatus } from '../../../database/entities/customer.entity';
import { SalesOrderStatus } from '../../../database/entities/sales-order.entity';
import { InvoiceStatus } from '../../../database/entities/invoice.entity';

export enum DateRange {
  TODAY = 'today',
  THIS_WEEK = 'this_week',
  THIS_MONTH = 'this_month',
  THIS_QUARTER = 'this_quarter',
  THIS_YEAR = 'this_year',
  LAST_WEEK = 'last_week',
  LAST_MONTH = 'last_month',
  LAST_QUARTER = 'last_quarter',
  LAST_YEAR = 'last_year',
  CUSTOM = 'custom',
}

export enum MetricType {
  REVENUE = 'revenue',
  ORDERS = 'orders',
  CUSTOMERS = 'customers',
  AVERAGE_ORDER_VALUE = 'average_order_value',
  CONVERSION_RATE = 'conversion_rate',
}

export class SalesAnalyticsQueryDto {
  @ApiPropertyOptional({
    description: 'Date range for analytics',
    enum: DateRange,
    example: DateRange.THIS_MONTH,
  })
  @IsOptional()
  @IsEnum(DateRange)
  dateRange?: DateRange;

  @ApiPropertyOptional({
    description: 'Start date for custom range',
    example: '2023-01-01',
  })
  @IsOptional()
  @IsDate()
  @Type(() => Date)
  startDate?: Date;

  @ApiPropertyOptional({
    description: 'End date for custom range',
    example: '2023-12-31',
  })
  @IsOptional()
  @IsDate()
  @Type(() => Date)
  endDate?: Date;

  @ApiPropertyOptional({
    description: 'Filter by customer ID',
    example: 'uuid-string',
  })
  @IsOptional()
  @IsUUID()
  customerId?: string;

  @ApiPropertyOptional({
    description: 'Filter by customer status',
    enum: CustomerStatus,
    example: CustomerStatus.ACTIVE,
  })
  @IsOptional()
  @IsEnum(CustomerStatus)
  customerStatus?: CustomerStatus;

  @ApiPropertyOptional({
    description: 'Filter by sales rep user ID',
    example: 'uuid-string',
  })
  @IsOptional()
  @IsUUID()
  salesRepId?: string;

  @ApiPropertyOptional({
    description: 'Group results by period',
    enum: ['day', 'week', 'month', 'quarter', 'year'],
    example: 'month',
  })
  @IsOptional()
  @IsEnum(['day', 'week', 'month', 'quarter', 'year'])
  groupBy?: string;
}

export class SalesMetricsDto {
  @ApiProperty({ example: 125000.50 })
  totalRevenue: number;

  @ApiProperty({ example: 250 })
  totalOrders: number;

  @ApiProperty({ example: 45 })
  newCustomers: number;

  @ApiProperty({ example: 500.00 })
  averageOrderValue: number;

  @ApiProperty({ example: 15.2 })
  conversionRate: number;

  @ApiProperty({ example: 95000.75 })
  paidInvoicesAmount: number;

  @ApiProperty({ example: 30000.25 })
  pendingInvoicesAmount: number;

  @ApiProperty({ example: 5000.00 })
  overdueInvoicesAmount: number;

  @ApiProperty({ example: 180 })
  completedOrders: number;

  @ApiProperty({ example: 45 })
  pendingOrders: number;

  @ApiProperty({ example: 25 })
  shippedOrders: number;
}

export class PeriodMetricDto {
  @ApiProperty({ example: '2023-12' })
  period: string;

  @ApiProperty({ example: 25000.50 })
  revenue: number;

  @ApiProperty({ example: 50 })
  orders: number;

  @ApiProperty({ example: 10 })
  newCustomers: number;

  @ApiProperty({ example: 500.00 })
  averageOrderValue: number;
}

export class TopCustomerDto {
  @ApiProperty({ example: 'uuid-string' })
  customerId: string;

  @ApiProperty({ example: 'Acme Corporation' })
  customerName: string;

  @ApiProperty({ example: 'john@acme.com' })
  customerEmail: string;

  @ApiProperty({ example: 15000.50 })
  totalRevenue: number;

  @ApiProperty({ example: 25 })
  totalOrders: number;

  @ApiProperty({ example: 600.02 })
  averageOrderValue: number;

  @ApiProperty({ example: '2023-11-15T00:00:00Z' })
  lastOrderDate: Date;
}

export class TopProductDto {
  @ApiProperty({ example: 'uuid-string' })
  productId: string;

  @ApiProperty({ example: 'PROD-001' })
  productSku: string;

  @ApiProperty({ example: 'Premium Widget' })
  productName: string;

  @ApiProperty({ example: 150 })
  quantitySold: number;

  @ApiProperty({ example: 7500.00 })
  totalRevenue: number;

  @ApiProperty({ example: 50.00 })
  averagePrice: number;

  @ApiProperty({ example: 25 })
  orderCount: number;
}

export class SalesAnalyticsResponseDto {
  @ApiProperty({ type: SalesMetricsDto })
  metrics: SalesMetricsDto;

  @ApiProperty({ type: [PeriodMetricDto] })
  periodData: PeriodMetricDto[];

  @ApiProperty({ type: [TopCustomerDto] })
  topCustomers: TopCustomerDto[];

  @ApiProperty({ type: [TopProductDto] })
  topProducts: TopProductDto[];

  @ApiProperty({ example: '2023-01-01T00:00:00Z' })
  periodStart: Date;

  @ApiProperty({ example: '2023-12-31T23:59:59Z' })
  periodEnd: Date;
}

export class SalesPipelineQueryDto {
  @ApiPropertyOptional({
    description: 'Filter by sales rep user ID',
    example: 'uuid-string',
  })
  @IsOptional()
  @IsUUID()
  salesRepId?: string;

  @ApiPropertyOptional({
    description: 'Filter by customer ID',
    example: 'uuid-string',
  })
  @IsOptional()
  @IsUUID()
  customerId?: string;

  @ApiPropertyOptional({
    description: 'Date range for pipeline',
    enum: DateRange,
    example: DateRange.THIS_MONTH,
  })
  @IsOptional()
  @IsEnum(DateRange)
  dateRange?: DateRange;

  @ApiPropertyOptional({
    description: 'Start date for custom range',
    example: '2023-01-01',
  })
  @IsOptional()
  @IsDate()
  @Type(() => Date)
  startDate?: Date;

  @ApiPropertyOptional({
    description: 'End date for custom range',
    example: '2023-12-31',
  })
  @IsOptional()
  @IsDate()
  @Type(() => Date)
  endDate?: Date;
}

export class PipelineStageDto {
  @ApiProperty({ enum: SalesOrderStatus, example: SalesOrderStatus.PENDING })
  status: SalesOrderStatus;

  @ApiProperty({ example: 'Pending' })
  statusLabel: string;

  @ApiProperty({ example: 15 })
  orderCount: number;

  @ApiProperty({ example: 75000.50 })
  totalValue: number;

  @ApiProperty({ example: 5000.03 })
  averageValue: number;

  @ApiProperty({ example: 25.5 })
  percentage: number;
}

export class SalesPipelineResponseDto {
  @ApiProperty({ type: [PipelineStageDto] })
  stages: PipelineStageDto[];

  @ApiProperty({ example: 100 })
  totalOrders: number;

  @ApiProperty({ example: 250000.75 })
  totalValue: number;

  @ApiProperty({ example: 2500.01 })
  averageOrderValue: number;

  @ApiProperty({ example: 15.2 })
  conversionRate: number;

  @ApiProperty({ example: '2023-01-01T00:00:00Z' })
  periodStart: Date;

  @ApiProperty({ example: '2023-12-31T23:59:59Z' })
  periodEnd: Date;
}

export class CustomerAnalyticsQueryDto {
  @ApiPropertyOptional({
    description: 'Customer ID',
    example: 'uuid-string',
  })
  @IsOptional()
  @IsUUID()
  customerId?: string;

  @ApiPropertyOptional({
    description: 'Date range for analysis',
    enum: DateRange,
    example: DateRange.THIS_YEAR,
  })
  @IsOptional()
  @IsEnum(DateRange)
  dateRange?: DateRange;

  @ApiPropertyOptional({
    description: 'Start date for custom range',
    example: '2023-01-01',
  })
  @IsOptional()
  @IsDate()
  @Type(() => Date)
  startDate?: Date;

  @ApiPropertyOptional({
    description: 'End date for custom range',
    example: '2023-12-31',
  })
  @IsOptional()
  @IsDate()
  @Type(() => Date)
  endDate?: Date;

  @ApiPropertyOptional({
    description: 'Include detailed transaction history',
    example: true,
  })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  includeDetails?: boolean;
}

export class CustomerMetricsDto {
  @ApiProperty({ example: 'uuid-string' })
  customerId: string;

  @ApiProperty({ example: 'Acme Corporation' })
  customerName: string;

  @ApiProperty({ example: 45000.75 })
  totalRevenue: number;

  @ApiProperty({ example: 25 })
  totalOrders: number;

  @ApiProperty({ example: 1800.03 })
  averageOrderValue: number;

  @ApiProperty({ example: 2500.25 })
  currentBalance: number;

  @ApiProperty({ example: 10000.00 })
  creditLimit: number;

  @ApiProperty({ example: 7499.75 })
  availableCredit: number;

  @ApiProperty({ example: '2023-11-15T00:00:00Z' })
  lastOrderDate: Date;

  @ApiProperty({ example: '2023-01-15T00:00:00Z' })
  firstOrderDate: Date;

  @ApiProperty({ example: 95.5 })
  paymentScore: number;

  @ApiProperty({ example: 15 })
  daysSinceLastOrder: number;
}

export class RevenueReportQueryDto {
  @ApiPropertyOptional({
    description: 'Report period',
    enum: DateRange,
    example: DateRange.THIS_QUARTER,
  })
  @IsOptional()
  @IsEnum(DateRange)
  period?: DateRange;

  @ApiPropertyOptional({
    description: 'Start date for custom range',
    example: '2023-01-01',
  })
  @IsOptional()
  @IsDate()
  @Type(() => Date)
  startDate?: Date;

  @ApiPropertyOptional({
    description: 'End date for custom range',
    example: '2023-12-31',
  })
  @IsOptional()
  @IsDate()
  @Type(() => Date)
  endDate?: Date;

  @ApiPropertyOptional({
    description: 'Group by period',
    enum: ['day', 'week', 'month'],
    example: 'month',
  })
  @IsOptional()
  @IsEnum(['day', 'week', 'month'])
  groupBy?: string;

  @ApiPropertyOptional({
    description: 'Include comparison with previous period',
    example: true,
  })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  includeComparison?: boolean;
}

export class RevenueDataDto {
  @ApiProperty({ example: '2023-01' })
  period: string;

  @ApiProperty({ example: 25000.50 })
  revenue: number;

  @ApiProperty({ example: 50 })
  orders: number;

  @ApiProperty({ example: 500.01 })
  averageOrderValue: number;

  @ApiProperty({ example: 22500.45 })
  previousPeriodRevenue?: number;

  @ApiProperty({ example: 11.1 })
  growthPercentage?: number;
}

export class RevenueReportResponseDto {
  @ApiProperty({ type: [RevenueDataDto] })
  data: RevenueDataDto[];

  @ApiProperty({ example: 300000.75 })
  totalRevenue: number;

  @ApiProperty({ example: 600 })
  totalOrders: number;

  @ApiProperty({ example: 500.01 })
  averageOrderValue: number;

  @ApiProperty({ example: 275000.25 })
  previousPeriodRevenue: number;

  @ApiProperty({ example: 9.1 })
  growthPercentage: number;

  @ApiProperty({ example: '2023-01-01T00:00:00Z' })
  periodStart: Date;

  @ApiProperty({ example: '2023-12-31T23:59:59Z' })
  periodEnd: Date;
}