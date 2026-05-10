# Purchasing Dashboard Filters Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `DashboardFilterBar` and backend analytics endpoint to the Purchasing Overview page, mirroring the Sales Overview implementation.

**Architecture:** Move shared `DateRange`/`GroupByPeriod` enums to `src/common/dto/analytics.dto.ts`, add a `GET /purchasing/analytics/dashboard` backend endpoint, create a `usePurchasingAnalytics` frontend hook, and refactor `PurchasingPage.tsx` to use the filter bar and hook instead of manual frontend calculations.

**Tech Stack:** NestJS 11 (TypeORM raw queries), React 19, Vitest (frontend tests), Jest (backend tests)

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `backend/src/common/dto/analytics.dto.ts` | Create | Shared `DateRange` + `GroupByPeriod` enums |
| `backend/src/modules/sales/dto/sales-analytics.dto.ts` | Modify | Import enums from common instead of defining them |
| `backend/src/modules/purchasing/dto/purchasing-analytics.dto.ts` | Create | Query/response DTOs for purchasing dashboard |
| `backend/src/modules/purchasing/services/purchasing-analytics.service.ts` | Modify | Add `getPurchasingAnalytics` method + private helpers |
| `backend/src/modules/purchasing/controllers/purchasing-analytics.controller.ts` | Modify | Add `GET /purchasing/analytics/dashboard` endpoint |
| `frontend/src/pages/purchasing/hooks/usePurchasingAnalytics.ts` | Create | Fetch hook for purchasing analytics endpoint |
| `frontend/src/pages/purchasing/PurchasingPage.tsx` | Modify | Use filter bar + hook, remove frontend calculations |

---

## Task 1: Create shared analytics enums

**Files:**
- Create: `backend/src/common/dto/analytics.dto.ts`
- Modify: `backend/src/modules/sales/dto/sales-analytics.dto.ts`

- [ ] **Step 1: Create the shared enums file**

```typescript
// backend/src/common/dto/analytics.dto.ts
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

export enum GroupByPeriod {
  DAY = 'day',
  WEEK = 'week',
  MONTH = 'month',
  QUARTER = 'quarter',
  YEAR = 'year',
}
```

- [ ] **Step 2: Update `sales-analytics.dto.ts` to import from common**

In `backend/src/modules/sales/dto/sales-analytics.dto.ts`, replace the two enum definitions with imports:

Remove these two enum blocks (the `DateRange` and `GroupByPeriod` definitions), and add at the top of the file:

```typescript
export { DateRange, GroupByPeriod } from '@/common/dto/analytics.dto';
```

The re-export ensures nothing that imports from `sales-analytics.dto.ts` breaks.

- [ ] **Step 3: Verify backend still compiles**

```bash
cd backend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
cd backend
git add src/common/dto/analytics.dto.ts src/modules/sales/dto/sales-analytics.dto.ts
git commit -m "refactor: move DateRange and GroupByPeriod enums to src/common/dto/analytics.dto"
```

---

## Task 2: Create purchasing analytics DTOs

**Files:**
- Create: `backend/src/modules/purchasing/dto/purchasing-analytics.dto.ts`

- [ ] **Step 1: Create the DTO file**

```typescript
// backend/src/modules/purchasing/dto/purchasing-analytics.dto.ts
import { IsOptional, IsEnum, IsIn, IsDate } from 'class-validator';
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
```

- [ ] **Step 2: Verify it compiles**

```bash
cd backend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd backend
git add src/modules/purchasing/dto/purchasing-analytics.dto.ts
git commit -m "feat(purchasing): add PurchasingAnalyticsQueryDto and response DTOs"
```

---

## Task 3: Add `getPurchasingAnalytics` to the service

**Files:**
- Modify: `backend/src/modules/purchasing/services/purchasing-analytics.service.ts`

- [ ] **Step 1: Add imports at the top of the service file**

Add these imports to `purchasing-analytics.service.ts` (after the existing imports):

```typescript
import { differenceInCalendarDays, subDays, subMonths, subYears } from 'date-fns';
import {
  PurchasingAnalyticsQueryDto,
  PurchasingAnalyticsResponseDto,
  PurchasingMetricsDto,
  PurchasingPeriodDataDto,
  PurchasingPeriodBlockDto,
  TopSupplierDto,
  RecentPurchaseOrderDto,
} from '../dto/purchasing-analytics.dto';
import { DateRange, GroupByPeriod } from '@/common/dto/analytics.dto';
```

