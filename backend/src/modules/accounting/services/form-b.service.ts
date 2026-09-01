import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ChartOfAccount } from '../entities/chart-of-account.entity';
import { JournalEntryLine } from '../entities/journal-entry-line.entity';
import { AccountBalanceService } from './account-balance.service';
import { AccountingSettingsService } from './accounting-settings.service';
import { ProfitAndLossService } from './profit-and-loss.service';
import { SettingsService } from '../../settings/settings.service';
import { toMinorUnits, formatScale4 } from '@/common/utils/money';
import { classifyFormB } from './form-b.classify';
import {
  FORM_B_LINES,
  FORM_VERSION,
  EXPENSE_CATEGORY_LINE,
  INCOME_CATEGORY_LINE,
} from './form-b.categories';
import { detectCycles, detectDanglingParents } from './profit-and-loss.graph';
import type { PlAccount, PlIntegrity } from './profit-and-loss.types';
import type {
  Amount,
  FormBRow,
  FormBFinding,
  FormBFindingAccount,
  FormBResponse,
  FormBReconciliation,
  FormBIdentityField,
} from './form-b.types';

export type RootStatus =
  | { ok: true; id: string }
  | { ok: false; kind: 'missing' }
  | { ok: false; kind: 'invalid'; detail: 'notFound' | 'wrongType' | 'dangling' | 'cyclic' };

@Injectable()
export class FormBService {
  constructor(
    @InjectRepository(ChartOfAccount) private readonly coaRepo: Repository<ChartOfAccount>,
    @InjectRepository(JournalEntryLine) private readonly lineRepo: Repository<JournalEntryLine>,
    private readonly balance: AccountBalanceService,
    private readonly settings: AccountingSettingsService,
    private readonly accountingReport: ProfitAndLossService,
    private readonly companySettings: SettingsService,
  ) {}

  /**
   * A configured root must be proven sound BEFORE it is used, because
   * getRollup() walks children recursively with no visited set
   * (account-balance.service.ts:40): a cyclic subtree is unbounded recursion,
   * and a dangling or wrong-type root would yield a confidently wrong number.
   *
   * `missing` and `invalid` are kept distinct: the first is an unfinished setup
   * the user completes, the second means the chart itself is malformed.
   */
  validateRoot(input: {
    id: string | null;
    expectedType: string;
    accounts: PlAccount[];
    cyclicIds: ReadonlySet<string>;
    danglingIds: ReadonlySet<string>;
  }): RootStatus {
    const { id, expectedType, accounts, cyclicIds, danglingIds } = input;
    if (id === null) return { ok: false, kind: 'missing' };

    const root = accounts.find((a) => a.id === id);
    if (!root) return { ok: false, kind: 'invalid', detail: 'notFound' };
    if (root.type !== expectedType) return { ok: false, kind: 'invalid', detail: 'wrongType' };

    // Walk the subtree with an explicit visited set — the traversal that checks
    // for a cycle must itself terminate on one.
    const childrenOf = new Map<string, string[]>();
    for (const a of accounts) {
      if (a.parentId === null) continue;
      const siblings = childrenOf.get(a.parentId);
      if (siblings) siblings.push(a.id);
      else childrenOf.set(a.parentId, [a.id]);
    }

    const seen = new Set<string>();
    const stack = [id];
    let sawCycle = false;
    let sawDangling = false;
    while (stack.length > 0) {
      const current = stack.pop()!;
      if (seen.has(current)) continue;
      seen.add(current);
      if (cyclicIds.has(current)) sawCycle = true;
      if (danglingIds.has(current)) sawDangling = true;
      for (const child of childrenOf.get(current) ?? []) stack.push(child);
    }

    // Cycle wins: it is the fault that makes traversal itself unsafe.
    if (sawCycle) return { ok: false, kind: 'invalid', detail: 'cyclic' };
    if (sawDangling) return { ok: false, kind: 'invalid', detail: 'dangling' };
    return { ok: true, id };
  }

  /** Every account id in a subtree, cycle-safe. */
  subtreeIds(rootId: string, accounts: PlAccount[]): Set<string> {
    const childrenOf = new Map<string, string[]>();
    for (const a of accounts) {
      if (a.parentId === null) continue;
      const siblings = childrenOf.get(a.parentId);
      if (siblings) siblings.push(a.id);
      else childrenOf.set(a.parentId, [a.id]);
    }
    const ids = new Set<string>();
    const stack = [rootId];
    while (stack.length > 0) {
      const current = stack.pop()!;
      if (ids.has(current)) continue;
      ids.add(current);
      for (const child of childrenOf.get(current) ?? []) stack.push(child);
    }
    return ids;
  }

