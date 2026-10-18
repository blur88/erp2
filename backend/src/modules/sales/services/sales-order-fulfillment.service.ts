import { ConflictException, Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { SalesOrder, SalesOrderStatus } from '../../../database/entities/sales-order.entity';
import { Product } from '../../../database/entities/product.entity';
import { StockOccurrenceKind } from '../../../database/entities/stock-occurrence.entity';
import { createOccurrence } from '../../inventory/services/stock-occurrence';
import { lockRowForUpdate, lockProductForStockUpdate } from '../../../common/db/tx-helpers';
import { resolveAppTimezone } from '../../../common/utils/app-calendar';
import { formatDateInTimezone } from '../../../common/utils/date-in-timezone';
import { AuditLogService } from '../../audit-logs/services';
import { SettingsService } from '../../settings/settings.service';
import { UNFULFILL_UNAVAILABLE } from '../../inventory/stock-undo-unavailable';
import { InventoryIntegrationService } from './inventory-integration.service';
import { BaseCostCalculatorService } from '../../inventory/services/base-cost-calculator.service';
import { recalculateCustomerMetrics } from './customer-metrics';
import { ACCOUNTING_POSTING_PORT } from '../../../common/accounting-posting/accounting-posting.port';
import type { AccountingPostingPort } from '../../../common/accounting-posting/accounting-posting.port';
import { AccountingSourceType } from '../../../common/accounting-posting/enums';
import { PostingType } from '../../../common/accounting-posting/enums';
import { formatMoney, quantizeToCents, toMinorUnits, allocateCents, formatScale4 } from '@/common/utils/money';

@Injectable()
export class SalesOrderFulfillmentService {
  constructor(
    @InjectRepository(SalesOrder)
    private readonly salesOrderRepository: Repository<SalesOrder>,
    private readonly inventoryIntegrationService: InventoryIntegrationService,
    private readonly baseCostCalculator: BaseCostCalculatorService,
    private readonly auditLogService: AuditLogService,
    @Inject(ACCOUNTING_POSTING_PORT)
    private readonly accounting: AccountingPostingPort,
    private readonly dataSource: DataSource,
    private readonly settingsService: SettingsService,
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
      const fulfilledItems = order.items.filter((item) => item.product);
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
      const plans = await this.baseCostCalculator.planConsumption(manager, plannedLines);

      let cogsScale8 = 0n;
      for (const plan of plans) {
        cogsScale8 += plan.totalScale8;
      }

      const now = new Date();
      // Round COGS once across ALL lines: (scale8 + 5000) / 10000, then to cents.
      const cogsMinor = (cogsScale8 + 5000n) / 10000n;
      const postedMinor = quantizeToCents(cogsMinor);
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
      const allocatedMinor = allocateCents(postedMinor, plans.map((p) => p.totalScale8));
      const allocatedSum = allocatedMinor.reduce((a, b) => a + b, 0n);
      if (allocatedSum !== postedMinor) {
        throw new Error(
          `Fulfilment value allocation mismatch: allocated ${allocatedSum} != posted ${postedMinor}`,
        );
      }

      for (let i = 0; i < plans.length; i += 1) {
        const plan = plans[i];
        await this.inventoryIntegrationService.adjustStock(
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

  async unfulfillOrder(id: string, userId?: string, username?: string): Promise<SalesOrder> {
    throw new ConflictException(UNFULFILL_UNAVAILABLE);
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
