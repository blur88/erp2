import { ConflictException, Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, IsNull, Not, Repository } from 'typeorm';
import { SalesOrder, SalesOrderStatus } from '../../../database/entities/sales-order.entity';
import { Product } from '../../../database/entities/product.entity';
import {
  StockOccurrence,
  StockOccurrenceKind,
} from '../../../database/entities/stock-occurrence.entity';
import { StockMovement, StockMovementType } from '../../../database/entities/stock-movement.entity';
import { PurchaseCostHistory } from '../../../database/entities/purchase-cost-history.entity';
import { StockBatchConsumption } from '../../../database/entities/stock-batch-consumption.entity';
import {
  StockMovementValuationGap,
  StockMovementValuationGapStatus,
} from '../../../database/entities/stock-movement-valuation-gap.entity';
import { JournalEntry } from '../../accounting/entities/journal-entry.entity';
import { JournalEntryLine } from '../../accounting/entities/journal-entry-line.entity';
import { createOccurrence } from '../../inventory/services/stock-occurrence';
import { StockMovementService } from '../../inventory/services/stock-movement.service';
import { lockRowForUpdate, lockProductForStockUpdate } from '../../../common/db/tx-helpers';
import { resolveAppTimezone } from '../../../common/utils/app-calendar';
import { formatDateInTimezone } from '../../../common/utils/date-in-timezone';
import { AuditLogService } from '../../audit-logs/services';
import { SettingsService } from '../../settings/settings.service';
import {
  UNFULFILL_EVIDENCE_INCOMPLETE,
  UNFULFILL_PRE_RECORDING,
  UNFULFILL_VALUATION_GAP,
} from '../../inventory/stock-undo-unavailable';
import { InventoryIntegrationService } from './inventory-integration.service';
import { BaseCostCalculatorService } from '../../inventory/services/base-cost-calculator.service';
import { recalculateCustomerMetrics } from './customer-metrics';
import { ACCOUNTING_POSTING_PORT } from '../../../common/accounting-posting/accounting-posting.port';
import type { AccountingPostingPort } from '../../../common/accounting-posting/accounting-posting.port';
import { AccountingSourceType } from '../../../common/accounting-posting/enums';
import { PostingType } from '../../../common/accounting-posting/enums';
import { formatMoney, quantizeToCents, toMinorUnits, allocateCents, formatScale4 } from '@/common/utils/money';
import { InventoryValuationService } from '../../inventory/valuation/inventory-valuation.service';
import { StockValuationEntry, StockValuationEntryKind } from '../../../database/entities/stock-valuation-entry.entity';
import { unitValueScale4 } from '../../inventory/valuation/valuation-math';

export function negateRecordedValue(value: string | number | null | undefined): string {
  return formatMoney(-toMinorUnits(String(value ?? '0')));
}

@Injectable()
export class SalesOrderFulfillmentService {
  constructor(
    @InjectRepository(SalesOrder)
    private readonly salesOrderRepository: Repository<SalesOrder>,
    private readonly inventoryIntegrationService: InventoryIntegrationService,
    private readonly baseCostCalculator: BaseCostCalculatorService,
    private readonly stockMovementService: StockMovementService,
    private readonly auditLogService: AuditLogService,
    @Inject(ACCOUNTING_POSTING_PORT)
    private readonly accounting: AccountingPostingPort,
    private readonly dataSource: DataSource,
    private readonly settingsService: SettingsService,
    private readonly inventoryValuation: InventoryValuationService,
  ) {}

