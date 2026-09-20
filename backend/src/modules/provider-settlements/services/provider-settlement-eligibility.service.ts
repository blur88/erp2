import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { EntityManager } from 'typeorm';
import { SalesOrderPayment } from '../../../database/entities/sales-order-payment.entity';
import { ProviderSettlement, ProviderSettlementStatus } from '../entities/provider-settlement.entity';
import { PostingType, AccountingSourceType } from '../../../common/accounting-posting/enums';

export interface EligiblePaymentRow {
  id: string;
  salesOrderId: string;
  orderNumber: string;
  paymentDate: string;
  amount: string;
  referenceNumber: string | null;
}

@Injectable()
export class ProviderSettlementEligibilityService {
  constructor(@InjectEntityManager() private readonly defaultManager: EntityManager) {}

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
           AND je."postingType" = CASE WHEN p.amount < 0 THEN :refundType ELSE :paymentType END
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

  async listEligible(params: {
    providerPaymentMethodId: string;
    settlementDate: string;
    settlementId?: string;
    search?: string;
    page?: number;
    limit?: number;
  }): Promise<{ data: EligiblePaymentRow[]; meta: { total: number; page: number; limit: number } }> {
    if (params.settlementId) {
      await this.assertOwnDraft(params.settlementId, params.providerPaymentMethodId);
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
      throw new BadRequestException(
        `These payments are no longer eligible: ${missing.join(', ')}. ` +
          `They may have been claimed by another settlement or had their posting reversed.`,
      );
    }
    return rows;
  }

  private async assertOwnDraft(settlementId: string, providerPaymentMethodId: string): Promise<void> {
    const settlement = await this.defaultManager
      .getRepository(ProviderSettlement)
      .findOne({ where: { id: settlementId } as any });
    if (!settlement) throw new NotFoundException('Settlement not found');
    if (settlement.status !== ProviderSettlementStatus.DRAFT) {
      throw new BadRequestException('Only a draft settlement can widen eligibility');
    }
    if (settlement.providerPaymentMethodId !== providerPaymentMethodId) {
      // A mismatch must be a 400, never a silent widening to another
      // provider's rows.
      throw new BadRequestException(
        'settlementId does not belong to the requested provider',
      );
    }
  }
}
