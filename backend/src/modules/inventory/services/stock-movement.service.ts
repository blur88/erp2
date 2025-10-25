import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Repository,
  FindManyOptions,
  SelectQueryBuilder,
  Between,
} from 'typeorm';
import {
  StockMovement,
  StockMovementType,
  StockMovementStatus,
} from '../../../database/entities/stock-movement.entity';
import { Product } from '../../../database/entities/product.entity';
import { User } from '../../../database/entities/user.entity';
import {
  CreateStockMovementDto,
  QueryStockMovementsDto,
  StockMovementResponseDto,
  StockTransferDto,
  StockReservationDto,
  StockSummaryDto,
  LowStockAlertDto,
  CreateBulkStockAdjustmentDto,
  BulkStockAdjustmentResponseDto,
} from '../dto/stock.dto';
import { ProductService } from './product.service';

@Injectable()
export class StockMovementService {
  private readonly logger = new Logger(StockMovementService.name);

  constructor(
    @InjectRepository(StockMovement)
    private readonly stockMovementRepository: Repository<StockMovement>,
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @Inject(forwardRef(() => ProductService))
    private readonly productService: ProductService,
  ) {}

  /**
   * Generate SA reference number for stock adjustments
   */
  private async generateSANumber(): Promise<string> {
    // Find the maximum SA number and increment it
    // This ensures sequential numbering even if some numbers were deleted
    const result = await this.stockMovementRepository
      .createQueryBuilder('movement')
      .select('movement.referenceNumber', 'referenceNumber')
      .where('movement.movementType IN (:...types)', {
        types: [StockMovementType.ADJUSTMENT_INCREASE, StockMovementType.ADJUSTMENT_DECREASE],
      })
      .andWhere('movement.referenceNumber IS NOT NULL')
      .andWhere('movement.referenceNumber LIKE :pattern', { pattern: 'SA-%' })
      .orderBy('movement.referenceNumber', 'DESC')
      .limit(1)
      .getRawOne();

    let nextNumber = 1;
    if (result?.referenceNumber) {
      // Extract number from SA-XXXXXX format
      const currentNumber = parseInt(result.referenceNumber.replace('SA-', ''), 10);
      nextNumber = currentNumber + 1;
    }

    return `SA-${String(nextNumber).padStart(6, '0')}`;
  }

  /**
   * Create a stock movement and update product stock
   */
  async create(
    createMovementDto: CreateStockMovementDto,
    userId?: string,
  ): Promise<StockMovementResponseDto> {
    this.logger.log(
      `Creating stock movement for product ${createMovementDto.productId}: ${createMovementDto.quantity} units`,
    );

    const product = await this.productRepository.findOne({
      where: { id: createMovementDto.productId },
      relations: ['category'],
    });

    if (!product) {
      throw new NotFoundException(
        `Product with ID '${createMovementDto.productId}' not found`,
      );
    }

    // Validate outward movements don't exceed available stock
    if (createMovementDto.quantity < 0) {
      const requestedQuantity = Math.abs(createMovementDto.quantity);
      if (product.stockQuantity < requestedQuantity) {
        throw new BadRequestException(
          `Insufficient stock. Available: ${product.stockQuantity}, Requested: ${requestedQuantity}`,
        );
      }
    }

    // Calculate previous and new balances
    const previousBalance = Number(product.stockQuantity);
    const newBalance = previousBalance + Number(createMovementDto.quantity);

    // Validate new balance is not negative
    if (newBalance < 0) {
      throw new BadRequestException(
        'Stock movement would result in negative stock quantity',
      );
    }

    // Generate SA number for adjustments
    let referenceNumber = createMovementDto.referenceNumber;
    const isAdjustment =
      createMovementDto.movementType === StockMovementType.ADJUSTMENT_INCREASE ||
      createMovementDto.movementType === StockMovementType.ADJUSTMENT_DECREASE;

    if (isAdjustment && !referenceNumber) {
      referenceNumber = await this.generateSANumber();
    }

    // Create stock movement
    const stockMovement = this.stockMovementRepository.create({
      ...createMovementDto,
      previousBalance,
      newBalance,
      status: StockMovementStatus.COMPLETED,
      movedByUserId: userId,
      locationCode: createMovementDto.locationCode || 'MAIN',
      referenceNumber,
    });

    const savedMovement = await this.stockMovementRepository.save(stockMovement);

    // Update product stock quantity
    await this.productService.updateStockQuantity(
      product.id,
      newBalance,
      userId,
    );

    // Audit logging removed with authentication system

    this.logger.log(`Stock movement created successfully: ${savedMovement.id}`);

    // Reload with relations for response DTO
    const movementWithRelations = await this.stockMovementRepository.findOne({
      where: { id: savedMovement.id },
      relations: ['product', 'movedByUser'],
    });

    return this.toResponseDto(movementWithRelations);
  }

