import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Repository,
  FindManyOptions,
  SelectQueryBuilder,
  In,
} from 'typeorm';
import {
  StockAdjustment,
  StockAdjustmentStatus,
} from '../../../database/entities/stock-adjustment.entity';
import { Product } from '../../../database/entities/product.entity';
import { StockMovementType } from '../../../database/entities/stock-movement.entity';
import {
  CreateStockAdjustmentDto,
  UpdateStockAdjustmentDto,
  QueryStockAdjustmentsDto,
  StockAdjustmentResponseDto,
  BulkStockAdjustmentDto,
} from '../dto/stock.dto';
import { StockMovementService } from './stock-movement.service';
import { ProductService } from './product.service';
import { StockMovement } from '../../../database/entities/stock-movement.entity';

@Injectable()
export class StockAdjustmentService {
  private readonly logger = new Logger(StockAdjustmentService.name);

  constructor(
    @InjectRepository(StockAdjustment)
    private readonly stockAdjustmentRepository: Repository<StockAdjustment>,
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,
    @Inject(forwardRef(() => StockMovementService))
    private readonly stockMovementService: StockMovementService,
    @Inject(forwardRef(() => ProductService))
    private readonly productService: ProductService,
  ) {}

  /**
   * Create a new stock adjustment
   */
  async create(
    createAdjustmentDto: CreateStockAdjustmentDto,
  ): Promise<StockAdjustmentResponseDto> {
    this.logger.log(
      `Creating stock adjustment for product ${createAdjustmentDto.productId}`,
    );

    const product = await this.productRepository.findOne({
      where: { id: createAdjustmentDto.productId },
      relations: ['category'],
    });

    if (!product) {
      throw new NotFoundException(
        `Product with ID '${createAdjustmentDto.productId}' not found`,
      );
    }

    // Validate system quantity matches current stock
    if (Number(createAdjustmentDto.systemQuantity) !== Number(product.stockQuantity)) {
      throw new BadRequestException(
        `System quantity mismatch. Current stock: ${product.stockQuantity}, Provided: ${createAdjustmentDto.systemQuantity}`,
      );
    }

    // Create stock adjustment
    const stockAdjustment = this.stockAdjustmentRepository.create({
      ...createAdjustmentDto,
      adjustmentDate: new Date(),
      locationCode: createAdjustmentDto.locationCode || 'MAIN',
      status: StockAdjustmentStatus.DRAFT,
    });

    const savedAdjustment = await this.stockAdjustmentRepository.save(stockAdjustment);

    // Process adjustment immediately
    await this.processAdjustment(savedAdjustment.id);

    // Audit logging removed with authentication system

    this.logger.log(`Stock adjustment created successfully: ${savedAdjustment.id}`);
    return this.toResponseDto(savedAdjustment);
  }

