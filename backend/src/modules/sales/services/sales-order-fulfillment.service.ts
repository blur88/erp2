import { ConflictException, Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { SalesOrder, SalesOrderStatus } from '../../../database/entities/sales-order.entity';
import { lockRowForUpdate } from '../../../common/db/tx-helpers';
import { StockMovementService } from '../../../modules/inventory/services/stock-movement.service';
import { AuditLogService } from '../../audit-logs/services';
import { BaseCostCalculatorService } from '../../inventory/services/base-cost-calculator.service';
import { InventoryIntegrationService } from './inventory-integration.service';
import { ACCOUNTING_POSTING_PORT } from '../../../common/accounting-posting/accounting-posting.port';
import type { AccountingPostingPort } from '../../../common/accounting-posting/accounting-posting.port';
import { AccountingSourceType } from '../../../common/accounting-posting/enums';
import { PostingType } from '../../../common/accounting-posting/enums';
import { formatScale4 } from '@/common/utils/money';

@Injectable()
export class SalesOrderFulfillmentService {
  private readonly logger = new Logger(SalesOrderFulfillmentService.name);

  constructor(
    @InjectRepository(SalesOrder)
    private readonly salesOrderRepository: Repository<SalesOrder>,
    private readonly inventoryIntegrationService: InventoryIntegrationService,
    private readonly stockMovementService: StockMovementService,
    private readonly baseCostCalculator: BaseCostCalculatorService,
    private readonly auditLogService: AuditLogService,
    @Inject(ACCOUNTING_POSTING_PORT)
    private readonly accounting: AccountingPostingPort,
    private readonly dataSource: DataSource,
  ) {}

  async fulfillOrder(id: string, userId?: string, username?: string): Promise<SalesOrder> {
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

      // NOTE (#1076): this reads item.product, hydrated as a relation before
      // any product lock was taken, so it is a snapshot and can be stale under
      // concurrency. It is the ONLY stock-sufficiency gate on this path —
      // adjustStock() deliberately permits negative stock for GOODS and does
      // not re-check. The #1076 locking therefore guarantees that the recorded
      // balances are correct and no update is lost; it does NOT make this
      // oversell check race-free. Two concurrent fulfilments of the last unit
      // can still both pass here and drive stock negative, which this codebase
      // treats as allowed for GOODS. Making the check authoritative means
      // moving it inside the lock and deciding whether negative stock stays
      // permitted — a product decision, tracked separately.
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

      let cogsScale8 = 0n;
      for (const item of order.items) {
        if (item.product) {
          const consumed = await this.inventoryIntegrationService.adjustStock(
            item.productId,
            -item.quantity,
            `Sales order fulfillment: ${order.orderNumber}`,
            order.id,
            userId,
            undefined,
            manager,
          );
          cogsScale8 += consumed;
        }
      }

      const now = new Date();
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

      // Round COGS once across ALL layers/products: (scale8 + 5000) / 10000
      const cogsMinor = (cogsScale8 + 5000n) / 10000n;
      const revenueAmount = formatScale4(String(orderForPosting.totalAmount));
      const cogsAmount = formatScale4(cogsMinor);
      await this.accounting.postSalesFulfillment({
        salesOrderId: id,
        sourceRef: order.orderNumber,
        revenueAmount,
        cogsAmount,
        entryDate: orderForPosting.fulfilledAt.toISOString().slice(0, 10),
        createdBy: username,
      }, manager);

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
    const saved = await this.dataSource.transaction(async (manager: EntityManager) => {
      const order = await lockRowForUpdate(manager, SalesOrder, id, {
        relations: { items: { product: true } },
        notFoundMessage: 'Sales order not found',
      });
      if (order.status !== SalesOrderStatus.FULFILLED) {
        throw new ConflictException('Order is not fulfilled');
      }

      for (const item of order.items) {
        if (item.product) {
          await this.baseCostCalculator.restoreStock(item.productId, item.quantity, manager);
        }
      }

      const result = await this.stockMovementService.deleteByReference(
        'sales_order',
        order.id,
        manager,
      );
      this.logger.log(`Deleted ${result.deletedCount} stock movements for ${order.orderNumber}`);

      await manager.getRepository(SalesOrder).update(id, {
        status: SalesOrderStatus.READY,
        fulfilledAt: null as any,
      });
      order.status = SalesOrderStatus.READY;
      order.fulfilledAt = undefined;

      const entryDate = new Date().toISOString().slice(0, 10);
      await this.accounting.reverseEntriesForDocument(
        AccountingSourceType.SALES_ORDER,
        order.id,
        [PostingType.SALES_FULFILLMENT_REVENUE, PostingType.SALES_FULFILLMENT_COGS],
        entryDate,
        manager,
        username,
      );

      return order;
    });

    await this.auditLogService.log(
      'UPDATE',
      'SalesOrder',
      `Unfulfilled sales order: ${saved.orderNumber}`,
      {
        entityId: id,
        userId: userId || 'system',
        username,
        oldValues: { status: SalesOrderStatus.FULFILLED },
        newValues: { status: SalesOrderStatus.READY },
      },
    );

    return saved;
  }
}
