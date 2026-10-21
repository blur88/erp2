import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import {
  Product,
  ProductType,
} from '../../../database/entities/product.entity';
import { StockMovementType } from '../../../database/entities/stock-movement.entity';
import { StockMovementService } from '../../inventory/services/stock-movement.service';
import { ACCOUNTING_POSTING_PORT } from '../../../common/accounting-posting/accounting-posting.port';
import type { AccountingPostingPort } from '../../../common/accounting-posting/accounting-posting.port';
import {
  AccountingSourceType,
  PostingType,
} from '../../../common/accounting-posting/enums';
import { lockRowForUpdate } from '../../../common/db/tx-helpers';
import { resolveAppTimezone } from '../../../common/utils/app-calendar';
import { formatDateInTimezone } from '../../../common/utils/date-in-timezone';
import { SettingsService } from '../../settings/settings.service';
import { InventoryValuationService } from '../../inventory/valuation/inventory-valuation.service';
import { StockValuationEntryKind } from '../../../database/entities/stock-valuation-entry.entity';
import { BaseCostCalculatorService } from '../../inventory/services/base-cost-calculator.service';
import { unitValueScale4 } from '../../inventory/valuation/valuation-math';
import {
  toMinorUnits,
  formatMoney,
  formatScale4,
  mulMinor,
  quantizeToCents,
  trimTrailingZeros,
} from '@/common/utils/money';
import {
  OwnerEquityDocument,
  OwnerEquityDocumentStatus,
  OwnerEquityType,
} from '../entities/owner-equity-document.entity';

