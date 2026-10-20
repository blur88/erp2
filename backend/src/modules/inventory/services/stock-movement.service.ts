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
  DataSource,
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
import { OwnerEquityDocument } from '../../owner-equity/entities/owner-equity-document.entity';
import { repoFor, lockProductForStockUpdate } from '../../../common/db/tx-helpers';
import {
  CreateStockMovementDto,
  QueryStockMovementsDto,
  StockMovementResponseDto,
  StockReservationDto,
  StockSummaryDto,
  LowStockAlertDto,
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
    // Entity-only dependency (repository, never OwnerEquityModule or its
    // services) — Owner Equity already imports InventoryModule (#1022), so
    // importing the module back would close a provider cycle.
    @InjectRepository(OwnerEquityDocument)
    private readonly ownerEquityDocumentRepository: Repository<OwnerEquityDocument>,
    @Inject(forwardRef(() => ProductService))
    private readonly productService: any,
    private readonly dataSource: DataSource,
  ) {}


  /**
   * Create a stock movement and update product stock
   */
  async create(
    createMovementDto: CreateStockMovementDto,
    userId?: string,
    manager?: EntityManager,
  ): Promise<StockMovementResponseDto> {
    // Stock-mutation contract (#1076): the product must be locked before
    // stockQuantity is read, so the read-compute-write below is atomic against
    // concurrent movements from any other workflow. A lock only means something
    // inside a transaction, so a caller that supplied no manager gets one here
    // (public entry points such as StockController.createMovement). This must
    // precede the repoFor() calls, which would otherwise bind to the default
    // connection and escape the transaction entirely.
    if (!manager) {
      return this.dataSource.transaction((txManager) =>
        this.create(createMovementDto, userId, txManager),
      );
    }

    const stockMovementRepo = repoFor(manager, StockMovement, this.stockMovementRepository);
    const productRepo = repoFor(manager, Product, this.productRepository);
    this.logger.log(
      `Creating stock movement for product ${createMovementDto.productId}: ${createMovementDto.quantity} units`,
    );

    await lockProductForStockUpdate(manager, Product, createMovementDto.productId);

    // Re-read WITH relations (category) now that the row is lock-held. The
    // locked instance above is the authority for stockQuantity; this read is
    // consistent because the lock is held for the rest of the transaction.
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

    // Validate new balance is not negative
    if (newBalance < 0) {
      throw new BadRequestException(
        'Stock movement would result in negative stock quantity',
      );
    }

    // Assign per-product sequence under the lock.
    const { nextProductSequence } = await import('./stock-occurrence');
    const productSequence = await nextProductSequence(manager, createMovementDto.productId);

    // Create stock movement
    const stockMovement = stockMovementRepo.create({
      ...createMovementDto,
      previousBalance,
      newBalance,
      productSequence,
      actorUserId: userId,
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
      .leftJoinAndSelect('movement.valuationGap', 'valuationGap')
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
        page,
        limit,
        totalPages: shouldPaginate ? Math.ceil(total / limit) : 1,
        hasNextPage: shouldPaginate ? page < Math.ceil(total / limit) : false,
        hasPreviousPage: shouldPaginate ? page > 1 : false,
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
   * Record initial stock for a new product
   */
  async recordInitialStock(
    productId: string,
    quantity: number,
    unitCost?: number,
    userId?: string,
    manager?: EntityManager,
  ): Promise<StockMovementResponseDto> {
    const createMovementDto: CreateStockMovementDto = {
      productId,
      movementType: StockMovementType.INITIAL_STOCK,
      quantity,
      unitValue: unitCost,
      reason: 'Initial stock entry',
      referenceType: 'initial_stock',
    };

    return this.create(createMovementDto, userId, manager);
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
    if (referenceType === 'owner_equity') {
      const repo = repoFor(
        manager,
        OwnerEquityDocument,
        this.ownerEquityDocumentRepository,
      );
      const doc = await repo.findOne({
        where: { id: referenceId },
        select: { id: true, referenceNumber: true },
        loadEagerRelations: false,
      });
      return doc?.referenceNumber;
    }
    return undefined;
  }

  /**
   * Batch-resolve reference numbers for a page of movements: one PO query, one
   * SO query and one Owner Equity query (each skipped when empty). Returns a
   * map keyed `${referenceType}:${referenceId}`.
   */
  private async buildReferenceNumberMap(
    movements: StockMovement[],
  ): Promise<Map<string, string>> {
    const map = new Map<string, string>();
    const poIds = new Set<string>();
    const soIds = new Set<string>();
    const oeIds = new Set<string>();

    for (const m of movements) {
      if (!m.referenceId) continue;
      if (m.referenceType === 'purchase_order') poIds.add(m.referenceId);
      else if (m.referenceType === 'sales_order') soIds.add(m.referenceId);
      else if (m.referenceType === 'owner_equity') oeIds.add(m.referenceId);
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

    if (oeIds.size > 0) {
      const docs = await this.ownerEquityDocumentRepository.find({
        where: { id: In([...oeIds]) },
        select: { id: true, referenceNumber: true },
        loadEagerRelations: false,
      });
      for (const doc of docs) {
        map.set(this.referenceKey('owner_equity', doc.id), doc.referenceNumber);
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
      valuationGap: movement.valuationGap
        ? {
            quantity: Number(movement.valuationGap.quantity),
            valueScale8: String(movement.valuationGap.valueScale8),
            status: movement.valuationGap.status,
          }
        : undefined,
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

}
