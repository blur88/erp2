import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import { BaseCrudService } from '../../../common/services/base-crud.service';
import {
  StockAdjustment,
  StockAdjustmentItem,
  StockAdjustmentStatus,
} from '../../../database/entities/stock-adjustment.entity';
import { Product, ProductType } from '../../../database/entities/product.entity';
import { User } from '../../../database/entities/user.entity';
import {
  CreateStockAdjustmentDto,
  UpdateStockAdjustmentDto,
  QueryStockAdjustmentsDto,
  StockAdjustmentResponseDto,
  StockAdjustmentListResponseDto,
  StockAdjustmentItemResponseDto,
  StockAdjustmentItemDto,
} from '../dto/stock-adjustment.dto';
import { StockMovementService } from './stock-movement.service';
import { StockMovementType, StockMovement } from '../../../database/entities/stock-movement.entity';
import { SettingsService } from '../../settings/settings.service';
import { AuditLogService } from '../../audit-logs/services';
import { ACCOUNTING_POSTING_PORT } from '../../../common/accounting-posting/accounting-posting.port';
import type { AccountingPostingPort } from '../../../common/accounting-posting/accounting-posting.port';
import { AccountingSourceType, PostingType } from '../../../common/accounting-posting/enums';
import { formatScale4, toMinorUnits } from '@/common/utils/money';

@Injectable()
export class StockAdjustmentService extends BaseCrudService<
  StockAdjustment,
  CreateStockAdjustmentDto,
  UpdateStockAdjustmentDto,
  QueryStockAdjustmentsDto
