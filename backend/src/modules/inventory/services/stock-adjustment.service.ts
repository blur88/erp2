import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
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
import { StockMovementType } from '../../../database/entities/stock-movement.entity';

@Injectable()
export class StockAdjustmentService {
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
    @Inject(forwardRef(() => StockMovementService))
    private readonly stockMovementService: StockMovementService,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Generate SA reference number for stock adjustments
   */
  private async generateSANumber(): Promise<string> {
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

    return `SA-${String(nextNumber).padStart(6, '0')}`;
  }

  /**
   * Create a new stock adjustment (as draft)
   */
  async create(
    createDto: CreateStockAdjustmentDto,
  ): Promise<StockAdjustmentResponseDto> {
    this.logger.log(`Creating stock adjustment with ${createDto.items.length} items`);

    // Validate items
    if (!createDto.items || createDto.items.length === 0) {
      throw new BadRequestException('Stock adjustment must have at least one item');
    }

    // Verify all products exist
    const productIds = createDto.items.map(item => item.productId);
    const products = await this.productRepository.findByIds(productIds);
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

    return this.findOne(saved.id);
  }

  /**
   * Find all stock adjustments with filtering and pagination
   */
  async findAll(query: QueryStockAdjustmentsDto) {
    const {
      page = 1,
      limit = 20,
      status,
      fromDate,
      toDate,
      search,
      sortBy = 'adjustmentDate',
      sortOrder = 'DESC',
    } = query;

    const queryBuilder = this.stockAdjustmentRepository
      .createQueryBuilder('adjustment')
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
        '(adjustment.adjustmentNumber ILIKE :search OR adjustment.notes ILIKE :search)',
        { search: `%${search}%` },
      );
    }

    // Apply sorting
    const validSortFields = ['adjustmentDate', 'adjustmentNumber', 'totalValue', 'itemCount'];
    const sortField = validSortFields.includes(sortBy) ? sortBy : 'adjustmentDate';
    const normalizedSortOrder = sortOrder?.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';
    queryBuilder.orderBy(`adjustment.${sortField}`, normalizedSortOrder);
    queryBuilder.addOrderBy('adjustment.createdAt', normalizedSortOrder);

    // Apply pagination
    const offset = (page - 1) * limit;
    queryBuilder.skip(offset).take(limit);

    const [adjustments, total] = await queryBuilder.getManyAndCount();

    const data = adjustments.map(adjustment => this.toListResponseDto(adjustment));

    return {
      data,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNextPage: page < Math.ceil(total / limit),
        hasPreviousPage: page > 1,
      },
    };
  }

  /**
   * Find one stock adjustment by ID
   */
  async findOne(id: string): Promise<StockAdjustmentResponseDto> {
    const adjustment = await this.stockAdjustmentRepository.findOne({
      where: { id },
      relations: ['items', 'items.product'],
    });

    if (!adjustment) {
      throw new NotFoundException(`Stock adjustment with ID '${id}' not found`);
    }

    return this.toResponseDto(adjustment);
  }

  /**
   * Update a stock adjustment (only in DRAFT status)
   */
  async update(
    id: string,
    updateDto: UpdateStockAdjustmentDto,
  ): Promise<StockAdjustmentResponseDto> {
    const adjustment = await this.stockAdjustmentRepository.findOne({
      where: { id },
      relations: ['items'],
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
      // Remove old items
      await this.stockAdjustmentItemRepository.delete({
        stockAdjustmentId: id,
      });

      // Verify all products exist
      const productIds = updateDto.items.map(item => item.productId);
      const products = await this.productRepository.findByIds(productIds);
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

    return this.findOne(saved.id);
  }

  /**
   * Complete a stock adjustment (post to stock movements)
   */
  async complete(id: string): Promise<StockAdjustmentResponseDto> {
    const adjustment = await this.stockAdjustmentRepository.findOne({
      where: { id },
      relations: ['items', 'items.product'],
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
            referenceNumber: adjustment.adjustmentNumber,
            reason: `Stock Adjustment ${adjustment.adjustmentNumber}`,
            notes: item.notes || adjustment.notes,
          },
        );
      }

      // Update adjustment status
      adjustment.status = StockAdjustmentStatus.COMPLETED;
      await queryRunner.manager.save(adjustment);

      await queryRunner.commitTransaction();
      this.logger.log(`Stock adjustment ${adjustment.adjustmentNumber} completed successfully`);
    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error(`Failed to complete stock adjustment: ${error.message}`, error.stack);
      throw error;
    } finally {
      await queryRunner.release();
    }

    return this.findOne(id);
  }


  /**
   * Uncomplete/revert a completed stock adjustment back to draft
   * This reverses the stock movements that were posted
   */
  async uncomplete(id: string): Promise<StockAdjustmentResponseDto> {
    const adjustment = await this.stockAdjustmentRepository.findOne({
      where: { id },
      relations: ['items', 'items.product'],
    });

    if (!adjustment) {
      throw new NotFoundException(`Stock adjustment with ID '${id}' not found`);
    }

    if (adjustment.status !== StockAdjustmentStatus.COMPLETED) {
      throw new BadRequestException('Only completed adjustments can be reverted to draft');
    }

    if (!adjustment.items || adjustment.items.length === 0) {
      throw new BadRequestException('Cannot revert adjustment with no items');
    }

    // Use transaction to ensure atomicity
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Create reverse stock movements for each item
      for (const item of adjustment.items) {
        if (item.difference === 0) continue;

        // Reverse the movement type
        const movementType = item.difference > 0
          ? StockMovementType.ADJUSTMENT_DECREASE
          : StockMovementType.ADJUSTMENT_INCREASE;

        // Reverse the quantity (negative becomes positive, positive becomes negative)
        const reverseQuantity = -item.difference;

        await this.stockMovementService.create(
          {
            productId: item.productId,
            movementType,
            quantity: reverseQuantity,
            unitValue: item.unitCost,
            referenceType: 'stock_adjustment',
            referenceId: adjustment.id,
            referenceNumber: adjustment.adjustmentNumber,
            reason: `Revert Stock Adjustment ${adjustment.adjustmentNumber}`,
            notes: `Reverting adjustment back to draft: ${item.notes || adjustment.notes || ''}`,
          },
        );
      }

      // Update adjustment status back to draft
      adjustment.status = StockAdjustmentStatus.DRAFT;
      await queryRunner.manager.save(adjustment);

      await queryRunner.commitTransaction();
      this.logger.log(`Stock adjustment ${adjustment.adjustmentNumber} reverted to draft successfully`);
    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error(`Failed to revert stock adjustment: ${error.message}`, error.stack);
      throw error;
    } finally {
      await queryRunner.release();
    }

    return this.findOne(id);
  }

  /**
   * Delete a stock adjustment (soft delete, only drafts)
   */
  async remove(id: string): Promise<void> {
    const adjustment = await this.stockAdjustmentRepository.findOne({
      where: { id },
    });

    if (!adjustment) {
      throw new NotFoundException(`Stock adjustment with ID '${id}' not found`);
    }

    if (adjustment.status !== StockAdjustmentStatus.DRAFT) {
      throw new BadRequestException('Only draft adjustments can be deleted');
    }

    await this.stockAdjustmentRepository.softDelete(id);
    this.logger.log(`Stock adjustment ${adjustment.adjustmentNumber} deleted successfully`);
  }

  /**
   * Find all deleted stock adjustments
   */
  async findDeleted(query: QueryStockAdjustmentsDto = {}): Promise<any> {
    const {
      search,
      sortBy = 'deletedAt',
      sortOrder = 'DESC',
      page = 1,
      limit = 20,
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

    // Apply pagination
    const offset = (page - 1) * limit;
    queryBuilder.skip(offset).take(limit);

    const [adjustments, total] = await queryBuilder.getManyAndCount();

    const data = adjustments.map(adjustment => this.toListResponseDto(adjustment));

    return {
      data,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNextPage: page < Math.ceil(total / limit),
        hasPreviousPage: page > 1,
      },
    };
  }

  /**
   * Restore a soft-deleted stock adjustment
   */
  async restore(id: string): Promise<StockAdjustmentResponseDto> {
    const adjustment = await this.stockAdjustmentRepository.findOne({
      where: { id },
      withDeleted: true, // Include soft-deleted records
      relations: ['items', 'items.product'],
    });

    if (!adjustment) {
      throw new NotFoundException(`Stock adjustment with ID '${id}' not found`);
    }

    if (!adjustment.deletedAt) {
      throw new BadRequestException('Stock adjustment is not deleted');
    }

    // Restore the adjustment
    await this.stockAdjustmentRepository.restore(id);

    this.logger.log(`Stock adjustment ${adjustment.adjustmentNumber} restored successfully`);

    return this.findOne(id);
  }

  /**
   * Permanently delete a stock adjustment (hard delete from database)
   */
  async permanentDelete(id: string): Promise<void> {
    // Find the adjustment (including soft-deleted ones)
    const adjustment = await this.stockAdjustmentRepository.findOne({
      where: { id },
      relations: ['items'],
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

    // Hard delete the adjustment
    await this.stockAdjustmentRepository.delete(id);

    this.logger.log(`Stock adjustment ${adjustment.adjustmentNumber} permanently deleted`);
  }

  /**
   * Bulk permanently delete stock adjustments
   */
  async bulkPermanentDelete(adjustmentIds: string[]): Promise<{ successCount: number; failedIds: string[] }> {
    const failedIds: string[] = [];
    let successCount = 0;

    for (const id of adjustmentIds) {
      try {
        await this.permanentDelete(id);
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