  /**
   * N5 — retail purchases: net Inventory-subtree movement for the year from
   * PURCHASE_ORDER-sourced entries. Debits minus credits, so PURCHASE_RECEIVE
   * adds and PURCHASE_REFUND subtracts.
   *
   * ONE query with FILTER, following getMovements()'s pattern, so the two
   * directions cannot drift apart.
   */
  async getInventoryPurchases(
    from: string, to: string, inventoryIds: Set<string>,
  ): Promise<bigint> {
    if (inventoryIds.size === 0) return 0n;
    const row = await this.lineRepo.createQueryBuilder('l')
      .innerJoin('journal_entry', 'e', 'e.id = l."entryId"')
      .select('COALESCE(SUM(l.debit),0)', 'debit')
      .addSelect('COALESCE(SUM(l.credit),0)', 'credit')
      .where('l."deletedAt" IS NULL')
      .andWhere('e."deletedAt" IS NULL')
      .andWhere('e."entryDate" >= :from', { from })
      .andWhere('e."entryDate" <= :to', { to })
      .andWhere(`e."sourceType" = 'PURCHASE_ORDER'`)
      .andWhere('l."accountId" IN (:...ids)', { ids: [...inventoryIds] })
      .getRawOne<{ debit: string; credit: string }>();
    return toMinorUnits(row?.debit ?? '0') - toMinorUnits(row?.credit ?? '0');
  }

  /**
   * Reconciliation term (c) — measured on the INVENTORY leg: credits minus
   * debits, so outflow is positive and the term is directly comparable to N7.
   *
   * Not the Owner Drawings subtree. (c) is a partition of N7, so it must be
   * measured the way N7 is. The postingType filter excludes cash drawings,
   * which share sourceType OWNER_EQUITY but never touch Inventory.
   */
  async getOwnerStockDrawings(
    from: string, to: string, inventoryIds: Set<string>,
  ): Promise<bigint> {
    if (inventoryIds.size === 0) return 0n;
    const row = await this.lineRepo.createQueryBuilder('l')
      .innerJoin('journal_entry', 'e', 'e.id = l."entryId"')
      .select('COALESCE(SUM(l.debit),0)', 'debit')
      .addSelect('COALESCE(SUM(l.credit),0)', 'credit')
      .where('l."deletedAt" IS NULL')
      .andWhere('e."deletedAt" IS NULL')
      .andWhere('e."entryDate" >= :from', { from })
      .andWhere('e."entryDate" <= :to', { to })
      .andWhere(`e."sourceType" = 'OWNER_EQUITY'`)
      .andWhere(`e."postingType" = 'OWNER_STOCK_DRAWING'`)
      .andWhere('l."accountId" IN (:...ids)', { ids: [...inventoryIds] })
      .getRawOne<{ debit: string; credit: string }>();
    return toMinorUnits(row?.credit ?? '0') - toMinorUnits(row?.debit ?? '0');
  }

  /**
   * Per-account ordinary movement for the year, natural balance. Mirrors
   * ProfitAndLossService.getMovements()'s split so the two reports agree on
   * what "ordinary" means.
   */
  private async getMovements(from: string, to: string): Promise<Map<string, bigint>> {
    const rows = await this.lineRepo.createQueryBuilder('l')
      .innerJoin('journal_entry', 'e', 'e.id = l."entryId"')
      .select('l."accountId"', 'accountId')
      .addSelect(`COALESCE(SUM(l.debit) FILTER (WHERE e."sourceType" <> 'STOCK_ADJUSTMENT'),0)`, 'debit')
      .addSelect(`COALESCE(SUM(l.credit) FILTER (WHERE e."sourceType" <> 'STOCK_ADJUSTMENT'),0)`, 'credit')
      .where('l."deletedAt" IS NULL')
      .andWhere('e."deletedAt" IS NULL')
      .andWhere('e."entryDate" >= :from', { from })
      .andWhere('e."entryDate" <= :to', { to })
      .groupBy('l."accountId"')
      .getRawMany<{ accountId: string; debit: string; credit: string }>();

    const map = new Map<string, bigint>();
    for (const r of rows) {
      map.set(r.accountId, toMinorUnits(r.debit) - toMinorUnits(r.credit));
    }
    return map;
  }