- [ ] **Step 2: Add the public method and private helpers at the bottom of the class**

Add these methods inside the `PurchasingAnalyticsService` class, before the closing `}`:

```typescript
  async getPurchasingAnalytics(
    query: PurchasingAnalyticsQueryDto,
  ): Promise<PurchasingAnalyticsResponseDto> {
    const { startDate, endDate } = this.parsePurchasingDateRange(
      query.dateRange,
      query.startDate,
      query.endDate,
    );
    const groupBy = query.groupBy ?? GroupByPeriod.MONTH;
    const comparePeriod = query.compareWith
      ? this.computePurchasingComparePeriod(startDate, endDate, query.compareWith)
      : null;

    const [metrics, periodData, topSuppliers, recentOrders] = await Promise.all([
      this.calculatePurchasingMetrics(startDate, endDate),
      this.getPurchasingPeriodData(startDate, endDate, groupBy),
      this.getTopSuppliers(startDate, endDate, 5),
      this.getRecentPurchaseOrders(5),
    ]);

    const current: PurchasingPeriodBlockDto = {
      metrics,
      periodData,
      periodStart: startDate.toISOString().split('T')[0],
      periodEnd: endDate.toISOString().split('T')[0],
    };

    let comparison: PurchasingPeriodBlockDto | undefined;
    if (comparePeriod) {
      const [compareMetrics, comparePeriodData] = await Promise.all([
        this.calculatePurchasingMetrics(comparePeriod.compareStart, comparePeriod.compareEnd),
        this.getPurchasingPeriodData(comparePeriod.compareStart, comparePeriod.compareEnd, groupBy),
      ]);
      comparison = {
        metrics: compareMetrics,
        periodData: comparePeriodData,
        periodStart: comparePeriod.compareStart.toISOString().split('T')[0],
        periodEnd: comparePeriod.compareEnd.toISOString().split('T')[0],
      };
    }

    return { current, comparison, topSuppliers, recentOrders };
  }

  private async calculatePurchasingMetrics(
    startDate: Date,
    endDate: Date,
  ): Promise<PurchasingMetricsDto> {
    const [orderStats, supplierStats] = await Promise.all([
      this.purchaseOrderRepository
        .createQueryBuilder('po')
        .where('po.orderDate BETWEEN :startDate AND :endDate', { startDate, endDate })
        .andWhere('po.deletedAt IS NULL')
        .select([
          'COALESCE(SUM(po.totalAmount), 0) as "totalSpent"',
          'COUNT(*) as "totalOrders"',
          'COALESCE(AVG(po.totalAmount), 0) as "averageOrderValue"',
        ])
        .getRawOne(),
      this.purchaseOrderRepository
        .createQueryBuilder('po')
        .where('po.orderDate BETWEEN :startDate AND :endDate', { startDate, endDate })
        .andWhere('po.deletedAt IS NULL')
        .select('COUNT(DISTINCT po.supplierId) as "activeSuppliers"')
        .getRawOne(),
    ]);

    return {
      totalSpent: parseFloat(orderStats.totalSpent) || 0,
      totalOrders: parseInt(orderStats.totalOrders) || 0,
      averageOrderValue: parseFloat(orderStats.averageOrderValue) || 0,
      activeSuppliers: parseInt(supplierStats.activeSuppliers) || 0,
    };
  }

  private async getPurchasingPeriodData(
    startDate: Date,
    endDate: Date,
    groupBy: string,
  ): Promise<PurchasingPeriodDataDto[]> {
    let dateFormat: string;

    switch (groupBy) {
      case 'day':
        dateFormat = 'YYYY-MM-DD';
        break;
      case 'week':
        dateFormat = 'IYYY-IW';
        break;
      case 'quarter':
        dateFormat = 'YYYY-"Q"Q';
        break;
      case 'year':
        dateFormat = 'YYYY';
        break;
      default: // month
        dateFormat = 'YYYY-MM';
        break;
    }

    const data = await this.purchaseOrderRepository
      .createQueryBuilder('po')
      .where('po.orderDate BETWEEN :startDate AND :endDate', { startDate, endDate })
      .andWhere('po.deletedAt IS NULL')
      .select([
        `TO_CHAR(po.orderDate, '${dateFormat}') as period`,
        'COUNT(*) as orders',
        'COALESCE(SUM(po.totalAmount), 0) as spent',
      ])
      .groupBy(`TO_CHAR(po.orderDate, '${dateFormat}')`)
      .orderBy(`TO_CHAR(po.orderDate, '${dateFormat}')`, 'ASC')
      .getRawMany();

    return data.map((item) => ({
      period: item.period,
      spent: parseFloat(item.spent) || 0,
      orders: parseInt(item.orders) || 0,
    }));
  }

  private async getTopSuppliers(
    startDate: Date,
    endDate: Date,
    limit: number,
  ): Promise<TopSupplierDto[]> {
    const data = await this.purchaseOrderRepository
      .createQueryBuilder('po')
      .leftJoin('po.supplier', 'supplier')
      .where('po.orderDate BETWEEN :startDate AND :endDate', { startDate, endDate })
      .andWhere('po.deletedAt IS NULL')
      .select([
        'supplier.id as "supplierId"',
        'supplier.companyName as "supplierName"',
        'COALESCE(SUM(po.totalAmount), 0) as "totalSpent"',
        'COUNT(*) as "orderCount"',
      ])
      .groupBy('supplier.id')
      .addGroupBy('supplier.companyName')
      .orderBy('"totalSpent"', 'DESC')
      .limit(limit)
      .getRawMany();

    return data.map((item) => ({
      supplierId: item.supplierId,
      supplierName: item.supplierName,
      totalSpent: parseFloat(item.totalSpent) || 0,
      orderCount: parseInt(item.orderCount) || 0,
    }));
  }

  private async getRecentPurchaseOrders(limit: number): Promise<RecentPurchaseOrderDto[]> {
    const orders = await this.purchaseOrderRepository
      .createQueryBuilder('po')
      .leftJoinAndSelect('po.supplier', 'supplier')
      .where('po.deletedAt IS NULL')
      .orderBy('po.orderDate', 'DESC')
      .limit(limit)
      .getMany();

    return orders.map((po) => {
      const date = po.orderDate instanceof Date ? po.orderDate : new Date(po.orderDate);
      return {
        orderNumber: po.orderNumber,
        orderDate: date.toISOString().split('T')[0],
        supplierName: po.supplier?.companyName || 'N/A',
        totalAmount: parseFloat(po.totalAmount?.toString() || '0'),
        status: po.isFullyReceived ? 'received' : 'pending',
      };
    });
  }

  private parsePurchasingDateRange(
    dateRange?: DateRange,
    customStartDate?: Date,
    customEndDate?: Date,
  ): { startDate: Date; endDate: Date } {
    const now = new Date();
    let startDate: Date;
    let endDate: Date = new Date(new Date().setHours(23, 59, 59, 999));

    if (customStartDate && customEndDate) {
      const normalizedStartDate = new Date(customStartDate);
      normalizedStartDate.setUTCHours(0, 0, 0, 0);
      const normalizedEndDate = new Date(customEndDate);
      normalizedEndDate.setUTCHours(23, 59, 59, 999);
      return { startDate: normalizedStartDate, endDate: normalizedEndDate };
    }

    switch (dateRange) {
      case DateRange.TODAY:
        startDate = new Date(now.setHours(0, 0, 0, 0));
        break;
      case DateRange.THIS_WEEK:
        startDate = new Date(now.setDate(now.getDate() - now.getDay()));
        startDate.setHours(0, 0, 0, 0);
        break;
      case DateRange.THIS_MONTH:
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      case DateRange.THIS_QUARTER: {
        const quarter = Math.floor(now.getMonth() / 3);
        startDate = new Date(now.getFullYear(), quarter * 3, 1);
        break;
      }
      case DateRange.THIS_YEAR:
        startDate = new Date(now.getFullYear(), 0, 1);
        break;
      case DateRange.LAST_WEEK:
        startDate = new Date(now.setDate(now.getDate() - now.getDay() - 7));
        startDate.setHours(0, 0, 0, 0);
        endDate = new Date(now.setDate(now.getDate() - now.getDay() - 1));
        endDate.setHours(23, 59, 59, 999);
        break;
      case DateRange.LAST_MONTH:
        startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        endDate = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
        break;
      case DateRange.LAST_QUARTER: {
        const lastQuarter = Math.floor(now.getMonth() / 3) - 1;
        const year = lastQuarter < 0 ? now.getFullYear() - 1 : now.getFullYear();
        const quarterStart = lastQuarter < 0 ? 3 : lastQuarter;
        startDate = new Date(year, quarterStart * 3, 1);
        endDate = new Date(year, quarterStart * 3 + 3, 0, 23, 59, 59, 999);
        break;
      }
      case DateRange.LAST_YEAR:
        startDate = new Date(now.getFullYear() - 1, 0, 1);
        endDate = new Date(now.getFullYear() - 1, 11, 31, 23, 59, 59, 999);
        break;
      default: // THIS_MONTH
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
    }

    return { startDate, endDate };
  }

  private computePurchasingComparePeriod(
    start: Date,
    end: Date,
    compareWith: 'previous_period' | 'last_month' | 'last_year',
  ): { compareStart: Date; compareEnd: Date } {
    if (compareWith === 'previous_period') {
      const dayCount = differenceInCalendarDays(end, start) + 1;
      const compareEnd = subDays(start, 1);
      const compareStart = subDays(compareEnd, dayCount - 1);
      return { compareStart, compareEnd };
    }
    if (compareWith === 'last_month') {
      return { compareStart: subMonths(start, 1), compareEnd: subMonths(end, 1) };
    }
    return { compareStart: subYears(start, 1), compareEnd: subYears(end, 1) };
  }
```

