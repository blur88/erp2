import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { EntityManager, SelectQueryBuilder } from 'typeorm';
import { SalesOrderPayment } from '../../../database/entities/sales-order-payment.entity';
import { ProviderSettlement, ProviderSettlementStatus } from '../entities/provider-settlement.entity';
import { PostingType, AccountingSourceType } from '../../../common/accounting-posting/enums';
import { AccountingLookupService } from '../../accounting/services/accounting-lookup.service';
import { ProviderSettlementDerivationService } from './provider-settlement-derivation.service';
import { derivedClearingAccountSql } from './derived-clearing-account.sql';
import { ChartOfAccount } from '../../accounting/entities/chart-of-account.entity';
import {
  EligiblePayment, groupKey, groupPayments, classifyClaimedGroup, withProviderClearing, ClaimedRowState,
} from './settlement-groups';
import { formatScale4, sumMinor } from '../../../common/utils/money';

export interface EligibilityScope { settlementDate: string; settlementId?: string }
export interface SettlementPaymentDetail {
  id: string; paymentDate: string; amount: string; referenceNumber: string | null;
}
export interface EligibleSettlementRow {
  salesOrderId: string; orderNumber: string;
  paymentMethodId: string; paymentMethodName: string;
  netAmount: string; payments: SettlementPaymentDetail[];
}
export interface EligibleRowsParams extends EligibilityScope {
  search?: string; page?: number; limit?: number; salesOrderIds?: string[];
}
export interface ClaimedSettlementRow {
  salesOrderId: string; orderNumber: string;
  paymentMethodId: string; paymentMethodName: string;
  savedNetAmount: string; currentNetAmount: string | null;
  savedPayments: SettlementPaymentDetail[]; currentPayments: SettlementPaymentDetail[];
  state: ClaimedRowState;
}

@Injectable()
export class ProviderSettlementEligibilityService {
  constructor(
    @InjectEntityManager() private readonly defaultManager: EntityManager,
    private readonly lookup: AccountingLookupService,
    private readonly derivation: ProviderSettlementDerivationService,
  ) {}

  /** SQL-derived clearing account per payment (#1285). Absent ⇒ TS derivation rejects it. */
  async derivedClearingAccounts(paymentIds: string[], manager: EntityManager): Promise<Map<string, string>> {
    if (paymentIds.length === 0) return new Map();
    const deposit = await this.lookup.resolveAccount('customerDeposit', manager);
    const args: unknown[] = [];
    const bind = (v: unknown) => { args.push(v); return `$${args.length}`; };
    const source = `(SELECT id, "salesOrderId", amount FROM sales_order_payments
                       WHERE id = ANY(${bind(paymentIds)}::uuid[]))`;
    const rows: Array<{ paymentId: string; clearingAccountId: string }> =
      await manager.query(derivedClearingAccountSql(source, bind, deposit.id), args);
    return new Map(rows.map((r) => [r.paymentId, r.clearingAccountId]));
  }

  /**
   * The claim predicate is BRANCHED, never parameterized.
   *
   * Writing only the with-id form and binding NULL when no id is supplied is a
   * silent, total failure: `l."settlementId" <> NULL` evaluates to NULL, never
   * TRUE, so the subquery matches nothing, NOT EXISTS is vacuously true, and
   * EVERY already-claimed row appears eligible. Duplicate selection would then
   * surface only as a 409 at save time, on rows the UI had just offered.
   */
  private applyClaimFilter(qb: any, settlementId?: string): void {
    if (settlementId) {
      qb.andWhere(
        `NOT EXISTS (SELECT 1 FROM provider_settlement_lines l
           WHERE l."salesOrderPaymentId" = p.id
             AND l."releasedAt" IS NULL
             AND l."settlementId" <> :settlementId)`,
        { settlementId },
      );
    } else {
      qb.andWhere(
        `NOT EXISTS (SELECT 1 FROM provider_settlement_lines l
           WHERE l."salesOrderPaymentId" = p.id
             AND l."releasedAt" IS NULL)`,
      );
    }
  }