  /**
   * Form B business identity (N1, N1a) read from Company Settings.
   *
   * There is deliberately no Form B-specific override: business name and
   * registration number are company identity that happens to be printed on a
   * tax form, so a second writable copy would drift from what the rest of the
   * system shows. Editing them means editing /settings/company.
   *
   * Company Settings is authoritative and taken at face value. Whatever is
   * configured there is the business identity for the filing — including the
   * placeholders SettingsService seeds on first run. The report does not
   * second-guess the configured value.
   *
   * Only a genuinely empty (or whitespace-only) value reads as absent and
   * raises MISSING_BUSINESS_IDENTITY.
   */
  private async resolveIdentity(): Promise<FormBResponse['identity']> {
    const company = await this.companySettings.getCompanySettings();
    const field = (value: string | null | undefined): FormBIdentityField => {
      // Company Settings is taken at face value: whatever is configured there
      // IS the business identity, seeded placeholders included. Only a genuinely
      // empty value reads as absent.
      const trimmed = typeof value === 'string' ? value.trim() : '';
      return trimmed === ''
        ? { value: null, source: null }
        : { value: trimmed, source: 'companySettings' };
    };
    return {
      businessName: field((company as any)?.name),
      registrationNumber: field((company as any)?.registrationNumber),
    };
  }