- [ ] **Step 3: Verify it compiles**

```bash
cd backend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
cd backend
git add src/modules/purchasing/services/purchasing-analytics.service.ts
git commit -m "feat(purchasing): add getPurchasingAnalytics service method"
```

---

## Task 4: Add the dashboard endpoint to the controller

**Files:**
- Modify: `backend/src/modules/purchasing/controllers/purchasing-analytics.controller.ts`

- [ ] **Step 1: Add import for the new DTOs**

At the top of `purchasing-analytics.controller.ts`, add to the existing import block:

```typescript
import {
  PurchasingAnalyticsQueryDto,
  PurchasingAnalyticsResponseDto,
} from '../dto/purchasing-analytics.dto';
```

- [ ] **Step 2: Add the endpoint method**

Add this method at the top of the controller class body (before the existing `@Get('purchase-order-summary')` endpoint — NestJS route order matters for specificity):

```typescript
  @Get('dashboard')
  @ApiOperation({ summary: 'Get purchasing analytics for the overview dashboard' })
  @ApiResponse({ status: 200, type: PurchasingAnalyticsResponseDto })
  async getDashboardAnalytics(
    @Query() query: PurchasingAnalyticsQueryDto,
  ): Promise<PurchasingAnalyticsResponseDto> {
    return this.purchasingAnalyticsService.getPurchasingAnalytics(query);
  }
```

