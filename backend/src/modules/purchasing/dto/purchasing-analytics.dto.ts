// backend/src/modules/purchasing/dto/purchasing-analytics.dto.ts
import { IsOptional, IsEnum, IsIn, IsDate, IsUUID } from 'class-validator';
import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { DateRange, GroupByPeriod } from '@/common/dto/analytics.dto';

export { DateRange, GroupByPeriod };

export class PurchasingAnalyticsQueryDto {
  @ApiPropertyOptional({ enum: DateRange, example: DateRange.THIS_MONTH })
  @IsOptional()
  @IsEnum(DateRange)
  dateRange?: DateRange;

  @ApiPropertyOptional({ example: '2026-01-01' })
  @IsOptional()
  @IsDate()
  @Transform(({ value }) => (value ? new Date(value) : value))
  startDate?: Date;

  @ApiPropertyOptional({ example: '2026-03-31' })
  @IsOptional()
  @IsDate()
  @Transform(({ value }) => (value ? new Date(value) : value))
  endDate?: Date;

  @ApiPropertyOptional({ enum: ['previous_period', 'last_month', 'last_year'] })
  @IsOptional()
  @IsIn(['previous_period', 'last_month', 'last_year'])
  compareWith?: 'previous_period' | 'last_month' | 'last_year';

  @ApiPropertyOptional({ enum: GroupByPeriod, example: GroupByPeriod.MONTH })
  @IsOptional()
  @IsEnum(GroupByPeriod)
  groupBy?: GroupByPeriod;

  @ApiPropertyOptional({ description: 'Filter by supplier ID' })
  @IsOptional()
  @IsUUID()
  supplierId?: string;

  @ApiPropertyOptional({ enum: ['received', 'pending'] })
  @IsOptional()
  @IsIn(['received', 'pending'])
  status?: 'received' | 'pending';

  @ApiPropertyOptional({ enum: ['unpaid', 'partial', 'paid', 'overpaid'] })
  @IsOptional()
  @IsIn(['unpaid', 'partial', 'paid', 'overpaid'])
  paymentStatus?: 'unpaid' | 'partial' | 'paid' | 'overpaid';
}

export class PurchasingMetricsDto {
  @ApiProperty({ example: 50000 })
  totalSpent!: number;

  @ApiProperty({ example: 25 })
  totalOrders!: number;

  @ApiProperty({ example: 2000 })
  averageOrderValue!: number;

  @ApiProperty({ example: 8 })
  activeSuppliers!: number;
}

export class PurchasingPeriodDataDto {
  @ApiProperty({ example: '2026-03' })
  period!: string;

  @ApiProperty({ example: 12000 })
  spent!: number;

  @ApiProperty({ example: 6 })
  orders!: number;
}

export class PurchasingPeriodBlockDto {
  @ApiProperty({ type: PurchasingMetricsDto })
  metrics!: PurchasingMetricsDto;

  @ApiProperty({ type: [PurchasingPeriodDataDto] })
  periodData!: PurchasingPeriodDataDto[];

  @ApiProperty({ example: '2026-03-01' })
  periodStart!: string;

  @ApiProperty({ example: '2026-03-31' })
  periodEnd!: string;
}

export class TopSupplierDto {
  @ApiProperty({ example: 'uuid' })
  supplierId!: string;

  @ApiProperty({ example: 'Acme Supplies' })
  supplierName!: string;

  @ApiProperty({ example: 15000 })
  totalSpent!: number;

  @ApiProperty({ example: 7 })
  orderCount!: number;
}

export class RecentPurchaseOrderDto {
  @ApiProperty({ example: 'PO-0001' })
  orderNumber!: string;

  @ApiProperty({ example: '2026-03-15' })
  orderDate!: string;

  @ApiProperty({ example: 'Acme Supplies' })
  supplierName!: string;

  @ApiProperty({ example: 3500 })
  totalAmount!: number;

  @ApiProperty({ example: 'pending' })
  status!: 'received' | 'pending';
}

export class PurchasingAnalyticsResponseDto {
  @ApiProperty({ type: PurchasingPeriodBlockDto })
  current!: PurchasingPeriodBlockDto;

  @ApiPropertyOptional({ type: PurchasingPeriodBlockDto })
  comparison?: PurchasingPeriodBlockDto;

  @ApiProperty({ type: [TopSupplierDto] })
  topSuppliers!: TopSupplierDto[];

  @ApiProperty({ type: [RecentPurchaseOrderDto] })
  recentOrders!: RecentPurchaseOrderDto[];
}