  async fulfillOrder(id: string, userId?: string, username?: string): Promise<SalesOrder> {
    // Business calendar resolved before the transaction opens (issue #1134).
    const timezone = await resolveAppTimezone(this.settingsService);

    const saved = await this.dataSource.transaction(async (manager: EntityManager) => {
      const order = await lockRowForUpdate(manager, SalesOrder, id, {
        relations: { items: { product: true }, customer: true },
        notFoundMessage: 'Sales order not found',
      });
      if (order.status === SalesOrderStatus.FULFILLED) {
        throw new ConflictException('Order is already fulfilled');
      }
      if (order.status !== SalesOrderStatus.READY) {
        throw new ConflictException(
          'Cannot fulfill order - order must be Ready (paid exactly in full, not over- or under-paid)',
        );
      }

      // Pre-flight sufficiency check (#1076, #1078). This reads item.product,
      // hydrated as a relation before any product lock was taken, so it is a
      // snapshot and NOT authoritative — it cannot be, since the lock is taken
      // per-product inside adjustStock() below.
      //
      // It is kept because it is the only place that can aggregate: it names
      // every short item in one message, which a per-product check under the
      // lock cannot do. It rejects the ordinary "not enough stock" case with a
      // good error before any work is done.
      //
      // The authoritative gate is in adjustStock(), which re-checks against the
      // lock-held row and throws ConflictException if the depletion would go
      // negative (#1078). A concurrent fulfilment that slips past this snapshot
      // is refused there, and the whole transaction rolls back.
      const offenders = order.items
        .filter(
          (item) =>
            item.product &&
            item.product.stockQuantity != null &&
            Number(item.product.stockQuantity) < Number(item.quantity),
        )
        .map(
          (item) =>
            `${item.product!.name ?? item.productId} (need ${Number(item.quantity)}, have ${Number(item.product!.stockQuantity)})`,
        );

      if (offenders.length > 0) {
        throw new ConflictException(
          `Cannot fulfill — ${offenders.length} item(s) out of stock: ${offenders.join(', ')}`,
        );
      }

      // Lock every affected product once, ascending, before the shared plan is
      // built. adjustStock re-locks the same rows; that is a no-op while held.
      const fulfilledItems = order.items
        .filter((item) => item.product)
        .sort((a, b) => a.lineNumber - b.lineNumber);
      const productIds = [...new Set(fulfilledItems.map((i) => i.productId))].sort();
      for (const productId of productIds) {
        await lockProductForStockUpdate(manager, Product, productId);
      }

      // Build ONE shared consumption plan across every line. Lines for the same
      // product share a single in-memory balance view, so the second line cannot
      // re-allocate the first line's batch quantity.
      const plannedLines = fulfilledItems.map((item) => ({
        productId: item.productId,
        quantity: Number(item.quantity),
      }));
      const valuationActive = await this.inventoryValuation.isActive(manager);
      const plans = valuationActive
        ? await this.baseCostCalculator.planPhysicalConsumption(manager, plannedLines)
        : await this.baseCostCalculator.planConsumption(manager, plannedLines);

      for (const plan of plans) {
        const actualBatchQuantityMinor = plan.consumptions.reduce(
          (sum, consumption) => sum + consumption.quantityMinor,
          0n,
        );
        if (
          actualBatchQuantityMinor !== plan.coveredQuantityMinor ||
          actualBatchQuantityMinor + plan.uncoveredQuantityMinor !== plan.requestedQuantityMinor ||
          plan.uncoveredQuantityMinor < 0n
        ) {
          throw new Error(
            `Fulfilment provenance does not reconcile for product ${plan.productId}`,
          );
        }
      }

      const pendingValuations = [];
      if (valuationActive) {
        for (const plan of plans) {
          pendingValuations.push(
            await this.inventoryValuation.valueDecrease(
              manager,
              plan.productId,
              plan.requestedQuantityMinor,
              StockValuationEntryKind.ISSUE,
            ),
          );
        }
      }

      let cogsScale8 = 0n;
      for (const plan of plans) cogsScale8 += plan.totalScale8;

      const now = new Date();
      // Round COGS once across ALL lines: (scale8 + 5000) / 10000, then to cents.
      const cogsMinor = (cogsScale8 + 5000n) / 10000n;
      const postedMinor = valuationActive
        ? pendingValuations.reduce((sum, pending) => sum + (pending.valueCents < 0n ? -pending.valueCents : pending.valueCents) * 100n, 0n)
        : quantizeToCents(cogsMinor);
      const postedAmount = formatMoney(postedMinor);

      // The occurrence is created BEFORE any movement, so each movement can carry
      // its occurrenceId at insert (write-once) and the occurrence records the
      // exact posted COGS.
      const occurrence = await createOccurrence(manager, {
        kind: StockOccurrenceKind.FULFILMENT,
        documentType: 'sales_order',
        documentId: order.id,
        occurredAt: now,
        actorUserId: userId,
        actorUsername: username,
        postedAmount: Number(postedAmount),
      });

      // Split the posted cents across the lines by their scale-8 consumption.
      const allocatedMinor = valuationActive
        ? pendingValuations.map((pending) => (pending.valueCents < 0n ? -pending.valueCents : pending.valueCents) * 100n)
        : allocateCents(postedMinor, plans.map((p) => p.totalScale8));
      const allocatedSum = allocatedMinor.reduce((a, b) => a + b, 0n);
      if (allocatedSum !== postedMinor) {
        throw new Error(
          `Fulfilment value allocation mismatch: allocated ${allocatedSum} != posted ${postedMinor}`,
        );
      }

      const gapRepo = manager.getRepository(StockMovementValuationGap);
      const movementIds: string[] = [];
      for (let i = 0; i < plans.length; i += 1) {
        const plan = plans[i];
        const adjusted = await this.inventoryIntegrationService.adjustStock(
          plan.productId,
          -Number(formatScale4(plan.requestedQuantityMinor)),
          `Sales order fulfillment: ${order.orderNumber}`,
          order.id,
          userId,
          undefined,
          manager,
          occurrence.id,
          plan,
          formatScale4(allocatedMinor[i] ?? 0n),
        );
        movementIds.push(adjusted.movementId);
        if (valuationActive) {
          const pending = pendingValuations[i];
          const unitValue = unitValueScale4(
            pending.quantityMinor < 0n ? -pending.quantityMinor : pending.quantityMinor,
            pending.valueCents < 0n ? -pending.valueCents : pending.valueCents,
          );
          await manager.getRepository(StockMovement).update(adjusted.movementId, {
            unitValue: Number(formatScale4(unitValue ?? 0n)),
            totalValue: Number(formatScale4((pending.valueCents < 0n ? -pending.valueCents : pending.valueCents) * 100n)),
          } as any);
        }
        if (plan.uncoveredQuantityMinor > 0n) {
          await gapRepo.save(
            gapRepo.create({
              movementId: adjusted.movementId,
              quantity: formatScale4(plan.uncoveredQuantityMinor),
              valueScale8: '0.00000000',
              status: StockMovementValuationGapStatus.UNVALUED_GAP,
            }),
          );
        }
      }

      if (plans.some((plan) => plan.uncoveredQuantityMinor > 0n)) {
        await manager.getRepository(StockOccurrence).update(occurrence.id, {
          hasValuationGap: true,
        });
      }

      await manager.getRepository(SalesOrder).update(id, {
        status: SalesOrderStatus.FULFILLED,
        updatedAt: now,
        fulfilledAt: now,
      });
      order.status = SalesOrderStatus.FULFILLED;
      order.fulfilledAt = now;

      // Re-read for document fields only (orderNumber, revenue basis, fulfilledAt).
      const pricedOrder = await manager.getRepository(SalesOrder).findOne({
        where: { id },
        relations: { items: { product: true }, customer: true },
      });
      const orderForPosting = pricedOrder ?? order;

      // Posting amounts are quantized to cents (#1241); the balance gate in the
      // posting service verifies the resulting journal before persistence.
      const revenueAmount = formatMoney(
        quantizeToCents(toMinorUnits(String(orderForPosting.totalAmount))),
      );
      const cogsAmount = formatMoney(postedMinor);
      if (toMinorUnits(cogsAmount) !== postedMinor) {
        throw new Error(
          `Fulfilment COGS mismatch: posted ${toMinorUnits(cogsAmount)} != recorded ${postedMinor}`,
        );
      }
      const posted = await this.accounting.postSalesFulfillment({
        salesOrderId: id,
        sourceRef: order.orderNumber,
        revenueAmount,
        cogsAmount,
        entryDate: formatDateInTimezone(orderForPosting.fulfilledAt, timezone),
        createdBy: username,
        occurrenceId: occurrence.id,
      }, manager);

      if (valuationActive) {
        await this.inventoryValuation.commit(
          manager,
          pendingValuations,
          movementIds,
          posted.cogsEntryId,
          userId,
        );
      }

      // Verify the journal matches the recorded occurrence exactly: a nonzero
      // occurrence must have a COGS entry, a zero-cost one must not.
      if (postedMinor > 0n && !posted.cogsEntryId) {
        throw new Error('Fulfilment COGS entry missing for a nonzero occurrence');
      }
      if (postedMinor === 0n && posted.cogsEntryId) {
        throw new Error('Unexpected COGS entry for a zero-cost occurrence');
      }

      await this.recalculateMetrics(manager, order);

      return order;
    });

    await this.auditLogService.log(
      'FULFILL',
      'SalesOrder',
      `Fulfilled sales order: ${saved.orderNumber}`,
      {
        entityId: id,
        userId: userId || 'system',
        username,
        oldValues: { status: SalesOrderStatus.READY },
        newValues: { status: SalesOrderStatus.FULFILLED },
      },
    );

    return saved;
  }