  /**
   * Find all stock adjustments with filtering, sorting, and pagination
   */
  async findAll(query: QueryStockAdjustmentsDto) {
    const {
      page = 1,
      limit = 20,
      productId,
      type,
      status,
      fromDate,
      toDate,
      locationCode,
      search,
      sortBy = 'adjustmentDate',
      sortOrder = 'DESC',
    } = query;

    const queryBuilder = this.stockAdjustmentRepository
      .createQueryBuilder('adjustment')
      .leftJoinAndSelect('adjustment.product', 'product')
      .leftJoinAndSelect('product.category', 'category')

    // Apply filters
    if (productId) {
      queryBuilder.andWhere('adjustment.productId = :productId', { productId });
    }

    if (type) {
      queryBuilder.andWhere('adjustment.type = :type', { type });
    }

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


    if (locationCode) {
      queryBuilder.andWhere('adjustment.locationCode = :locationCode', {
        locationCode,
      });
    }


    if (search) {
      queryBuilder.andWhere(
        '(adjustment.adjustmentNumber ILIKE :search OR product.name ILIKE :search OR product.barcode ILIKE :search OR adjustment.reason ILIKE :search)',
        { search: `%${search}%` },
      );
    }

    // Apply sorting
    const validSortFields = ['adjustmentDate', 'adjustmentQuantity', 'totalValueImpact'];
    const sortField = validSortFields.includes(sortBy) ? sortBy : 'adjustmentDate';
    queryBuilder.orderBy(`adjustment.${sortField}`, sortOrder);

    // Apply pagination
    const offset = (page - 1) * limit;
    queryBuilder.skip(offset).take(limit);

    const [adjustments, total] = await queryBuilder.getManyAndCount();

    const data = adjustments.map(adjustment => this.toResponseDto(adjustment));

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
      relations: ['product', 'product.category'],
    });

    if (!adjustment) {
      throw new NotFoundException(`Stock adjustment with ID '${id}' not found`);
    }

    return this.toResponseDto(adjustment);
  }

  /**
   * Update a stock adjustment (only if not yet approved)
   */
  async update(
    id: string,
    updateAdjustmentDto: UpdateStockAdjustmentDto,
    adjustedBy: string = 'system',
  ): Promise<StockAdjustmentResponseDto> {
    this.logger.log(`Updating stock adjustment: ${id}`);

    const adjustment = await this.stockAdjustmentRepository.findOne({
      where: { id },
      relations: ['product'],
    });

    if (!adjustment) {
      throw new NotFoundException(`Stock adjustment with ID '${id}' not found`);
    }

    // Check if adjustment can be modified
    if (!adjustment.isPending) {
      throw new BadRequestException('Cannot modify adjustment that is not in pending status');
    }

    // Track changes for audit
    const changes: Record<string, { from: any; to: any }> = {};
    Object.keys(updateAdjustmentDto).forEach(key => {
      if (updateAdjustmentDto[key] !== adjustment[key]) {
        changes[key] = { from: adjustment[key], to: updateAdjustmentDto[key] };
      }
    });

    // Update adjustment
    Object.assign(adjustment, updateAdjustmentDto);

    // Recalculate if quantities changed
    if (updateAdjustmentDto.systemQuantity || updateAdjustmentDto.actualQuantity) {
      adjustment.adjustmentQuantity = Number(adjustment.actualQuantity) - Number(adjustment.systemQuantity);
    }

    // Recalculate value impact if unit cost or quantities changed
    if (updateAdjustmentDto.unitCost || updateAdjustmentDto.systemQuantity || updateAdjustmentDto.actualQuantity) {
      if (adjustment.unitCost) {
        adjustment.totalValueImpact = Number(adjustment.adjustmentQuantity) * Number(adjustment.unitCost);
      }
    }

    const updatedAdjustment = await this.stockAdjustmentRepository.save(adjustment);

    // Process adjustment immediately if quantity changed
    if (updatedAdjustment.adjustmentQuantity !== 0) {
      await this.processAdjustment(updatedAdjustment.id);
    }

    // Audit logging removed with authentication system

    this.logger.log(`Stock adjustment updated successfully: ${updatedAdjustment.id}`);
    return this.toResponseDto(updatedAdjustment);
  }


  /**
   * Cancel a stock adjustment (only if pending)
   */
  async cancel(
    id: string,
    reason: string,
    adjustedBy: string = 'system',
  ): Promise<StockAdjustmentResponseDto> {
    this.logger.log(`Cancelling stock adjustment: ${id}`);

    const adjustment = await this.stockAdjustmentRepository.findOne({
      where: { id },
      relations: ['product'],
    });

    if (!adjustment) {
      throw new NotFoundException(`Stock adjustment with ID '${id}' not found`);
    }

    if (!adjustment.isPending) {
      throw new BadRequestException('Only pending adjustments can be cancelled');
    }

    // Cancel the adjustment
    adjustment.cancel(reason);
    const cancelledAdjustment = await this.stockAdjustmentRepository.save(adjustment);

    // Audit logging removed with authentication system

    this.logger.log(`Stock adjustment cancelled successfully: ${cancelledAdjustment.id}`);
    return this.toResponseDto(cancelledAdjustment);
  }

  /**
   * Create bulk stock adjustments
   */
  async createBulk(
    bulkAdjustmentDto: BulkStockAdjustmentDto,
    adjustedBy: string = 'system',
  ): Promise<StockAdjustmentResponseDto[]> {
    this.logger.log(`Creating bulk stock adjustments: ${bulkAdjustmentDto.adjustments.length} items`);

    const results: StockAdjustmentResponseDto[] = [];

    for (const adjustmentDto of bulkAdjustmentDto.adjustments) {
      // Apply global settings
      const completeAdjustmentDto: CreateStockAdjustmentDto = {
        ...adjustmentDto,
        reason: adjustmentDto.reason || bulkAdjustmentDto.globalReason || 'Bulk adjustment',
        countDetails: adjustmentDto.countDetails || bulkAdjustmentDto.globalCountDetails,
      };

      try {
        const adjustment = await this.create(completeAdjustmentDto, adjustedBy);
        results.push(adjustment);
      } catch (error) {
        this.logger.error(`Failed to create adjustment for product ${adjustmentDto.productId}: ${error.message}`);
        // Continue with other adjustments, but log the error
      }
    }

    // Audit logging removed with authentication system

    this.logger.log(`Bulk stock adjustments completed: ${results.length} created`);
    return results;
  }


  /**
   * Process an adjustment (create stock movement and update product)
   */
  private async processAdjustment(adjustmentId: string): Promise<void> {
    const adjustment = await this.stockAdjustmentRepository.findOne({
      where: { id: adjustmentId },
      relations: ['product'],
    });

    if (!adjustment || adjustment.status === StockAdjustmentStatus.CANCELLED) {
      return;
    }

    // Create stock movement
    if (adjustment.adjustmentQuantity !== 0) {
      const movementData = StockMovement.createAdjustmentMovement(
        adjustment.productId,
        Number(adjustment.adjustmentQuantity),
        adjustment.reason,
        adjustment.id,
        'system',
      );

      await this.stockMovementService.create(movementData as any, 'system');
    }

    // Mark adjustment as completed
    adjustment.complete();
    await this.stockAdjustmentRepository.save(adjustment);
  }

  /**
   * Convert stock adjustment entity to response DTO
   */
  private toResponseDto(adjustment: StockAdjustment): StockAdjustmentResponseDto {
    return {
      id: adjustment.id,
      adjustmentNumber: adjustment.adjustmentNumber,
      type: adjustment.type,
      status: adjustment.status,
      adjustmentDate: adjustment.adjustmentDate,
      systemQuantity: Number(adjustment.systemQuantity),
      actualQuantity: Number(adjustment.actualQuantity),
      adjustmentQuantity: Number(adjustment.adjustmentQuantity),
      unitCost: adjustment.unitCost ? Number(adjustment.unitCost) : undefined,
      totalValueImpact: adjustment.totalValueImpact ? Number(adjustment.totalValueImpact) : undefined,
      locationCode: adjustment.locationCode,
      binLocation: adjustment.binLocation,
      batchNumber: adjustment.batchNumber,
      expiryDate: adjustment.expiryDate,
      reason: adjustment.reason,
      notes: adjustment.notes,
      countedBy: adjustment.countedBy,
      countedAt: adjustment.countedAt,
      countDetails: adjustment.countDetails,
      attachments: adjustment.attachments,
      product: {
        id: adjustment.product.id,
        sku: adjustment.product.barcode,
        name: adjustment.product.name,
        unit: 'pcs',
      },
      isIncrease: adjustment.isIncrease,
      isDecrease: adjustment.isDecrease,
      adjustmentPercent: adjustment.adjustmentPercent,
      isPending: adjustment.isPending,
      isCompleted: adjustment.isCompleted,
      adjustedByUser: {
        id: 'system',
        email: 'system',
        firstName: 'System',
        lastName: 'User',
      },
      canApprove: false,
      canReject: false,
      requiresApproval: false,
      isSignificant: Math.abs(adjustment.adjustmentPercent) > 5 || Math.abs(Number(adjustment.totalValueImpact || 0)) > 50,
      createdAt: adjustment.createdAt,
      updatedAt: adjustment.updatedAt,
    };
  }
}