- [ ] **Step 3: Verify it compiles**

```bash
cd backend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Run existing purchasing analytics tests**

```bash
cd backend && npx jest src/modules/purchasing --no-coverage
```

Expected: all existing tests pass.

- [ ] **Step 5: Commit**

```bash
cd backend
git add src/modules/purchasing/controllers/purchasing-analytics.controller.ts
git commit -m "feat(purchasing): add GET /purchasing/analytics/dashboard endpoint"
```

---

## Task 5: Create the frontend analytics hook

**Files:**
- Create: `frontend/src/pages/purchasing/hooks/usePurchasingAnalytics.ts`

- [ ] **Step 1: Create the hook file**

```typescript
// frontend/src/pages/purchasing/hooks/usePurchasingAnalytics.ts
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import api from '@/services/api'

export interface PurchasingMetrics {
  totalSpent: number
  totalOrders: number
  averageOrderValue: number
  activeSuppliers: number
}

export interface PurchasingPeriodDataPoint {
  period: string
  spent: number
  orders: number
}

export interface PurchasingPeriodBlock {
  metrics: PurchasingMetrics
  periodData: PurchasingPeriodDataPoint[]
  periodStart: string
  periodEnd: string
}

export interface TopSupplier {
  supplierId: string
  supplierName: string
  totalSpent: number
  orderCount: number
}

export interface RecentPurchaseOrder {
  orderNumber: string
  orderDate: string
  supplierName: string
  totalAmount: number
  status: 'received' | 'pending'
}

export interface PurchasingAnalyticsData {
  current: PurchasingPeriodBlock
  comparison?: PurchasingPeriodBlock
  topSuppliers: TopSupplier[]
  recentOrders: RecentPurchaseOrder[]
}

