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
import { SalesOrderPayment } from '../../../database/entities/sales-order-payment.entity';
import { PaymentMethodEntity } from '../../../database/entities/payment-method.entity';
import { ProviderSettlementDerivationService } from './provider-settlement-derivation.service';
import { ProviderSettlementEligibilityService } from './provider-settlement-eligibility.service';
import { EligiblePayment, groupKey, groupPayments } from './settlement-groups';
import {
  SETTLEMENT_TEST_HOOK,
  SettlementTestHook,
  SettlementTestPhase,
} from './provider-settlement.test-hooks';
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
  SettlementRowDto,
  ProviderSettlementProviderDto,
} from '../dto/provider-settlement.dto';

const CLAIM_INDEX = 'IDX_886b6f559ab60cc5167ca3896b';
const STALE_TEXT = 'Some rows changed since they were loaded. Review them and save again.';
const DEADLOCK_TEXT = 'The settlement could not be saved because of a concurrent change. Try again.';
const SAME_ACCOUNT_TEXT =
  'The selected payments already debit the destination bank account and cannot be settled into that same account.';

/**
 * A payment method mapped straight to a bank account (CIMB → 1200) debits that
 * bank when the payment posts. Settling it into the same account would post
 * Dr X / Cr X — a journal that balances and changes nothing, while marking the
 * payments settled. `clearingAccountId` must be the account DERIVED from the
 * payments' original journals, never the live mapping.
 */
function assertDistinctAccounts(clearingAccountId: string, bankAccountId: string): void {
  if (clearingAccountId === bankAccountId) throw new BadRequestException(SAME_ACCOUNT_TEXT);
}

interface StaleRow { salesOrderId: string; paymentMethodId: string; currentNetAmount: string | null }

function staleConflict(staleRows: StaleRow[]): ConflictException {
  // Rides INSIDE message: the global filter keeps only `message`.
  return new ConflictException({ message: { text: STALE_TEXT, staleRows } });
}

/** 40P01 is surfaced as a retryable 409, never swallowed. */
async function mapDeadlock<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (err) {
    if ((err as { code?: string })?.code === '40P01') throw new ConflictException(DEADLOCK_TEXT);
    throw err;
  }
}

