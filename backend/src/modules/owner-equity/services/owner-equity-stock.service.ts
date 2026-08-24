import {
  BadRequestException,
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
import {
  ACCOUNTING_POSTING_PORT,
  AccountingPostingPort,
} from '../../../common/accounting-posting/accounting-posting.port';
import {
  AccountingSourceType,
  PostingType,
} from '../../../common/accounting-posting/enums';
import { lockRowForUpdate } from '../../../common/db/tx-helpers';
import {
  toMinorUnits,
  formatScale4,
  mulMinor,
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
  ) {}

  async complete(
    referenceNumber: string,
    _userId?: string,
    username?: string,
  ): Promise<OwnerEquityDocument> {
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
      const unitCostMinor = toMinorUnits(String(product.baseCost ?? 0));
      const totalCostMinor = mulMinor(qtyMinor, unitCostMinor);

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

      // One instant for both the JE date and completedAt, so the two can never
      // straddle a midnight boundary. The JE takes the completion ACTION date,
      // not doc.equityDate — issue #1132, superseding the original spec §5.4.
      const completedAt = new Date();
      const actionDate = completedAt.toISOString().slice(0, 10);

      // Zero cost: the inventory moved, but a zero-value JE is meaningless and
      // CHK_jel_nonneg-adjacent. Mirrors postSalesFulfillment's COGS gate
      // (accounting-posting.service.ts:110-121). Uncomplete then legitimately
      // finds nothing to reverse.
      if (totalCostMinor > 0n) {
        await this.posting.postOwnerStockDrawing({
          equityDocumentId: doc.id,
          stockMovementId: movement.id,
          amount: formatScale4(totalCostMinor),
          sourceRef: doc.referenceNumber,
          entryDate: actionDate,
          createdBy: username,
        }, manager);
      }

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

      // Compensating movement, never reverseMovement(): the latter absolute-sets
      // stock to the original movement's newBalance
      // (stock-movement.service.ts:272-300), overwriting any movement recorded
      // in between.
      await this.stockMovementService.create({
        productId: doc.productId,
        movementType: StockMovementType.OWNER_DRAWING_REVERSAL,
        quantity: Number(doc.quantity),
        unitValue: doc.unitCost ? Number(doc.unitCost) : 0,
        referenceType: 'owner_equity',
        referenceId: doc.id,
        reason: `Owner Stock Drawing Reversal ${doc.referenceNumber}`,
        notes: doc.notes,
      }, undefined, manager);

      await this.posting.reverseEntriesForDocument(
        AccountingSourceType.OWNER_EQUITY,
        doc.id,
        [PostingType.OWNER_STOCK_DRAWING],
        new Date().toISOString().slice(0, 10),   // Uncomplete action date (UTC)
        manager,
        username,
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
