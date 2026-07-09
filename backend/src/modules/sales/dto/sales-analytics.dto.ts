import { IsOptional, IsEnum, IsIn, IsUUID, IsDate, IsInt, Min, IsString } from 'class-validator';
import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import { format } from 'date-fns';
import { Transform, Type } from 'class-transformer';
import { DateRange, GroupByPeriod } from '@/common/dto/analytics.dto';
// Re-export for backward compatibility
export { DateRange, GroupByPeriod } from '@/common/dto/analytics.dto';

//  enum removed - using fulfillment status instead

enum MetricType {
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
  @Transform(({ value }) => (value ? new Date(value) : value))
  startDate?: Date;

  @ApiPropertyOptional({
    description: 'End date for custom range',
    example: '2023-12-31',
  })
  @IsOptional()
  @IsDate()
  @Transform(({ value }) => (value ? new Date(value) : value))
  endDate?: Date;

  @ApiPropertyOptional({
    description: 'Filter by customer ID',
    example: 'uuid-string',
  })
  @IsOptional()
  @IsUUID()
  customerId?: string;

  @ApiPropertyOptional({
    description: 'Filter by sales rep user ID',
    example: 'uuid-string',
  })
  @IsOptional()
  @IsUUID()
  salesRepId?: string;

  @ApiPropertyOptional({
    description: 'Group results by period',
    enum: GroupByPeriod,
    example: GroupByPeriod.MONTH,
  })
  @IsOptional()
  @IsEnum(GroupByPeriod)
  groupBy?: GroupByPeriod;

  @ApiPropertyOptional({ enum: ['previous_period', 'last_month', 'last_year'] })
  @IsOptional()
  @IsIn(['previous_period', 'last_month', 'last_year'])
  compareWith?: 'previous_period' | 'last_month' | 'last_year';

  @ApiPropertyOptional({
    description: 'Filter by fulfillment status',
    enum: ['fulfilled', 'unfulfilled'],
  })
  @IsOptional()
  @IsIn(['fulfilled', 'unfulfilled'])
  fulfillmentStatus?: 'fulfilled' | 'unfulfilled';

  @ApiPropertyOptional({
    description: 'Filter by payment status',
    enum: ['unpaid', 'partial', 'paid', 'overpaid'],
  })
  @IsOptional()
  @IsIn(['unpaid', 'partial', 'paid', 'overpaid'])
  paymentStatus?: 'unpaid' | 'partial' | 'paid' | 'overpaid';
}

export class SalesMetricsDto {
  @ApiProperty({ example: 125000.5, description: 'Total revenue' })
  totalRevenue!: number;

  @ApiProperty({ example: 250, description: 'Total orders' })
  totalOrders!: number;

  @ApiProperty({ example: 45, description: 'New customers' })
  newCustomers!: number;

  @ApiProperty({ example: 500.0, description: 'Average order value' })
  averageOrderValue!: number;

  @ApiProperty({ example: 15.2, description: 'Conversion rate' })
  conversionRate!: number;

  @ApiProperty({ example: 95000.75, description: 'Paid invoices amount' })
  paidInvoicesAmount!: number;

  @ApiProperty({ example: 30000.25, description: 'Pending invoices amount' })
  pendingInvoicesAmount!: number;

  @ApiProperty({ example: 5000.0, description: 'Overdue invoices amount' })
  overdueInvoicesAmount!: number;

  @ApiProperty({ example: 180, description: 'Completed orders' })
  completedOrders!: number;

  @ApiProperty({ example: 45, description: 'Confirmed orders' })
  confirmedOrders!: number;

  @ApiProperty({ example: 25, description: 'Draft orders' })
  draftOrders!: number;
}

export class PeriodMetricDto {
  @ApiProperty({ example: '2023-12', description: 'Period' })
  period!: string;

  @ApiProperty({ example: 25000.5, description: 'Revenue' })
  revenue!: number;

  @ApiProperty({ example: 50, description: 'Orders' })
  orders!: number;

  @ApiProperty({ example: 10, description: 'New customers' })
  newCustomers!: number;

  @ApiProperty({ example: 500.0, description: 'Average order value' })
  averageOrderValue!: number;
}

export class SalesAnalyticsPeriodBlockDto {
  @ApiProperty({ type: SalesMetricsDto })
  metrics!: SalesMetricsDto;

  @ApiProperty({ type: [PeriodMetricDto] })
  periodData!: PeriodMetricDto[];

  @ApiProperty({ example: '2026-03-01' })
  @Transform(({ value }) => (value instanceof Date ? format(value, 'yyyy-MM-dd') : value))
  periodStart!: string;

  @ApiProperty({ example: '2026-03-31' })
  @Transform(({ value }) => (value instanceof Date ? format(value, 'yyyy-MM-dd') : value))
  periodEnd!: string;
}

export class TopCustomerDto {
  @ApiProperty({ example: 'uuid-string', description: 'Customer ID' })
  customerId!: string;

