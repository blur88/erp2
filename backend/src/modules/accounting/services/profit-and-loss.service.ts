import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ChartOfAccount } from '../entities/chart-of-account.entity';
import { JournalEntryLine } from '../entities/journal-entry-line.entity';
import { AccountBalanceService } from './account-balance.service';
import { AccountingSettingsService } from './accounting-settings.service';
import { classify, assembleSections } from './profit-and-loss.classify';
import { formatScale4, toMinorUnits } from '@/common/utils/money';
import type {
  AccountMovement, PlAccount, PlSection, ProfitAndLossResponse,
} from './profit-and-loss.types';

const INVENTORY_ADJUSTMENTS_ROW_ID = 'cogs.adjustments';

@Injectable()
export class ProfitAndLossService {
  constructor(
    @InjectRepository(ChartOfAccount) private readonly coaRepo: Repository<ChartOfAccount>,
    @InjectRepository(JournalEntryLine) private readonly lineRepo: Repository<JournalEntryLine>,
    private readonly balance: AccountBalanceService,
    private readonly settings: AccountingSettingsService,
  ) {}

  /**
   * Gross Profit = Revenue - (Cost of Sales + Inventory Adjustments)
   * Net Profit   = Gross Profit + Other Income - Total Expenses
   *
   * Adjustments carry their sign: a decrease (stock lost) is a cost, an
   * increase (stock found) reduces cost.
   */
  computeTotals(
    sections: PlSection[],
    inventoryAdjustments: bigint,
  ): { totalCostOfSales: bigint; grossProfit: bigint; netProfit: bigint } {
    const totalOf = (key: string) => {
      const s = sections.find((x) => x.key === key);
      return s ? toMinorUnits(s.total) : 0n;
    };
    // Returned, not just used internally: the COGS section's own total omits
    // adjustments, so displaying it would contradict Gross Profit.
    const totalCostOfSales = totalOf('cogs') + inventoryAdjustments;
    const grossProfit = totalOf('revenue') - totalCostOfSales;
    const netProfit = grossProfit + totalOf('otherIncome') - totalOf('expenses');
    return { totalCostOfSales, grossProfit, netProfit };
  }

  /**
   * Per-account period movement, split by whether the entry is
   * STOCK_ADJUSTMENT-sourced. ONE query with FILTER, not two: deriving both
   * halves from a single pass is what stops the split drifting (spec §6).
   */
  private async getMovements(from: string, to: string): Promise<Map<string, {
    ordinaryRaw: bigint; adjustmentRaw: bigint;
  }>> {
    const rows = await this.lineRepo.createQueryBuilder('l')
      .innerJoin('journal_entry', 'e', 'e.id = l."entryId"')
      .select('l."accountId"', 'accountId')
      .addSelect(`COALESCE(SUM(l.debit) FILTER (WHERE e."sourceType" <> 'STOCK_ADJUSTMENT'),0)`, 'ordDebit')
      .addSelect(`COALESCE(SUM(l.credit) FILTER (WHERE e."sourceType" <> 'STOCK_ADJUSTMENT'),0)`, 'ordCredit')
      .addSelect(`COALESCE(SUM(l.debit) FILTER (WHERE e."sourceType" = 'STOCK_ADJUSTMENT'),0)`, 'adjDebit')
      .addSelect(`COALESCE(SUM(l.credit) FILTER (WHERE e."sourceType" = 'STOCK_ADJUSTMENT'),0)`, 'adjCredit')
      .where('l."deletedAt" IS NULL')
      .andWhere('e."deletedAt" IS NULL')
      .andWhere('e."entryDate" >= :from', { from })
      .andWhere('e."entryDate" <= :to', { to })
      .groupBy('l."accountId"')
      .getRawMany<{
        accountId: string; ordDebit: string; ordCredit: string;
        adjDebit: string; adjCredit: string;
      }>();

    const map = new Map<string, { ordinaryRaw: bigint; adjustmentRaw: bigint }>();
    for (const r of rows) {
      map.set(r.accountId, {
        ordinaryRaw: toMinorUnits(r.ordDebit) - toMinorUnits(r.ordCredit),
        adjustmentRaw: toMinorUnits(r.adjDebit) - toMinorUnits(r.adjCredit),
      });
    }
    return map;
  }

