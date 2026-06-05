import { IsOptional, IsEnum, IsIn, IsDate, IsUUID } from 'class-validator';
import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { DateRange, GroupByPeriod } from '@/common/dto/analytics.dto';

export { DateRange, GroupByPeriod };

export class InventoryAnalyticsQueryDto {
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

  @ApiPropertyOptional({ enum: GroupByPeriod, example: GroupByPeriod.DAY })
  @IsOptional()
  @IsEnum(GroupByPeriod)
  groupBy?: GroupByPeriod;

  @ApiPropertyOptional({ description: 'Filter by category ID' })
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiPropertyOptional({ description: 'Filter by supplier ID' })
  @IsOptional()
  @IsUUID()
  supplierId?: string;

  @ApiPropertyOptional({ enum: ['in_stock', 'low_stock', 'out_of_stock'] })
  @IsOptional()
  @IsIn(['in_stock', 'low_stock', 'out_of_stock'])
  stockStatus?: 'in_stock' | 'low_stock' | 'out_of_stock';
}

export class InventoryMetricsDto {
  @ApiProperty({ example: 120 })
  totalProducts!: number;

  @ApiProperty({ example: 8 })
  totalCategories!: number;

  @ApiProperty({ example: 45000 })
  inventoryValue!: number;

  @ApiProperty({ example: 5 })
  lowStockCount!: number;

  @ApiProperty({ example: 2 })
  outOfStockCount!: number;

  @ApiProperty({ example: 340 })
  stockMovementsIn!: number;

  @ApiProperty({ example: 210 })
  stockMovementsOut!: number;
}

export class InventoryPeriodDataDto {
  @ApiProperty({ example: '2026-03-01' })
  period!: string;

  @ApiProperty({ example: 45 })
  movementsIn!: number;

  @ApiProperty({ example: 28 })
  movementsOut!: number;
}

export class InventoryPeriodBlockDto {
  @ApiProperty({ type: InventoryMetricsDto })
  metrics!: InventoryMetricsDto;

  @ApiProperty({ type: [InventoryPeriodDataDto] })
  periodData!: InventoryPeriodDataDto[];

  @ApiProperty({ example: '2026-03-01' })
  periodStart!: string;

  @ApiProperty({ example: '2026-03-31' })
  periodEnd!: string;
}

export class LowStockAlertDto {
  @ApiProperty({ example: 'uuid' })
  productId!: string;

  @ApiProperty({ example: 'Widget A' })
  productName!: string;

  @ApiProperty({ example: 'Electronics' })
  categoryName!: string;

  @ApiProperty({ example: 3 })
  stockQuantity!: number;

  @ApiProperty({ enum: ['low_stock', 'out_of_stock'] })
  status!: 'low_stock' | 'out_of_stock';
}

export class RecentMovementDto {
  @ApiProperty({ example: '2026-03-15' })
  movementDate!: string;

  @ApiProperty({ example: 'Widget A' })
  productName!: string;

  @ApiProperty({ example: 'purchase_receipt' })
  movementType!: string;

  @ApiProperty({ example: 50 })
  quantity!: number;

  @ApiProperty({ example: 'PO-0042' })
  referenceNumber!: string;
}

export class InventoryAnalyticsResponseDto {
  @ApiProperty({ type: InventoryPeriodBlockDto })
  current!: InventoryPeriodBlockDto;

  @ApiPropertyOptional({ type: InventoryPeriodBlockDto })
  comparison?: InventoryPeriodBlockDto;

  @ApiProperty({ type: [LowStockAlertDto] })
  lowStockAlerts!: LowStockAlertDto[];

  @ApiProperty({ type: [RecentMovementDto] })
  recentMovements!: RecentMovementDto[];
}