  /**
   * Find all stock movements with filtering, sorting, and pagination
   */
  async findAll(query: QueryStockMovementsDto) {
    const {
      page = 1,
      limit = 20,
      productId,
      movementType,
      status,
      fromDate,
      toDate,
      referenceType,
      referenceId,
      locationCode,
      batchNumber,
      movedByUserId,
      search,
      sortBy = 'movementDate',
      sortOrder = 'DESC',
    } = query;

    const queryBuilder = this.stockMovementRepository
      .createQueryBuilder('movement')
      .leftJoinAndSelect('movement.product', 'product')
      .leftJoinAndSelect('product.category', 'category')
      .leftJoinAndSelect('movement.movedByUser', 'user');

    // Apply filters
    if (productId) {
      queryBuilder.andWhere('movement.productId = :productId', { productId });
    }

    if (movementType) {
      queryBuilder.andWhere('movement.movementType = :movementType', {
        movementType,
      });
    }

    if (status) {
      queryBuilder.andWhere('movement.status = :status', { status });
    }

    if (fromDate && toDate) {
      queryBuilder.andWhere('movement.movementDate BETWEEN :fromDate AND :toDate', {
        fromDate,
        toDate,
      });
    } else if (fromDate) {
      queryBuilder.andWhere('movement.movementDate >= :fromDate', { fromDate });
    } else if (toDate) {
      queryBuilder.andWhere('movement.movementDate <= :toDate', { toDate });
    }

    if (referenceType) {
      queryBuilder.andWhere('movement.referenceType = :referenceType', {
        referenceType,
      });
    }

    if (referenceId) {
      queryBuilder.andWhere('movement.referenceId = :referenceId', {
        referenceId,
      });
    }

    if (locationCode) {
      queryBuilder.andWhere('movement.locationCode = :locationCode', {
        locationCode,
      });
    }

    if (batchNumber) {
      queryBuilder.andWhere('movement.batchNumber = :batchNumber', {
        batchNumber,
      });
    }

    if (movedByUserId) {
      queryBuilder.andWhere('movement.movedByUserId = :movedByUserId', {
        movedByUserId,
      });
    }

    if (search) {
      queryBuilder.andWhere(
        '(product.name ILIKE :search OR product.barcode ILIKE :search OR movement.referenceNumber ILIKE :search OR movement.reason ILIKE :search),',
        { search: `%${search}%` },
      );
    }

    // Apply sorting
    const validSortFields = ['movementDate', 'quantity', 'totalValue'];
    const sortField = validSortFields.includes(sortBy) ? sortBy : 'movementDate';
    // Normalize sort order to uppercase for TypeORM
    const normalizedSortOrder = sortOrder?.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';
    queryBuilder.orderBy(`movement.${sortField}`, normalizedSortOrder);

    // Apply pagination
    const offset = (page - 1) * limit;
    queryBuilder.skip(offset).take(limit);

    const [movements, total] = await queryBuilder.getManyAndCount();

    const data = movements.map(movement => this.toResponseDto(movement));

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
   * Find one stock movement by ID
   */
  async findOne(id: string): Promise<StockMovementResponseDto> {
    const movement = await this.stockMovementRepository.findOne({
      where: { id },
      relations: ['product', 'product.category', 'movedByUser'],
    });

    if (!movement) {
      throw new NotFoundException(`Stock movement with ID '${id}' not found`);
    }

    return this.toResponseDto(movement);
  }

  /**
   * Reverse a stock movement
   */
  async reverseMovement(
    id: string,
    reason: string,
    userId?: string,
  ): Promise<StockMovementResponseDto> {
    this.logger.log(`Reversing stock movement: ${id}`);

    const movement = await this.stockMovementRepository.findOne({
      where: { id },
      relations: ['product'],
    });

    if (!movement) {
      throw new NotFoundException(`Stock movement with ID '${id}' not found`);
    }

    if (!movement.canReverse()) {
      throw new BadRequestException('Stock movement cannot be reversed');
    }

    // Create reversal movement
    const reversalMovement = movement.reverse(reason, userId);
    const savedReversal = await this.stockMovementRepository.save(reversalMovement);

    // Update original movement status
    await this.stockMovementRepository.save(movement);

    // Update product stock
    await this.productService.updateStockQuantity(
      movement.product.id,
      Number(reversalMovement.newBalance),
      userId,
    );

    // Audit logging removed with authentication system

    this.logger.log(`Stock movement reversed successfully: ${savedReversal.id}`);
    return this.toResponseDto(savedReversal);
  }

  /**
   * Record initial stock for a new product
   */
  async recordInitialStock(
    productId: string,
    quantity: number,
    unitCost?: number,
    userId?: string,
  ): Promise<StockMovementResponseDto> {
    const createMovementDto: CreateStockMovementDto = {
      productId,
      movementType: StockMovementType.INITIAL_STOCK,
      quantity,
      unitValue: unitCost,
      reason: 'Initial stock entry',
      referenceType: 'initial_stock',
    };

    return this.create(createMovementDto, userId);
  }

  /**
   * Record stock movement for sales
   */
  async recordSale(
    productId: string,
    quantity: number,
    unitPrice: number,
    referenceId: string,
    referenceNumber: string,
    userId?: string,
  ): Promise<StockMovementResponseDto> {
    const movementData = StockMovement.createSaleMovement(
      productId,
      quantity,
      unitPrice,
      referenceId,
      referenceNumber,
      userId,
    );

    return this.create(movementData as CreateStockMovementDto, userId);
  }

  /**
   * Record stock movement for purchases
   */
  async recordPurchaseReceipt(
    productId: string,
    quantity: number,
    unitCost: number,
    referenceId: string,
    referenceNumber: string,
    userId?: string,
  ): Promise<StockMovementResponseDto> {
    const movementData = StockMovement.createPurchaseReceiptMovement(
      productId,
      quantity,
      unitCost,
      referenceId,
      referenceNumber,
      userId,
    );

    return this.create(movementData as CreateStockMovementDto, userId);
  }

  /**
   * Transfer stock between locations
   */
  async transferStock(
    transferDto: StockTransferDto,
    userId?: string,
  ): Promise<{ outMovement: StockMovementResponseDto; inMovement: StockMovementResponseDto }> {
    this.logger.log(
      `Transferring ${transferDto.quantity} units of product ${transferDto.productId} from ${transferDto.fromLocationCode} to ${transferDto.toLocationCode}`,
    );

    const product = await this.productRepository.findOne({
      where: { id: transferDto.productId },
    });

    if (!product) {
      throw new NotFoundException(
        `Product with ID '${transferDto.productId}' not found`,
      );
    }

    // Check available stock at source location
    if (product.stockQuantity < transferDto.quantity) {
      throw new BadRequestException(
        `Insufficient stock at source location. Available: ${product.stockQuantity}, Requested: ${transferDto.quantity}`,
      );
    }

    // Create outward movement (from source)
    const outMovementDto: CreateStockMovementDto = {
      productId: transferDto.productId,
      movementType: StockMovementType.TRANSFER_OUT,
      quantity: -transferDto.quantity,
      locationCode: transferDto.fromLocationCode,
      binLocation: transferDto.fromBinLocation,
      batchNumber: transferDto.batchNumber,
      reason: transferDto.reason,
      notes: transferDto.notes,
      referenceType: 'stock_transfer',
      referenceNumber: transferDto.referenceNumber,
    };

    const outMovement = await this.create(outMovementDto, userId);

    // Create inward movement (to destination)
    const inMovementDto: CreateStockMovementDto = {
      productId: transferDto.productId,
      movementType: StockMovementType.TRANSFER_IN,
      quantity: transferDto.quantity,
      locationCode: transferDto.toLocationCode,
      binLocation: transferDto.toBinLocation,
      batchNumber: transferDto.batchNumber,
      reason: transferDto.reason,
      notes: transferDto.notes,
      referenceType: 'stock_transfer',
      referenceNumber: transferDto.referenceNumber,
    };

    const inMovement = await this.create(inMovementDto, userId);

    // Audit logging removed with authentication system

    this.logger.log(
      `Stock transfer completed: ${outMovement.id} -> ${inMovement.id}`,
    );

    return { outMovement, inMovement };
  }

  /**
   * Get stock summary for a product
   */
  async getProductStockSummary(
    productId: string,
    fromDate?: Date,
    toDate?: Date,
  ): Promise<StockSummaryDto> {
    const product = await this.productRepository.findOne({
      where: { id: productId },
      relations: ['category'],
    });

    if (!product) {
      throw new NotFoundException(`Product with ID '${productId}' not found`);
    }

    // Base query for movements within date range
    const movementsQuery = this.stockMovementRepository
      .createQueryBuilder('movement')
      .where('movement.productId = :productId', { productId })
      .andWhere('movement.status = :status', { status: StockMovementStatus.COMPLETED });

    if (fromDate && toDate) {
      movementsQuery.andWhere('movement.movementDate BETWEEN :fromDate AND :toDate', {
        fromDate,
        toDate,
      });
    } else if (fromDate) {
      movementsQuery.andWhere('movement.movementDate >= :fromDate', { fromDate });
    } else if (toDate) {
      movementsQuery.andWhere('movement.movementDate <= :toDate', { toDate });
    }

    const movements = await movementsQuery.getMany();

    // Calculate inward and outward totals
    let totalInward = 0;
    let totalOutward = 0;
    let lastMovementDate: Date | undefined;

    movements.forEach(movement => {
      if (movement.isInward) {
        totalInward += Math.abs(Number(movement.quantity));
      } else if (movement.isOutward) {
        totalOutward += Math.abs(Number(movement.quantity));
      }

      if (!lastMovementDate || movement.movementDate > lastMovementDate) {
        lastMovementDate = movement.movementDate;
      }
    });


    return {
      productId: product.id,
      sku: product.barcode,
      name: product.name,
      stockQuantity: Number(product.stockQuantity),
      reservedQuantity: Number(0),
      availableQuantity: product.stockQuantity,
      stockValue: Number(product.stockQuantity) * Number(product.baseCost),
      lastMovementDate,
      totalInward,
      totalOutward,
      netMovement: totalInward - totalOutward,
    };
  }

  /**
   * Get low stock alerts
   */
  async getLowStockAlerts(): Promise<LowStockAlertDto[]> {
    const lowStockProducts = await this.productRepository
      .createQueryBuilder('product')
      .leftJoinAndSelect('product.category', 'category')
      .leftJoin('product.stockMovements', 'movements')
      .where('product.stockQuantity <= product.reorderLevel')
      .andWhere('product.isActive = true')
      .andWhere('product.reorderLevel > 0')
      .select([
        'product.id',
        'product.sku',
        'product.name',
        'product.stockQuantity',
        '0',
        'product.reorderLevel',
        'product.optimalStockLevel',
        'category.name',
        'MAX(movements.movementDate) as lastMovementDate',
      ])
      .groupBy('product.id, category.id')
      .orderBy('(product.stockQuantity / NULLIF(product.reorderLevel, 0))', 'ASC')
      .getRawMany();

    const alerts: LowStockAlertDto[] = [];

    for (const product of lowStockProducts) {
      // Calculate average daily usage over last 30 days
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const recentOutwardMovements = await this.stockMovementRepository
        .createQueryBuilder('movement')
        .where('movement.productId = :productId', { productId: product.product_id })
        .andWhere('movement.movementDate >= :date', { date: thirtyDaysAgo })
        .andWhere('movement.quantity < 0') // Outward movements
        .getMany();

      const totalUsage = recentOutwardMovements.reduce(
        (sum, movement) => sum + Math.abs(Number(movement.quantity)),
        0,
      );
      const averageDailyUsage = totalUsage / 30;

      // Calculate estimated days until out of stock
      const currentStock = Number(product.product_stockQuantity);
      const estimatedDaysUntilOutOfStock = averageDailyUsage > 0 
        ? Math.floor(currentStock / averageDailyUsage) 
        : 999;

      // Determine alert severity
      let alertSeverity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' = 'LOW';
      const stockRatio = currentStock / Number(product.product_reorderLevel);

      if (currentStock <= 0) {
        alertSeverity = 'CRITICAL';
      } else if (stockRatio <= 0.25) {
        alertSeverity = 'HIGH';
      } else if (stockRatio <= 0.5) {
        alertSeverity = 'MEDIUM';
      }

      // Calculate days since last restock
      let daysSinceLastRestock = 0;
      if (product.lastMovementDate) {
        const lastMovement = new Date(product.lastMovementDate);
        const today = new Date();
        daysSinceLastRestock = Math.floor(
          (today.getTime() - lastMovement.getTime()) / (1000 * 60 * 60 * 24),
        );
      }

      alerts.push({
        productId: product.product_id,
        sku: product.product_sku,
        name: product.product_name,
        currentStock,
        reorderLevel: Number(product.product_reorderLevel),
        recommendedOrderQuantity: Number(product.product_optimalStockLevel) - currentStock,
        daysSinceLastRestock,
        averageDailyUsage,
        estimatedDaysUntilOutOfStock,
        alertSeverity,
        categoryName: product.category_name,
        lastMovementDate: product.lastMovementDate ? new Date(product.lastMovementDate) : undefined,
      });
    }

    return alerts;
  }

  /**
   * Convert stock movement entity to response DTO
   */
  private toResponseDto(movement: StockMovement): StockMovementResponseDto {
    return {
      id: movement.id,
      movementType: movement.movementType,
      status: movement.status,
      movementDate: movement.movementDate,
      quantity: Number(movement.quantity),
      previousBalance: Number(movement.previousBalance),
      newBalance: Number(movement.newBalance),
      unitValue: movement.unitValue ? Number(movement.unitValue) : undefined,
      totalValue: movement.totalValue ? Number(movement.totalValue) : undefined,
      referenceType: movement.referenceType,
      referenceId: movement.referenceId,
      referenceNumber: movement.referenceNumber,
      locationCode: movement.locationCode,
      binLocation: movement.binLocation,
      batchNumber: movement.batchNumber,
      expiryDate: movement.expiryDate,
      reason: movement.reason,
      notes: movement.notes,
      product: {
        id: movement.product.id,
        sku: movement.product.barcode,
        name: movement.product.name,
        unit: 'pcs',
      },
      movedByUser: movement.movedByUser ? {
        id: movement.movedByUser.id,
        email: movement.movedByUser.email,
        firstName: movement.movedByUser.firstName,
        lastName: movement.movedByUser.lastName,
      } : undefined,
      isInward: movement.isInward,
      isOutward: movement.isOutward,
      description: movement.getDescription(),
      createdAt: movement.createdAt,
      updatedAt: movement.updatedAt,
    };
  }

  /**
   * Create bulk stock adjustment with multiple products in one transaction
   */
  async createBulkStockAdjustment(
    createBulkDto: CreateBulkStockAdjustmentDto,
    userId?: string,
  ): Promise<BulkStockAdjustmentResponseDto> {
    this.logger.log(`Creating bulk stock adjustment with ${createBulkDto.items.length} items`);

    // Generate single SA number for the entire batch
    const saNumber = await this.generateSANumber();
    const movementIds: string[] = [];

    // Process each item
    for (const item of createBulkDto.items) {
      // Skip items with no difference
      if (item.difference === 0) {
        continue;
      }

      // Fetch product to get current stock
      const product = await this.productRepository.findOne({
        where: { id: item.productId },
        relations: ['category'],
      });

      if (!product) {
        throw new NotFoundException(
          `Product with ID '${item.productId}' not found`,
        );
      }

      // Determine movement type based on difference
      const movementType = item.difference > 0
        ? StockMovementType.ADJUSTMENT_INCREASE
        : StockMovementType.ADJUSTMENT_DECREASE;

      // Calculate balances
      const previousBalance = Number(product.stockQuantity);
      const newBalance = Number(item.newQuantity);

      // Validate new balance
      if (newBalance < 0) {
        throw new BadRequestException(
          `Stock adjustment for ${product.name} would result in negative stock quantity`,
        );
      }

      // Create stock movement with shared SA number
      const stockMovement = this.stockMovementRepository.create({
        productId: item.productId,
        movementType,
        quantity: Math.abs(item.difference),
        previousBalance,
        newBalance,
        status: StockMovementStatus.COMPLETED,
        movedByUserId: userId,
        locationCode: 'MAIN',
        referenceNumber: saNumber,
        movementDate: createBulkDto.adjustmentDate,
        reason: 'Stock Adjustment',
        notes: createBulkDto.notes || undefined,
      });

      const savedMovement = await this.stockMovementRepository.save(stockMovement);
      movementIds.push(savedMovement.id);

      // Update product stock quantity
      await this.productService.updateStockQuantity(
        product.id,
        newBalance,
        userId,
      );

      this.logger.log(
        `Stock adjustment for ${product.name}: ${previousBalance} → ${newBalance} (${item.difference > 0 ? '+' : ''}${item.difference})`,
      );
    }

    this.logger.log(`Bulk stock adjustment ${saNumber} created successfully with ${movementIds.length} movements`);

    return {
      saNumber,
      itemsAdjusted: movementIds.length,
      adjustmentDate: createBulkDto.adjustmentDate,
      notes: createBulkDto.notes,
      movementIds,
    };
  }
}