  /**
   * THE payment-eligibility rule set (spec §4.1), shared by listing, save and
   * post so the date cutoff and claim rules cannot drift between them. It has NO
   * mapping filter and NO HAVING: post must see a group that a new refund has
   * brought to zero, and a draft whose method became unmapped must still post.
   */
  private paymentEligibilityQuery(
    manager: EntityManager,
    scope: EligibilityScope,
  ): SelectQueryBuilder<SalesOrderPayment> {
    const qb = manager
      .getRepository(SalesOrderPayment)
      .createQueryBuilder('p')
      .innerJoin('sales_orders', 'so', 'so.id = p."salesOrderId"')
      .where('p."paymentDate" <= :settlementDate', { settlementDate: scope.settlementDate });
    this.applyClaimFilter(qb, scope.settlementId);
    qb.andWhere(
      `EXISTS (SELECT 1 FROM journal_entry je
         WHERE je."sourceEventId" = p.id
           AND je."sourceType" = :soType
           AND je."sourceDocumentId" = p."salesOrderId"
           AND je."postingType"::text = CASE WHEN p.amount < 0 THEN :refundType ELSE :paymentType END
           AND je."reversalOfEntryId" IS NULL
           AND NOT EXISTS (
             SELECT 1 FROM journal_entry rev WHERE rev."reversalOfEntryId" = je.id))`,
      {
        soType: AccountingSourceType.SALES_ORDER,
        refundType: PostingType.SALES_REFUND,
        paymentType: PostingType.SALES_PAYMENT,
      },
    );
    return qb;
  }

  private static readonly PAYMENT_COLUMNS = [
    'p.id AS id',
    'p."salesOrderId" AS "salesOrderId"',
    'p."paymentMethodId" AS "paymentMethodId"',
    'p."paymentDate" AS "paymentDate"',
    'p.amount AS amount',
    'p."referenceNumber" AS "referenceNumber"',
  ];

  /** Raw eligible payments for whole orders — callers group them. */
  async eligiblePaymentsForOrders(
    salesOrderIds: string[],
    scope: EligibilityScope,
    manager: EntityManager,
  ): Promise<EligiblePayment[]> {
    if (salesOrderIds.length === 0) return [];
    const rows = await this.paymentEligibilityQuery(manager, scope)
      .andWhere('p."salesOrderId" IN (:...salesOrderIds)', { salesOrderIds })
      .select(ProviderSettlementEligibilityService.PAYMENT_COLUMNS)
      .orderBy('p."paymentDate"', 'ASC')
      .addOrderBy('p.id', 'ASC')
      .getRawMany();
    return rows as EligiblePayment[];
  }

  /**
   * Count, group keys and payment details are read inside ONE REPEATABLE READ
   * snapshot. Separate autocommit reads could straddle a refund commit and
   * return a group whose net (read first) disagrees with its details (read
   * second). Inside the snapshot every statement sees the same data, and the
   * returned netAmount is additionally DERIVED from the details, so the two
   * cannot disagree by construction.
   */
  async listEligibleRows(params: EligibleRowsParams): Promise<{
    data: EligibleSettlementRow[];
    meta: { total: number; page: number; limit: number };
  }> {
    return this.defaultManager.transaction('REPEATABLE READ', (m) => this.listEligibleRowsIn(m, params));
  }

