import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Invoice } from '../../../database/entities/invoice.entity';
import { SalesOrder } from '../../../database/entities/sales-order.entity';
import { StockMovementService } from '../../../modules/inventory/services/stock-movement.service';
import { AuditLogService } from '../../audit-logs/services';
import { AccountingService } from '../../accounting/services/accounting.service';
import { BaseCostCalculatorService } from '../../inventory/services/base-cost-calculator.service';
import { InventoryIntegrationService } from './inventory-integration.service';

@Injectable()
export class SalesOrderFulfillmentService {
  private readonly logger = new Logger(SalesOrderFulfillmentService.name);

  constructor(
    @InjectRepository(SalesOrder)
    private readonly salesOrderRepository: Repository<SalesOrder>,
    @InjectRepository(Invoice)
    private readonly invoiceRepository: Repository<Invoice>,
    private readonly inventoryIntegrationService: InventoryIntegrationService,
    private readonly stockMovementService: StockMovementService,
    private readonly baseCostCalculator: BaseCostCalculatorService,
    private readonly accountingService: AccountingService,
    private readonly auditLogService: AuditLogService,
  ) {}

  async fulfillOrder(id: string, userId?: string, username?: string): Promise<SalesOrder> {
    const order = await this.salesOrderRepository.findOne({
      where: { id },
      relations: { customer: true, items: { product: true } },
    });

    if (!order) {
      throw new NotFoundException('Sales order not found');
    }

    if (order.isFulfilled) {
      throw new ConflictException('Order is already fulfilled');
    }

    if (!order.isPaidInFull) {
      throw new ConflictException(
        `Cannot fulfill order. Payment required: ${order.balanceDue}. Received: ${order.paidAmount}`,
      );
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

    order.isFulfilled = true;
    order.fulfilledDate = new Date();

    const savedOrder = await this.salesOrderRepository.save(order);

    await this.auditLogService.log('FULFILL', 'SalesOrder', `Fulfilled sales order: ${order.orderNumber}`, {
      entityId: id,
      userId: userId || 'system',
      username,
      oldValues: { isFulfilled: false },
      newValues: { isFulfilled: true, fulfilledDate: order.fulfilledDate },
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
      this.logger.error(
        `Failed to post accounting entry for sales order ${id}: ${error.message}`,
        error.stack,
      );
    }

    return savedOrder;
  }

  async unfulfillOrder(id: string): Promise<SalesOrder> {
    const order = await this.salesOrderRepository.findOne({
      where: { id },
      relations: { customer: true, items: { product: true } },
    });

    if (!order) {
      throw new NotFoundException('Sales order not found');
    }

    if (!order.isFulfilled) {
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
      const stockMovementResult = await this.stockMovementService.deleteByReference(
        'sales_order',
        order.id,
      );
      this.logger.log(
        `Deleted ${stockMovementResult.deletedCount} stock movements for sales order ${order.orderNumber} unfulfillment`,
      );
    } catch (error) {
      this.logger.error(`Failed to delete stock movements for sales order ${order.orderNumber}: ${error.message}`);
    }

    try {
      await this.accountingService.reverseSourceEntries('sales_order', id, 'system');
      this.logger.log(`Reversed accounting entries for sales order ${order.orderNumber}`);
    } catch (error) {
      this.logger.error(`Failed to reverse JE for order ${id}: ${error.message}`);
    }

    order.isFulfilled = false;
    order.fulfilledDate = null;

    const savedOrder = await this.salesOrderRepository.save(order);

    await this.auditLogService.log('UPDATE', 'SalesOrder', `Unfulfilled sales order: ${order.orderNumber}`, {
      entityId: id,
      userId: 'system',
      oldValues: { isFulfilled: true },
      newValues: { isFulfilled: false, fulfilledDate: null },
    });

    return savedOrder;
  }
}
