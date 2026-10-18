import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
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
import { ACCOUNTING_POSTING_PORT } from '../../../common/accounting-posting/accounting-posting.port';
import type { AccountingPostingPort } from '../../../common/accounting-posting/accounting-posting.port';

import { formatMoney, formatScale4, quantizeToCents, toMinorUnits } from '@/common/utils/money';
import { lockRowForUpdate } from '../../../common/db/tx-helpers';
import { resolveAppTimezone } from '../../../common/utils/app-calendar';
import { formatDateInTimezone } from '../../../common/utils/date-in-timezone';
import { AuditLogService } from '../../audit-logs/services';
import { BaseCostCalculatorService } from '../../inventory/services/base-cost-calculator.service';
import { StockMovementService } from '../../inventory/services/stock-movement.service';
import { RETURN_TO_READY_UNAVAILABLE } from '../../inventory/stock-undo-unavailable';
import { SettingsService } from '../../settings/settings.service';

@Injectable()
export class PurchaseOrderLifecycleService {
  constructor(
    @InjectRepository(PurchaseOrder)
    private readonly purchaseOrderRepository: Repository<PurchaseOrder>,
    private readonly stockMovementService: StockMovementService,
    private readonly baseCostCalculator: BaseCostCalculatorService,
    private readonly auditLogService: AuditLogService,
    private readonly dataSource: DataSource,
    @Inject(ACCOUNTING_POSTING_PORT)
    private readonly accounting: AccountingPostingPort,
    private readonly settingsService: SettingsService,
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
        status === PurchaseOrderStatus.RECEIVED
          ? 'Cannot edit purchase order in RECEIVED status. Received orders cannot be edited.'
          : `Cannot edit purchase order in ${status} status. ${
              status === PurchaseOrderStatus.CANCELLED
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
    // Business calendar resolved before the transaction opens (issue #1134).
    const timezone = await resolveAppTimezone(this.settingsService);

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

      const items = purchaseOrder.items || [];

      // Allocate shipping across the whole PO at once so the shares sum to the
      // PO shipping total exactly (#1241). Weights are line values on the same
      // net basis the GL posts from: item.totalAmount (after line discount).
      const itemValueWeightsMinor = items.map((item) =>
        quantizeToCents(toMinorUnits(String(item.totalAmount || 0))),
      );
      const shippingSharesMinor = this.baseCostCalculator.allocateShippingByValue(
        quantizeToCents(toMinorUnits(String(purchaseOrder.shippingAmount || 0))),
        itemValueWeightsMinor,
      );

      // Pass 1: compute per-line landed cost and scale-8 value (no writes).
      const linePlans: Array<{
        item: any;
        quantity: number;
        netUnitCost: number;
        shippingPerUnit: number;
        landedCost: number;
        scale8: bigint;
        qtyMinor: bigint;
      }> = [];
      let inventoryScale8 = 0n;
      for (let i = 0; i < items.length; i += 1) {
        const item = items[i];
        const quantity = Number(item.quantity);
        const lineTotal = Number(item.totalAmount);
        const netUnitCost =
          quantity > 0 && Number.isFinite(lineTotal) && lineTotal > 0
            ? lineTotal / quantity
            : Number(item.unitCost);

        const qtyMinor = toMinorUnits(String(quantity));
        const shippingShareMinor = shippingSharesMinor[i] ?? 0n;
        const shippingPerUnit = Number(
          formatScale4(qtyMinor > 0n ? (shippingShareMinor * 10000n) / qtyMinor : 0n),
        );
        const landedCost = netUnitCost + shippingPerUnit;
        const scale8b = qtyMinor * toMinorUnits(landedCost.toFixed(4));
        inventoryScale8 += scale8b;

        linePlans.push({
          item,
          quantity,
          netUnitCost,
          shippingPerUnit,
          landedCost,
          scale8: scale8b,
          qtyMinor,
        });
      }

      const inventoryMinor = (inventoryScale8 + 5000n) / 10000n;
      const postedMinor = quantizeToCents(inventoryMinor);
      const postedAmount = formatMoney(postedMinor);

      // Create the occurrence first.
      const { createOccurrence } = await import('../../inventory/services/stock-occurrence');
      const occurrence = await createOccurrence(manager, {
        kind: 'receipt' as any,
        documentType: 'purchase_order',
        documentId: purchaseOrder.id,
        occurredAt: receiveDate,
        actorUserId: userId,
        actorUsername: username,
        postedAmount: Number(postedAmount),
        isLegacy: false,
      });

      // Allocate the posted amount across lines.
      const { allocateCents } = await import('../../../common/utils/money');
      const weightsScale8 = linePlans.map((p) => p.scale8);
      const allocatedMinor = allocateCents(postedMinor, weightsScale8);

      // Pass 2: writes.
      for (let i = 0; i < linePlans.length; i += 1) {
        const plan = linePlans[i];
        const item = plan.item;
        const allocated = allocatedMinor[i] ?? 0n;
        const totalValue = Number(formatScale4(allocated));

        const movementDto: CreateStockMovementDto = {
          productId: item.productId,
          movementType: StockMovementType.PURCHASE_RECEIPT,
          quantity: plan.quantity,
          reason: `Purchase order received: ${purchaseOrder.orderNumber}`,
          referenceType: 'purchase_order',
          referenceId: purchaseOrder.id,
          unitValue: plan.netUnitCost,
          occurrenceId: occurrence.id,
          totalValue,
        };

        await this.stockMovementService.create(movementDto, userId, manager);
        const persisted = await this.baseCostCalculator.addStock(
          item.productId,
          purchaseOrder.id,
          plan.quantity,
          plan.netUnitCost,
          plan.shippingPerUnit,
          receiveDate,
          manager,
          occurrence.id,
        );
        await manager.getRepository(PurchaseOrderItem).update(item.id, {
          receivedQuantity: plan.quantity,
        });
        item.receivedQuantity = plan.quantity;
      }

      await this.accounting.postPurchaseReceive({
        purchaseOrderId: id,
        sourceRef: purchaseOrder.orderNumber,
        amount: postedAmount,
        entryDate: formatDateInTimezone(receiveDate, timezone),
        createdBy: username,
        occurrenceId: occurrence.id,
      }, manager);

      await manager.getRepository(PurchaseOrder).update(id, {
        status: PurchaseOrderStatus.RECEIVED,
        receivedDate: receiveDate,
      });
      purchaseOrder.status = PurchaseOrderStatus.RECEIVED;
      purchaseOrder.receivedDate = receiveDate;

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
    throw new ConflictException(RETURN_TO_READY_UNAVAILABLE);
  }
}