  private async listEligibleRowsIn(m: EntityManager, params: EligibleRowsParams): Promise<{
    data: EligibleSettlementRow[];
    meta: { total: number; page: number; limit: number };
  }> {
    if (params.settlementId) await this.assertOwnDraft(params.settlementId, m);

    // Embed the shared builder as a CTE so grouping sits ON TOP of it, never
    // inside it. TypeORM emits $1..$n; our own parameters continue from n+1.
    const [eligibleSql, eligibleParams] = this.paymentEligibilityQuery(m, params)
      .select(ProviderSettlementEligibilityService.PAYMENT_COLUMNS)
      .getQueryAndParameters();
    const args: unknown[] = [...eligibleParams];
    const bind = (v: unknown) => { args.push(v); return `$${args.length}`; };

    const deposit = await this.lookup.resolveAccount('customerDeposit', m);
    const derivedSql = derivedClearingAccountSql('eligible', bind, deposit.id);

    const filters: string[] = [];
    if (params.salesOrderIds?.length) {
      filters.push(`g."salesOrderId" = ANY(${bind(params.salesOrderIds)}::uuid[])`);
    }
    // Search selects whole GROUPS (spec §4.2): the predicate filters group keys,
    // never the payment rows being summed, so a non-matching refund still
    // counts toward a matching group's net. The per-group reference match is an
    // aggregate below, never a correlated subquery.
    let refMatch = 'false';
    if (params.search) {
      const q = bind(`%${params.search}%`);
      refMatch = `bool_or(e."referenceNumber" ILIKE ${q})`;
      filters.push(`(so."orderNumber" ILIKE ${q} OR g."refMatch")`);
    }

    // Journal gate (spec §6): EVERY eligible payment of the group derives (by the
    // SQL mirror of the TS derivation) to ONE flagged, live account. This gate
    // alone decides which methods appear. The method's live mapping is deliberately
    // not consulted (#1288), so payments recorded to a clearing account stay listed
    // after their provider is remapped, unmapped or made invalid. It already
    // excludes cash and bank payments, which derive to unflagged accounts.
    //
    // Evaluated as ONE aggregate per group (#1288): correlated subqueries over the
    // CTEs rescanned them once per group, which is quadratic. Both joins are LEFT
    // on purpose, so every payment row stays in its group: a payment with no
    // derivation (d is NULL), or one deriving to a soft-deleted or unflagged
    // account (a is NULL or unflagged), makes bool_and FALSE and rejects the whole
    // group. An inner join would drop that row and let the remainder qualify.
    // `derived` holds at most one row per payment, so the joins never duplicate
    // amounts in the SUM.
    const groupsSql = `
      WITH eligible AS (${eligibleSql}),
      derived AS (${derivedSql}),
      grouped AS (
        SELECT e."salesOrderId", e."paymentMethodId", SUM(e.amount) AS "netAmount",
               ${refMatch} AS "refMatch"
          FROM eligible e
          LEFT JOIN derived d ON d."paymentId" = e.id
          LEFT JOIN chart_of_account a ON a.id = d."clearingAccountId" AND a."deletedAt" IS NULL
         GROUP BY e."salesOrderId", e."paymentMethodId"
        HAVING SUM(e.amount) <> 0
           AND bool_and(a."isProviderClearing" IS TRUE)
           AND count(DISTINCT d."clearingAccountId") = 1
      )
      SELECT g."salesOrderId", g."paymentMethodId", g."netAmount"::text AS "netAmount",
             so."orderNumber", pm.name AS "paymentMethodName"
        FROM grouped g
        JOIN sales_orders so ON so.id = g."salesOrderId"
        JOIN payment_methods pm ON pm.id = g."paymentMethodId"
       ${filters.length ? `WHERE ${filters.join(' AND ')}` : ''}`;

    const [{ total }] = await m.query(
      `SELECT count(*)::int AS total FROM (${groupsSql}) t`, args,
    );

    const unpaginated = Boolean(params.salesOrderIds?.length) || !(params.page && params.limit);
    let pageSql = `${groupsSql} ORDER BY so."orderNumber" ASC, pm.name ASC, g."paymentMethodId" ASC`;
    const pageArgs = [...args];
    if (!unpaginated) {
      pageArgs.push(params.limit, (params.page! - 1) * params.limit!);
      pageSql += ` LIMIT $${pageArgs.length - 1} OFFSET $${pageArgs.length}`;
    }
    const groups: Array<Omit<EligibleSettlementRow, 'payments'>> = await m.query(pageSql, pageArgs);

    const payments = await this.eligiblePaymentsForOrders(
      [...new Set(groups.map((g) => g.salesOrderId))], params, m,
    );
    const byGroup = groupPayments(payments);
    const data = groups.map((g) => {
      const details = byGroup.get(groupKey(g)) ?? [];
      return {
        ...g,
        // Derived from the details returned alongside it — never the separately
        // read SQL sum — so a row can never show a net its payments don't add to.
        netAmount: formatScale4(sumMinor(details.map((d) => d.amount))),
        payments: details.map(({ id, paymentDate, amount, referenceNumber }) => ({
          id, paymentDate, amount: formatScale4(amount), referenceNumber,
        })),
      };
    });
    return {
      data,
      meta: {
        total,
        page: unpaginated ? 1 : params.page!,
        limit: unpaginated ? total : params.limit!,
      },
    };
  }

