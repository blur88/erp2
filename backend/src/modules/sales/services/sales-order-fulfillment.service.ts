import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SalesOrder, SalesOrderPaymentStatus, SalesOrderStatus } from '../../../database/entities/sales-order.entity';
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
  ) {}

  async fulfillOrder(id: string, userId?: string, username?: string): Promise<SalesOrder> {
    const order = await this.salesOrderRepository.findOne({
      where: { id },
      relations: { items: { product: true } },
    });

    if (!order) throw new NotFoundException('Sales order not found');
    if (order.status === SalesOrderStatus.FULFILLED) {
      throw new ConflictException('Order is already fulfilled');
    }
    if (order.paymentStatus !== SalesOrderPaymentStatus.PAID) {
      throw new ConflictException('Cannot fulfill order - payment status must be PAID');
    }

    for (const item of order.items) {
      if (item.product) {
        await this.inventoryIntegrationService.adjustStock(
          item.productId,
          -item.quantity,
          `Sales order fulfillment: ${order.orderNumber}`,
          order.id,
        );
      }
    }

    order.status = SalesOrderStatus.FULFILLED;
    const saved = await this.salesOrderRepository.save(order);

    await this.auditLogService.log('FULFILL', 'SalesOrder', `Fulfilled sales order: ${order.orderNumber}`, {
      entityId: id,
      userId: userId || 'system',
      username,
      oldValues: { status: SalesOrderStatus.DRAFT },
      newValues: { status: SalesOrderStatus.FULFILLED },
    });

    try {
      const fullOrder = await this.salesOrderRepository.findOne({
        where: { id },
        relations: { customer: true, items: { product: true } },
      });
      if (fullOrder) {
        await this.accountingService.postSalesOrderEntry(fullOrder, userId || 'system', username);
        this.logger.log(`Posted accounting entry for sales order ${fullOrder.orderNumber}`);
      }
    } catch (error) {
      this.logger.error(`Failed to post accounting entry for sales order ${id}: ${error.message}`, error.stack);
    }

    return saved;
  }

  async unfulfillOrder(id: string, userId?: string, username?: string): Promise<SalesOrder> {
    const order = await this.salesOrderRepository.findOne({
      where: { id },
      relations: { items: { product: true } },
    });

    if (!order) throw new NotFoundException('Sales order not found');
    if (order.status !== SalesOrderStatus.FULFILLED) {
      throw new ConflictException('Order is not fulfilled');
    }

    for (const item of order.items) {
      if (item.product) {
        try {
          await this.baseCostCalculator.restoreStock(item.productId, item.quantity);
        } catch (error) {
          this.logger.warn(`Failed to restore cost history for product ${item.productId}: ${error.message}`);
        }
      }
    }

    try {
      const result = await this.stockMovementService.deleteByReference('sales_order', order.id);
      this.logger.log(`Deleted ${result.deletedCount} stock movements for ${order.orderNumber}`);
    } catch (error) {
      this.logger.error(`Failed to delete stock movements for ${order.orderNumber}: ${error.message}`);
    }

    order.status = SalesOrderStatus.DRAFT;
    const saved = await this.salesOrderRepository.save(order);

    await this.auditLogService.log('UPDATE', 'SalesOrder', `Unfulfilled sales order: ${order.orderNumber}`, {
      entityId: id,
      userId: userId || 'system',
      username,
      oldValues: { status: SalesOrderStatus.FULFILLED },
      newValues: { status: SalesOrderStatus.DRAFT },
    });

    try {
      await this.accountingService.reverseSourceEntries('sales_order', id, userId || 'system');
      this.logger.log(`Reversed accounting entry for sales order ${order.orderNumber}`);
    } catch (error) {
      this.logger.error(
        `Failed to reverse accounting entry for sales order ${id}: ${error.message}`,
        error.stack,
      );
    }

    return saved;
  }
}
