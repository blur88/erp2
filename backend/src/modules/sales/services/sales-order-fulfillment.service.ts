import {
  ConflictException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { SalesOrder, SalesOrderStatus } from '../../../database/entities/sales-order.entity';
import { lockRowForUpdate } from '../../../common/db/tx-helpers';
import { StockMovementService } from '../../../modules/inventory/services/stock-movement.service';
import { AuditLogService } from '../../audit-logs/services';
import { BaseCostCalculatorService } from '../../inventory/services/base-cost-calculator.service';
import { AccountingService } from '../../accounting/services/accounting.service';
import { InventoryIntegrationService } from './inventory-integration.service';

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
    private readonly accountingService: AccountingService,
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
        throw new ConflictException('Cannot fulfill order - order must be Ready (paid in full)');
      }

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

      for (const item of order.items) {
        if (item.product) {
          await this.inventoryIntegrationService.adjustStock(
            item.productId,
            -item.quantity,
            `Sales order fulfillment: ${order.orderNumber}`,
            order.id,
            userId,
            undefined,
            manager,
          );
        }
      }

      const now = new Date();
      await manager.getRepository(SalesOrder).update(id, {
        status: SalesOrderStatus.FULFILLED,
        updatedAt: now,
      });
      order.status = SalesOrderStatus.FULFILLED;

      // Re-read the order after the status update + stock reduction, then post
      // accounting against that fresh row. This fixes two things the in-memory
      // lock-read snapshot got wrong:
      //  1. fulfilledDate (a getter over updatedAt) — the re-read carries the just-
      //     persisted updatedAt = now, so the journal entry lands in the correct
      //     fiscal period instead of the order's stale pre-fulfillment date.
      //  2. COGS — adjustStock -> reduceStock may have recalculated each product's
      //     baseCost as FIFO batches were depleted; the re-read items.product carry
      //     the post-reduction cost (matching the previous post-save reload).
      const pricedOrder = await manager.getRepository(SalesOrder).findOne({
        where: { id },
        relations: { items: { product: true }, customer: true },
      });
      const orderForPosting = pricedOrder ?? order;

      // NOTE: postSalesOrderEntry receives `manager` for call-site uniformity, but
      // JournalEntryService persistence is not yet manager-bound (see #719), so the
      // journal entries commit on a separate connection. A failure *here* still rolls
      // back stock + status (the post is the last in-tx step); the residual gap is a
      // failure of the outer COMMIT after the GL committed, which #719 will close.
      await this.accountingService.postSalesOrderEntry(orderForPosting, userId || 'system', username, manager);
      this.logger.log(`Posted accounting entry for sales order ${order.orderNumber}`);

      return order;
    });

    await this.auditLogService.log('FULFILL', 'SalesOrder', `Fulfilled sales order: ${saved.orderNumber}`, {
      entityId: id,
      userId: userId || 'system',
      username,
      oldValues: { status: SalesOrderStatus.READY },
      newValues: { status: SalesOrderStatus.FULFILLED },
    });

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

      const result = await this.stockMovementService.deleteByReference('sales_order', order.id, manager);
      this.logger.log(`Deleted ${result.deletedCount} stock movements for ${order.orderNumber}`);

      await manager.getRepository(SalesOrder).update(id, { status: SalesOrderStatus.READY });
      order.status = SalesOrderStatus.READY;

      await this.accountingService.reverseSourceEntries('sales_order', id, userId || 'system', manager);
      this.logger.log(`Reversed accounting entry for sales order ${order.orderNumber}`);

      return order;
    });

    await this.auditLogService.log('UPDATE', 'SalesOrder', `Unfulfilled sales order: ${saved.orderNumber}`, {
      entityId: id,
      userId: userId || 'system',
      username,
      oldValues: { status: SalesOrderStatus.FULFILLED },
      newValues: { status: SalesOrderStatus.READY },
    });

    return saved;
  }
}