  /**
   * Built from the draft's LINES, not from eligibility (spec §4.2): a group the
   * draft touches must surface even if it now nets to zero or its payments have
   * dropped out, so the form can say why the draft changed.
   */
  async listClaimedRows(settlementId: string, settlementDate: string): Promise<{ data: ClaimedSettlementRow[] }> {
    // Same single-snapshot rule as listEligibleRows: the saved lines and the
    // current eligibility they are classified against must be one point in time,
    // or a refund committing between the two reads misclassifies the group.
    return this.defaultManager.transaction('REPEATABLE READ', (m) =>
      this.listClaimedRowsIn(m, settlementId, settlementDate),
    );
  }

  private async listClaimedRowsIn(
    m: EntityManager, settlementId: string, settlementDate: string,
  ): Promise<{ data: ClaimedSettlementRow[] }> {
    await this.assertOwnDraft(settlementId, m);
    const saved: Array<SettlementPaymentDetail & { salesOrderId: string; paymentMethodId: string; orderNumber: string; paymentMethodName: string }> =
      await m.query(
        `SELECT p.id, p."salesOrderId", p."paymentMethodId", p."paymentDate",
                l.amount::text AS amount, p."referenceNumber",
                so."orderNumber", pm.name AS "paymentMethodName"
           FROM provider_settlement_lines l
           JOIN sales_order_payments p ON p.id = l."salesOrderPaymentId"
           JOIN sales_orders so ON so.id = p."salesOrderId"
           JOIN payment_methods pm ON pm.id = p."paymentMethodId"
          WHERE l."settlementId" = $1 AND l."releasedAt" IS NULL
          ORDER BY so."orderNumber", pm.name, p."paymentDate", p.id`,
        [settlementId],
      );
    const current = await this.eligiblePaymentsForOrders(
      [...new Set(saved.map((s) => s.salesOrderId))], { settlementDate, settlementId }, m,
    );
    const currentByGroup = groupPayments(current);
    const detail = ({ id, paymentDate, amount, referenceNumber }: SettlementPaymentDetail) =>
      ({ id, paymentDate, amount: formatScale4(amount), referenceNumber });

    const data: ClaimedSettlementRow[] = [];
    for (const [key, savedRows] of groupPayments(saved)) {
      const cur = currentByGroup.get(key) ?? [];
      const first = savedRows[0];
      // Classify FIRST. An ineligible group (no current eligible payments) is
      // preserved and never reclassified (spec §8), so it must not pay for — or be
      // affected by — a derivation at all.
      const base = classifyClaimedGroup(savedRows, cur);
      const state = base === 'ineligible'
        ? base
        : withProviderClearing(base, await this.deriveSaved(savedRows, m));
      data.push({
        salesOrderId: first.salesOrderId,
        orderNumber: first.orderNumber,
        paymentMethodId: first.paymentMethodId,
        paymentMethodName: first.paymentMethodName,
        savedNetAmount: formatScale4(sumMinor(savedRows.map((r) => r.amount))),
        currentNetAmount: cur.length ? formatScale4(sumMinor(cur.map((r) => r.amount))) : null,
        savedPayments: savedRows.map(detail),
        currentPayments: cur.map(detail),
        state,
      });
    }
    return { data };
  }

  /** TS derivation (authoritative) over the group's SAVED lines; a 400 means "failed", never "unflagged". */
  private async deriveSaved(
    saved: Array<{ id: string; salesOrderId: string; amount: string }>, m: EntityManager,
  ): Promise<{ ok: true; flagged: boolean } | { ok: false }> {
    let accountId: string;
    try {
      accountId = await this.derivation.deriveClearingAccountId(
        saved.map(({ id, salesOrderId, amount }) => ({ id, salesOrderId, amount })), m,
      );
    } catch (err) {
      if (err instanceof BadRequestException) return { ok: false };
      throw err;
    }
    const account = await m.getRepository(ChartOfAccount).findOne({ where: { id: accountId } as any });
    return { ok: true, flagged: Boolean(account?.isProviderClearing) };
  }

  async assertOwnDraft(settlementId: string, manager: EntityManager = this.defaultManager): Promise<ProviderSettlement> {
    const settlement = await manager.getRepository(ProviderSettlement).findOne({ where: { id: settlementId } as any });
    if (!settlement) throw new NotFoundException('Settlement not found');
    if (settlement.status !== ProviderSettlementStatus.DRAFT) {
      throw new BadRequestException('Only a draft settlement can widen eligibility');
    }
    return settlement;
  }
}
