// balance-sheet.service.ts
import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ChartOfAccount } from '../entities/chart-of-account.entity';
import { AccountBalanceService } from './account-balance.service';
import { AccountingSettingsService } from './accounting-settings.service';
import { ProfitAndLossService } from './profit-and-loss.service';
import { SettingsService } from '../../settings/settings.service';
import { getAppToday } from '@/common/utils/app-calendar';
import { toMinorUnits } from '@/common/utils/money';
import { assembleBalanceSheet, type AssembleAccount } from './balance-sheet.assemble';
import { SETTINGS_KEY_LINE } from './balance-sheet.lines';
import type {
  BalanceSheetAccountRef, BalanceSheetFinding, BalanceSheetResponse,
} from './balance-sheet.types';

@Injectable()
export class BalanceSheetService {
  constructor(
    @InjectRepository(ChartOfAccount) private readonly coaRepo: Repository<ChartOfAccount>,
    private readonly balance: AccountBalanceService,
    private readonly settings: AccountingSettingsService,
    private readonly pl: ProfitAndLossService,
    private readonly appSettings: SettingsService,
  ) {}

  async getBalanceSheet(params: { year: number }): Promise<BalanceSheetResponse> {
    // Contextual validation lives HERE, not in the DTO: a class-validator
    // constraint is synchronous with no database access, so it cannot read
    // Regional Settings. Enforcing the bound against the same business date the
    // report computes with is what stops validation and computation disagreeing
    // about what "this year" means.
    const businessToday = await getAppToday(this.appSettings);
    const currentYear = Number(businessToday.slice(0, 4));
    if (params.year > currentYear) {
      throw new BadRequestException(
        `Balance Sheet is not available for the future year ${params.year}.`,
      );
    }

    const yearEnd = `${params.year}-12-31`;
    const asOfDate = businessToday < yearEnd ? businessToday : yearEnd;
    const preYearDate = `${params.year - 1}-12-31`;

    const [accountEntities, atDate, preYear, acctSettings, plResult] = await Promise.all([
      this.coaRepo.find({ order: { code: 'ASC' } }),
      this.balance.getLeafBalances(asOfDate),
      this.balance.getLeafBalances(preYearDate),
      this.settings.get(),
      // The SAME cutoff, so N48 and the asset rows are bounded identically.
      this.pl.getProfitAndLoss({ year: params.year, to: asOfDate }),
    ]);

    const accounts: AssembleAccount[] = accountEntities.map((a: any) => ({
      id: a.id, code: a.code, name: a.name, type: a.type as string, isPostable: a.isPostable,
    }));

    const integrity = (plResult as any).integrity ?? {};
    const structuralFaults = integrity.structuralFaults ?? [];
    const anomalies = integrity.anomalies ?? [];
    const tieOutOk = integrity.tieOutOk !== false;

    // Integrity is evaluated PER PERIOD. N47 is a raw type-sum with no tie-out
    // of its own, so only the shared COA graph can invalidate it; a
    // selected-year tie-out failure leaves it standing.
    const hasFaults = structuralFaults.length > 0;
    const priorProfitValid = !hasFaults;
    const netProfit = hasFaults || !tieOutOk ? null : toMinorUnits(plResult.netProfit);

    // Carry account identities through from the P&L integrity block. A finding
    // that says "the chart of accounts has faults" without naming the accounts
    // is not actionable, and the identities are already available here — an
    // empty array would be discarding them, not respecting a limit.
    // BalanceSheetAccountRef carries NO amount: a faulted account's
    // contribution is exactly what is undefined.
    const byIdForFindings = new Map(accounts.map((a) => [a.id, a]));
    const toRefs = (items: unknown[]): BalanceSheetAccountRef[] => {
      const refs: BalanceSheetAccountRef[] = [];
      for (const item of items) {
        const id = (item as any)?.accountId ?? (item as any)?.id ?? null;
        if (typeof id !== 'string') continue;
        const a = byIdForFindings.get(id);
        refs.push({
          accountId: id,
          code: a?.code ?? (item as any)?.code ?? '',
          name: a?.name ?? (item as any)?.name ?? '',
        });
      }
      return refs;
    };

    const profitFindings: BalanceSheetFinding[] = [];
    if (hasFaults) {
      const faultRefs = toRefs(structuralFaults);
      // Emitted for BOTH scopes: a broken account graph invalidates the
      // prior-period type-sum and the selected-year classified profit alike, and
      // the spec's per-period rule nulls N47 and N48 together on faults. One
      // 'selectedYear' finding would leave a consumer filtering by scope unable
      // to see why N47 went null.
      for (const scope of ['priorPeriod', 'selectedYear'] as const) {
        profitFindings.push({
          code: 'PROFIT_STRUCTURAL_FAULTS', severity: 'integrity', scope,
          affectedLines: scope === 'priorPeriod' ? ['N47', 'N50'] : ['N48', 'N50'],
          message:
            'The chart of accounts has structural faults, so ' +
            (scope === 'priorPeriod' ? 'the brought-forward balance' : 'selected-year profit') +
            ' cannot be determined.',
          accounts: faultRefs,
        });
      }
    }
    if (!tieOutOk) {
      profitFindings.push({
        code: 'PROFIT_TIE_OUT_FAILED', severity: 'integrity', scope: 'selectedYear',
        affectedLines: ['N48', 'N50'],
        message: 'Two independent profit computations disagree for the selected year.',
        accounts: [],
      });
    }
    if (anomalies.length > 0) {
      profitFindings.push({
        code: 'PROFIT_ANOMALIES', severity: 'warning', scope: 'selectedYear',
        affectedLines: ['N48'],
        message: `${anomalies.length} account classification anomaly(ies) were detected.`,
        accounts: toRefs(anomalies),
      });
    }

    const settingsAccountIds: Record<string, string | null> = {};
    for (const key of Object.keys(SETTINGS_KEY_LINE)) {
      settingsAccountIds[key] = (acctSettings as any)?.[key] ?? null;
    }

    const { rows, balanceCheck, findings } = assembleBalanceSheet({
      accounts,
      atDate,
      preYear,
      settingsAccountIds,
      openingBalanceEquityAccountId:
        (acctSettings as any)?.openingBalanceEquityAccountId ?? null,
      netProfit,
      priorProfitValid,
      profitFindings,
    });

    return {
      year: params.year,
      asOfDate,
      availableYears: plResult.availableYears,
      rows,
      balanceCheck,
      findings,
    };
  }
}