  async getFormB(params: { year: number }): Promise<FormBResponse> {
    const { year } = params;
    const from = `${year}-01-01`;
    const to = `${year}-12-31`;

    const [accountEntities, rawMovements, settings, accountingView, identity] =
      await Promise.all([
        this.coaRepo.find({ order: { code: 'ASC' } }),
        this.getMovements(from, to),
        this.settings.get(),
        this.accountingReport.getProfitAndLoss({ year }),
        this.resolveIdentity(),
      ]);

    const accounts: PlAccount[] = accountEntities.map((a: any) => ({
      id: a.id, code: a.code, name: a.name, type: a.type as string,
      parentId: a.parentId, isPostable: a.isPostable,
    }));
    const byId = new Map(accounts.map((a) => [a.id, a]));
    const graph = new Map(accounts.map((a) => [a.id, { id: a.id, parentId: a.parentId }]));
    const cyclicIds = new Set(detectCycles([...graph.values()]));
    const danglingIds = new Set(detectDanglingParents([...graph.values()]));

    const findings: FormBFinding[] = [];
    const describe = (id: string): FormBFindingAccount => {
      const a = byId.get(id);
      return { accountId: id, code: a?.code ?? '(unknown)', name: a?.name ?? '(unknown)' };
    };

    // --- configured roots, validated BEFORE any rollup ---
    const roots = {
      inventory: this.validateRoot({
        id: (settings as any).inventoryAccountId ?? null, expectedType: 'Asset',
        accounts, cyclicIds, danglingIds,
      }),
      revenue: this.validateRoot({
        id: (settings as any).salesRevenueAccountId ?? null, expectedType: 'Income',
        accounts, cyclicIds, danglingIds,
      }),
      cogs: this.validateRoot({
        id: (settings as any).cogsAccountId ?? null, expectedType: 'Expense',
        accounts, cyclicIds, danglingIds,
      }),
    };

    for (const [key, settingKey] of [
      ['inventory', 'inventoryAccountId'],
      ['revenue', 'salesRevenueAccountId'],
      ['cogs', 'cogsAccountId'],
    ] as const) {
      const status = roots[key];
      if (status.ok) continue;
      const id = (settings as any)[settingKey] as string | null;
      findings.push((status as any).kind === 'missing'
        ? {
            code: 'MISSING_CONFIGURED_ROOT', severity: 'incomplete',
            message: `${settingKey} is not configured. Rows derived from it are unavailable.`,
            accounts: [], settingKey,
          }
        : {
            code: 'INVALID_CONFIGURED_ROOT', severity: 'integrity',
            message: `${settingKey} is ${(status as any).detail}. Rows derived from it are unavailable until the chart is repaired.`,
            accounts: id === null ? [] : [describe(id)], settingKey,
          });
    }

    // --- N4, N5, N6, N7 (Inventory root only) ---
    let n4: bigint | null = null;
    let n5: bigint | null = null;
    let n6: bigint | null = null;
    let n7: bigint | null = null;
    let ownerStockDrawings: bigint | null = null;

    if (roots.inventory.ok) {
      const invIds = this.subtreeIds(roots.inventory.id, accounts);
      const [priorLeaf, closingLeaf, purchases, drawings] = await Promise.all([
        this.balance.getLeafBalances(`${year - 1}-12-31`),
        this.balance.getLeafBalances(to),
        this.getInventoryPurchases(from, to, invIds),
        this.getOwnerStockDrawings(from, to, invIds),
      ]);
      n4 = this.balance.getRollup(roots.inventory.id, priorLeaf, accounts);
      n6 = this.balance.getRollup(roots.inventory.id, closingLeaf, accounts);
      n5 = purchases;
      n7 = n4 + n5 - n6;
      ownerStockDrawings = drawings;
    }

    // --- N3 (Sales Revenue root only) ---
    const naturalOf = (accountId: string): bigint => {
      const raw = rawMovements.get(accountId) ?? 0n;
      const type = byId.get(accountId)?.type;
      return type ? this.balance.naturalBalance(type as any, raw) : raw;
    };

    let n3: bigint | null = null;
    if (roots.revenue.ok) {
      const revIds = this.subtreeIds(roots.revenue.id, accounts);
      n3 = 0n;
      for (const id of revIds) n3 += naturalOf(id);
    }

    // --- classification (needs BOTH excluded roots to be sound) ---
    const canClassifyIncome = roots.revenue.ok;
    const canClassifyExpense = roots.cogs.ok;

    const classified = classifyFormB({
      accounts: accountEntities.map((a: any) => ({
        id: a.id, code: a.code, name: a.name, type: a.type as string,
        isPostable: a.isPostable, isActive: a.isActive, parentId: a.parentId,
        formBExpenseCategory: a.formBExpenseCategory ?? null,
        formBIncomeCategory: a.formBIncomeCategory ?? null,
      })),
      movements: [...rawMovements.keys()].map((accountId) => ({
        accountId, ordinary: naturalOf(accountId), stockAdjustment: 0n,
      })),
      graph,
      cogsAccountId: roots.cogs.ok ? roots.cogs.id : null,
      salesRevenueAccountId: roots.revenue.ok ? roots.revenue.id : null,
      cyclicIds, danglingIds,
    });

    for (const bad of classified.ineligible) {
      findings.push({
        code: 'MAPPED_ACCOUNT_INELIGIBLE', severity: 'integrity',
        message: `${bad.code} ${bad.name} carries a Form B mapping but is not eligible (${bad.reason}); its movement was excluded.`,
        accounts: [bad], settingKey: null,
      });
    }

    // --- rows ---
    const sumOf = (line: string): bigint =>
      (classified.byLine.get(line) ?? []).reduce((t, r) => t + toMinorUnits(r.amount), 0n);

    const incomeLines = Object.values(INCOME_CATEGORY_LINE);
    const expenseLines = Object.values(EXPENSE_CATEGORY_LINE);

    const n14 = canClassifyIncome
      ? incomeLines.reduce((t, l) => t + sumOf(l), 0n) : null;
    const n25 = canClassifyExpense
      ? expenseLines.reduce((t, l) => t + sumOf(l), 0n) : null;
    const n8 = n3 !== null && n7 !== null ? n3 - n7 : null;
    const n26 = n8 !== null && n14 !== null && n25 !== null ? n8 + n14 - n25 : null;

    const fmt = (v: bigint | null): Amount => (v === null ? null : formatScale4(v));

    const amountFor = (line: string): Amount => {
      switch (line) {
        case 'N3': return fmt(n3);
        case 'N4': return fmt(n4);
        case 'N5': return fmt(n5);
        case 'N6': return fmt(n6);
        case 'N7': return fmt(n7);
        case 'N8': return fmt(n8);
        case 'N14': return fmt(n14);
        case 'N25': return fmt(n25);
        case 'N26': return fmt(n26);
        case 'N27': return null;
        default:
          if (incomeLines.includes(line)) return canClassifyIncome ? fmt(sumOf(line)) : null;
          if (expenseLines.includes(line)) return canClassifyExpense ? fmt(sumOf(line)) : null;
          return null;
      }
    };

    const rows: FormBRow[] = FORM_B_LINES.map((def) => {
      const contributors = classified.byLine.get(def.line) ?? [];
      const isMapped = def.kind === 'mappedExpense' || def.kind === 'mappedIncome';
      const usable = def.kind === 'mappedIncome' ? canClassifyIncome
        : def.kind === 'mappedExpense' ? canClassifyExpense : true;

      const row: FormBRow = {
        line: def.line,
        label: def.label,
        formula: def.formula,
        amount: amountFor(def.line),
        accounts: isMapped && usable ? contributors : [],
        cohorts: null,
      };

      // N24 / N13 carry their cohorts split so the UI can label them.
      if (def.line === 'N24' || def.line === 'N13') {
        row.cohorts = isMapped && usable
          ? {
              explicit: contributors.filter((c) => c.assignment === 'explicit'),
              fallback: contributors.filter((c) => c.assignment === 'fallback'),
            }
          : { explicit: [], fallback: [] };
      }

      // N5 alone carries the retail marker: production cost is never computed,
      // stored, or defaulted to zero.
      if (def.line === 'N5') row.productionCost = null;

      if (def.line === 'N27') {
        row.derived = false;
        row.status = 'requiresFilerInput';
      }

      return row;
    });

    // --- reconciliation (spec §5.3) ---
    // (b) depends on NEITHER configured root, so it is never nulled by a root
    // fault. (a) depends on the COGS root; n7 and (c) on the Inventory root.
    const a: bigint | null = roots.cogs.ok
      ? toMinorUnits(accountingView.totalCostOfSales) : null;
    const b: bigint = toMinorUnits(accountingView.inventoryAdjustments);
    const residual: bigint | null =
      n7 !== null && a !== null && ownerStockDrawings !== null
        ? n7 - (a + ownerStockDrawings)
        : null;

    const reconciliation: FormBReconciliation = {
      n7: fmt(n7),
      accountingTotalCostOfSales: fmt(a),
      inventoryAdjustments: fmt(b),
      ownerStockDrawings: fmt(ownerStockDrawings),
      residual: fmt(residual),
    };

    if (residual !== null && residual !== 0n) {
      findings.push({
        code: 'UNEXPLAINED_INVENTORY_RESIDUAL', severity: 'integrity',
        message: `Inventory movement of ${formatScale4(residual)} is not explained by cost of sales, adjustments or stock drawings.`,
        accounts: [], settingKey: null,
      });
    }

    // --- remaining findings ---
    /*
     * FORM_VERSION is a MINIMUM supported version, not an exact match.
     *
     * The Bahagian N field set (N3-N27) carries forward unchanged, so the YA
     * 2025 layout applies to 2025 and every later year; warning on those would
     * be permanent noise on a report that is in fact correct. Only a year
     * EARLIER than the encoded version is suspect, because that layout predates
     * the one verified here.
     */
    if (year < FORM_VERSION) {
      findings.push({
        code: 'FORM_VERSION_MISMATCH', severity: 'incomplete',
        message: `Presented using the Form B YA ${FORM_VERSION} taxonomy, which is the earliest version this report supports. The ${year} form may differ.`,
        accounts: [], settingKey: null,
      });
    }

    findings.push({
      code: 'DISALLOWED_EXPENSES_UNDETERMINED', severity: 'incomplete',
      message: 'N27 Disallowed Expenses is not derived from the ledger and must be determined by the filer (Form B worksheet F1).',
      accounts: [], settingKey: null,
    });

    const missingIdentity = (Object.entries(identity) as [string, FormBIdentityField][])
      .filter(([, f]) => f.value === null)
      .map(([k]) => k);
    if (missingIdentity.length > 0) {
      findings.push({
        code: 'MISSING_BUSINESS_IDENTITY', severity: 'incomplete',
        message: `Business information is incomplete: ${missingIdentity.join(', ')}. Set it in Company Settings.`,
        accounts: [], settingKey: 'companySettings',
      });
    }

    // Fallback warnings: non-zero movement only, so a year closed before an
    // account existed does not nag.
    /*
     * Only warn about a fallback when its line actually exists. With the COGS
     * root unavailable, N15-N25 are null (§5.6), so "these accounts are filed
     * under N24" would point at a row rendered as an em dash — telling the user
     * to fix a classification that is not being applied, and burying the
     * MISSING/INVALID_CONFIGURED_ROOT finding that is the real problem.
     */
    if (canClassifyExpense && classified.fallbackExpense.length > 0) {
      findings.push({
        code: 'UNMAPPED_EXPENSE_ACCOUNTS', severity: 'warning',
        message: `${classified.fallbackExpense.length} expense account(s) have no Form B category and are filed under N24 Other Expenses.`,
        accounts: classified.fallbackExpense.map((r) => describe(r.accountId)),
        settingKey: null,
      });
    }
    if (canClassifyIncome && classified.fallbackIncome.length > 0) {
      findings.push({
        code: 'UNMAPPED_INCOME_ACCOUNTS', severity: 'warning',
        message: `${classified.fallbackIncome.length} income account(s) have no Form B category and are filed under N13 Other Income.`,
        accounts: classified.fallbackIncome.map((r) => describe(r.accountId)),
        settingKey: null,
      });
    }

    findings.push(...this.relayAccountingIntegrity(accountingView, findings, describe));

    const counts = {
      warning: findings.filter((f) => f.severity === 'warning').length,
      incomplete: findings.filter((f) => f.severity === 'incomplete').length,
      integrity: findings.filter((f) => f.severity === 'integrity').length,
    };

    return {
      year,
      formVersion: FORM_VERSION,
      availableYears: accountingView.availableYears,
      identity,
      rows,
      reconciliation,
      findings,
      readiness: {
        hasWarnings: counts.warning > 0,
        hasIncomplete: counts.incomplete > 0,
        hasIntegrity: counts.integrity > 0,
        counts,
      },
    };
  }