export interface PurchasingAnalyticsParams {
  dateRange?: string
  startDate?: string
  endDate?: string
  groupBy?: string
  compareWith?: string
}

export function usePurchasingAnalytics(params: PurchasingAnalyticsParams) {
  const [data, setData] = useState<PurchasingAnalyticsData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isFetching, setIsFetching] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const fetchAnalytics = useCallback(async (nextParams: PurchasingAnalyticsParams) => {
    abortRef.current?.abort()

    const controller = new AbortController()
    abortRef.current = controller

    setIsFetching(true)
    setError(null)

    try {
      const response = await api.get('/purchasing/analytics/dashboard', {
        params: Object.fromEntries(Object.entries(nextParams).filter(([, value]) => value !== undefined)),
        signal: controller.signal,
      })
      setData(response.data)
      setIsLoading(false)
    } catch (err: unknown) {
      if ((err as { name?: string }).name === 'AbortError' || (err as { name?: string }).name === 'CanceledError') {
        return
      }
      setError(err instanceof Error ? err : new Error(String(err)))
      setIsLoading(false)
    } finally {
      setIsFetching(false)
    }
  }, [])

  const serializedParams = useMemo(() => JSON.stringify(params), [params])

  useEffect(() => {
    fetchAnalytics(params)
    return () => {
      abortRef.current?.abort()
    }
  }, [fetchAnalytics, params, serializedParams])

  return { data, isLoading, isFetching, error }
}
```

- [ ] **Step 2: Run frontend type check**

```bash
cd frontend && npm run type-check
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd frontend
git add src/pages/purchasing/hooks/usePurchasingAnalytics.ts
git commit -m "feat(purchasing): add usePurchasingAnalytics hook"
```

---

## Task 6: Refactor PurchasingPage to use filter bar and hook

**Files:**
- Modify: `frontend/src/pages/purchasing/PurchasingPage.tsx`

- [ ] **Step 1: Replace the entire file content**

The existing page has inline metric calculations that will be fully replaced. Write the new file:

```tsx
import React from 'react'
import {
  Box,
  Typography,
  Paper,
  Grid,
  Card,
  CardContent,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  Alert,
  Button,
  useTheme,
} from '@mui/material'
import {
  Assignment as PurchasingIcon,
  LocalShipping as SuppliersIcon,
  Inventory2 as GRNIcon,
  Payment as PaymentsIcon,
  TrendingUp as TrendingUpIcon,
  TrendingDown as TrendingDownIcon,
} from '@mui/icons-material'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
} from 'chart.js'
import { Line } from 'react-chartjs-2'
import { formatCurrency, formatDate } from '@/utils/formatters'
import { TYPOGRAPHY_STYLES, TABLE_STYLES } from '@/constants/typography'
import { useNavigate } from 'react-router-dom'
import PageHeader from '@/components/common/PageHeader'
import { DashboardFilterBar } from '@/components/dashboard/DashboardFilterBar'
import { useDashboardFilters } from '@/hooks/useDashboardFilters'
import { usePurchasingAnalytics } from './hooks/usePurchasingAnalytics'

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
)

