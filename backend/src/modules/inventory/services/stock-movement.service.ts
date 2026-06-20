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
  EntityManager,
  In,
} from 'typeorm';
import { applyPagination } from '@/common/pagination/apply-pagination';
import {
  StockMovement,
  StockMovementType,
} from '../../../database/entities/stock-movement.entity';
import { Product } from '../../../database/entities/product.entity';
import { PurchaseOrder } from '../../../database/entities/purchase-order.entity';
import { SalesOrder } from '../../../database/entities/sales-order.entity';
import { repoFor } from '../../../common/db/tx-helpers';
import {
  CreateStockMovementDto,
  QueryStockMovementsDto,
  StockMovementResponseDto,
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
    @InjectRepository(PurchaseOrder)
    private readonly purchaseOrderRepository: Repository<PurchaseOrder>,
    @InjectRepository(SalesOrder)
    private readonly salesOrderRepository: Repository<SalesOrder>,
    @Inject(forwardRef(() => ProductService))
    private readonly productService: ProductService,
  ) {}


  /**
   * Create a stock movement and update product stock
   */
  async create(
    createMovementDto: CreateStockMovementDto,
    userId?: string,
    manager?: EntityManager,
  ): Promise<StockMovementResponseDto> {
    const stockMovementRepo = repoFor(manager, StockMovement, this.stockMovementRepository);
    const productRepo = repoFor(manager, Product, this.productRepository);
    this.logger.log(
      `Creating stock movement for product ${createMovementDto.productId}: ${createMovementDto.quantity} units`,
    );

    const product = await productRepo.findOne({
      where: { id: createMovementDto.productId },
      relations: { category: true },
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

    // DEBUG: Log stock values to trace the bug
    console.log(`🔍 [stockMovementService.create] Product ${createMovementDto.productId}:`);
    console.log(`  Current stock in DB: ${previousBalance}`);
    console.log(`  Quantity change: ${createMovementDto.quantity}`);
    console.log(`  New balance will be: ${newBalance}`);

    // Validate new balance is not negative
    if (newBalance < 0) {
      throw new BadRequestException(
        'Stock movement would result in negative stock quantity',
      );
    }

    // Create stock movement
    const stockMovement = stockMovementRepo.create({
      ...createMovementDto,
      previousBalance,
      newBalance,
    });

    const savedMovement = await stockMovementRepo.save(stockMovement);

    // Update product stock quantity
    await this.productService.updateStockQuantity(
      product.id,
      newBalance,
      userId,
      manager,
    );

    // Audit logging removed with authentication system

    this.logger.log(`Stock movement created successfully: ${savedMovement.id}`);

    // Reload with relations for response DTO
    const movementWithRelations = await stockMovementRepo.findOne({
      where: { id: savedMovement.id },
      relations: { product: true },
    });

    const referenceNumber = await this.resolveReferenceNumber(
      movementWithRelations.referenceType,
      movementWithRelations.referenceId,
      manager,
    );
    return this.toResponseDto(movementWithRelations, referenceNumber);
  }

  /**
   * Find all stock movements with filtering, sorting, and pagination
   */
  async findAll(query: QueryStockMovementsDto) {
    const {
      page,
      limit,
      productId,
      movementType,
      fromDate,
      toDate,
      referenceType,
      referenceId,
      search,
      sortBy = 'movementDate',
      sortOrder = 'DESC',
    } = query;

    const queryBuilder = this.stockMovementRepository
      .createQueryBuilder('movement')
      .leftJoinAndSelect('movement.product', 'product')
      .leftJoinAndSelect('product.category', 'category')
      .where('movement.deletedAt IS NULL');

    // Apply filters
    if (productId) {
      queryBuilder.andWhere('movement.productId = :productId', { productId });
    }

    if (movementType) {
      queryBuilder.andWhere('movement.movementType = :movementType', {
        movementType,
      });
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

    if (search) {
      queryBuilder.andWhere(
        '(product.name ILIKE :search OR product.barcode ILIKE :search OR movement.reason ILIKE :search)',
        { search: `%${search}%` },
      );
    }

    // Apply sorting
    const validSortFields = ['movementDate', 'quantity', 'totalValue'];
    const sortField = validSortFields.includes(sortBy) ? sortBy : 'movementDate';
    // Normalize sort order to uppercase for TypeORM
    const normalizedSortOrder = sortOrder?.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';
    queryBuilder.orderBy(`movement.${sortField}`, normalizedSortOrder);
    // Add secondary sort by createdAt to ensure consistent ordering when primary field has duplicates
    queryBuilder.addOrderBy('movement.createdAt', normalizedSortOrder);

    // Apply pagination
    const shouldPaginate = page !== undefined && limit !== undefined;
    applyPagination(queryBuilder, page, limit);

    const [movements, total] = await queryBuilder.getManyAndCount();

    const referenceNumbers = await this.buildReferenceNumberMap(movements);
    const data = movements.map(movement =>
      this.toResponseDto(
        movement,
        movement.referenceType && movement.referenceId
          ? referenceNumbers.get(
              this.referenceKey(movement.referenceType, movement.referenceId),
            )
          : undefined,
      ),
    );

    return {
      data,
      meta: {
        total,
        ...(shouldPaginate && { page }),
        ...(shouldPaginate && { limit }),
        ...(shouldPaginate && { totalPages: Math.ceil(total / limit) }),
        ...(shouldPaginate && { hasNextPage: page < Math.ceil(total / limit) }),
        ...(shouldPaginate && { hasPreviousPage: page > 1 }),
      },
    };
  }

  /**
   * Find one stock movement by ID
   */
  async findOne(id: string): Promise<StockMovementResponseDto> {
    const movement = await this.stockMovementRepository.findOne({
      where: { id },
      relations: { product: { category: true } }, // movedByUser omitted — column removed in migration 1732550000000
    });

    if (!movement) {
      throw new NotFoundException(`Stock movement with ID '${id}' not found`);
    }

    const referenceNumber = await this.resolveReferenceNumber(
      movement.referenceType,
      movement.referenceId,
    );
    return this.toResponseDto(movement, referenceNumber);
  }

  /**
   * Reverse a stock movement
   */
  async reverseMovement(
    id: string,
    reason: string,
    userId?: string,
    manager?: EntityManager,
  ): Promise<StockMovementResponseDto> {
    const stockMovementRepo = repoFor(manager, StockMovement, this.stockMovementRepository);
    this.logger.log(`Reversing stock movement: ${id}`);

    const movement = await stockMovementRepo.findOne({
      where: { id },
      relations: { product: true },
    });

    if (!movement) {
      throw new NotFoundException(`Stock movement with ID '${id}' not found`);
    }

    // Create reversal movement
    const reversalMovement = movement.reverse(reason);
    const savedReversal = await stockMovementRepo.save(reversalMovement);

    // Update product stock
    await this.productService.updateStockQuantity(
      movement.product.id,
      Number(reversalMovement.newBalance),
      userId,
      manager,
    );

    // Audit logging removed with authentication system

    this.logger.log(`Stock movement reversed successfully: ${savedReversal.id}`);
    const referenceNumber = await this.resolveReferenceNumber(
      savedReversal.referenceType,
      savedReversal.referenceId,
      manager,
    );
    return this.toResponseDto(savedReversal, referenceNumber);
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
    userId?: string,
  ): Promise<StockMovementResponseDto> {
    const movementData = StockMovement.createSaleMovement(
      productId,
      quantity,
      unitPrice,
      referenceId,
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
    userId?: string,
  ): Promise<StockMovementResponseDto> {
    const movementData = StockMovement.createPurchaseReceiptMovement(
      productId,
      quantity,
      unitCost,
      referenceId,
    );

    return this.create(movementData as CreateStockMovementDto, userId);
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
      relations: { category: true },
    });

    if (!product) {
      throw new NotFoundException(`Product with ID '${productId}' not found`);
    }

    // Base query for movements within date range
    const movementsQuery = this.stockMovementRepository
      .createQueryBuilder('movement')
      .where('movement.productId = :productId', { productId });

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

  /** Map key for a reference-number lookup: type-scoped so PO/SO can't collide on a shared UUID. */
  private referenceKey(referenceType: string, referenceId: string): string {
    return `${referenceType}:${referenceId}`;
  }

  /**
   * Resolve a single movement's order number (PO/SO only). Uses the active
   * transaction manager when given so lookups don't escape an open transaction.
   */
  private async resolveReferenceNumber(
    referenceType: string | undefined,
    referenceId: string | undefined,
    manager?: EntityManager,
  ): Promise<string | undefined> {
    if (!referenceId) return undefined;
    if (referenceType === 'purchase_order') {
      const repo = repoFor(manager, PurchaseOrder, this.purchaseOrderRepository);
      const po = await repo.findOne({
        where: { id: referenceId },
        select: { id: true, orderNumber: true },
        loadEagerRelations: false, // PurchaseOrder.supplier is eager; skip the needless JOIN
      });
      return po?.orderNumber;
    }
    if (referenceType === 'sales_order') {
      const repo = repoFor(manager, SalesOrder, this.salesOrderRepository);
      const so = await repo.findOne({
        where: { id: referenceId },
        select: { id: true, orderNumber: true },
        loadEagerRelations: false,
      });
      return so?.orderNumber;
    }
    return undefined;
  }

  /**
   * Batch-resolve order numbers for a page of movements: one PO query + one SO
   * query (skipped when empty). Returns a map keyed `${referenceType}:${referenceId}`.
   */
  private async buildReferenceNumberMap(
    movements: StockMovement[],
  ): Promise<Map<string, string>> {
    const map = new Map<string, string>();
    const poIds = new Set<string>();
    const soIds = new Set<string>();

    for (const m of movements) {
      if (!m.referenceId) continue;
      if (m.referenceType === 'purchase_order') poIds.add(m.referenceId);
      else if (m.referenceType === 'sales_order') soIds.add(m.referenceId);
    }

    if (poIds.size > 0) {
      const pos = await this.purchaseOrderRepository.find({
        where: { id: In([...poIds]) },
        select: { id: true, orderNumber: true },
        loadEagerRelations: false, // PurchaseOrder.supplier is eager; skip the needless JOIN
      });
      for (const po of pos) {
        map.set(this.referenceKey('purchase_order', po.id), po.orderNumber);
      }
    }

    if (soIds.size > 0) {
      const sos = await this.salesOrderRepository.find({
        where: { id: In([...soIds]) },
        select: { id: true, orderNumber: true },
        loadEagerRelations: false,
      });
      for (const so of sos) {
        map.set(this.referenceKey('sales_order', so.id), so.orderNumber);
      }
    }

    return map;
  }

  /**
   * Convert stock movement entity to response DTO
   */
  private toResponseDto(
    movement: StockMovement,
    referenceNumber?: string,
  ): StockMovementResponseDto {
    return {
      id: movement.id,
      movementType: movement.movementType,
      movementDate: movement.movementDate,
      quantity: Number(movement.quantity),
      previousBalance: Number(movement.previousBalance),
      newBalance: Number(movement.newBalance),
      unitValue: movement.unitValue ? Number(movement.unitValue) : undefined,
      totalValue: movement.totalValue ? Number(movement.totalValue) : undefined,
      referenceType: movement.referenceType,
      referenceId: movement.referenceId,
      referenceNumber,
      reason: movement.reason,
      notes: movement.notes,
      product: {
        id: movement.product.id,
        sku: movement.product.barcode,
        name: movement.product.name,
        unit: 'pcs',
      },
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
        relations: { category: true },
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

      // Create stock movement
      const stockMovement = this.stockMovementRepository.create({
        productId: item.productId,
        movementType,
        quantity: Math.abs(item.difference),
        previousBalance,
        newBalance,
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

    this.logger.log(`Bulk stock adjustment created successfully with ${movementIds.length} movements`);

    return {
      itemsAdjusted: movementIds.length,
      adjustmentDate: createBulkDto.adjustmentDate,
      notes: createBulkDto.notes,
      movementIds,
    };
  }

  /**
   * Recalculate previousBalance and newBalance for all movements of a product
   * This ensures data integrity after movements are deleted
   */
  async recalculateBalances(
    productId: string,
    manager?: EntityManager,
  ): Promise<void> {
    const stockMovementRepo = repoFor(manager, StockMovement, this.stockMovementRepository);
    const productRepo = repoFor(manager, Product, this.productRepository);

    this.logger.log(`Recalculating balances for product ${productId}`);

    // Fetch all movements for this product in chronological order
    const movements = await stockMovementRepo.find({
      where: { productId },
      order: {
        movementDate: 'ASC',
        createdAt: 'ASC',
      },
    });

    if (movements.length === 0) {
      this.logger.log(`No movements found for product ${productId}, nothing to recalculate`);
      return;
    }

    // Get current product stock
    const product = await productRepo.findOne({
      where: { id: productId },
    });

    if (!product) {
      this.logger.warn(`Product ${productId} not found, cannot recalculate balances`);
      return;
    }

    // Calculate total movement to determine starting balance
    const totalMovement = movements.reduce((sum, movement) => {
      return sum + Number(movement.quantity);
    }, 0);

    // Starting balance = current stock - total movement
    let runningBalance = Number(product.stockQuantity) - totalMovement;

    this.logger.log(
      `Product ${productId}: Current stock = ${product.stockQuantity}, Total movement = ${totalMovement}, Starting balance = ${runningBalance}`
    );

    // Update each movement with recalculated balances
    for (const movement of movements) {
      const previousBalance = runningBalance;
      const quantity = Number(movement.quantity);
      const newBalance = runningBalance + quantity;

      // Only update if values have changed
      if (
        Number(movement.previousBalance) !== previousBalance ||
        Number(movement.newBalance) !== newBalance
      ) {
        movement.previousBalance = previousBalance;
        movement.newBalance = newBalance;
        await stockMovementRepo.save(movement);

        this.logger.log(
          `Updated movement ${movement.id}: ${previousBalance} + (${quantity}) = ${newBalance}`
        );
      }

      runningBalance = newBalance;
    }

    this.logger.log(`Balance recalculation completed for product ${productId}`);
  }

  /**
   * Delete stock movements by reference type and ID
   * Used for hard delete cascades when removing source documents
   * IMPORTANT: This method reverses the stock quantities before deleting movements
   */
  async deleteByReference(
    referenceType: string,
    referenceId: string,
    manager?: EntityManager,
  ): Promise<{ deletedCount: number }> {
    const stockMovementRepo = repoFor(manager, StockMovement, this.stockMovementRepository);
    const productRepo = repoFor(manager, Product, this.productRepository);

    this.logger.log(`Deleting stock movements for ${referenceType}: ${referenceId}`);

    // First, fetch all movements to revert their quantities
    const movements = await stockMovementRepo.find({
      where: {
        referenceType,
        referenceId,
      },
      relations: { product: true },
    });

    if (movements.length === 0) {
      this.logger.log(`No stock movements found for ${referenceType}: ${referenceId}`);
      return { deletedCount: 0 };
    }

    // Collect affected product IDs for balance recalculation
    const affectedProductIds = new Set<string>();

    // Revert stock quantities for each product affected
    const productUpdates = new Map<string, number>();

    for (const movement of movements) {
      const productId = movement.productId;
      affectedProductIds.add(productId);
      const currentAdjustment = productUpdates.get(productId) || 0;
      // Reverse the movement by negating the quantity
      productUpdates.set(productId, currentAdjustment - Number(movement.quantity));

      this.logger.log(
        `Will revert ${movement.quantity} units for product ${productId} (movement ${movement.id})`
      );
    }

    // Update product stock quantities
    for (const [productId, adjustment] of productUpdates.entries()) {
      const product = await productRepo.findOne({
        where: { id: productId },
      });

      if (product) {
        const oldStock = Number(product.stockQuantity);
        const newStock = oldStock + adjustment;

        this.logger.log(
          `Reverting stock for product ${productId}: ${oldStock} + (${adjustment}) = ${newStock}`
        );

        if (newStock < 0) {
          this.logger.warn(
            `Warning: Reverting stock for product ${productId} would result in negative stock (${newStock}). Setting to 0.`
          );
          product.stockQuantity = 0;
        } else {
          product.stockQuantity = newStock;
        }

        await productRepo.save(product);
      } else {
        this.logger.warn(`Product ${productId} not found, skipping stock reversion`);
      }
    }

    // Now delete the stock movements
    const result = await stockMovementRepo
      .createQueryBuilder()
      .delete()
      .from('stock_movements')
      .where('referenceType = :referenceType', { referenceType })
      .andWhere('referenceId = :referenceId', { referenceId })
      .execute();

    const deletedCount = Number(result.affected) || 0;
    this.logger.log(
      `Deleted ${deletedCount} stock movements and reverted quantities for ${productUpdates.size} products (${referenceType}: ${referenceId})`
    );

    // Recalculate balances for all affected products
    for (const productId of affectedProductIds) {
      await this.recalculateBalances(productId, manager);
    }

    return { deletedCount };
  }

  /**
   * Delete stock movements by multiple reference types and IDs
   * Used for bulk operations
   */
  async deleteByMultipleReferences(
    references: Array<{ referenceType: string; referenceId: string }>,
  ): Promise<{ deletedCount: number }> {
    if (!references || references.length === 0) {
      return { deletedCount: 0 };
    }

    this.logger.log(`Deleting stock movements for ${references.length} references`);

    let totalDeletedCount = 0;
    const affectedProductIds = new Set<string>();

    for (const { referenceType, referenceId } of references) {
      // First, fetch movements to track affected products
      const movements = await this.stockMovementRepository.find({
        where: {
          referenceType,
          referenceId,
        },
      });

      // Track affected products
      movements.forEach((movement) => {
        affectedProductIds.add(movement.productId);
      });

      // Delete the movements
      const result = await this.stockMovementRepository
        .createQueryBuilder('movement')
        .delete()
        .where('movement.referenceType = :referenceType', { referenceType })
        .andWhere('movement.referenceId = :referenceId', { referenceId })
        .execute();

      const deletedCount = Number(result.affected) || 0;
      totalDeletedCount += deletedCount;
    }

    this.logger.log(`Deleted ${totalDeletedCount} stock movements across ${references.length} references`);

    // Recalculate balances for all affected products
    for (const productId of affectedProductIds) {
      await this.recalculateBalances(productId);
    }

    return { deletedCount: totalDeletedCount };
  }
}
