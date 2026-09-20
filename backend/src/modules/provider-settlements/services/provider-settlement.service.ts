import {
  Injectable,
  BadRequestException,
  ConflictException,
  NotFoundException,
  Inject,
} from '@nestjs/common';
import { DataSource, EntityManager, In, IsNull, Not } from 'typeorm';
import { ProviderSettlement, ProviderSettlementStatus } from '../entities/provider-settlement.entity';
import { ProviderSettlementLine } from '../entities/provider-settlement-line.entity';
import { ProviderSettlementDerivationService } from './provider-settlement-derivation.service';
import { ProviderSettlementEligibilityService } from './provider-settlement-eligibility.service';
import { PaymentMethodMappingService } from '../../accounting/services/payment-method-mapping.service';
import { AccountingLookupService } from '../../accounting/services/accounting-lookup.service';
import { ChartOfAccount } from '../../accounting/entities/chart-of-account.entity';
import { ACCOUNTING_POSTING_PORT } from '../../../common/accounting-posting/accounting-posting.port';
import type { AccountingPostingPort } from '../../../common/accounting-posting/accounting-posting.port';
import { SettingsService } from '../../settings/settings.service';
import { AuditLogService } from '../../audit-logs/services';
import { lockRowForUpdate } from '../../../common/db/tx-helpers';
import { resolveAppTimezone } from '../../../common/utils/app-calendar';
import { formatDateInTimezone } from '../../../common/utils/date-in-timezone';
import {
  toMinorUnits,
  formatScale4,
  sumMinor,
  formatMoney,
  quantizeToCents,
} from '@/common/utils/money';
import {
  CreateProviderSettlementDto,
  UpdateProviderSettlementDto,
  ListProviderSettlementsQueryDto,
} from '../dto/provider-settlement.dto';