  /**
   * Undo a fulfilment non-destructively (#1406): restore exactly the batches and
   * stock the fulfilment recorded, write one reversal movement per original sale
   * movement, reverse both journal entries, and record a linked reversal
   * occurrence. Every check runs before the first write; a state the records
   * cannot prove is refused, not guessed.
   */
  async unfulfillOrder(
    id: string,
    reason: string,
    userId?: string,
    username?: string,
  ): Promise<SalesOrder> {
    const timezone = await resolveAppTimezone(this.settingsService);

    const saved = await this.dataSource.transaction(async (manager: EntityManager) => {
      const order = await lockRowForUpdate(manager, SalesOrder, id, {
        relations: { items: { product: true }, customer: true },
        notFoundMessage: 'Sales order not found',
      });
      if (order.status !== SalesOrderStatus.FULFILLED) {
        throw new ConflictException('Order is not fulfilled');
      }

      const occurrence = await this.findLiveFulfilmentOccurrence(manager, order.id);
      if (!occurrence) {
        throw new ConflictException(UNFULFILL_PRE_RECORDING);
      }

      // The order row is locked first. Discover product IDs, lock all products
      // ascending, then discover/lock all batch IDs ascending. Reload evidence
      // after those locks and complete eligibility checks before any writes.
      let saleMovements = await this.loadSaleMovements(manager, occurrence.id);
      const productIds = [...new Set(saleMovements.map((m) => m.productId))].sort();
      for (const productId of productIds) {
        await lockProductForStockUpdate(manager, Product, productId);
      }

      const consumptionRepo = manager.getRepository(StockBatchConsumption);
      const gapRepo = manager.getRepository(StockMovementValuationGap);
      const movementIds = saleMovements.map((movement) => movement.id);
      const initialConsumptions = movementIds.length
        ? await consumptionRepo.find({ where: { movementId: In(movementIds) } as any })
        : [];
      const batchIds = [...new Set(initialConsumptions.map((row) => row.batchId))].sort();
      if (batchIds.length > 0) {
        await manager.getRepository(PurchaseCostHistory).find({
          where: { id: In(batchIds) } as any,
          order: { id: 'ASC' },
          lock: { mode: 'pessimistic_write' },
        });
      }

      const lockedOccurrence = await manager.getRepository(StockOccurrence).findOne({
        where: { id: occurrence.id } as any,
        lock: { mode: 'pessimistic_write' },
      });
      if (!lockedOccurrence) throw new ConflictException(UNFULFILL_EVIDENCE_INCOMPLETE);
      saleMovements = await this.loadSaleMovements(manager, lockedOccurrence.id);
      if (saleMovements.length !== movementIds.length) {
        throw new ConflictException(UNFULFILL_EVIDENCE_INCOMPLETE);
      }

      const lockedMovementIds = saleMovements.map((movement) => movement.id);
      const consumptions = lockedMovementIds.length
        ? await consumptionRepo.find({ where: { movementId: In(lockedMovementIds) } as any })
        : [];
      const valuationGaps = lockedMovementIds.length
        ? await gapRepo.find({ where: { movementId: In(lockedMovementIds) } as any })
        : [];
      const consumptionsByMovement = new Map<string, StockBatchConsumption[]>();
      for (const consumption of consumptions) {
        const rows = consumptionsByMovement.get(consumption.movementId) ?? [];
        rows.push(consumption);
        consumptionsByMovement.set(consumption.movementId, rows);
      }
      const gapsByMovement = new Map(valuationGaps.map((gap) => [gap.movementId, gap]));

      for (const movement of saleMovements) {
        const consumedMinor = (consumptionsByMovement.get(movement.id) ?? []).reduce(
          (sum, row) => sum + toMinorUnits(String(row.quantity)),
          0n,
        );
        const gapMinor = toMinorUnits(String(gapsByMovement.get(movement.id)?.quantity ?? '0'));
        const movedMinor = toMinorUnits(String(movement.quantity).replace('-', ''));
        if (consumedMinor + gapMinor !== movedMinor) {
          throw new ConflictException(UNFULFILL_EVIDENCE_INCOMPLETE);
        }
      }

      if (lockedOccurrence.hasValuationGap !== (valuationGaps.length > 0)) {
        throw new ConflictException(UNFULFILL_EVIDENCE_INCOMPLETE);
      }
      if (lockedOccurrence.hasValuationGap) {
        throw new ConflictException(UNFULFILL_VALUATION_GAP);
      }

      const valuationActive = await this.inventoryValuation.isActive(manager);
      const originalValuations = new Map<string, StockValuationEntry | null>();
      if (valuationActive) {
        for (const movement of saleMovements) {
          originalValuations.set(
            movement.id,
            await this.inventoryValuation.findEntryForMovement(manager, movement.id),
          );
        }
      }

      const restoration = await this.assessRestorationEvidence(
        manager,
        lockedOccurrence,
        saleMovements,
      );
      const now = new Date();

      // The reversal occurrence is created first so every reversal movement and
      // restored batch can be traced to it.
      const reversal = await createOccurrence(manager, {
        kind: StockOccurrenceKind.FULFILMENT_REVERSAL,
        documentType: 'sales_order',
        documentId: order.id,
        occurredAt: now,
        actorUserId: userId,
        actorUsername: username,
        reversesOccurrenceId: occurrence.id,
        postedAmount: Number(occurrence.postedAmount ?? 0),
        reason,
      });

      // Restore each batch from its recorded provenance.
      const costRepo = manager.getRepository(PurchaseCostHistory);
      for (const [batchId, restoreMinor] of restoration.restoreByBatch) {
        const batch = await costRepo.findOne({ where: { id: batchId } as any });
        const remainingMinor = toMinorUnits(String(batch!.remainingQuantity));
        await costRepo.update(batchId, {
          remainingQuantity: formatScale4(remainingMinor + restoreMinor) as any,
          updatedAt: now,
        });
      }

      // One SALE_REVERSAL per sale movement, mirroring quantity and value.
      const valuationReversals = [];
      const reversalMovementIds: string[] = [];
      for (const movement of saleMovements) {
        const reversedMovement = await this.stockMovementService.create(
          {
            productId: movement.productId,
            movementType: StockMovementType.SALE_REVERSAL,
            quantity: Math.abs(Number(movement.quantity)),
            reason: `Reversal: ${reason}`,
            referenceType: 'sales_order',
            referenceId: order.id,
            occurrenceId: reversal.id,
            reversesMovementId: movement.id,
            totalValue: Number(movement.totalValue ?? 0),
          } as any,
          userId,
          manager,
        );
        reversalMovementIds.push(reversedMovement.id);
        if (valuationActive) {
          const original = originalValuations.get(movement.id) ?? {
            id: '',
            productId: movement.productId,
            method: await this.inventoryValuation.currentMethod(manager, movement.productId),
            quantity: String(movement.quantity),
            value: negateRecordedValue(movement.totalValue),
            createdAt: movement.movementDate,
          } as StockValuationEntry;
          const pending = await this.inventoryValuation.valueDecreaseReversal(manager, original);
          valuationReversals.push(pending);
          const unitValue = unitValueScale4(
            pending.quantityMinor < 0n ? -pending.quantityMinor : pending.quantityMinor,
            pending.valueCents < 0n ? -pending.valueCents : pending.valueCents,
          );
          await manager.getRepository(StockMovement).update(reversedMovement.id, {
            unitValue: Number(formatScale4(unitValue ?? 0n)),
            totalValue: Number(formatScale4((pending.valueCents < 0n ? -pending.valueCents : pending.valueCents) * 100n)),
          } as any);
        }
      }

      // Recalculate each product's base cost from its restored batches.
      for (const productId of productIds) {
        await this.baseCostCalculator.updateProductBaseCost(productId, manager);
      }

      await this.reverseFulfilmentJournal(
        manager,
        order.id,
        occurrence.id,
        toMinorUnits(String(occurrence.postedAmount ?? '0')),
        formatDateInTimezone(now, timezone),
        username,
      );

      if (valuationActive) {
        const cogsReversal = await manager.getRepository(JournalEntry).findOne({
          where: {
            sourceType: AccountingSourceType.SALES_ORDER,
            sourceDocumentId: order.id,
            sourceEventId: occurrence.id,
            postingType: PostingType.SALES_FULFILLMENT_COGS,
            reversalOfEntryId: Not(IsNull()),
          } as any,
          order: { createdAt: 'DESC' },
        });
        await this.inventoryValuation.commit(
          manager,
          valuationReversals,
          reversalMovementIds,
          cogsReversal?.id ?? null,
          userId,
        );
      }

      await manager.getRepository(SalesOrder).update(id, {
        status: SalesOrderStatus.READY,
        updatedAt: now,
        fulfilledAt: null,
      });
      order.status = SalesOrderStatus.READY;
      order.fulfilledAt = null as any;

      await this.recalculateMetrics(manager, order);

      return order;
    });

    await this.auditLogService.log(
      'UNFULFILL',
      'SalesOrder',
      `Unfulfilled sales order: ${saved.orderNumber}`,
      {
        entityId: id,
        userId: userId || 'system',
        username,
        oldValues: { status: SalesOrderStatus.FULFILLED },
        newValues: { status: SalesOrderStatus.READY, reason },
      },
    );

    return saved;
  }

