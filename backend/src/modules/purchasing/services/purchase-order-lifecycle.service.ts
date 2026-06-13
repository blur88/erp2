import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';

import {
  PurchaseOrder,
  PurchaseOrderItem,
  PurchaseOrderPaymentStatus,
  PurchaseOrderStatus,
} from '../../../database/entities';
import { StockMovementType } from '../../../database/entities/stock-movement.entity';
import { CreateStockMovementDto } from '../../inventory/dto/stock.dto';
import { lockRowForUpdate } from '../../../common/db/tx-helpers';
import { AuditLogService } from '../../audit-logs/services';
import { BaseCostCalculatorService } from '../../inventory/services/base-cost-calculator.service';
import { StockMovementService } from '../../inventory/services/stock-movement.service';
import { AccountingService } from '../../accounting/services/accounting.service';

@Injectable()
export class PurchaseOrderLifecycleService {
  private readonly logger = new Logger(PurchaseOrderLifecycleService.name);

  constructor(
    @InjectRepository(PurchaseOrder)
    private readonly purchaseOrderRepository: Repository<PurchaseOrder>,
    private readonly stockMovementService: StockMovementService,
    private readonly baseCostCalculator: BaseCostCalculatorService,
    private readonly accountingService: AccountingService,
    private readonly auditLogService: AuditLogService,
    private readonly dataSource: DataSource,
  ) {}

  async assertEditAllowed(purchaseOrderId: string): Promise<void> {
    const purchaseOrder = await this.purchaseOrderRepository.findOne({
      where: { id: purchaseOrderId },
    });

    if (!purchaseOrder) {
      throw new NotFoundException('Purchase order not found');
    }

    PurchaseOrderLifecycleService.assertStatusEditable(purchaseOrder.status);
  }

  static assertStatusEditable(status: PurchaseOrderStatus): void {
    if (status !== PurchaseOrderStatus.DRAFT && status !== PurchaseOrderStatus.READY) {
      throw new BadRequestException(
        `Cannot edit purchase order in ${status} status. ${
          status === PurchaseOrderStatus.RECEIVED
            ? 'Return the goods first.'
            : status === PurchaseOrderStatus.CANCELLED
              ? 'Uncancel the order first.'
              : 'Order must be paid in full (Ready) before editing.'
        }`,
      );
    }
  }

  async cancel(id: string, userId?: string, username?: string): Promise<PurchaseOrder> {
    const saved = await this.dataSource.transaction(async (manager: EntityManager) => {
      const purchaseOrder = await lockRowForUpdate(manager, PurchaseOrder, id, {
        notFoundMessage: 'Purchase order not found',
      });

      if (purchaseOrder.status === PurchaseOrderStatus.RECEIVED) {
        throw new ConflictException('Return goods first.');
      }

      if (purchaseOrder.status === PurchaseOrderStatus.CANCELLED) {
        throw new ConflictException('Order is already cancelled.');
      }

      if (purchaseOrder.paymentStatus !== PurchaseOrderPaymentStatus.UNPAID) {
        throw new ConflictException(
          'Cannot cancel an order with recorded payments. Refund all payments first.',
        );
      }

      await manager.getRepository(PurchaseOrder).update(id, {
        status: PurchaseOrderStatus.CANCELLED,
      });
      purchaseOrder.status = PurchaseOrderStatus.CANCELLED;
      return purchaseOrder;
    });

    await this.auditLogService.log(
      'UPDATE',
      'PurchaseOrder',
      `Cancelled purchase order: ${saved.orderNumber}`,
      {
        entityId: id,
        userId: userId || 'system',
        username,
        oldValues: { status: PurchaseOrderStatus.DRAFT },
        newValues: { status: PurchaseOrderStatus.CANCELLED },
      },
    );

    return saved;
  }

  async uncancel(id: string, userId?: string, username?: string): Promise<PurchaseOrder> {
    const saved = await this.dataSource.transaction(async (manager: EntityManager) => {
      const purchaseOrder = await lockRowForUpdate(manager, PurchaseOrder, id, {
        notFoundMessage: 'Purchase order not found',
      });

      if (purchaseOrder.status !== PurchaseOrderStatus.CANCELLED) {
        throw new ConflictException('Order is not cancelled.');
      }

      await manager.getRepository(PurchaseOrder).update(id, {
        status: PurchaseOrderStatus.DRAFT,
      });
      purchaseOrder.status = PurchaseOrderStatus.DRAFT;
      return purchaseOrder;
    });

    await this.auditLogService.log(
      'UPDATE',
      'PurchaseOrder',
      `Uncancelled purchase order: ${saved.orderNumber}`,
      {
        entityId: id,
        userId: userId || 'system',
        username,
        oldValues: { status: PurchaseOrderStatus.CANCELLED },
        newValues: { status: PurchaseOrderStatus.DRAFT },
      },
    );

    return saved;
  }

