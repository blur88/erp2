import {
  Injectable,
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { EntityManager, SelectQueryBuilder } from 'typeorm';
import { SalesOrderPayment } from '../../../database/entities/sales-order-payment.entity';
import { ProviderSettlement, ProviderSettlementStatus } from '../entities/provider-settlement.entity';
import { PostingType, AccountingSourceType } from '../../../common/accounting-posting/enums';
import { PaymentMethodMappingService } from '../../accounting/services/payment-method-mapping.service';
import { EligiblePayment, groupKey, groupPayments, classifyClaimedGroup, ClaimedRowState } from './settlement-groups';
import { formatScale4, sumMinor } from '../../../common/utils/money';

export interface EligiblePaymentRow {
  id: string;
  salesOrderId: string;
  orderNumber: string;
  paymentDate: string;
  amount: string;
  referenceNumber: string | null;
}

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
    private readonly mappingService: PaymentMethodMappingService,
  ) {}

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

  private baseQuery(
    manager: EntityManager,
    params: { providerPaymentMethodId: string; settlementDate: string; settlementId?: string },
  ) {
    const qb = manager
      .getRepository(SalesOrderPayment)
      .createQueryBuilder('p')
      .innerJoin('sales_orders', 'so', 'so.id = p."salesOrderId"')
      .where('p."paymentMethodId" = :methodId', {
        methodId: params.providerPaymentMethodId,
      });

    qb.andWhere('p."paymentDate" <= :settlementDate', {
      settlementDate: params.settlementDate,
    });

    this.applyClaimFilter(qb, params.settlementId);

    // The original posting must exist and not be reversed. Constrain on the
    // FULL key — sourceEventId alone is a bare uuid match across every source
    // type.
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

  /** `mapped` methods, plus the draft's stored method (spec §4.5). */
  private async allowedMethodIds(
    draft: Pick<ProviderSettlement, 'providerPaymentMethodId'> | undefined,
    manager?: EntityManager,
  ): Promise<string[]> {
    const rows = await this.mappingService.list(manager);
    const ids = new Set(rows.filter((r) => r.status === 'mapped').map((r) => r.paymentMethodId));
    if (draft) ids.add(draft.providerPaymentMethodId);
    return [...ids];
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
    const draft = params.settlementId ? await this.assertOwnDraft(params.settlementId, m) : undefined;
    const methodIds = await this.allowedMethodIds(draft, m);
    if (methodIds.length === 0) return { data: [], meta: { total: 0, page: params.page ?? 1, limit: params.limit ?? 0 } };

    // Embed the shared builder as a CTE so grouping sits ON TOP of it, never
    // inside it. TypeORM emits $1..$n; our own parameters continue from n+1.
    const [eligibleSql, eligibleParams] = this.paymentEligibilityQuery(m, params)
      .select(ProviderSettlementEligibilityService.PAYMENT_COLUMNS)
      .getQueryAndParameters();
    const args: unknown[] = [...eligibleParams];
    const bind = (v: unknown) => { args.push(v); return `$${args.length}`; };

    const filters: string[] = [`g."paymentMethodId" = ANY(${bind(methodIds)}::uuid[])`];
    if (params.salesOrderIds?.length) {
      filters.push(`g."salesOrderId" = ANY(${bind(params.salesOrderIds)}::uuid[])`);
    }
    if (params.search) {
      const q = bind(`%${params.search}%`);
      // Search selects whole GROUPS (spec §4.2): the predicate filters group keys,
      // never the payment rows being summed, so a non-matching refund still
      // counts toward a matching group's net.
      filters.push(`(so."orderNumber" ILIKE ${q} OR EXISTS (
        SELECT 1 FROM eligible e2
         WHERE e2."salesOrderId" = g."salesOrderId"
           AND e2."paymentMethodId" = g."paymentMethodId"
           AND e2."referenceNumber" ILIKE ${q}))`);
    }

    const groupsSql = `
      WITH eligible AS (${eligibleSql}),
      grouped AS (
        SELECT e."salesOrderId", e."paymentMethodId", SUM(e.amount) AS "netAmount"
          FROM eligible e
         GROUP BY e."salesOrderId", e."paymentMethodId"
        HAVING SUM(e.amount) <> 0
      )
      SELECT g."salesOrderId", g."paymentMethodId", g."netAmount"::text AS "netAmount",
             so."orderNumber", pm.name AS "paymentMethodName"
        FROM grouped g
        JOIN sales_orders so ON so.id = g."salesOrderId"
        JOIN payment_methods pm ON pm.id = g."paymentMethodId"
       WHERE ${filters.join(' AND ')}`;

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
      data.push({
        salesOrderId: first.salesOrderId,
        orderNumber: first.orderNumber,
        paymentMethodId: first.paymentMethodId,
        paymentMethodName: first.paymentMethodName,
        savedNetAmount: formatScale4(sumMinor(savedRows.map((r) => r.amount))),
        currentNetAmount: cur.length ? formatScale4(sumMinor(cur.map((r) => r.amount))) : null,
        savedPayments: savedRows.map(detail),
        currentPayments: cur.map(detail),
        state: classifyClaimedGroup(savedRows, cur),
      });
    }
    return { data };
  }

  async listEligible(params: {
    providerPaymentMethodId: string;
    settlementDate: string;
    settlementId?: string;
    search?: string;
    page?: number;
    limit?: number;
  }): Promise<{ data: EligiblePaymentRow[]; meta: { total: number; page: number; limit: number } }> {
    if (params.settlementId) {
      const draft = await this.assertOwnDraft(params.settlementId);
      if (draft.providerPaymentMethodId !== params.providerPaymentMethodId) {
        throw new BadRequestException('settlementId does not belong to the requested provider');
      }
    }

    const qb = this.baseQuery(this.defaultManager, params);
    if (params.search) {
      qb.andWhere('(so."orderNumber" ILIKE :q OR p."referenceNumber" ILIKE :q)', {
        q: `%${params.search}%`,
      });
    }

    // Stable sort, so server-side pagination cannot skip or repeat a row.
    qb.orderBy('p."paymentDate"', 'ASC').addOrderBy('p.id', 'ASC');

    // No page/limit means the FULL set — never a server-side hard cap.
    if (params.page && params.limit) {
      qb.skip((params.page - 1) * params.limit).take(params.limit);
    }

    qb.select([
      'p.id AS id',
      'p."salesOrderId" AS "salesOrderId"',
      'so."orderNumber" AS "orderNumber"',
      'p."paymentDate" AS "paymentDate"',
      'p.amount AS amount',
      'p."referenceNumber" AS "referenceNumber"',
    ]);

    const [data, total] = await Promise.all([qb.getRawMany(), qb.getCount()]);
    return {
      data: data as EligiblePaymentRow[],
      meta: { total, page: params.page ?? 1, limit: params.limit ?? total },
    };
  }

  /**
   * Revalidate a specific set at save/post time. Callers pass their own
   * settlementId so the settlement's OWN claims do not disqualify it — using
   * the unqualified branch here would reject every row the draft holds and make
   * posting impossible.
   */
  async assertEligible(
    paymentIds: string[],
    params: { providerPaymentMethodId: string; settlementDate: string; settlementId?: string },
    manager: EntityManager,
  ): Promise<SalesOrderPayment[]> {
    if (paymentIds.length === 0) {
      throw new BadRequestException('Select at least one payment');
    }
    const qb = this.baseQuery(manager, params).andWhere('p.id IN (:...ids)', { ids: paymentIds });
    const rows = await qb.getMany();

    const found = new Set(rows.map((r) => r.id));
    const missing = paymentIds.filter((id) => !found.has(id));
    if (missing.length > 0) {
      throw new ConflictException({
        message: {
          text: `These payments are no longer eligible: ${missing.join(', ')}. Refresh and reselect.`,
          unavailablePaymentIds: missing,
        },
      });
    }
    return rows;
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