  private async findLiveFulfilmentOccurrence(
    manager: EntityManager,
    orderId: string,
  ): Promise<StockOccurrence | null> {
    const repo = manager.getRepository(StockOccurrence);
    const candidates = await repo.find({
      where: {
        documentType: 'sales_order',
        documentId: orderId,
        kind: StockOccurrenceKind.FULFILMENT,
      } as any,
      order: { createdAt: 'DESC' },
    });
    for (const candidate of candidates) {
      const reversal = await repo.findOne({ where: { reversesOccurrenceId: candidate.id } as any });
      if (!reversal) return candidate;
    }
    return null;
  }

  private async loadSaleMovements(
    manager: EntityManager,
    occurrenceId: string,
  ): Promise<StockMovement[]> {
    const movements = await manager.getRepository(StockMovement).find({
      where: { occurrenceId } as any,
      order: { id: 'ASC' },
    });
    return movements.filter((m) => Number(m.quantity) < 0);
  }

  /**
   * Validates the recorded provenance, batch capacity, movement values and
   * journal entries. Returns the per-batch restoration to apply. Throws
   * UNFULFILL_EVIDENCE_INCOMPLETE on any gap rather than guessing.
   */
  private async assessRestorationEvidence(
    manager: EntityManager,
    occurrence: StockOccurrence,
    saleMovements: StockMovement[],
  ): Promise<{ restoreByBatch: Map<string, bigint> }> {
    const incomplete = () => new ConflictException(UNFULFILL_EVIDENCE_INCOMPLETE);
    if (saleMovements.length === 0) throw incomplete();

    const consumptionRepo = manager.getRepository(StockBatchConsumption);
    const costRepo = manager.getRepository(PurchaseCostHistory);

    // A product with cost batches must have provenance for every unit it moved;
    // a zero-cost product (no batches) legitimately has none.
    const batchedProducts = new Set<string>();
    for (const movement of saleMovements) batchedProducts.add(movement.productId);
    for (const productId of batchedProducts) {
      const count = await costRepo.count({ where: { productId } as any });
      if (count === 0) batchedProducts.delete(productId);
    }

    const restoreByBatch = new Map<string, bigint>();
    for (const movement of saleMovements) {
      const provenance = await consumptionRepo.find({ where: { movementId: movement.id } as any });
      if (!batchedProducts.has(movement.productId)) {
        if (provenance.length > 0) throw incomplete();
        continue;
      }

      let provenanceQtyMinor = 0n;
      for (const row of provenance) {
        const qtyMinor = toMinorUnits(String(row.quantity));
        provenanceQtyMinor += qtyMinor;
        restoreByBatch.set(row.batchId, (restoreByBatch.get(row.batchId) ?? 0n) + qtyMinor);

        const batch = await costRepo.findOne({ where: { id: row.batchId } as any });
        if (!batch) throw incomplete();
        if (batch.reversedAt) throw incomplete();
        if (batch.productId !== movement.productId) throw incomplete();
      }

      const movedQtyMinor = toMinorUnits(String(movement.quantity).replace('-', ''));
      if (provenanceQtyMinor !== movedQtyMinor) throw incomplete();
    }

    for (const [batchId, restoreMinor] of restoreByBatch) {
      const batch = await costRepo.findOne({ where: { id: batchId } as any });
      const remainingMinor = toMinorUnits(String(batch!.remainingQuantity));
      const receivedMinor = toMinorUnits(String(batch!.receivedQuantity));
      if (remainingMinor + restoreMinor > receivedMinor) throw incomplete();
    }

    const movementsTotalMinor = saleMovements.reduce(
      (sum, m) => sum + toMinorUnits(String(m.totalValue ?? '0')),
      0n,
    );
    const postedMinor = toMinorUnits(String(occurrence.postedAmount ?? '0'));
    if (movementsTotalMinor !== postedMinor) throw incomplete();

    const entryRepo = manager.getRepository(JournalEntry);
    const originals = await entryRepo.find({
      where: {
        sourceType: AccountingSourceType.SALES_ORDER,
        sourceEventId: occurrence.id,
        reversalOfEntryId: IsNull(),
      } as any,
      order: { id: 'ASC' },
      lock: { mode: 'pessimistic_write' },
    });
    const revenueOriginal = originals.find(
      (e) => e.postingType === PostingType.SALES_FULFILLMENT_REVENUE,
    );
    const cogsOriginal = originals.find((e) => e.postingType === PostingType.SALES_FULFILLMENT_COGS);
    if (!revenueOriginal) throw incomplete();
    if (await entryRepo.findOne({ where: { reversalOfEntryId: revenueOriginal.id } as any })) {
      throw incomplete();
    }

    if (postedMinor > 0n) {
      if (!cogsOriginal) throw incomplete();
      if (await entryRepo.findOne({ where: { reversalOfEntryId: cogsOriginal.id } as any })) {
        throw incomplete();
      }
      const cogsLines = await manager
        .getRepository(JournalEntryLine)
        .find({ where: { entryId: cogsOriginal.id } as any });
      const cogsDebitMinor = cogsLines.reduce((sum, l) => sum + toMinorUnits(String(l.debit)), 0n);
      if (cogsDebitMinor !== postedMinor) throw incomplete();
    } else if (cogsOriginal) {
      throw incomplete();
    }

    return { restoreByBatch };
  }