const PurchasingPage: React.FC = () => {
  const theme = useTheme()
  const navigate = useNavigate()

  const {
    period,
    compareWith,
    customFrom,
    customTo,
    setPeriod,
    setCompare,
    setCustomRange,
    setCustomFrom,
    setCustomTo,
    reset,
    isDefault,
    resolvedApiParams,
  } = useDashboardFilters('purchasing')

  const { data, isLoading, isFetching, error } = usePurchasingAnalytics(resolvedApiParams)

  const current = data?.current
  const comparison = data?.comparison
  const topSuppliers = data?.topSuppliers ?? []
  const recentOrders = data?.recentOrders ?? []

  const stats = [
    {
      title: 'Total Spending',
      value: formatCurrency(current?.metrics.totalSpent ?? 0),
      icon: PurchasingIcon,
      color: 'warning',
      currentValue: current?.metrics.totalSpent,
      comparisonValue: comparison?.metrics.totalSpent,
    },
    {
      title: 'Purchase Orders',
      value: String(current?.metrics.totalOrders ?? 0),
      icon: GRNIcon,
      color: 'info',
      currentValue: current?.metrics.totalOrders,
      comparisonValue: comparison?.metrics.totalOrders,
    },
    {
      title: 'Active Suppliers',
      value: String(current?.metrics.activeSuppliers ?? 0),
      icon: SuppliersIcon,
      color: 'secondary',
      currentValue: current?.metrics.activeSuppliers,
      comparisonValue: comparison?.metrics.activeSuppliers,
    },
    {
      title: 'Avg Order Value',
      value: formatCurrency(current?.metrics.averageOrderValue ?? 0),
      icon: PaymentsIcon,
      color: 'success',
      currentValue: current?.metrics.averageOrderValue,
      comparisonValue: comparison?.metrics.averageOrderValue,
    },
  ]

  const purchasingTrendData = {
    labels: current?.periodData.map((item) => item.period) ?? [],
    datasets: [
      {
        label: 'Spending',
        data: current?.periodData.map((item) => item.spent) ?? [],
        borderColor: theme.palette.warning.main,
        backgroundColor: `${theme.palette.warning.main}20`,
        tension: 0.4,
      },
      ...(comparison
        ? [
            {
              label: 'Comparison',
              data: comparison.periodData.map((item) => item.spent),
              borderColor: theme.palette.grey[400],
              backgroundColor: `${theme.palette.grey[400]}20`,
              borderDash: [4, 4],
              tension: 0.4,
            },
          ]
        : []),
    ],
  }

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'top' as const },
    },
    scales: {
      y: {
        beginAtZero: true,
        ticks: {
          callback: function (value: any) {
            return formatCurrency(value)
          },
        },
      },
    },
  }

  const getDeltaPercent = (current?: number, previous?: number): number | null => {
    if (current === undefined || previous === undefined || previous === 0) return null
    return ((current - previous) / previous) * 100
  }

  return (
    <Box sx={{ p: 3 }}>
      <PageHeader
        variant="overview"
        title="Purchasing Overview"
        subtitle="Monitor purchasing activities and manage supplier relationships"
        primaryAction={{ label: 'Create Purchase Order', onClick: () => navigate('/purchasing/orders/create') }}
      />

      <DashboardFilterBar
        period={period}
        compareWith={compareWith}
        customFrom={customFrom}
        customTo={customTo}
        isFetching={isFetching}
        isDefault={isDefault}
        onPeriodChange={setPeriod}
        onCompareChange={setCompare}
        onCustomRangeChange={setCustomRange}
        onCustomFromChange={setCustomFrom}
        onCustomToChange={setCustomTo}
        onReset={reset}
      />

      {error && (
        <Alert
          severity="error"
          sx={{ mb: 2 }}
          action={<Button size="small" onClick={() => window.location.reload()}>Retry</Button>}
        >
          Failed to load dashboard data.
        </Alert>
      )}

      <Box sx={{ opacity: isFetching ? 0.7 : 1, transition: 'opacity 0.2s' }}>
        {/* Stats Cards */}
        <Grid container spacing={3} sx={{ mb: 4 }}>
          {stats.map((stat, index) => {
            const delta = getDeltaPercent(stat.currentValue, stat.comparisonValue)
            return (
              <Grid key={index} size={{ xs: 12, sm: 6, lg: 3 }}>
                <Card>
                  <CardContent>
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                      <Box
                        sx={{
                          p: 1.5,
                          borderRadius: 2,
                          bgcolor: `${stat.color}.light`,
                          color: `${stat.color}.contrastText`,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <stat.icon />
                      </Box>
                      {delta !== null && (
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                          {delta >= 0 ? (
                            <TrendingUpIcon sx={{ fontSize: 16, color: 'success.main' }} />
                          ) : (
                            <TrendingDownIcon sx={{ fontSize: 16, color: 'error.main' }} />
                          )}
                          <Typography
                            variant={TYPOGRAPHY_STYLES.tableCell.caption.variant}
                            sx={{
                              color: delta >= 0 ? 'success.main' : 'error.main',
                              fontWeight: TYPOGRAPHY_STYLES.tableCell.primary.fontWeight,
                              fontSize: TYPOGRAPHY_STYLES.tableCell.caption.fontSize,
                            }}
                          >
                            {delta > 0 ? '+' : ''}{delta.toFixed(1)}%
                          </Typography>
                        </Box>
                      )}
                    </Box>
                    <Typography
                      variant={TYPOGRAPHY_STYLES.pageHeader.variant}
                      sx={{ fontWeight: TYPOGRAPHY_STYLES.pageHeader.fontWeight, mb: 0.5 }}
                    >
                      {isLoading ? '—' : stat.value}
                    </Typography>
                    <Typography variant={TYPOGRAPHY_STYLES.tableCell.secondary.variant} color="text.secondary">
                      {stat.title}
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
            )
          })}
        </Grid>

        {/* Charts and Analytics */}
        <Grid container spacing={3} sx={{ mb: 4 }}>
          <Grid size={{ xs: 12, lg: 8 }}>
            <Paper sx={{ p: 3, height: 400 }}>
              <Typography
                variant={TYPOGRAPHY_STYLES.tableHeader.variant}
                sx={{ fontWeight: TYPOGRAPHY_STYLES.tableHeader.fontWeight, mb: 3 }}
              >
                Purchasing Trend
              </Typography>
              <Box sx={{ height: 300 }}>
                <Line data={purchasingTrendData} options={chartOptions} />
              </Box>
            </Paper>
          </Grid>

          <Grid size={{ xs: 12, lg: 4 }}>
            <Paper sx={{ p: 3 }}>
              <Typography
                variant={TYPOGRAPHY_STYLES.tableHeader.variant}
                sx={{ fontWeight: TYPOGRAPHY_STYLES.tableHeader.fontWeight, mb: 3 }}
              >
                Top Suppliers
              </Typography>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {topSuppliers.length > 0 ? (
                  topSuppliers.map((supplier, index) => (
                    <Box key={supplier.supplierId}>
                      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Typography
                            variant="h6"
                            sx={{
                              width: 24,
                              height: 24,
                              borderRadius: '50%',
                              bgcolor: index === 0 ? 'warning.main' : index === 1 ? 'secondary.main' : 'grey.400',
                              color: 'white',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: TYPOGRAPHY_STYLES.tableCell.caption.fontSize,
                              fontWeight: TYPOGRAPHY_STYLES.tableCell.primary.fontWeight,
                            }}
                          >
                            {index + 1}
                          </Typography>
                          <Box>
                            <Typography
                              variant={TYPOGRAPHY_STYLES.tableCell.primary.variant}
                              sx={{ fontSize: TYPOGRAPHY_STYLES.tableCell.primary.fontSize }}
                            >
                              {supplier.supplierName}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              {supplier.orderCount} orders
                            </Typography>
                          </Box>
                        </Box>
                        <Typography variant="body2" color="warning">
                          {formatCurrency(supplier.totalSpent)}
                        </Typography>
                      </Box>
                    </Box>
                  ))
                ) : (
                  <Typography
                    variant={TYPOGRAPHY_STYLES.tableCell.secondary.variant}
                    color="text.secondary"
                    align="center"
                  >
                    No supplier data available
                  </Typography>
                )}
              </Box>
            </Paper>
          </Grid>
        </Grid>

        {/* Recent Orders */}
        <Grid container spacing={3}>
          <Grid size={12}>
            <Paper sx={{ overflow: 'hidden' }}>
              <Box sx={{ p: 3, borderBottom: 1, borderColor: 'divider' }}>
                <Typography
                  variant={TYPOGRAPHY_STYLES.tableHeader.variant}
                  sx={{ fontWeight: TYPOGRAPHY_STYLES.tableHeader.fontWeight }}
                >
                  Recent Purchase Orders
                </Typography>
              </Box>
              <TableContainer>
                <Table size={TABLE_STYLES.size}>
                  <TableHead>
                    <TableRow
                      sx={{
                        '& .MuiTableCell-head': {
                          fontWeight: TYPOGRAPHY_STYLES.tableHeader.fontWeight,
                          backgroundColor: TABLE_STYLES.header.backgroundColor,
                          py: TABLE_STYLES.header.padding.py,
                        },
                      }}
                    >
                      {['PO Number', 'Supplier', 'PO Date', 'Amount', 'Status'].map((heading) => (
                        <TableCell key={heading} align={heading === 'Amount' ? 'right' : 'left'}>
                          <Typography
                            variant={TYPOGRAPHY_STYLES.tableHeader.variant}
                            sx={{
                              fontWeight: TYPOGRAPHY_STYLES.tableHeader.fontWeight,
                              color: TYPOGRAPHY_STYLES.tableHeader.color,
                              fontSize: TYPOGRAPHY_STYLES.tableHeader.fontSize,
                            }}
                          >
                            {heading}
                          </Typography>
                        </TableCell>
                      ))}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {recentOrders.length > 0 ? (
                      recentOrders.map((order) => (
                        <TableRow
                          key={order.orderNumber}
                          hover
                          sx={{
                            cursor: 'pointer',
                            '& .MuiTableCell-root': {
                              borderBottom: TABLE_STYLES.cell.border,
                              py: TABLE_STYLES.cell.padding.py,
                              px: TABLE_STYLES.cell.padding.px,
                            },
                            height: TABLE_STYLES.row.height,
                          }}
                          onClick={() => navigate(`/purchasing/orders?poNumber=${order.orderNumber}`)}
                        >
                          <TableCell>
                            <Typography
                              variant={TYPOGRAPHY_STYLES.tableCell.primary.variant}
                              sx={{ fontSize: TYPOGRAPHY_STYLES.tableCell.primary.fontSize }}
                            >
                              {order.orderNumber}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            <Typography
                              variant={TYPOGRAPHY_STYLES.tableCell.primary.variant}
                              sx={{ fontSize: TYPOGRAPHY_STYLES.tableCell.primary.fontSize }}
                            >
                              {order.supplierName}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            <Typography
                              variant={TYPOGRAPHY_STYLES.tableCell.secondary.variant}
                              sx={{ fontSize: TYPOGRAPHY_STYLES.tableCell.secondary.fontSize }}
                            >
                              {formatDate(order.orderDate)}
                            </Typography>
                          </TableCell>
                          <TableCell align="right">
                            <Typography
                              variant={TYPOGRAPHY_STYLES.tableCell.primary.variant}
                              color="warning"
                              sx={{ fontSize: TYPOGRAPHY_STYLES.tableCell.primary.fontSize }}
                            >
                              {formatCurrency(order.totalAmount)}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            <Chip
                              label={order.status === 'received' ? 'Received' : 'Pending'}
                              color={order.status === 'received' ? 'success' : 'warning'}
                              size="small"
                              variant="outlined"
                              sx={{
                                fontSize: TYPOGRAPHY_STYLES.chip.small.fontSize,
                                fontWeight: TYPOGRAPHY_STYLES.chip.small.fontWeight,
                                height: TYPOGRAPHY_STYLES.chip.small.height,
                              }}
                            />
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={5} align="center">
                          <Typography variant={TYPOGRAPHY_STYLES.tableCell.secondary.variant} color="text.secondary">
                            No recent purchase orders
                          </Typography>
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
            </Paper>
          </Grid>
        </Grid>
      </Box>
    </Box>
  )
}

export default PurchasingPage
```

- [ ] **Step 2: Run frontend type check**

```bash
cd frontend && npm run type-check
```

Expected: no errors.

- [ ] **Step 3: Run frontend tests**

```bash
cd frontend && npm run test -- --run
```

Expected: all tests pass (no purchasing page tests currently exist, so this is a sanity check that nothing broke).

- [ ] **Step 4: Commit**

```bash
cd frontend
git add src/pages/purchasing/PurchasingPage.tsx
git commit -m "feat(purchasing): integrate DashboardFilterBar and usePurchasingAnalytics hook"
```

---

## Self-Review

**Spec coverage check:**
- ✅ Part 1 (shared enums) → Task 1
- ✅ Part 2 (DTOs) → Task 2
- ✅ Part 3 (service method + helpers) → Task 3
- ✅ Part 4 (controller endpoint) → Task 4
- ✅ Part 5 (frontend hook) → Task 5
- ✅ Part 6 (page refactor: filter bar, stats, chart with comparison, top suppliers, recent orders) → Task 6
- ✅ Active suppliers = distinct suppliers with PO in period → Task 3 `calculatePurchasingMetrics`
- ✅ Comparison block includes `periodData` for chart → Task 3 `getPurchasingAnalytics`

**Placeholder scan:** None found.

**Type consistency:**
- `PurchasingPeriodBlock` used in hook types matches `PurchasingPeriodBlockDto` shape from service
- `TopSupplier` / `RecentPurchaseOrder` in frontend hook match `TopSupplierDto` / `RecentPurchaseOrderDto` backend shapes
- `getDeltaPercent` helper uses `currentValue`/`comparisonValue` — both defined on every stat object ✅
