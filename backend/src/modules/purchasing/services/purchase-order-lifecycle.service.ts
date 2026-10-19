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
  Product,
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
import { lockRowForUpdate, lockProductForStockUpdate } from '../../../common/db/tx-helpers';
import { resolveAppTimezone } from '../../../common/utils/app-calendar';
import { formatDateInTimezone } from '../../../common/utils/date-in-timezone';
import { AuditLogService } from '../../audit-logs/services';
import { BaseCostCalculatorService } from '../../inventory/services/base-cost-calculator.service';
import { StockMovementService } from '../../inventory/services/stock-movement.service';
import { createOccurrence } from '../../inventory/services/stock-occurrence';
import { SettingsService } from '../../settings/settings.service';
import { PurchaseCostHistory } from '../../../database/entities/purchase-cost-history.entity';
import {
  RECEIPT_LINE_EVIDENCE_VERSION,
  StockOccurrenceKind,
} from '../../../database/entities/stock-occurrence.entity';
import {
  AccountingSourceType,
  PostingType,
} from '../../../common/accounting-posting/enums';
import {
  assessReceiptReversal,
} from './receipt-reversal-evidence';
import { STOCK_EVIDENCE_HORIZON } from '../../../config/stock-evidence-horizon';

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
    @Inject(STOCK_EVIDENCE_HORIZON)
    private readonly horizon: Date | null,
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

      const items = [...(purchaseOrder.items || [])].sort(
        (left, right) => left.lineNumber - right.lineNumber,
      );

      // Hold every product lock in a stable order before any movement or batch
      // write. Line order is a business presentation detail, not a lock order.
      const productIds = [...new Set(items.map((item) => item.productId))].sort();
      for (const productId of productIds) {
        await lockProductForStockUpdate(manager, Product, productId);
      }

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
        receiptEvidenceVersion: RECEIPT_LINE_EVIDENCE_VERSION,
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
          purchaseOrderItemId: item.id,
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
          item.id,
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

  /**
   * Return a received purchase order to Ready non-destructively (#1406): reverse
   * exactly the receipt's stock, batches and journal entry, guarded by a
   * fail-closed evidence assessment, and record a linked reversal occurrence.
   * Nothing is deleted; a state the records cannot prove is refused.
   */
  async return(
    id: string,
    reason: string,
    userId?: string,
    username?: string,
  ): Promise<PurchaseOrder> {
    const timezone = await resolveAppTimezone(this.settingsService);

    const saved = await this.dataSource.transaction(async (manager: EntityManager) => {
      const purchaseOrder = await lockRowForUpdate(manager, PurchaseOrder, id, {
        relations: { items: { product: true }, supplier: true },
        notFoundMessage: 'Purchase order not found',
      });

      if (purchaseOrder.status !== PurchaseOrderStatus.RECEIVED) {
        throw new ConflictException('Order is not received');
      }

      const items = purchaseOrder.items ?? [];

      // Lock the products (ascending), then the batches (ascending), before the
      // assessment reads them: the locks are what make the assessment stable.
      const productIds = [...new Set(items.map((i) => i.productId))].sort();
      for (const productId of productIds) {
        await lockProductForStockUpdate(manager, Product, productId);
      }
      const batchRows: { id: string }[] = await manager.query(
        `SELECT id FROM purchase_cost_history WHERE "purchaseOrderId" = $1 ORDER BY id ASC`,
        [id],
      );
      for (const row of batchRows) {
        await lockRowForUpdate(manager, PurchaseCostHistory, row.id, {});
      }

      const assessment = await assessReceiptReversal(manager, purchaseOrder, this.horizon);
      if (assessment.ok === false) {
        throw new ConflictException(assessment.message);
      }
      const receipt = assessment.receipt;

      const now = new Date();
      const entryDate = formatDateInTimezone(now, timezone);

      // The reversal occurrence is created first so every reversal movement and
      // reversed batch can be traced to it.
      const reversal = await createOccurrence(manager, {
        kind: StockOccurrenceKind.RECEIPT_REVERSAL,
        documentType: 'purchase_order',
        documentId: id,
        occurredAt: now,
        actorUserId: userId,
        actorUsername: username,
        reversesOccurrenceId: receipt.occurrenceId ?? undefined,
        isLegacy: receipt.occurrenceId == null,
        legacyJournalEntryId: receipt.legacyEntryId ?? undefined,
        reason,
      });

      // One reversal movement per receipt movement, inserted once with the
      // original's value and its quantity negated.
      for (const line of receipt.lines) {
        await this.stockMovementService.create(
          {
            productId: line.productId,
            movementType: StockMovementType.PURCHASE_RECEIPT_REVERSAL,
            quantity: -Number(formatScale4(line.quantityMinor)),
            reason: `Reversal: ${reason}`,
            referenceType: 'purchase_order',
            referenceId: id,
            occurrenceId: reversal.id,
            purchaseOrderItemId: line.purchaseOrderItemId,
            reversesMovementId: line.movementId,
            totalValue: Number(formatScale4(line.movementValueMinor)),
          } as CreateStockMovementDto,
          userId,
          manager,
        );
      }

      // Zero and mark the batch, keeping the row.
      await manager
        .getRepository(PurchaseCostHistory)
        .createQueryBuilder()
        .update(PurchaseCostHistory)
        .set({
          remainingQuantity: 0,
          reversedAt: now,
          reversedByOccurrenceId: reversal.id,
        } as any)
        .where('"id" IN (:...batchIds)', {
          batchIds: receipt.lines.map((line) => line.batchId),
        })
        .execute();

      // Reverse the receipt entry: event-keyed for a new receipt, by entry id for
      // a legacy one.
      if (receipt.occurrenceId) {
        const result = await this.accounting.reverseEntryForEvent(
          {
            sourceType: AccountingSourceType.PURCHASE_ORDER,
            sourceDocumentId: id,
            sourceEventId: receipt.occurrenceId,
            expectedPostingType: PostingType.PURCHASE_RECEIVE,
            otherPostingTypes: [],
            entryDate,
            createdBy: username,
          },
          manager,
        );
        if (result.outcome !== 'reversed') {
          throw new ConflictException('The receipt entry is already reversed');
        }
      } else if (receipt.legacyEntryId) {
        const result = await this.accounting.reverseOriginalEntry(
          {
            originalEntryId: receipt.legacyEntryId,
            expectedSourceType: AccountingSourceType.PURCHASE_ORDER,
            expectedDocumentId: id,
            expectedPostingType: PostingType.PURCHASE_RECEIVE,
            entryDate,
            createdBy: username,
          },
          manager,
        );
        if (result.outcome !== 'reversed') {
          throw new ConflictException('The receipt entry is already reversed');
        }
      }

      // Recalculate each product's base cost from its (now empty) batches.
      for (const productId of productIds) {
        await this.baseCostCalculator.updateProductBaseCost(productId, manager);
      }

      await manager.getRepository(PurchaseOrderItem).update(
        { purchaseOrderId: id } as any,
        { receivedQuantity: 0 } as any,
      );
      await manager.getRepository(PurchaseOrder).update(id, {
        status: PurchaseOrderStatus.READY,
        receivedDate: null,
      });
      purchaseOrder.status = PurchaseOrderStatus.READY;
      purchaseOrder.receivedDate = null;

      return purchaseOrder;
    });

    await this.auditLogService.log(
      'UPDATE',
      'PurchaseOrder',
      `Returned purchase order: ${saved.orderNumber}`,
      {
        entityId: id,
        userId: userId || 'system',
        username,
        oldValues: { status: PurchaseOrderStatus.RECEIVED },
        newValues: { status: PurchaseOrderStatus.READY, reason },
      },
    );

    return saved;
  }
}