  /** Earliest posted year through the current year, newest first (spec §3). */
  private async getAvailableYears(): Promise<number[]> {
    const row = await this.lineRepo.createQueryBuilder('l')
      .innerJoin('journal_entry', 'e', 'e.id = l."entryId"')
      .select('MIN(e."entryDate")', 'earliest')
      .where('l."deletedAt" IS NULL')
      .andWhere('e."deletedAt" IS NULL')
      .getRawOne<{ earliest: string | null }>();

    const currentYear = new Date().getFullYear();
    const earliestYear = row?.earliest
      ? new Date(row.earliest).getFullYear()
      : currentYear;
    const from = Math.min(earliestYear, currentYear);

    const years: number[] = [];
    for (let y = currentYear; y >= from; y--) years.push(y);
    return years;
  }

  async getProfitAndLoss(params: { year: number }): Promise<ProfitAndLossResponse> {
    const from = `${params.year}-01-01`;
    const to = `${params.year}-12-31`;

    const [accountEntities, movementMap, availableYears, settings] = await Promise.all([
      this.coaRepo.find({ order: { code: 'ASC' } }),
      this.getMovements(from, to),
      this.getAvailableYears(),
      this.settings.get(),
    ]);

    const accounts: PlAccount[] = accountEntities.map((a) => ({
      id: a.id, code: a.code, name: a.name, type: a.type as string,
      parentId: a.parentId, isPostable: a.isPostable,
    }));
    const typeById = new Map(accounts.map((a) => [a.id, a.type]));

    // Raw debit-minus-credit -> natural balance, so Income and Expense both
    // read positive when normal (same convention as GL and Trial Balance).
    const movements: AccountMovement[] = [...movementMap.entries()].map(
      ([accountId, raw]) => {
        const type = typeById.get(accountId);
        const natural = (v: bigint) =>
          type ? this.balance.naturalBalance(type as any, v) : v;
        return {
          accountId,
          ordinary: natural(raw.ordinaryRaw),
          stockAdjustment: natural(raw.adjustmentRaw),
        };
      },
    );

    const result = classify({
      accounts,
      movements,
      salesRevenueAccountId: (settings as any)?.salesRevenueAccountId ?? null,
      cogsAccountId: (settings as any)?.cogsAccountId ?? null,
    });

    const sections = assembleSections(accounts, result.assignments);
    const { totalCostOfSales, grossProfit, netProfit } =
      this.computeTotals(sections, result.inventoryAdjustments);

    // Independent tie-out (spec §2): sum Income and Expense SEPARATELY and
    // subtract. naturalBalance returns positive for both families, so adding
    // them would add profit to costs.
    let incomeSum = 0n;
    let expenseSum = 0n;
    for (const m of movements) {
      const type = typeById.get(m.accountId);
      const whole = m.ordinary + m.stockAdjustment;
      if (type === 'Income') incomeSum += whole;
      else if (type === 'Expense') expenseSum += whole;
    }
    const independentNetProfit = incomeSum - expenseSum;

    return {
      year: params.year,
      availableYears,
      sections,
      inventoryAdjustments: formatScale4(result.inventoryAdjustments),
      inventoryAdjustmentsRowId: INVENTORY_ADJUSTMENTS_ROW_ID,
      totalCostOfSales: formatScale4(totalCostOfSales),
      totalCostOfSalesRowId: 'cogs.total',
      grossProfit: formatScale4(grossProfit),
      netProfit: formatScale4(netProfit),
      integrity: {
        anomalies: result.anomalies,
        structuralFaults: result.structuralFaults,
        tieOutOk: independentNetProfit === netProfit,
        independentNetProfit: formatScale4(independentNetProfit),
      },
    };
  }
}