@Injectable()
export class ProviderSettlementService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly settings: SettingsService,
    private readonly auditLogService: AuditLogService,
    private readonly derivation: ProviderSettlementDerivationService,
    private readonly eligibility: ProviderSettlementEligibilityService,
    @Inject(ACCOUNTING_POSTING_PORT)
    private readonly postingPort: AccountingPostingPort,
  ) {}

  private [SETTLEMENT_TEST_HOOK]?: SettlementTestHook;

  private async testHook(
    phase: SettlementTestPhase, salesOrderIds: string[], manager: EntityManager,
  ): Promise<void> {
    const hook = this[SETTLEMENT_TEST_HOOK];
    if (hook) await hook(phase, { salesOrderIds, manager });
  }

  /**
   * The single Payment Method the rows share. Mixed methods are a 400 that names
   * each METHOD with its ORDER NUMBERS — the user has to know which rows to split
   * out, and bare uuids tell them nothing they can act on. Labels are read on the
   * transaction's manager; an id with no row falls back to the id itself.
   */
  private async assertSingleMethod(rows: SettlementRowDto[], manager: EntityManager): Promise<string> {
    const byMethod = new Map<string, string[]>();
    for (const r of rows) byMethod.set(r.paymentMethodId, [...(byMethod.get(r.paymentMethodId) ?? []), r.salesOrderId]);
    if (byMethod.size === 1) return rows[0].paymentMethodId;

    const methodIds = [...byMethod.keys()];
    const orderIds = [...new Set(rows.map((r) => r.salesOrderId))];
    const methods: Array<{ id: string; name: string }> = await manager.query(
      'SELECT id, name FROM payment_methods WHERE id = ANY($1::uuid[])', [methodIds],
    );
    const orders: Array<{ id: string; orderNumber: string }> = await manager.query(
      'SELECT id, "orderNumber" FROM sales_orders WHERE id = ANY($1::uuid[])', [orderIds],
    );
    const methodName = (id: string) => methods.find((m) => m.id === id)?.name ?? id;
    const orderNumber = (id: string) => orders.find((o) => o.id === id)?.orderNumber ?? id;
    const detail = [...byMethod.entries()]
      .map(([m, sos]) => `${methodName(m)}: ${sos.map(orderNumber).join(', ')}`)
      .join('; ');
    throw new BadRequestException(
      `A settlement can cover one provider payout. Create a separate settlement for each Payment Method. (${detail})`,
    );
  }

  /**
   * Lock the involved orders FOR SHARE, ascending, BEFORE recomputing. Every
   * payment/refund writer locks its one order FOR UPDATE first, so a refund
   * either commits before this read (and is seen) or waits for our commit (and
   * becomes unclaimed residue). FOR SHARE lets concurrent settlements on the same
   * order proceed; the claim index serializes their claims.
   */
  private async lockSalesOrders(salesOrderIds: string[], manager: EntityManager): Promise<void> {
    const ids = [...new Set(salesOrderIds)].sort();
    await manager.query('SELECT id FROM sales_orders WHERE id = ANY($1::uuid[]) ORDER BY id FOR SHARE', [ids]);
    await this.testHook('afterSalesOrderLock', ids, manager);
  }

  /** Recompute each requested group; any drift ⇒ one row-specific 409. */
  private async resolveRows(
    rows: SettlementRowDto[], settlementDate: string, settlementId: string | undefined, manager: EntityManager,
  ): Promise<EligiblePayment[]> {
    const soIds = rows.map((r) => r.salesOrderId);
    await this.lockSalesOrders(soIds, manager);
    const eligible = await this.eligibility.eligiblePaymentsForOrders(
      [...new Set(soIds)], { settlementDate, settlementId }, manager,
    );
    const byGroup = groupPayments(eligible);
    const stale: StaleRow[] = [];
    const selected: EligiblePayment[] = [];
    for (const row of rows) {
      const payments = byGroup.get(groupKey(row)) ?? [];
      const net = sumMinor(payments.map((p) => p.amount));
      if (payments.length === 0) {
        stale.push({ salesOrderId: row.salesOrderId, paymentMethodId: row.paymentMethodId, currentNetAmount: null });
      } else if (net === 0n || net !== toMinorUnits(row.expectedNetAmount)) {
        stale.push({ salesOrderId: row.salesOrderId, paymentMethodId: row.paymentMethodId, currentNetAmount: formatScale4(net) });
      } else {
        selected.push(...payments);
      }
    }
    if (stale.length) throw staleConflict(stale);
    await this.testHook('afterRecompute', [...new Set(soIds)].sort(), manager);
    return selected;
  }

  private assertReconciles(payments: EligiblePayment[], settlementAmount: string): void {
    const totalMinor = sumMinor(payments.map((p) => p.amount));
    if (totalMinor <= 0n) {
      throw new BadRequestException('The selected total must be greater than zero');
    }
    const amountMinor = toMinorUnits(settlementAmount);
    if (totalMinor !== amountMinor) {
      const fmt = (m: bigint) => formatMoney(quantizeToCents(m));
      throw new BadRequestException(
        `Amount received ${fmt(amountMinor)} does not equal the selected total ${fmt(totalMinor)} ` +
          `(difference ${fmt(amountMinor - totalMinor)})`,
      );
    }
  }

  async create(
    dto: CreateProviderSettlementDto,
    userId?: string,
    username?: string,
  ): Promise<ProviderSettlement> {
    if (!dto.rows?.length) throw new BadRequestException('Select at least one row');

    const saved = await mapDeadlock(() => this.dataSource.transaction(async (manager: EntityManager) => {
      const methodId = await this.assertSingleMethod(dto.rows, manager);
      await this.assertPostableBankAccount(dto.bankAccountId, manager);
      const payments = await this.resolveRows(dto.rows, dto.settlementDate, undefined, manager);
      this.assertReconciles(payments, dto.settlementAmount);
      const clearingAccountId = await this.derivation.deriveClearingAccountId(payments, manager);
      assertDistinctAccounts(clearingAccountId, dto.bankAccountId);
      await this.assertProviderClearingAccount(clearingAccountId, manager);
      const referenceNumber = await this.settings.generateDocumentNumber('Provider Settlements', manager);
      const repo = manager.getRepository(ProviderSettlement);
      const settlement = repo.create({
        referenceNumber,
        providerPaymentMethodId: methodId,
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
    }));

    await this.auditLogService.log(
      'CREATE', 'ProviderSettlement',
      `Created provider settlement ${saved.referenceNumber}`,
      { entityId: saved.id, userId: userId || 'system', username },
    );
    return saved;
  }

  /**
   * `rows` is the COMPLETE desired selection, not an add/remove delta —
   * the resulting line set is exactly the current eligible set of each group,
   * and nothing else.
   */
  async update(
    id: string,
    dto: UpdateProviderSettlementDto,
    userId?: string,
    username?: string,
  ): Promise<ProviderSettlement> {
    if (!dto.rows?.length) {
      throw new BadRequestException(
        'A settlement must keep at least one row. Discard the draft instead.',
      );
    }

    const saved = await mapDeadlock(() => this.dataSource.transaction(async (manager: EntityManager) => {
      // Lock BEFORE reading status: otherwise update and post can both see
      // DRAFT and one mutates an already-posted settlement.
      const settlement = await lockRowForUpdate(manager, ProviderSettlement, id, {
        notFoundMessage: 'Settlement not found',
      });
      if (settlement.status !== ProviderSettlementStatus.DRAFT) {
        throw new ConflictException('Only a draft settlement can be edited');
      }

      // The payment method is INFERRED from the rows now, never submitted.
      const methodId = await this.assertSingleMethod(dto.rows, manager);

      await this.assertPostableBankAccount(dto.bankAccountId ?? settlement.bankAccountId, manager);

      const settlementDate = dto.settlementDate ?? settlement.settlementDate;
      const payments = await this.resolveRows(dto.rows, settlementDate, id, manager);
      // Reconcile against the amount being SAVED — the stored one when the
      // PATCH omits it.
      this.assertReconciles(payments, dto.settlementAmount ?? settlement.settlementAmount);

      // Derived BEFORE the claims are replaced, so the same-account guard can
      // reject without touching the draft's existing lines.
      const clearingAccountId = await this.derivation.deriveClearingAccountId(payments, manager);
      assertDistinctAccounts(clearingAccountId, dto.bankAccountId ?? settlement.bankAccountId);
      await this.assertProviderClearingAccount(clearingAccountId, manager);

      const lineRepo = manager.getRepository(ProviderSettlementLine);

      // HARD delete, never softDelete/softRemove. ProviderSettlementLine
      // extends BaseEntity, so a soft delete sets deletedAt — but the partial
      // unique index is predicated on releasedAt IS NULL, so the claim would
      // stay ACTIVE and the payment would be permanently unselectable while
      // looking removed.
      await lineRepo.delete({ settlementId: id } as any);
      await this.writeLines(id, payments, manager);

      // Recomputed on every update: changing the selection can change the
      // derived account.
      settlement.clearingAccountId = clearingAccountId;
      settlement.providerPaymentMethodId = methodId;

      if (dto.bankAccountId) settlement.bankAccountId = dto.bankAccountId;
      if (dto.settlementDate) settlement.settlementDate = dto.settlementDate;
      if (dto.providerReference !== undefined) {
        settlement.providerReference = dto.providerReference ?? null;
      }
      if (dto.settlementAmount) {
        settlement.settlementAmount = formatScale4(toMinorUnits(dto.settlementAmount));
      }
      return manager.getRepository(ProviderSettlement).save(settlement as any);
    }));

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
      // No provider join: see methodsById().
      .leftJoinAndSelect('s.clearingAccount', 'clearingAccount')
      .leftJoinAndSelect('s.bankAccount', 'bankAccount')
      .leftJoinAndSelect('s.journalEntry', 'journalEntry')
      .leftJoinAndSelect('s.reversalJournalEntry', 'reversalJournalEntry')
      .leftJoinAndSelect('s.lines', 'line')
      // Labels and references for the grouped detail view. Amounts stay the
      // line SNAPSHOTS; these joins supply only names. No line method join:
      // see methodsById().
      .leftJoinAndSelect('line.salesOrderPayment', 'linePayment')
      .leftJoinAndSelect('linePayment.salesOrder', 'lineOrder')
      .where('s.id = :id', { id })
      .orderBy('line.createdAt', 'ASC')
      .addOrderBy('line.id', 'ASC')
      .getOne();
    if (!settlement) throw new NotFoundException('Settlement not found');
    // One lookup serves both the provider and every line's method.
    const methods = await this.methodsById([
      settlement.providerPaymentMethodId,
      ...(settlement.lines ?? []).map((l) => l.salesOrderPayment?.paymentMethodId),
    ]);
    this.attachProviders([settlement], methods);
    this.attachLineMethods(settlement, methods);
    return settlement;
  }

  /**
   * The methods that own at least one settlement, inactive and soft-deleted
   * ones included (#1289) — the Provider filter's options. A soft-deleted
   * settlement owns nothing here, as it is absent from list() too.
   */
  async listProviders(): Promise<ProviderSettlementProviderDto[]> {
    const rows: Array<{ id: string; name: string; isActive: boolean; deleted: boolean }> =
      await this.dataSource.query(
        `SELECT pm.id, pm.name, pm."isActive", pm."deletedAt" IS NOT NULL AS deleted
           FROM payment_methods pm
          WHERE EXISTS (
                  SELECT 1 FROM provider_settlements s
                   WHERE s."providerPaymentMethodId" = pm.id AND s."deletedAt" IS NULL)
          ORDER BY pm."sortOrder" ASC, pm.name ASC, pm.id ASC`,
      );
    return rows.map((r) => ({ id: r.id, name: r.name, isActive: r.isActive, deleted: r.deleted }));
  }

  /**
   * Payment methods by id, INCLUDING soft-deleted ones, so a settlement still
   * names the provider it was recorded under (#1289) and each claimed line the
   * method it was paid with (#1292).
   *
   * Deliberately a second read rather than a join: TypeORM's withDeleted() is
   * builder-wide, so on the main query it would also revive soft-deleted
   * settlements and soft-deleted accounts, which must stay excluded. This is
   * the only withDeleted read on this path.
   */
  private async methodsById(ids: Array<string | undefined>): Promise<Map<string, PaymentMethodEntity>> {
    const unique = [...new Set(ids.filter((id): id is string => !!id))];
    if (unique.length === 0) return new Map();
    const methods = await this.dataSource.getRepository(PaymentMethodEntity).find({
      where: { id: In(unique) } as any,
      withDeleted: true,
    });
    return new Map(methods.map((m) => [m.id, m]));
  }

  private attachProviders(
    settlements: ProviderSettlement[],
    methods: Map<string, PaymentMethodEntity>,
  ): void {
    for (const s of settlements) {
      s.providerPaymentMethod = methods.get(s.providerPaymentMethodId) ?? null;
    }
  }

  /** Name each claimed line's payment method, soft-deleted included (#1292). */
  private attachLineMethods(
    settlement: ProviderSettlement,
    methods: Map<string, PaymentMethodEntity>,
  ): void {
    for (const line of settlement.lines ?? []) {
      const payment = line.salesOrderPayment;
      if (payment) payment.paymentMethod = methods.get(payment.paymentMethodId) ?? null;
    }
  }

  async list(query: ListProviderSettlementsQueryDto): Promise<{
    data: ProviderSettlement[];
    meta: { total: number; page: number; limit: number };
  }> {
    const qb = this.dataSource
      .getRepository(ProviderSettlement)
      .createQueryBuilder('s')
      // No provider join: see methodsById().
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
    //
    // Pass these as bare `alias.property` — never pre-quoted. TypeORM parses an
    // orderBy argument and escapes it itself; a quoted property is escaped
    // verbatim, and under skip/take with joined relations the distinct-id
    // strategy projects each ordering term into its `distinctAlias` subquery,
    // emitting `distinctAlias.s_"settlementDate"` and failing (#1265). The
    // quoting in the andWhere fragments above is raw SQL and stays as-is.
    qb.orderBy('s.settlementDate', 'DESC').addOrderBy('s.referenceNumber', 'DESC');

    // No page/limit means the FULL set — never a server-side hard cap.
    if (query.page !== undefined && query.limit !== undefined) {
      qb.skip((query.page - 1) * query.limit).take(query.limit);
      const [data, total] = await qb.getManyAndCount();
      this.attachProviders(data, await this.methodsById(data.map((s) => s.providerPaymentMethodId)));
      return { data, meta: { total, page: query.page, limit: query.limit } };
    }

    const data = await qb.getMany();
    this.attachProviders(data, await this.methodsById(data.map((s) => s.providerPaymentMethodId)));
    return { data, meta: { total: data.length, page: 1, limit: data.length } };
  }

  async post(id: string, userId?: string, username?: string): Promise<ProviderSettlement> {
    const saved = await mapDeadlock(() => this.dataSource.transaction(async (manager: EntityManager) => {
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
      if (lines.length === 0) throw new BadRequestException('A settlement must have at least one payment');

      // Which group does each line belong to? Read the payment rows themselves.
      const linePayments = await manager.getRepository(SalesOrderPayment).find({
        where: { id: In(lines.map((l) => l.salesOrderPaymentId)) } as any,
      });
      const soIds = [...new Set(linePayments.map((p) => p.salesOrderId))];
      await this.lockSalesOrders(soIds, manager);

      const eligible = await this.eligibility.eligiblePaymentsForOrders(
        soIds, { settlementDate: settlement.settlementDate, settlementId: id }, manager,
      );
      const eligibleByGroup = groupPayments(eligible);
      const linesByGroup = groupPayments(
        linePayments.map((p) => ({ id: p.id, salesOrderId: p.salesOrderId, paymentMethodId: p.paymentMethodId })),
      );

      // Completeness by payment-ID SET, not by net (spec §4.6): a refund that
      // zeroes the group, or a payment+refund pair that leaves the net unchanged,
      // still changes what this settlement would clear.
      for (const [key, claimed] of linesByGroup) {
        const live = new Set((eligibleByGroup.get(key) ?? []).map((p) => p.id));
        const same = live.size === claimed.length && claimed.every((c) => live.has(c.id));
        if (!same) {
          const [salesOrderId, paymentMethodId] = key.split(':');
          const [order] = await manager.query(
            'SELECT id, "orderNumber" FROM sales_orders WHERE id = ANY($1::uuid[])', [[salesOrderId]],
          );
          const [method] = await manager.query(
            'SELECT id, name FROM payment_methods WHERE id = ANY($1::uuid[])', [[paymentMethodId]],
          );
          throw new BadRequestException(
            `Sales order ${order?.orderNumber ?? salesOrderId} / ${method?.name ?? paymentMethodId} ` +
              `changed since this draft was saved; edit and re-save.`,
          );
        }
      }

      // Each line's SNAPSHOT must still equal its live payment row. The
      // snapshot is what the user reconciled against and what the settlement
      // displays; summing only the live rows would let an amount that changed
      // since the draft was saved post silently under the old total.
      const liveById = new Map(eligible.map((p) => [p.id, p]));
      for (const line of lines) {
        const live = liveById.get(line.salesOrderPaymentId)!;
        if (toMinorUnits(line.amount) !== toMinorUnits(live.amount)) {
          throw new BadRequestException(
            `Payment ${line.salesOrderPaymentId} changed since this draft was saved ` +
              `(recorded ${line.amount}, now ${live.amount}). Review the selection.`,
          );
        }
      }
      const payments = lines.map((l) => liveById.get(l.salesOrderPaymentId)!);

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
      // Re-checked here so a draft saved before the guard existed cannot post.
      assertDistinctAccounts(rederived, settlement.bankAccountId);
      await this.assertProviderClearingAccount(rederived, manager);

      this.assertReconciles(payments, settlement.settlementAmount);
      const amountMinor = toMinorUnits(settlement.settlementAmount);

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
    }));

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

  private async assertPostableBankAccount(accountId: string, manager: EntityManager): Promise<void> {
    // Validated against the Chart of Accounts — never inferred from the broad
    // `Accounting Channel = Bank` value.
    const account = await manager
      .getRepository(ChartOfAccount)
      .findOne({ where: { id: accountId } as any });
    if (!account) throw new BadRequestException('Bank account not found');
    if (!account.isActive) throw new BadRequestException('Bank account is inactive');
    if (!account.isPostable) throw new BadRequestException('Bank account is not postable');
    if (account.isProviderClearing) throw new BadRequestException('The destination account cannot be a provider clearing account');
  }

  /**
   * The journal-derived clearing-account guard (#1285): the account the payments'
   * ORIGINAL journals debited must be flagged. It never consults the method's
   * live mapping, so a provider that was since remapped, unmapped or made
   * invalid stays settleable for payments recorded to its clearing account
   * (#1288), while cash and bank payments are still rejected. Runs on create,
   * on every update and at post. Runs after assertDistinctAccounts so the
   * Dr X / Cr X case keeps its more specific message.
   */
  private async assertProviderClearingAccount(accountId: string, manager: EntityManager): Promise<void> {
    const account = await manager.getRepository(ChartOfAccount).findOne({ where: { id: accountId } as any });
    if (!account?.isProviderClearing) {
      const label = account ? `${account.code} ${account.name}` : accountId;
      throw new BadRequestException(
        `Account ${label} is not a provider clearing account. ` +
          'Only payments recorded to a provider clearing account can be settled.',
      );
    }
  }

  /**
   * Insert the claim rows, reporting the groups that ACTUALLY conflicted.
   *
   * Two things make this non-obvious:
   *
   * 1. A unique violation marks the whole PostgreSQL transaction as failed, so
   *    querying for the conflicting rows afterwards would itself error. The
   *    insert therefore runs inside a SAVEPOINT; rolling back to it restores a
   *    usable transaction without discarding the caller's earlier work (the
   *    settlement row). Same pattern as AccountingPostingService.build().
   * 2. Reporting every SUBMITTED group would be wrong. The frontend is promised
   *    it can drop the unavailable groups and keep the rest; if the response
   *    names all of them, it must clear the entire selection. So after the
   *    rollback we query which payments are actually claimed elsewhere and name
   *    only their groups.
   */
  private async writeLines(
    settlementId: string,
    payments: EligiblePayment[],
    manager: EntityManager,
  ): Promise<void> {
    const repo = manager.getRepository(ProviderSettlementLine);
    // Ascending payment id: concurrent settlements contend on several unique-index
    // entries; one consistent order keeps that contention deadlock-free.
    const ordered = [...payments].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    const rows = ordered.map((p) =>
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
      const e = err as { code?: string; constraint?: string; driverError?: { constraint?: string } };
      const constraint = e.constraint ?? e.driverError?.constraint;
      if (e.code !== '23505' || constraint !== CLAIM_INDEX) throw err;
      // Query ONLY after rolling back: the violation failed the transaction.
      await manager.query('ROLLBACK TO SAVEPOINT ps_lines_insert');
      const conflicting = await repo.find({
        where: {
          salesOrderPaymentId: In(ordered.map((p) => p.id)),
          releasedAt: IsNull(),
          settlementId: Not(settlementId),
        } as any,
        select: { salesOrderPaymentId: true } as any,
      });
      const taken = new Set(conflicting.map((c) => c.salesOrderPaymentId));
      const keys = new Map<string, StaleRow>();
      for (const p of ordered) {
        if (taken.has(p.id)) {
          keys.set(groupKey(p), { salesOrderId: p.salesOrderId, paymentMethodId: p.paymentMethodId, currentNetAmount: null });
        }
      }

      // The global filter copies `responseObj.message` VERBATIM into the
      // response and discards every other key of the exception body
      // (http-exception.filter.ts:85). A sibling field would therefore be
      // silently stripped. The machine-readable rows must ride INSIDE
      // `message`, which survives as an object.
      //
      // Wire shape: { statusCode: 409, message: { text, staleRows }, ... }
      throw staleConflict([...keys.values()]);
    }
  }
}
