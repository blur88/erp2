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
    userId?: string,
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
      adjustedByUserId: userId,
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
      adjustedByUserId,
      search,
      sortBy = 'adjustmentDate',
      sortOrder = 'DESC',
    } = query;

    const queryBuilder = this.stockAdjustmentRepository
      .createQueryBuilder('adjustment')
      .leftJoinAndSelect('adjustment.adjustedByUser', 'user')
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

    if (adjustedByUserId) {
      queryBuilder.andWhere('adjustment.adjustedByUserId = :adjustedByUserId', {
        adjustedByUserId,
      });
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
      relations: ['adjustedByUser', 'items', 'items.product'],
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
    userId?: string,
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
  async complete(id: string, userId?: string): Promise<StockAdjustmentResponseDto> {
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
          userId,
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
   * Cancel a stock adjustment
   */
  async cancel(id: string): Promise<StockAdjustmentResponseDto> {
    const adjustment = await this.stockAdjustmentRepository.findOne({
      where: { id },
    });

    if (!adjustment) {
      throw new NotFoundException(`Stock adjustment with ID '${id}' not found`);
    }

    if (!adjustment.canCancel()) {
      throw new BadRequestException('This adjustment cannot be cancelled');
    }

    adjustment.status = StockAdjustmentStatus.CANCELLED;
    await this.stockAdjustmentRepository.save(adjustment);

    this.logger.log(`Stock adjustment ${adjustment.adjustmentNumber} cancelled successfully`);

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
      adjustedByUser: adjustment.adjustedByUser ? {
        id: adjustment.adjustedByUser.id,
        email: adjustment.adjustedByUser.email,
        firstName: adjustment.adjustedByUser.firstName,
        lastName: adjustment.adjustedByUser.lastName,
      } : undefined,
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
      adjustedByUser: adjustment.adjustedByUser ? {
        id: adjustment.adjustedByUser.id,
        email: adjustment.adjustedByUser.email,
        firstName: adjustment.adjustedByUser.firstName,
        lastName: adjustment.adjustedByUser.lastName,
      } : undefined,
      items: adjustment.items ? adjustment.items.map(item => this.toItemResponseDto(item)) : [],
      isEditable: adjustment.isEditable(),
      canComplete: adjustment.canComplete(),
      canCancel: adjustment.canCancel(),
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