  /**
   * Surface the Accounting View's own integrity findings rather than swallowing
   * them: this report is built on those numbers, so a fault there is a fault
   * here.
   *
   * structuralFaults gets its OWN code. PlIntegrity keeps it separate from
   * anomalies (profit-and-loss.types.ts:81) because the two mean different
   * things — an anomaly is money dropped or double-counted, a structural fault
   * ties out CLEANLY and is still wrong. Folding them together would let a
   * fault hide behind a passing tie-out.
   *
   * Deduplication: §5.6.1 validates the same configured roots the Accounting
   * View does, so one broken setting would otherwise raise two findings and
   * inflate readiness.counts. Form B's own finding wins — it names the setting
   * the user edits and carries the validation detail.
   */
  private relayAccountingIntegrity(
    view: { integrity: PlIntegrity },
    existing: FormBFinding[],
    describe: (id: string) => FormBFindingAccount,
  ): FormBFinding[] {
    const out: FormBFinding[] = [];
    const integrity = view.integrity;

    if (!integrity.tieOutOk) {
      out.push({
        code: 'ACCOUNTING_VIEW_TIE_OUT_FAILED', severity: 'integrity',
        message: `The Accounting View does not tie out (independent net profit ${integrity.independentNetProfit}). Form B figures derive from it and may be wrong.`,
        accounts: [], settingKey: null,
      });
    }

    if (integrity.anomalies.length > 0) {
      out.push({
        code: 'ACCOUNTING_VIEW_ANOMALIES', severity: 'integrity',
        message: `The Accounting View reports ${integrity.anomalies.length} assignment anomal${integrity.anomalies.length === 1 ? 'y' : 'ies'}.`,
        accounts: integrity.anomalies.map((a) => describe(a.accountId)),
        settingKey: null,
      });
    }

    // Defects Form B already reported, by the two keys a fault can carry.
    const reportedSettings = new Set(
      existing
        .filter((f) => f.code === 'MISSING_CONFIGURED_ROOT' || f.code === 'INVALID_CONFIGURED_ROOT')
        .map((f) => f.settingKey)
        .filter((k): k is string => k !== null),
    );
    const reportedAccounts = new Set(
      existing
        .filter((f) => f.code === 'MISSING_CONFIGURED_ROOT' || f.code === 'INVALID_CONFIGURED_ROOT')
        .flatMap((f) => f.accounts.map((a) => a.accountId)),
    );
    // A root fault is reported with settingKey but no accounts, so also treat
    // the configured root ids themselves as already-reported.
    for (const f of existing) {
      if (f.code !== 'INVALID_CONFIGURED_ROOT' && f.code !== 'MISSING_CONFIGURED_ROOT') continue;
      if (f.settingKey !== null) reportedSettings.add(f.settingKey);
    }

    const novel = integrity.structuralFaults.filter((fault) => {
      if (fault.settingKey !== null && reportedSettings.has(fault.settingKey)) return false;
      if (fault.accounts.some((a) => reportedAccounts.has(a.accountId))) return false;
      return true;
    });

    if (novel.length > 0) {
      out.push({
        code: 'ACCOUNTING_VIEW_STRUCTURAL_FAULTS', severity: 'integrity',
        message: `The Accounting View reports ${novel.length} structural fault(s) in the chart of accounts: ${novel.map((f) => f.kind).join(', ')}.`,
        accounts: novel.flatMap((f) => f.accounts.map((a) => ({
          accountId: a.accountId, code: a.code, name: a.name,
        }))),
        settingKey: novel.find((f) => f.settingKey !== null)?.settingKey ?? null,
      });
    }

    return out;
  }
}