  async receive(id: string, userId?: string, username?: string): Promise<PurchaseOrder> {
    const saved = await this.dataSource.transaction(async (manager: EntityManager) => {
      const purchaseOrder = await lockRowForUpdate(manager, PurchaseOrder, id, {
        relations: { items: { product: true }, supplier: true },
        notFoundMessage: 'Purchase order not found',
      });

      if (purchaseOrder.status === PurchaseOrderStatus.RECEIVED) {
        throw new ConflictException('Order is already received');
      }

      if (purchaseOrder.status !== PurchaseOrderStatus.READY) {
        throw new ConflictException('Cannot receive order - order must be Ready');
      }

      const receiveDate = new Date();
      const poSubtotal = Number(purchaseOrder.subtotal || 0);
      const poShipping = Number(purchaseOrder.shippingAmount || 0);

      for (const item of purchaseOrder.items || []) {
        const quantity = Number(item.quantity);
        // Capitalize inventory at the NET (after line discount) unit cost so the
        // cost-history subledger matches the GL inventory debit, which the
        // accounting entry posts from item.totalAmount (also net of discount).
        // PO.subtotal is the sum of item.totalAmount, so the shipping-by-value
        // share is computed on the same net basis for both numerator and
        // denominator.
        // item.totalAmount is the line total net of discount; divide back to a
        // per-unit net cost. Fall back to the raw unitCost if the line total is
        // missing or non-positive.
        const lineTotal = Number(item.totalAmount);
        const netUnitCost =
          quantity > 0 && Number.isFinite(lineTotal) && lineTotal > 0
            ? lineTotal / quantity
            : Number(item.unitCost);
        const shippingPerUnit = this.baseCostCalculator.calculateShippingByValue(
          netUnitCost,
          quantity,
          poSubtotal,
          poShipping,
        );

        const movementDto: CreateStockMovementDto = {
          productId: item.productId,
          movementType: StockMovementType.PURCHASE_RECEIPT,
          quantity,
          reason: `Purchase order received: ${purchaseOrder.orderNumber}`,
          referenceType: 'purchase_order',
          referenceId: purchaseOrder.id,
          unitValue: netUnitCost,
        };

        await this.stockMovementService.create(movementDto, userId, manager);
        await this.baseCostCalculator.addStock(
          item.productId,
          purchaseOrder.id,
          quantity,
          netUnitCost,
          shippingPerUnit,
          receiveDate,
          manager,
        );

        await manager.getRepository(PurchaseOrderItem).update(item.id, {
          receivedQuantity: quantity,
        });
        item.receivedQuantity = quantity;
      }

      await manager.getRepository(PurchaseOrder).update(id, {
        status: PurchaseOrderStatus.RECEIVED,
      });
      purchaseOrder.status = PurchaseOrderStatus.RECEIVED;

      await this.accountingService.postPurchaseReceiptEntry(
        purchaseOrder,
        userId || 'system',
        receiveDate,
        username,
      );

      return purchaseOrder;
    });

    await this.auditLogService.log('UPDATE', 'PurchaseOrder', `Received purchase order: ${saved.orderNumber}`, {
      entityId: id,
      userId: userId || 'system',
      username,
      oldValues: { status: PurchaseOrderStatus.READY },
      newValues: { status: PurchaseOrderStatus.RECEIVED },
    });

    return saved;
  }

  async return(id: string, userId?: string, username?: string): Promise<PurchaseOrder> {
    const saved = await this.dataSource.transaction(async (manager: EntityManager) => {
      const purchaseOrder = await lockRowForUpdate(manager, PurchaseOrder, id, {
        relations: { items: { product: true } },
        notFoundMessage: 'Purchase order not found',
      });

      if (purchaseOrder.status !== PurchaseOrderStatus.RECEIVED) {
        throw new ConflictException('Order is not received');
      }

      for (const item of purchaseOrder.items || []) {
        await this.baseCostCalculator.removeStock(item.productId, purchaseOrder.id, manager);
        await manager.getRepository(PurchaseOrderItem).update(item.id, {
          receivedQuantity: 0,
        });
        item.receivedQuantity = 0;
      }

      await this.stockMovementService.deleteByReference('purchase_order', purchaseOrder.id, manager);

      await manager.getRepository(PurchaseOrder).update(id, {
        status: PurchaseOrderStatus.READY,
      });
      purchaseOrder.status = PurchaseOrderStatus.READY;

      await this.accountingService.reverseSourceEntries(
        'purchase_order',
        id,
        userId || 'system',
        manager,
      );

      return purchaseOrder;
    });

    await this.auditLogService.log('UPDATE', 'PurchaseOrder', `Returned purchase order: ${saved.orderNumber}`, {
      entityId: id,
      userId: userId || 'system',
      username,
      oldValues: { status: PurchaseOrderStatus.RECEIVED },
      newValues: { status: PurchaseOrderStatus.READY },
    });

    return saved;
  }
}