@Injectable()
export class OwnerEquityStockService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly stockMovementService: StockMovementService,
    @Inject(ACCOUNTING_POSTING_PORT)
    private readonly posting: AccountingPostingPort,
    private readonly settingsService: SettingsService,
    private readonly inventoryValuation: InventoryValuationService,
    private readonly baseCostCalculator: BaseCostCalculatorService,
  ) {}

  async complete(
    referenceNumber: string,
    _userId?: string,
    username?: string,
  ): Promise<OwnerEquityDocument> {
    // Business calendar resolved before the transaction opens (issue #1134).
    const timezone = await resolveAppTimezone(this.settingsService);

    return this.dataSource.transaction(async (manager: EntityManager) => {
      const doc = await this.lockByReference(manager, referenceNumber);
      if (doc.type !== OwnerEquityType.STOCK_DRAWING) {
        throw new BadRequestException('Not a stock drawing');
      }
      if (doc.documentStatus !== OwnerEquityDocumentStatus.DRAFT) {
        throw new BadRequestException('Only draft stock drawings can be completed');
      }
      const product = await manager.findOne(Product, {
        where: { id: doc.productId },
        lock: { mode: 'pessimistic_write' },
        loadEagerRelations: false,
      } as any);
      if (!product) throw new BadRequestException('Product not found');
      if (product.type !== ProductType.GOODS) {
        throw new BadRequestException(
          'Only Stocked Product items can be drawn; services have no inventory',
        );
      }
      const qtyMinor = toMinorUnits(doc.quantity);
      const stockMinor = toMinorUnits(String(product.stockQuantity));
      if (qtyMinor > stockMinor) {
        throw new BadRequestException(
          `Quantity ${trimTrailingZeros(String(doc.quantity))} exceeds available stock ` +
            `${trimTrailingZeros(String(product.stockQuantity))}`,
        );
      }
      const valuationActive = await this.inventoryValuation.isActive(manager);
      const physicalPlan = valuationActive
        ? (await this.baseCostCalculator.planPhysicalConsumption(manager, [{ productId: product.id, quantity: Number(doc.quantity) }]))[0]
        : undefined;
      const pending = valuationActive
        ? await this.inventoryValuation.valueDecrease(manager, product.id, qtyMinor, StockValuationEntryKind.ISSUE)
        : undefined;
      const valueCents = pending ? -pending.valueCents : 0n;
      const unitCostMinor = pending
        ? unitValueScale4(qtyMinor, valueCents) ?? 0n
        : toMinorUnits(String(product.baseCost ?? 0));
      const totalCostMinor = pending ? valueCents * 100n : mulMinor(qtyMinor, unitCostMinor);

      const movement = await this.stockMovementService.create({
        productId: product.id,
        movementType: StockMovementType.OWNER_DRAWING,
        quantity: -Number(doc.quantity),
        unitValue: Number(formatScale4(unitCostMinor)),
        referenceType: 'owner_equity',
        referenceId: doc.id,
        reason: `Owner Stock Drawing ${doc.referenceNumber}`,
        notes: doc.notes,
      }, undefined, manager);
      if (valuationActive && pending && physicalPlan) {
        await this.baseCostCalculator.recordConsumptions(manager, movement.id, physicalPlan.consumptions);
      }

      // One instant for both the JE date and completedAt, so the two can never
      // straddle a midnight boundary. The JE takes the completion ACTION date,
      // not doc.equityDate — issue #1132, superseding the original spec §5.4.
      // That instant is resolved against the configured business calendar, not
      // UTC — issue #1134.
      const completedAt = new Date();
      const actionDate = formatDateInTimezone(completedAt, timezone);

      // Zero cost: the inventory moved, but a zero-value JE is meaningless and
      // CHK_jel_nonneg-adjacent. Mirrors postSalesFulfillment's COGS gate
      // (accounting-posting.service.ts:110-121). Uncomplete then legitimately
      // finds nothing to reverse.
      let journalEntryId: string | null = null;
      if (totalCostMinor > 0n) {
        const posted = await this.posting.postOwnerStockDrawing({
          equityDocumentId: doc.id,
          stockMovementId: movement.id,
          amount: formatMoney(quantizeToCents(totalCostMinor)),
          sourceRef: doc.referenceNumber,
          entryDate: actionDate,
          createdBy: username,
        }, manager);
        journalEntryId = posted.journalEntryId;
      }
      if (valuationActive && pending)
        await this.inventoryValuation.commit(manager, [pending], [movement.id], journalEntryId, _userId);

      doc.unitCost = formatScale4(unitCostMinor);
      doc.totalCost = formatScale4(totalCostMinor);
      doc.documentStatus = OwnerEquityDocumentStatus.COMPLETED;
      doc.completedAt = completedAt;
      doc.completedBy = username ?? 'system';
      return manager.getRepository(OwnerEquityDocument).save(doc);
    });
  }

  async uncomplete(
    referenceNumber: string,
    _userId?: string,
    username?: string,
  ): Promise<OwnerEquityDocument> {
    const timezone = await resolveAppTimezone(this.settingsService);
    const uncompleteInstant = new Date();

    return this.dataSource.transaction(async (manager: EntityManager) => {
      const doc = await this.lockByReference(manager, referenceNumber);
      if (doc.type !== OwnerEquityType.STOCK_DRAWING) {
        throw new BadRequestException('Not a stock drawing');
      }
      if (doc.documentStatus !== OwnerEquityDocumentStatus.COMPLETED) {
        throw new BadRequestException(
          'Only completed stock drawings can be uncompleted',
        );
      }
      const product = await manager.findOne(Product, {
        where: { id: doc.productId },
        lock: { mode: 'pessimistic_write' },
        loadEagerRelations: false,
      } as any);
      if (!product) throw new BadRequestException('Product not found');

      const valuationActive = await this.inventoryValuation.isActive(manager);
      let pending;
      let originalMovementId: string | undefined;
      if (valuationActive) {
        const [movement] = await manager.query(
          `SELECT id FROM stock_movements WHERE "referenceType" = 'owner_equity' AND "referenceId" = $1 AND "movementType" = 'owner_drawing' ORDER BY "productSequence" DESC LIMIT 1 FOR UPDATE`,
          [doc.id],
        );
        originalMovementId = movement?.id;
        const original = originalMovementId
          ? await this.inventoryValuation.entryForMovement(manager, originalMovementId)
          : null;
        if (!original)
          throw new ConflictException('This drawing predates inventory valuation; its value is part of the approved opening position. Use a stock correction.');
        pending = await this.inventoryValuation.valueDecreaseReversal(manager, original);
        await this.baseCostCalculator.restoreConsumptions(manager, originalMovementId!);
      }

      // Compensating movement, never reverseMovement(): the latter absolute-sets
      // stock to the original movement's newBalance
      // (stock-movement.service.ts:272-300), overwriting any movement recorded
      // in between.
      const reversalMovement = await this.stockMovementService.create({
        productId: doc.productId,
        movementType: StockMovementType.OWNER_DRAWING_REVERSAL,
        quantity: Number(doc.quantity),
        unitValue: doc.unitCost ? Number(doc.unitCost) : 0,
        referenceType: 'owner_equity',
        referenceId: doc.id,
        reason: `Owner Stock Drawing Reversal ${doc.referenceNumber}`,
        notes: doc.notes,
      }, undefined, manager);

      const reversals = await this.posting.reverseEntriesForDocument(
        AccountingSourceType.OWNER_EQUITY,
        doc.id,
        [PostingType.OWNER_STOCK_DRAWING],
        // Uncomplete action date, in the configured business calendar (#1134).
        formatDateInTimezone(uncompleteInstant, timezone),
        manager,
        username,
      );
      if (valuationActive && pending)
        await this.inventoryValuation.commit(
          manager,
          [pending],
          [reversalMovement.id],
          reversals[0]?.journalEntryId ?? null,
          _userId,
        );

      doc.unitCost = null;
      doc.totalCost = null;
      doc.completedAt = null;
      doc.completedBy = null;
      doc.documentStatus = OwnerEquityDocumentStatus.DRAFT;
      return manager.getRepository(OwnerEquityDocument).save(doc);
    });
  }

  private async lockByReference(
    manager: EntityManager,
    referenceNumber: string,
  ): Promise<OwnerEquityDocument> {
    const repo = manager.getRepository(OwnerEquityDocument);
    const existing = await repo.findOne({
      where: { referenceNumber },
    } as any);
    if (!existing) {
      throw new NotFoundException('Owner equity document not found');
    }
    return lockRowForUpdate(manager, OwnerEquityDocument, existing.id, {
      notFoundMessage: 'Owner equity document not found',
    });
  }
}