> {
  private readonly logger = new Logger(StockAdjustmentService.name);

  constructor(
    @InjectRepository(StockAdjustment)
    private readonly stockAdjustmentRepository: Repository<StockAdjustment>,
    @InjectRepository(StockAdjustmentItem)
    private readonly stockAdjustmentItemRepository: Repository<StockAdjustmentItem>,
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(StockMovement)
    private readonly stockMovementRepository: Repository<StockMovement>,
    @Inject(forwardRef(() => StockMovementService))
    private readonly stockMovementService: StockMovementService,
    private readonly dataSource: DataSource,
    private readonly settingsService: SettingsService,
    auditLogService: AuditLogService,
    @Inject(ACCOUNTING_POSTING_PORT)
    private readonly accounting: AccountingPostingPort,
  ) {
    super(stockAdjustmentRepository, auditLogService);
  }

  getEntityType(): string {
    return 'StockAdjustment';
  }

  buildWhereClause(query: QueryStockAdjustmentsDto) {
    const where: Record<string, unknown> = {};
    if (query.status) {
      where.status = query.status;
    }
    return where as any;
  }

  protected async afterDelete(adjustment: StockAdjustment): Promise<void> {
    if (adjustment.status !== StockAdjustmentStatus.DRAFT) {
      throw new BadRequestException('Only draft adjustments can be deleted');
    }
  }

  private assertNoServiceProducts(products: Product[]): void {
    if (products.some(p => p.type === ProductType.SERVICE)) {
      throw new BadRequestException(
        'Service products are not valid for stock adjustments',
      );
    }
  }

  private assertNoDuplicateProducts(items: { productId: string }[]): void {
    const seen = new Set<string>();
    for (const item of items) {
      if (seen.has(item.productId)) {
        throw new BadRequestException(
          'Duplicate product in stock adjustment items — each product may appear only once',
        );
      }
      seen.add(item.productId);
    }
  }

  /**
   * Generate SA reference number for stock adjustments
   */
  private async generateSANumber(): Promise<string> {
    // Use document number settings to generate SA number
    try {
      const saNumber = await this.settingsService.generateDocumentNumber('Stock Adjustment');
      this.logger.log(`Generated stock adjustment number: ${saNumber}`);
      return saNumber;
    } catch (error) {
      this.logger.error(`Error generating SA number: ${error.message}`);
      // Fallback to legacy method
      const result = await this.stockAdjustmentRepository
        .createQueryBuilder('adjustment')
        .select('adjustment.adjustmentNumber', 'adjustmentNumber')
        .where('adjustment.adjustmentNumber LIKE :pattern', { pattern: 'SA-%' })
        .orderBy('adjustment.adjustmentNumber', 'DESC')
        .limit(1)
        .getRawOne();

      let nextNumber = 1;
      if (result?.adjustmentNumber) {
        const currentNumber = parseInt(result.adjustmentNumber.replace('SA-', ''), 10);
        nextNumber = currentNumber + 1;
      }

      const fallbackNumber = `SA-${String(nextNumber).padStart(6, '0')}`;
      this.logger.log(`Fallback stock adjustment number: ${fallbackNumber}`);
      return fallbackNumber;
    }
  }

  /** Largest magnitude representable by the NUMERIC(15, 4) quantity columns. */
  private static readonly QUANTITY_MINOR_LIMIT = 10n ** 15n;

  /**
   * newQuantity is derived, never client-supplied: difference is the command.
   *
   * Scale-4 BigInt arithmetic — the quantity columns are NUMERIC(15, 4) and float
   * addition can't be trusted to land on the stored value.
   *
   * Converts both operands, bounds-checks them and their sum, and returns the sum
   * in minor units. Throws ordinary `Error` on conversion or range failure — never
   * an HTTP exception — and does NOT apply the non-negative business rule. Both
   * belong to the caller, so error presentation stays where the item index and
   * productId are in scope.
   */
  private deriveNewQuantityMinor(oldQuantity: number, difference: number): bigint {
    const oldMinor = toMinorUnits(String(oldQuantity));
    const differenceMinor = toMinorUnits(String(difference));
    this.assertQuantityInRange(oldMinor);
    this.assertQuantityInRange(differenceMinor);

    const derivedMinor = oldMinor + differenceMinor;
    this.assertQuantityInRange(derivedMinor);
    return derivedMinor;
  }

  private assertQuantityInRange(minor: bigint): void {
    const magnitude = minor < 0n ? -minor : minor;
    if (magnitude >= StockAdjustmentService.QUANTITY_MINOR_LIMIT) {
      throw new Error(
        `Quantity ${formatScale4(minor)} exceeds the supported range for a stock adjustment`,
      );
    }
  }

  /**
   * Caller-side wrapper: turns the helper's plain Errors into line-specific
   * BadRequestExceptions, applies the non-negative rule, and formats for storage.
   * Returns a scale-4 string written straight to the NUMERIC column.
   */
  private deriveItemNewQuantity(itemDto: StockAdjustmentItemDto, index: number): string {
    const position = `Item ${index + 1} (product ${itemDto.productId})`;

    let derivedMinor: bigint;
    try {
      derivedMinor = this.deriveNewQuantityMinor(itemDto.oldQuantity, itemDto.difference);
    } catch (error) {
      throw new BadRequestException(`${position}: ${(error as Error).message}`);
    }

    if (derivedMinor < 0n) {
      throw new BadRequestException(
        `${position}: difference ${itemDto.difference} applied to stock ${itemDto.oldQuantity} ` +
        `would result in negative quantity ${formatScale4(derivedMinor)}.`,
      );
    }

    return formatScale4(derivedMinor);
  }

  /**
   * Create a new stock adjustment (as draft)
   */
  async create(
    createDto: CreateStockAdjustmentDto,
    userId?: string,
    username?: string,
  ): Promise<StockAdjustmentResponseDto> {
    this.logger.log(`Creating stock adjustment with ${createDto.items.length} items`);

    // Validate items
    if (!createDto.items || createDto.items.length === 0) {
      throw new BadRequestException('Stock adjustment must have at least one item');
    }
    this.assertNoDuplicateProducts(createDto.items);

    // Verify all products exist
    const productIds = createDto.items.map(item => item.productId);
    const products = await this.productRepository.findBy({ id: In(productIds) });
    if (products.length !== productIds.length) {
      throw new BadRequestException('One or more products not found');
    }
    this.assertNoServiceProducts(products);

    // Derive every quantity BEFORE generating the SA number: generateSANumber
    // commits its sequence increment independently of this request, so a
    // rejection after it would permanently consume an adjustment number.
    const derivedNewQuantities = createDto.items.map((itemDto, index) =>
      this.deriveItemNewQuantity(itemDto, index),
    );

    // Generate SA number
    const adjustmentNumber = await this.generateSANumber();

    // Calculate total value
    let totalValue = 0;
    const items: StockAdjustmentItem[] = [];

    for (const [index, itemDto] of createDto.items.entries()) {
      const product = products.find(p => p.id === itemDto.productId);
      if (!product) continue;

      const newQuantity = derivedNewQuantities[index];

      const unitCost = itemDto.unitCost ?? Number(product.baseCost);
      const itemTotalValue = Math.abs(itemDto.difference) * unitCost;
      totalValue += itemTotalValue;

      const item = this.stockAdjustmentItemRepository.create({
        productId: itemDto.productId,
        oldQuantity: itemDto.oldQuantity,
        newQuantity: newQuantity as any, // scale-4 string; entity types it as number
        difference: itemDto.difference,
        unitCost,
        totalValue: itemTotalValue,
        notes: itemDto.notes,
      });

      items.push(item);
    }

    // Create adjustment
    const adjustment = this.stockAdjustmentRepository.create({
      adjustmentNumber,
      adjustmentDate: createDto.adjustmentDate,
      status: StockAdjustmentStatus.DRAFT,
      notes: createDto.notes,
      itemCount: items.length,
      totalValue,
      items,
    });

    const saved = await this.stockAdjustmentRepository.save(adjustment);
    this.logger.log(`Stock adjustment ${adjustmentNumber} created successfully`);

    // Log audit trail for create
    await this.auditLogService.log(
      'CREATE',
      'StockAdjustment',
      `Created stock adjustment: ${adjustmentNumber} (${items.length} items, RM ${totalValue.toFixed(2)})`,
      {
        entityId: saved.id,
        userId: userId || 'system',
        username,
        newValues: {
          adjustmentNumber,
          itemCount: items.length,
          totalValue,
          status: StockAdjustmentStatus.DRAFT,
        },
      }
    );

    return this.findOne(saved.id);
  }

  /**
   * Find all stock adjustments with filtering (no pagination)
   */
  async findAll(query: QueryStockAdjustmentsDto) {
    const {
      status,
      fromDate,
      toDate,
      search,
      categoryId,
      sortBy = 'adjustmentNumber',
      sortOrder = 'ASC',
    } = query;

    const queryBuilder = this.stockAdjustmentRepository
      .createQueryBuilder('adjustment')
      .leftJoin('adjustment.items', 'item')
      .leftJoin('item.product', 'product')
      .where('adjustment.deletedAt IS NULL');

    // Apply filters
    if (status) {
      queryBuilder.andWhere('adjustment.status = :status', { status });
    }

    if (fromDate && toDate) {
      queryBuilder.andWhere('adjustment.adjustmentDate BETWEEN :fromDate AND :toDate', {
        fromDate,
        toDate,
      });
    } else if (fromDate) {
      queryBuilder.andWhere('adjustment.adjustmentDate >= :fromDate', { fromDate });
    } else if (toDate) {
      queryBuilder.andWhere('adjustment.adjustmentDate <= :toDate', { toDate });
    }

    if (search) {
      queryBuilder.andWhere(
        '(adjustment.adjustmentNumber ILIKE :search OR adjustment.notes ILIKE :search OR product.name ILIKE :search)',
        { search: `%${search}%` },
      );
    }

    if (categoryId) {
      queryBuilder.andWhere('product.categoryId = :categoryId', { categoryId });
    }

    // Apply sorting
    const validSortFields = ['adjustmentDate', 'adjustmentNumber', 'totalValue', 'itemCount'];
    const sortField = validSortFields.includes(sortBy) ? sortBy : 'adjustmentDate';
    const normalizedSortOrder = sortOrder?.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';
    queryBuilder.orderBy(`adjustment.${sortField}`, normalizedSortOrder);
    queryBuilder.addOrderBy('adjustment.createdAt', normalizedSortOrder);

    // DISTINCT on adjustment id to avoid join fan-out duplicates
    queryBuilder.distinct(true);

    const [adjustments, total] = await queryBuilder.getManyAndCount();

    const data = adjustments.map(adjustment => this.toListResponseDto(adjustment));

    return {
      data,
      meta: {
        total,
      },
    };
  }

  /**
   * Find one stock adjustment by ID
   */
  async findOne(id: string): Promise<StockAdjustmentResponseDto> {
    const adjustment = await this.stockAdjustmentRepository.findOne({
      where: { id },
      relations: { items: { product: true } },
      withDeleted: true, // Include soft-deleted records
    });

    if (!adjustment) {
      throw new NotFoundException(`Stock adjustment with ID '${id}' not found`);
    }

    // If the adjustment is soft-deleted, throw appropriate error
    if (adjustment.deletedAt) {
      throw new NotFoundException(`Stock adjustment with ID '${id}' has been deleted`);
    }

    const dto = this.toResponseDto(adjustment);
    const isCompleted = adjustment.status === StockAdjustmentStatus.COMPLETED;

    for (let i = 0; i < dto.items.length; i++) {
      const sourceItem = adjustment.items[i];
      dto.items[i].liveStock = sourceItem.product
        ? Number(sourceItem.product.stockQuantity)
        : undefined;

      if (isCompleted) {
        const movement = await this.stockMovementRepository.findOne({
          where: {
            referenceType: 'stock_adjustment',
            referenceId: adjustment.id,
            productId: sourceItem.productId,
          },
        });
        dto.items[i].stockBefore = movement ? Number(movement.previousBalance) : null;
        dto.items[i].stockAfter = movement ? Number(movement.newBalance) : null;
      } else {
        dto.items[i].stockBefore = null;
        dto.items[i].stockAfter = null;
      }
    }

    return dto;
  }

  async findByAdjustmentNumber(adjustmentNumber: string): Promise<StockAdjustmentResponseDto> {
    const adjustment = await this.stockAdjustmentRepository.findOne({
      where: { adjustmentNumber },
      relations: { items: { product: true } },
    });

    if (!adjustment) {
      throw new NotFoundException(`Stock adjustment '${adjustmentNumber}' not found`);
    }

    return this.toResponseDto(adjustment);
  }

  /**
   * Update a stock adjustment (only in DRAFT status)
   */
  async update(
    id: string,
    updateDto: UpdateStockAdjustmentDto,
    userId?: string,
    username?: string,
  ): Promise<StockAdjustmentResponseDto> {
    const adjustment = await this.stockAdjustmentRepository.findOne({
      where: { id },
      relations: { items: true },
    });

    if (!adjustment) {
      throw new NotFoundException(`Stock adjustment with ID '${id}' not found`);
    }

    if (!adjustment.isEditable()) {
      throw new BadRequestException('Only draft adjustments can be edited');
    }

    // Update basic fields
    if (updateDto.adjustmentDate) {
      adjustment.adjustmentDate = updateDto.adjustmentDate;
    }
    if (updateDto.notes !== undefined) {
      adjustment.notes = updateDto.notes;
    }

    // Update items if provided
    if (updateDto.items) {
      this.assertNoDuplicateProducts(updateDto.items);

      // Verify all products exist and are not services BEFORE mutating anything
      const productIds = updateDto.items.map(item => item.productId);
      const products = await this.productRepository.findBy({ id: In(productIds) });
      if (products.length !== productIds.length) {
        throw new BadRequestException('One or more products not found');
      }
      this.assertNoServiceProducts(products);

      // Derive every quantity BEFORE deleting anything: a rejection here must
      // leave the existing items intact (#871).
      const derivedNewQuantities = updateDto.items.map((itemDto, index) =>
        this.deriveItemNewQuantity(itemDto, index),
      );

      // Safe to remove old items now that validation passed
      await this.stockAdjustmentItemRepository.delete({
        stockAdjustmentId: id,
      });

      // Create new items
      let totalValue = 0;
      const items: StockAdjustmentItem[] = [];

      for (const [index, itemDto] of updateDto.items.entries()) {
        const product = products.find(p => p.id === itemDto.productId);
        if (!product) continue;

        const unitCost = itemDto.unitCost ?? Number(product.baseCost);
        const itemTotalValue = Math.abs(itemDto.difference) * unitCost;
        totalValue += itemTotalValue;

        const item = this.stockAdjustmentItemRepository.create({
          stockAdjustmentId: id,
          productId: itemDto.productId,
          oldQuantity: itemDto.oldQuantity,
          newQuantity: derivedNewQuantities[index] as any, // scale-4 string
          difference: itemDto.difference,
          unitCost,
          totalValue: itemTotalValue,
          notes: itemDto.notes,
        });

        items.push(item);
      }

      adjustment.items = items;
      adjustment.itemCount = items.length;
      adjustment.totalValue = totalValue;
    }

    const saved = await this.stockAdjustmentRepository.save(adjustment);
    this.logger.log(`Stock adjustment ${saved.adjustmentNumber} updated successfully`);

    // Log audit trail for update
    await this.auditLogService.log(
      'UPDATE',
      'StockAdjustment',
      `Updated stock adjustment: ${saved.adjustmentNumber}`,
      {
        entityId: id,
        userId: userId || 'system',
        username,
        newValues: {
          adjustmentNumber: saved.adjustmentNumber,
          itemCount: saved.itemCount,
          totalValue: saved.totalValue,
        },
      }
    );

    return this.findOne(saved.id);
  }

  /**
   * Update ONLY the notes field, regardless of status.
   * Does not touch items, quantities, stock movements, totals, or the journal entry.
   */
  async updateNotes(
    id: string,
    notes: string | undefined,
    userId?: string,
    username?: string,
  ): Promise<StockAdjustmentResponseDto> {
    const adjustment = await this.stockAdjustmentRepository.findOne({ where: { id } });
    if (!adjustment) {
      throw new NotFoundException(`Stock adjustment with ID '${id}' not found`);
    }

    adjustment.notes = notes;
    await this.stockAdjustmentRepository.save(adjustment);

    await this.auditLogService.log(
      'UPDATE',
      'StockAdjustment',
      `Updated notes for stock adjustment: ${adjustment.adjustmentNumber}`,
      { entityId: id, userId: userId || 'system', username },
    );

    return this.findOne(id);
  }

  /**
   * Complete a stock adjustment (post to stock movements)
   */
  async complete(id: string, userId?: string, username?: string): Promise<StockAdjustmentResponseDto> {
    const { manager, auditEntry } = await this.dataSource.transaction(async (manager: EntityManager) => {
      // Load + lock the header row on THIS transaction's manager (a pessimistic
      // lock must run inside the same transaction, not on the default-repo connection).
      const adjustment = await manager.findOne(StockAdjustment, {
        where: { id },
        lock: { mode: 'pessimistic_write' },
        loadEagerRelations: false,
      });

      if (!adjustment) {
        throw new NotFoundException(`Stock adjustment with ID '${id}' not found`);
      }

      if (!adjustment.canComplete()) {
        throw new BadRequestException('Only draft adjustments can be completed');
      }

      if (adjustment.itemCount === 0) {
        throw new BadRequestException('Cannot complete adjustment with no items');
      }

      // Load items separately through the manager (no LEFT JOIN lock issues).
      const items = await manager.find(StockAdjustmentItem, {
        where: { stockAdjustmentId: id },
        relations: { product: true },
      });

      if (items.length === 0) {
        throw new BadRequestException('Cannot complete adjustment with no items');
      }

      let increaseMinor = 0n;
      let decreaseMinor = 0n;
      const reconciledItems: StockAdjustmentItem[] = [];

      // Create stock movements for each item using the manager.
      for (const item of items) {
        // Single bigint parse drives the zero-check, movement direction, and value.
        const diffMinor = toMinorUnits(String(item.difference));
        if (diffMinor === 0n) continue;

        const movementType = diffMinor > 0n
          ? StockMovementType.ADJUSTMENT_INCREASE
          : StockMovementType.ADJUSTMENT_DECREASE;

        const movement = await this.stockMovementService.create(
          {
            productId: item.productId,
            movementType,
            quantity: Number(item.difference),
            unitValue: item.unitCost,
            referenceType: 'stock_adjustment',
            referenceId: adjustment.id,
            reason: `Stock Adjustment ${adjustment.adjustmentNumber}`,
            notes: item.notes || adjustment.notes,
          },
          undefined,
          manager,
        );

        // #982: the draft's oldQuantity is a form-load snapshot that may be
        // stale. Preserve it, then record what the movement actually did.
        // `difference` is the user's command and is never rewritten.
        item.requestedOldQuantity = item.oldQuantity;
        item.oldQuantity = Number(movement.previousBalance) as any;
        item.newQuantity = Number(movement.newBalance) as any;
        reconciledItems.push(item);

        // Accumulate value from the persisted totalValue (option A).
        const valueMinor = item.totalValue != null
          ? toMinorUnits(String(item.totalValue))
          : (() => {
              const qtyAbs = diffMinor < 0n ? -diffMinor : diffMinor;
              const cost = toMinorUnits(String(item.unitCost ?? '0'));
              return (qtyAbs * cost + 5000n) / 10000n;
            })();
        if (diffMinor > 0n) increaseMinor += valueMinor; else decreaseMinor += valueMinor;
      }

      // Save reconciled audit values on THIS transaction's manager so they
      // commit atomically with the movements, the JE and the status flip.
      if (reconciledItems.length > 0) {
        await manager.save(reconciledItems);
      }

      // Post the stock adjustment JE (both directional pairs in one balanced entry).
      if (increaseMinor > 0n || decreaseMinor > 0n) {
        await this.accounting.postStockAdjustment({
          adjustmentId: adjustment.id,
          sourceRef: adjustment.adjustmentNumber,
          increaseAmount: formatScale4(increaseMinor),
          decreaseAmount: formatScale4(decreaseMinor),
          entryDate: new Date().toISOString().slice(0, 10),
          createdBy: username,
        }, manager);
      }

      // Update adjustment status inside the txn.
      adjustment.status = StockAdjustmentStatus.COMPLETED;
      await manager.save(adjustment);

      return { manager, auditEntry: { id: adjustment.id, number: adjustment.adjustmentNumber } };
    });

    // Audit log AFTER committed transaction.
    await this.auditLogService.log(
      'UPDATE',
      'StockAdjustment',
      `Completed stock adjustment: ${auditEntry.number}`,
      {
        entityId: auditEntry.id,
        userId: userId || 'system',
        username,
        oldValues: { status: StockAdjustmentStatus.DRAFT },
        newValues: { status: StockAdjustmentStatus.COMPLETED },
      }
    );

    this.logger.log(`Stock adjustment ${auditEntry.number} completed successfully`);
    return this.findOne(id);
  }
  /**
   * Revert a completed stock adjustment — reverse stock movements + JE and set status REVERTED.
   */
  async revert(id: string, userId?: string, username?: string): Promise<StockAdjustmentResponseDto> {
    const { manager, auditEntry } = await this.dataSource.transaction(async (manager: EntityManager) => {
      // Lock the header on this transaction's manager (see complete()).
      const adjustment = await manager.findOne(StockAdjustment, {
        where: { id },
        lock: { mode: 'pessimistic_write' },
        loadEagerRelations: false,
      });

      if (!adjustment) {
        throw new NotFoundException(`Stock adjustment with ID '${id}' not found`);
      }

      if (adjustment.status !== StockAdjustmentStatus.COMPLETED) {
        throw new BadRequestException('Only completed adjustments can be reverted');
      }

      // Load items separately through the manager.
      const items = await manager.find(StockAdjustmentItem, {
        where: { stockAdjustmentId: id },
        relations: { product: true },
      });

      // Write reversing stock movements (opposite sign).
      for (const item of items) {
        const diff = Number(item.difference);
        if (diff === 0) continue;

        const reverseType = diff > 0
          ? StockMovementType.ADJUSTMENT_DECREASE
          : StockMovementType.ADJUSTMENT_INCREASE;

        await this.stockMovementService.create(
          {
            productId: item.productId,
            movementType: reverseType,
            quantity: -diff,
            unitValue: item.unitCost,
            referenceType: 'stock_adjustment',
            referenceId: adjustment.id,
            reason: `Reversal of stock adjustment ${adjustment.adjustmentNumber}`,
            notes: item.notes || adjustment.notes,
          },
          undefined,
          manager,
        );
      }

      // Reverse the accounting JE.
      await this.accounting.reverseEntriesForDocument(
        AccountingSourceType.STOCK_ADJUSTMENT,
        id,
        [PostingType.STOCK_ADJUSTMENT],
        new Date().toISOString().slice(0, 10),
        manager,
        username,
      );

      // Set status REVERTED.
      adjustment.status = StockAdjustmentStatus.REVERTED;
      await manager.save(adjustment);

      return { manager, auditEntry: { id: adjustment.id, number: adjustment.adjustmentNumber } };
    });

    await this.auditLogService.log(
      'UPDATE',
      'StockAdjustment',
      `Reverted stock adjustment: ${auditEntry.number}`,
      {
        entityId: auditEntry.id,
        userId: userId || 'system',
        username,
        oldValues: { status: StockAdjustmentStatus.COMPLETED },
        newValues: { status: StockAdjustmentStatus.REVERTED },
      }
    );

    this.logger.log(`Stock adjustment ${auditEntry.number} reverted successfully`);
    return this.findOne(id);
  }

  /**
   * Convert adjustment to list response DTO
   */
  private toListResponseDto(adjustment: StockAdjustment): StockAdjustmentListResponseDto {
    return {
      id: adjustment.id,
      adjustmentNumber: adjustment.adjustmentNumber,
      adjustmentDate: adjustment.adjustmentDate,
      status: adjustment.status,
      notes: adjustment.notes,
      itemCount: adjustment.itemCount,
      totalValue: Number(adjustment.totalValue),
      createdAt: adjustment.createdAt,
    };
  }

  /**
   * Convert adjustment to full response DTO
   */
  private toResponseDto(adjustment: StockAdjustment): StockAdjustmentResponseDto {
    return {
      id: adjustment.id,
      adjustmentNumber: adjustment.adjustmentNumber,
      adjustmentDate: adjustment.adjustmentDate,
      status: adjustment.status,
      notes: adjustment.notes,
      itemCount: adjustment.itemCount,
      totalValue: Number(adjustment.totalValue),
      items: adjustment.items ? adjustment.items.map(item => this.toItemResponseDto(item)) : [],
      isEditable: adjustment.isEditable(),
      canComplete: adjustment.canComplete(),
      createdAt: adjustment.createdAt,
      updatedAt: adjustment.updatedAt,
    };
  }

  /**
   * Convert item to response DTO
   */
  private toItemResponseDto(item: StockAdjustmentItem): StockAdjustmentItemResponseDto {
    return {
      id: item.id,
      product: {
        id: item.product.id,
        name: item.product.name,
        barcode: item.product.barcode,
      },
      oldQuantity: Number(item.oldQuantity),
      // `!= null`, not a truthy check: a legitimate snapshot of 0 must survive.
      requestedOldQuantity:
        item.requestedOldQuantity != null ? Number(item.requestedOldQuantity) : undefined,
      newQuantity: Number(item.newQuantity),
      difference: Number(item.difference),
      unitCost: item.unitCost ? Number(item.unitCost) : undefined,
      totalValue: item.totalValue ? Number(item.totalValue) : undefined,
      notes: item.notes,
      isIncrease: item.isIncrease,
      isDecrease: item.isDecrease,
      absoluteDifference: item.absoluteDifference,
    };
  }
}