  @ApiProperty({ example: 'Acme Corporation', description: 'Customer name' })
  customerName!: string;

  @ApiProperty({ example: 'john@acme.com', description: 'Customer email' })
  customerEmail!: string;

  @ApiProperty({ example: 15000.5, description: 'Total revenue' })
  totalRevenue!: number;

  @ApiProperty({ example: 25, description: 'Total orders' })
  totalOrders!: number;

  @ApiProperty({ example: 600.02, description: 'Average order value' })
  averageOrderValue!: number;

  @ApiProperty({
    example: '2023-11-15T00:00:00Z',
    description: 'Last order date',
  })
  lastOrderDate!: Date;
}

export class TopProductDto {
  @ApiProperty({ example: 'uuid-string', description: 'Product ID' })
  productId!: string;

  @ApiProperty({ example: 'PROD-001', description: 'Product SKU' })
  productSku!: string;

  @ApiProperty({ example: 'Premium Widget', description: 'Product name' })
  productName!: string;

  @ApiProperty({ example: 150, description: 'Quantity sold' })
  quantitySold!: number;

  @ApiProperty({ example: 7500.0, description: 'Total revenue' })
  totalRevenue!: number;

  @ApiProperty({ example: 50.0, description: 'Average price' })
  averagePrice!: number;

  @ApiProperty({ example: 25, description: 'Order count' })
  orderCount!: number;
}

export class SalesAnalyticsResponseDto {
  @ApiProperty({ type: SalesAnalyticsPeriodBlockDto })
  current!: SalesAnalyticsPeriodBlockDto;

  @ApiPropertyOptional({ type: SalesAnalyticsPeriodBlockDto })
  comparison?: SalesAnalyticsPeriodBlockDto;

  @ApiProperty({ type: [TopCustomerDto] })
  topCustomers!: TopCustomerDto[];

  @ApiProperty({ type: [TopProductDto] })
  topProducts!: TopProductDto[];
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
  @Transform(({ value }) => (value ? new Date(value) : value))
  startDate?: Date;

  @ApiPropertyOptional({
    description: 'End date for custom range',
    example: '2023-12-31',
  })
  @IsOptional()
  @IsDate()
  @Transform(({ value }) => (value ? new Date(value) : value))
  endDate?: Date;
}

export class PipelineStageDto {
  @ApiProperty({ example: 'fulfilled', description: 'Fulfillment status' })
  status!: string;

  @ApiProperty({ example: 'Fulfilled', description: 'Status label' })
  statusLabel!: string;

  @ApiProperty({ example: 15, description: 'Order count' })
  orderCount!: number;

  @ApiProperty({ example: 75000.5, description: 'Total value' })
  totalValue!: number;

  @ApiProperty({ example: 5000.03, description: 'Average value' })
  averageValue!: number;

  @ApiProperty({ example: 25.5, description: 'Percentage' })
  percentage!: number;
}

export class SalesPipelineResponseDto {
  @ApiProperty({ type: [PipelineStageDto], description: 'Pipeline stages' })
  stages!: PipelineStageDto[];

  @ApiProperty({ example: 100, description: 'Total orders' })
  totalOrders!: number;

  @ApiProperty({ example: 250000.75, description: 'Total value' })
  totalValue!: number;

  @ApiProperty({ example: 2500.01, description: 'Average order value' })
  averageOrderValue!: number;

  @ApiProperty({ example: 15.2, description: 'Conversion rate' })
  conversionRate!: number;

  @ApiProperty({ example: '2023-01-01T00:00:00Z', description: 'Period start' })
  periodStart!: Date;

  @ApiProperty({ example: '2023-12-31T23:59:59Z', description: 'Period end' })
  periodEnd!: Date;
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
  @Transform(({ value }) => (value ? new Date(value) : value))
  startDate?: Date;

  @ApiPropertyOptional({
    description: 'End date for custom range',
    example: '2023-12-31',
  })
  @IsOptional()
  @IsDate()
  @Transform(({ value }) => (value ? new Date(value) : value))
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
  @ApiProperty({ example: 'uuid-string', description: 'Customer ID' })
  customerId!: string;

  @ApiProperty({ example: 'Acme Corporation', description: 'Customer name' })
  customerName!: string;

  @ApiProperty({ example: 45000.75, description: 'Total revenue' })
  totalRevenue!: number;

  @ApiProperty({ example: 25, description: 'Total orders' })
  totalOrders!: number;

  @ApiProperty({ example: 1800.03, description: 'Average order value' })
  averageOrderValue!: number;

  @ApiProperty({
    example: '2023-11-15T00:00:00Z',
    description: 'Last order date',
  })
  lastOrderDate!: Date;

  @ApiProperty({
    example: '2023-01-15T00:00:00Z',
    description: 'First order date',
  })
  firstOrderDate!: Date;

  @ApiProperty({ example: 95.5, description: 'Payment score' })
  paymentScore!: number;

  @ApiProperty({ example: 15, description: 'Days since last order' })
  daysSinceLastOrder!: number;
}