  private async reverseFulfilmentJournal(
    manager: EntityManager,
    orderId: string,
    occurrenceId: string,
    postedMinor: bigint,
    entryDate: string,
    username?: string,
  ): Promise<void> {
    const revenue = await this.accounting.reverseEntryForEvent(
      {
        sourceType: AccountingSourceType.SALES_ORDER,
        sourceDocumentId: orderId,
        sourceEventId: occurrenceId,
        expectedPostingType: PostingType.SALES_FULFILLMENT_REVENUE,
        otherPostingTypes: [],
        companionPostingTypes: [PostingType.SALES_FULFILLMENT_COGS],
        entryDate,
        createdBy: username,
      },
      manager,
    );
    if (revenue.outcome !== 'reversed') {
      throw new ConflictException(UNFULFILL_EVIDENCE_INCOMPLETE);
    }

    const cogs = await this.accounting.reverseEntryForEvent(
      {
        sourceType: AccountingSourceType.SALES_ORDER,
        sourceDocumentId: orderId,
        sourceEventId: occurrenceId,
        expectedPostingType: PostingType.SALES_FULFILLMENT_COGS,
        otherPostingTypes: [],
        companionPostingTypes: [PostingType.SALES_FULFILLMENT_REVENUE],
        entryDate,
        createdBy: username,
      },
      manager,
    );
    // A zero-cost fulfilment has no COGS original to reverse.
    if (postedMinor > 0n ? cogs.outcome !== 'reversed' : cogs.outcome !== 'no_original') {
      throw new ConflictException(UNFULFILL_EVIDENCE_INCOMPLETE);
    }
  }

  /**
   * Keeps the customer's stored order metrics in step with the status change
   * (#1355). It runs last in the transaction, so the customer row lock is held
   * only until commit, and it is not caught: metrics that cannot be written
   * roll the transition back rather than commit a customer that disagrees with
   * their orders.
   */
  private async recalculateMetrics(manager: EntityManager, order: SalesOrder): Promise<void> {
    const found = await recalculateCustomerMetrics(manager, order.customerId);
    if (!found) {
      // sales_orders.customerId is a RESTRICT foreign key, so this is unreachable
      // unless the schema changed.
      throw new Error(
        `Customer ${order.customerId} of sales order ${order.orderNumber} does not exist`,
      );
    }
  }
}