@Injectable()
export class ProviderSettlementService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly settings: SettingsService,
    private readonly auditLogService: AuditLogService,
    private readonly derivation: ProviderSettlementDerivationService,
    private readonly eligibility: ProviderSettlementEligibilityService,
    private readonly mappingService: PaymentMethodMappingService,
    private readonly lookup: AccountingLookupService,
    @Inject(ACCOUNTING_POSTING_PORT)
    private readonly postingPort: AccountingPostingPort,
  ) {}

  async create(
    dto: CreateProviderSettlementDto,
    userId?: string,
    username?: string,
  ): Promise<ProviderSettlement> {
    if (!dto.paymentIds?.length) {
      throw new BadRequestException('Select at least one payment');
    }
    await this.assertMappedProvider(dto.providerPaymentMethodId);

    const saved = await this.dataSource.transaction(async (manager: EntityManager) => {
      await this.assertPostableBankAccount(dto.bankAccountId, manager);

      const payments = await this.eligibility.assertEligible(
        dto.paymentIds,
        {
          providerPaymentMethodId: dto.providerPaymentMethodId,
          settlementDate: dto.settlementDate,
        },
        manager,
      );
      const clearingAccountId = await this.derivation.deriveClearingAccountId(payments, manager);

      const referenceNumber = await this.settings.generateDocumentNumber(
        'Provider Settlements',
        manager,
      );
      const repo = manager.getRepository(ProviderSettlement);
      const settlement = repo.create({
        referenceNumber,
        providerPaymentMethodId: dto.providerPaymentMethodId,
        clearingAccountId,
        bankAccountId: dto.bankAccountId,
        settlementDate: dto.settlementDate,
        providerReference: dto.providerReference ?? null,
        settlementAmount: formatScale4(toMinorUnits(dto.settlementAmount)),
        status: ProviderSettlementStatus.DRAFT,
      } as any) as unknown as ProviderSettlement;
      const savedSettlement = await repo.save(settlement as any);

      await this.writeLines(savedSettlement.id, payments, manager);
      return savedSettlement;
    });

    await this.auditLogService.log(
      'CREATE', 'ProviderSettlement',
      `Created provider settlement ${saved.referenceNumber}`,
      { entityId: saved.id, userId: userId || 'system', username },
    );
    return saved;
  }

  /**
   * `paymentIds` is the COMPLETE desired selection, not an add/remove delta —
   * the resulting line set is exactly what was passed and nothing else.
   */
  async update(
    id: string,
    dto: UpdateProviderSettlementDto,
    userId?: string,
    username?: string,
  ): Promise<ProviderSettlement> {
    if (!dto.paymentIds?.length) {
      throw new BadRequestException(
        'A settlement must keep at least one payment. Discard the draft instead.',
      );
    }

    const saved = await this.dataSource.transaction(async (manager: EntityManager) => {
      // Lock BEFORE reading status: otherwise update and post can both see
      // DRAFT and one mutates an already-posted settlement.
      const settlement = await lockRowForUpdate(manager, ProviderSettlement, id, {
        notFoundMessage: 'Settlement not found',
      });
      if (settlement.status !== ProviderSettlementStatus.DRAFT) {
        throw new ConflictException('Only a draft settlement can be edited');
      }

      const providerId = dto.providerPaymentMethodId ?? settlement.providerPaymentMethodId;
      const settlementDate = dto.settlementDate ?? settlement.settlementDate;

      // Check the mapping only when the provider ACTUALLY CHANGES, and only
      // after the lock — comparing against the stored value needs the row.
      // Checking on every update would block ordinary edits (fixing a typo in
      // the reference, correcting the amount) on a draft whose method went
      // invalid after it was saved, which is the same mistake as re-checking at
      // post time.
      if (providerId !== settlement.providerPaymentMethodId) {
        await this.assertMappedProvider(providerId, manager);
      }

      if (dto.bankAccountId) await this.assertPostableBankAccount(dto.bankAccountId, manager);

      const lineRepo = manager.getRepository(ProviderSettlementLine);
      const payments = await this.eligibility.assertEligible(
        dto.paymentIds,
        { providerPaymentMethodId: providerId, settlementDate, settlementId: id },
        manager,
      );

      // HARD delete, never softDelete/softRemove. ProviderSettlementLine
      // extends BaseEntity, so a soft delete sets deletedAt — but the partial
      // unique index is predicated on releasedAt IS NULL, so the claim would
      // stay ACTIVE and the payment would be permanently unselectable while
      // looking removed.
      await lineRepo.delete({ settlementId: id } as any);
      await this.writeLines(id, payments, manager);

      // Recomputed on every update: changing the selection can change the
      // derived account.
      settlement.clearingAccountId = await this.derivation.deriveClearingAccountId(
        payments, manager,
      );

      if (dto.providerPaymentMethodId) settlement.providerPaymentMethodId = dto.providerPaymentMethodId;
      if (dto.bankAccountId) settlement.bankAccountId = dto.bankAccountId;
      if (dto.settlementDate) settlement.settlementDate = dto.settlementDate;
      if (dto.providerReference !== undefined) {
        settlement.providerReference = dto.providerReference ?? null;
      }
      if (dto.settlementAmount) {
        settlement.settlementAmount = formatScale4(toMinorUnits(dto.settlementAmount));
      }
      return manager.getRepository(ProviderSettlement).save(settlement as any);
    });

    await this.auditLogService.log(
      'UPDATE', 'ProviderSettlement',
      `Updated provider settlement ${(saved as any).referenceNumber}`,
      { entityId: id, userId: userId || 'system', username },
    );
    return saved as ProviderSettlement;
  }

  async discard(id: string, userId?: string, username?: string): Promise<void> {
    const referenceNumber = await this.dataSource.transaction(async (manager: EntityManager) => {
      const settlement = await lockRowForUpdate(manager, ProviderSettlement, id, {
        notFoundMessage: 'Settlement not found',
      });
      if (settlement.status !== ProviderSettlementStatus.DRAFT) {
        throw new ConflictException('Only a draft settlement can be discarded');
      }
      // Hard delete both, releasing the claims — see the note in update().
      await manager.getRepository(ProviderSettlementLine).delete({ settlementId: id } as any);
      await manager.getRepository(ProviderSettlement).delete({ id } as any);
      return settlement.referenceNumber;
    });

    await this.auditLogService.log(
      'DELETE', 'ProviderSettlement', `Discarded provider settlement ${referenceNumber}`,
      { entityId: id, userId: userId || 'system', username },
    );
  }

  async findOne(id: string): Promise<ProviderSettlement> {
    const settlement = await this.dataSource
      .getRepository(ProviderSettlement)
      .createQueryBuilder('s')
      .leftJoinAndSelect('s.providerPaymentMethod', 'provider')
      .leftJoinAndSelect('s.clearingAccount', 'clearingAccount')
      .leftJoinAndSelect('s.bankAccount', 'bankAccount')
      .leftJoinAndSelect('s.journalEntry', 'journalEntry')
      .leftJoinAndSelect('s.reversalJournalEntry', 'reversalJournalEntry')
      .leftJoinAndSelect('s.lines', 'line')
      .where('s.id = :id', { id })
      .orderBy('line.createdAt', 'ASC')
      .addOrderBy('line.id', 'ASC')
      .getOne();
    if (!settlement) throw new NotFoundException('Settlement not found');
    return settlement;
  }

  async list(query: ListProviderSettlementsQueryDto): Promise<{
    data: ProviderSettlement[];
    meta: { total: number; page: number; limit: number };
  }> {
    const qb = this.dataSource
      .getRepository(ProviderSettlement)
      .createQueryBuilder('s')
      .leftJoinAndSelect('s.providerPaymentMethod', 'provider')
      .leftJoinAndSelect('s.clearingAccount', 'clearingAccount')
      .leftJoinAndSelect('s.bankAccount', 'bankAccount');

    if (query.search) {
      qb.andWhere(
        '(s."referenceNumber" ILIKE :search OR s."providerReference" ILIKE :search)',
        { search: `%${query.search}%` },
      );
    }
    if (query.startDate) {
      qb.andWhere('s."settlementDate" >= :startDate', { startDate: query.startDate });
    }
    if (query.endDate) {
      qb.andWhere('s."settlementDate" <= :endDate', { endDate: query.endDate });
    }
    if (query.providerPaymentMethodId) {
      qb.andWhere('s."providerPaymentMethodId" = :providerId', {
        providerId: query.providerPaymentMethodId,
      });
    }
    if (query.status) {
      qb.andWhere('s.status = :status', { status: query.status });
    }

    // Stable sort: settlementDate ties freely, so referenceNumber (unique)
    // breaks the tie and server-side pagination cannot skip or repeat a row.
    qb.orderBy('s."settlementDate"', 'DESC').addOrderBy('s."referenceNumber"', 'DESC');

    // No page/limit means the FULL set — never a server-side hard cap.
    if (query.page !== undefined && query.limit !== undefined) {
      qb.skip((query.page - 1) * query.limit).take(query.limit);
      const [data, total] = await qb.getManyAndCount();
      return { data, meta: { total, page: query.page, limit: query.limit } };
    }

    const data = await qb.getMany();
    return { data, meta: { total: data.length, page: 1, limit: data.length } };
  }

  async post(id: string, userId?: string, username?: string): Promise<ProviderSettlement> {
    const saved = await this.dataSource.transaction(async (manager: EntityManager) => {
      // Lock before the status read — see update().
      const settlement = await lockRowForUpdate(manager, ProviderSettlement, id, {
        notFoundMessage: 'Settlement not found',
      });
      if (settlement.status !== ProviderSettlementStatus.DRAFT) {
        throw new ConflictException('Only a draft settlement can be posted');
      }

      const lines = await manager.getRepository(ProviderSettlementLine).find({
        where: { settlementId: id, releasedAt: IsNull() } as any,
      });
      if (lines.length === 0) {
        throw new BadRequestException('A settlement must have at least one payment');
      }

      // Revalidate with the OWN-DRAFT branch: the unqualified branch would
      // reject every row this draft claims and make posting impossible.
      const payments = await this.eligibility.assertEligible(
        lines.map((l) => l.salesOrderPaymentId),
        {
          providerPaymentMethodId: settlement.providerPaymentMethodId,
          settlementDate: settlement.settlementDate,
          settlementId: id,
        },
        manager,
      );

      // Re-derive from journal history and confirm the snapshot. A MAPPING
      // change cannot affect this. A payment whose original entry was REVERSED
      // since the draft was saved legitimately fails here — that is the point
      // of revalidating, not a defensive check.
      const rederived = await this.derivation.deriveClearingAccountId(payments, manager);
      if (rederived !== settlement.clearingAccountId) {
        throw new BadRequestException(
          `Clearing account changed since this draft was saved ` +
            `(${settlement.clearingAccountId} → ${rederived}). Review the selection.`,
        );
      }

      // Each line's SNAPSHOT must still equal its live payment row. The
      // snapshot is what the user reconciled against and what the settlement
      // displays; summing only the live rows would let an amount that changed
      // since the draft was saved post silently under the old total.
      const liveById = new Map(payments.map((p) => [p.id, p.amount]));
      for (const line of lines) {
        const live = liveById.get(line.salesOrderPaymentId);
        if (live === undefined) {
          throw new BadRequestException(
            `Payment ${line.salesOrderPaymentId} is no longer available`,
          );
        }
        if (toMinorUnits(line.amount) !== toMinorUnits(live)) {
          throw new BadRequestException(
            `Payment ${line.salesOrderPaymentId} changed since this draft was saved ` +
              `(recorded ${line.amount}, now ${live}). Review the selection.`,
          );
        }
      }

      const selectedMinor = sumMinor(payments.map((p) => p.amount));
      const amountMinor = toMinorUnits(settlement.settlementAmount);
      if (selectedMinor !== amountMinor) {
        throw new BadRequestException(
          `Settlement amount ${formatMoney(quantizeToCents(amountMinor))} does not reconcile ` +
            `with the selected payments ${formatMoney(quantizeToCents(selectedMinor))}`,
        );
      }

      await this.assertPostableBankAccount(settlement.bankAccountId, manager);

      const { journalEntryId } = await this.postingPort.postProviderSettlement(
        {
          settlementId: settlement.id,
          sourceRef: settlement.referenceNumber,
          bankAccountId: settlement.bankAccountId,
          clearingAccountId: settlement.clearingAccountId,
          amount: formatMoney(quantizeToCents(amountMinor)),
          // The settlement already carries a meaningful business date, so no
          // clock is consulted here.
          entryDate: settlement.settlementDate,
          createdBy: username,
        },
        manager,
      );

      settlement.status = ProviderSettlementStatus.POSTED;
      settlement.journalEntryId = journalEntryId;
      settlement.postedAt = new Date();
      settlement.postedBy = username ?? 'system';
      return manager.getRepository(ProviderSettlement).save(settlement as any);
    });

    await this.auditLogService.log(
      'UPDATE', 'ProviderSettlement',
      `Posted provider settlement ${(saved as any).referenceNumber}`,
      { entityId: id, userId: userId || 'system', username },
    );
    return saved as ProviderSettlement;
  }

  async reverse(id: string, userId?: string, username?: string): Promise<ProviderSettlement> {
    // Resolve the timezone BEFORE opening the transaction and close over it.
    // getRegionalSettings() reads through the default DataSource, not the
    // active EntityManager, so calling it inside the transaction issues a query
    // on a separate connection while that transaction is open — and on a fresh
    // install it WRITES a default row (#1134).
    const timezone = await resolveAppTimezone(this.settings);

    const { saved, alreadyReversed } = await this.dataSource.transaction(
      async (manager: EntityManager) => {
        // The lock is what makes the idempotency below safe: reverseEntry()
        // does not serialize concurrent reversals of the same entry on its own.
        const settlement = await lockRowForUpdate(manager, ProviderSettlement, id, {
          notFoundMessage: 'Settlement not found',
        });

        if (settlement.status === ProviderSettlementStatus.REVERSED) {
          return { saved: settlement, alreadyReversed: true };
        }
        if (settlement.status !== ProviderSettlementStatus.POSTED) {
          throw new ConflictException('Only a posted settlement can be reversed');
        }

        // The reversal has no business date of its own, so it uses the action
        // date in the configured business timezone — never settlementDate
        // (which would date a correction into a possibly-closed period) and
        // never a raw UTC clock.
        const entryDate = formatDateInTimezone(new Date(), timezone);

        const { journalEntryId } = await this.postingPort.reverseEntry(
          {
            originalEntryId: settlement.journalEntryId as string,
            entryDate,
            createdBy: username,
          },
          manager,
        );

        settlement.status = ProviderSettlementStatus.REVERSED;
        settlement.reversalJournalEntryId = journalEntryId;
        settlement.reversedAt = new Date();
        settlement.reversedBy = username ?? 'system';
        const savedSettlement = await manager
          .getRepository(ProviderSettlement)
          .save(settlement as any);

        // Release the claims. The rows survive verbatim — only this stamp is
        // added, which is what lets the payments join a corrective settlement
        // without deleting or mutating any financial value.
        await manager
          .getRepository(ProviderSettlementLine)
          .update({ settlementId: id } as any, { releasedAt: new Date() } as any);

        return { saved: savedSettlement, alreadyReversed: false };
      },
    );

    if (!alreadyReversed) {
      await this.auditLogService.log(
        'UPDATE', 'ProviderSettlement',
        `Reversed provider settlement ${(saved as any).referenceNumber}`,
        { entityId: id, userId: userId || 'system', username },
      );
    }
    return saved as ProviderSettlement;
  }

  /**
   * Only status 'mapped' may be selected. 'unmapped' has no clearing account at
   * all; 'invalid' points at one that is missing, soft-deleted, inactive or
   * non-postable. Enforced server-side because a client is not trusted to have
   * filtered its own dropdown.
   *
   * Called on create and on a provider-CHANGING update only — NEVER at post
   * time, where the clearing account comes from journal history and the current
   * mapping is irrelevant.
   *
   * `manager` MUST be the caller's transaction manager when one is open.
   * mappingService.list() resolves its injected repositories from the default
   * DataSource, and reading through them while the update transaction is open
   * opens a second connection (#1134). Passing the manager keeps every read on
   * the transaction's single connection.
   */
  private async assertMappedProvider(
    paymentMethodId: string,
    manager?: EntityManager,
  ): Promise<void> {
    const rows = await this.mappingService.list(manager);
    const row = rows.find((r: any) => r.paymentMethodId === paymentMethodId);
    if (!row || row.status !== 'mapped') {
      throw new BadRequestException(
        `Payment method is not mapped to a valid account (status: ${row?.status ?? 'unknown'})`,
      );
    }
  }

  private async assertPostableBankAccount(accountId: string, manager: EntityManager): Promise<void> {
    // Validated against the Chart of Accounts — never inferred from the broad
    // `Accounting Channel = Bank` value.
    const account = await manager
      .getRepository(ChartOfAccount)
      .findOne({ where: { id: accountId } as any });
    if (!account) throw new BadRequestException('Bank account not found');
    if (!account.isActive) throw new BadRequestException('Bank account is inactive');
    if (!account.isPostable) throw new BadRequestException('Bank account is not postable');
  }

  /**
   * Insert the claim rows, reporting the ids that ACTUALLY conflicted.
   *
   * Two things make this non-obvious:
   *
   * 1. A unique violation marks the whole PostgreSQL transaction as failed, so
   *    querying for the conflicting rows afterwards would itself error. The
   *    insert therefore runs inside a SAVEPOINT; rolling back to it restores a
   *    usable transaction without discarding the caller's earlier work (the
   *    settlement row). Same pattern as AccountingPostingService.build().
   * 2. Reporting every SUBMITTED id would be wrong. The frontend is promised it
   *    can drop the unavailable rows and keep the rest; if the response names
   *    all of them, it must clear the entire selection. So after the rollback we
   *    query which ids are actually claimed elsewhere and name only those.
   */
  private async writeLines(
    settlementId: string,
    payments: Array<{ id: string; amount: string }>,
    manager: EntityManager,
  ): Promise<void> {
    const repo = manager.getRepository(ProviderSettlementLine);
    const rows = payments.map((p) =>
      repo.create({
        settlementId,
        salesOrderPaymentId: p.id,
        amount: formatScale4(toMinorUnits(p.amount)),
        releasedAt: null,
      } as any),
    );

    await manager.query('SAVEPOINT ps_lines_insert');
    try {
      await repo.save(rows as any);
      await manager.query('RELEASE SAVEPOINT ps_lines_insert');
    } catch (err) {
      if ((err as { code?: string })?.code !== '23505') throw err;
      await manager.query('ROLLBACK TO SAVEPOINT ps_lines_insert');

      const conflicting = await repo.find({
        where: {
          salesOrderPaymentId: In(payments.map((p) => p.id)),
          releasedAt: IsNull(),
          settlementId: Not(settlementId),
        } as any,
        select: { salesOrderPaymentId: true } as any,
      });
      const ids = [...new Set(conflicting.map((c) => c.salesOrderPaymentId))];

      // The global filter copies `responseObj.message` VERBATIM into the
      // response and discards every other key of the exception body
      // (http-exception.filter.ts:85). A sibling `unavailablePaymentIds` field
      // would therefore be silently stripped. The machine-readable ids must
      // ride INSIDE `message`, which survives as an object.
      //
      // Wire shape: { statusCode: 409, message: { text, unavailablePaymentIds }, ... }
      throw new ConflictException({
        message: {
          text:
            `These payments were claimed by another settlement: ${ids.join(', ')}. ` +
            `Refresh and reselect.`,
          unavailablePaymentIds: ids,
        },
      });
    }
  }
}
