import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { BaseCrudService } from '../../../common/services/base-crud.service';
import {
  StockAdjustment,
  StockAdjustmentItem,
  StockAdjustmentStatus,
} from '../../../database/entities/stock-adjustment.entity';
import { Product } from '../../../database/entities/product.entity';
import { User } from '../../../database/entities/user.entity';
import {
  CreateStockAdjustmentDto,
  UpdateStockAdjustmentDto,
  QueryStockAdjustmentsDto,
  StockAdjustmentResponseDto,
  StockAdjustmentListResponseDto,
  StockAdjustmentItemResponseDto,
} from '../dto/stock-adjustment.dto';
import { StockMovementService } from './stock-movement.service';
import { StockMovementType, StockMovement } from '../../../database/entities/stock-movement.entity';
import { SettingsService } from '../../settings/settings.service';
import { AuditLogService } from '../../audit-logs/services';
import { AccountingService } from '@modules/accounting/services/accounting.service';

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
    private readonly accountingService: AccountingService,
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

    // Generate SA number
    const adjustmentNumber = await this.generateSANumber();

    // Calculate total value
    let totalValue = 0;
    const items: StockAdjustmentItem[] = [];

    for (const itemDto of createDto.items) {
      const product = products.find(p => p.id === itemDto.productId);
      if (!product) continue;

      const unitCost = itemDto.unitCost ?? Number(product.baseCost);
      const itemTotalValue = Math.abs(itemDto.difference) * unitCost;
      totalValue += itemTotalValue;

      const item = this.stockAdjustmentItemRepository.create({
        productId: itemDto.productId,
        oldQuantity: itemDto.oldQuantity,
        newQuantity: itemDto.newQuantity,
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

      // Remove old items
      await this.stockAdjustmentItemRepository.delete({
        stockAdjustmentId: id,
      });

      // Verify all products exist
      const productIds = updateDto.items.map(item => item.productId);
      const products = await this.productRepository.findBy({ id: In(productIds) });
      if (products.length !== productIds.length) {
        throw new BadRequestException('One or more products not found');
      }

      // Create new items
      let totalValue = 0;
      const items: StockAdjustmentItem[] = [];

      for (const itemDto of updateDto.items) {
        const product = products.find(p => p.id === itemDto.productId);
        if (!product) continue;

        const unitCost = itemDto.unitCost ?? Number(product.baseCost);
        const itemTotalValue = Math.abs(itemDto.difference) * unitCost;
        totalValue += itemTotalValue;

        const item = this.stockAdjustmentItemRepository.create({
          stockAdjustmentId: id,
          productId: itemDto.productId,
          oldQuantity: itemDto.oldQuantity,
          newQuantity: itemDto.newQuantity,
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
    const adjustment = await this.stockAdjustmentRepository.findOne({
      where: { id },
      relations: { items: { product: true } },
    });

    if (!adjustment) {
      throw new NotFoundException(`Stock adjustment with ID '${id}' not found`);
    }

    if (!adjustment.canComplete()) {
      throw new BadRequestException('Only draft adjustments can be completed');
    }

    if (!adjustment.items || adjustment.items.length === 0) {
      throw new BadRequestException('Cannot complete adjustment with no items');
    }

    // Use transaction to ensure atomicity
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Create stock movements for each item
      for (const item of adjustment.items) {
        if (item.difference === 0) continue;

        const movementType = item.difference > 0
          ? StockMovementType.ADJUSTMENT_INCREASE
          : StockMovementType.ADJUSTMENT_DECREASE;

        await this.stockMovementService.create(
          {
            productId: item.productId,
            movementType,
            quantity: item.difference,
            unitValue: item.unitCost,
            referenceType: 'stock_adjustment',
            referenceId: adjustment.id,
            reason: `Stock Adjustment ${adjustment.adjustmentNumber}`,
            notes: item.notes || adjustment.notes,
          },
        );
      }

      // Update adjustment status
      adjustment.status = StockAdjustmentStatus.COMPLETED;
      await queryRunner.manager.save(adjustment);

      // Log audit trail for complete
      await this.auditLogService.log(
        'UPDATE',
        'StockAdjustment',
        `Completed stock adjustment: ${adjustment.adjustmentNumber}`,
        {
          entityId: adjustment.id,
          userId: userId || 'system',
          username,
          oldValues: { status: StockAdjustmentStatus.DRAFT },
          newValues: { status: StockAdjustmentStatus.COMPLETED },
        }
      );

      await queryRunner.commitTransaction();
      this.logger.log(`Stock adjustment ${adjustment.adjustmentNumber} completed successfully`);
    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error(`Failed to complete stock adjustment: ${error.message}`, error.stack);
      throw error;
    } finally {
      await queryRunner.release();
    }

    // Auto-post to accounting (don't fail completion on error)
    try {
      const fullAdjustment = await this.findOne(id); // Get adjustment with relations
      await this.accountingService.postStockAdjustmentEntry(
        fullAdjustment as any,
        userId || 'system',
        username,
      );
      this.logger.log(`Posted accounting entry for stock adjustment ${adjustment.adjustmentNumber}`);
    } catch (error) {
      this.logger.error(
        `Failed to post accounting entry for stock adjustment ${id}: ${error.message}`,
        error.stack,
      );
      // Continue - don't fail the completion
    }

    return this.findOne(id);
  }
  /**
   * Delete a stock adjustment (soft delete, only drafts)
   */
  /**
   * Find all deleted stock adjustments (no pagination)
   */
  async findDeleted(query: QueryStockAdjustmentsDto = {}): Promise<any> {
    const {
      search,
      sortBy = 'deletedAt',
      sortOrder = 'DESC',
    } = query;

    let queryBuilder = this.stockAdjustmentRepository
      .createQueryBuilder('adjustment')
      .withDeleted() // Include soft-deleted records
      .where('adjustment.deletedAt IS NOT NULL'); // Only get soft-deleted adjustments

    if (search) {
      queryBuilder = queryBuilder.andWhere(
        '(adjustment.adjustmentNumber ILIKE :search OR adjustment.notes ILIKE :search)',
        { search: `%${search}%` },
      );
    }

    // Apply sorting
    const validSortFields = ['deletedAt', 'adjustmentDate', 'adjustmentNumber', 'totalValue'];
    const sortField = validSortFields.includes(sortBy) ? sortBy : 'deletedAt';
    const normalizedSortOrder = sortOrder?.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';
    queryBuilder.orderBy(`adjustment.${sortField}`, normalizedSortOrder);

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
   * Restore a soft-deleted stock adjustment
   */
  async restore(id: string, userId?: string, username?: string): Promise<StockAdjustmentResponseDto> {
    const adjustment = await this.stockAdjustmentRepository.findOne({
      where: { id },
      withDeleted: true, // Include soft-deleted records
      relations: { items: { product: true } },
    });

    if (!adjustment) {
      throw new NotFoundException(`Stock adjustment with ID '${id}' not found`);
    }

    if (!adjustment.deletedAt) {
      throw new BadRequestException('Stock adjustment is not deleted');
    }

    // Restore the adjustment
    await this.stockAdjustmentRepository.restore(id);

    await this.auditLogService.log(
      'RESTORE',
      'StockAdjustment',
      `Restored stock adjustment: ${adjustment.adjustmentNumber}`,
      { entityId: id, userId: userId || 'system', username }
    );

    this.logger.log(`Stock adjustment ${adjustment.adjustmentNumber} restored successfully`);

    return this.findOne(id);
  }

  /**
   * Permanently delete a stock adjustment (hard delete from database)
   */
  async permanentDelete(id: string, userId?: string, username?: string): Promise<void> {
    // Find the adjustment (including soft-deleted ones)
    const adjustment = await this.stockAdjustmentRepository.findOne({
      where: { id },
      relations: { items: true },
      withDeleted: true,
    });

    if (!adjustment) {
      throw new NotFoundException(`Stock adjustment with ID '${id}' not found`);
    }

    if (!adjustment.deletedAt) {
      throw new BadRequestException('Stock adjustment must be soft-deleted first');
    }

    // Delete associated stock movements
    try {
      const stockMovementResult = await this.stockMovementService.deleteByReference(
        'stock_adjustment',
        id
      );
      this.logger.log(`Deleted ${stockMovementResult.deletedCount} stock movements for stock adjustment ${adjustment.adjustmentNumber}`);
    } catch (error) {
      this.logger.error(`Failed to delete stock movements for stock adjustment ${adjustment.adjustmentNumber}: ${error.message}`);
      // Don't throw error - stock adjustment deletion should still succeed
    }

    // Hard delete all adjustment items first
    if (adjustment.items && adjustment.items.length > 0) {
      await this.stockAdjustmentItemRepository.delete(
        adjustment.items.map(item => item.id)
      );
    }

    // Log audit trail for permanent delete
    await this.auditLogService.log(
      'PERMANENT_DELETE',
      'StockAdjustment',
      `Permanently deleted stock adjustment: ${adjustment.adjustmentNumber}`,
      {
        entityId: id,
        userId: userId || 'system',
        username,
        oldValues: {
          adjustmentNumber: adjustment.adjustmentNumber,
          itemCount: adjustment.itemCount,
          totalValue: adjustment.totalValue,
          status: adjustment.status,
        },
      }
    );

    // Hard delete the adjustment
    await this.stockAdjustmentRepository.delete(id);

    this.logger.log(`Stock adjustment ${adjustment.adjustmentNumber} permanently deleted`);
  }

  /**
   * Bulk permanently delete stock adjustments
   */
  async bulkPermanentDelete(
    adjustmentIds: string[],
    userId?: string,
    username?: string,
  ): Promise<{ successCount: number; failedIds: string[] }> {
    const failedIds: string[] = [];
    let successCount = 0;

    for (const id of adjustmentIds) {
      try {
        await this.permanentDelete(id, userId, username);
        successCount++;
      } catch (error) {
        this.logger.error(`Failed to permanently delete stock adjustment ${id}: ${error.message}`);
        failedIds.push(id);
      }
    }

    return { successCount, failedIds };
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
