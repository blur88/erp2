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
  StockAdjustmentType,
  StockAdjustmentStatus,
} from '../../../database/entities/stock-adjustment.entity';
import { Product } from '../../../database/entities/product.entity';
import { User } from '../../../database/entities/user.entity';
import { StockMovementType } from '../../../database/entities/stock-movement.entity';
import {
  CreateStockAdjustmentDto,
  UpdateStockAdjustmentDto,
  QueryStockAdjustmentsDto,
  StockAdjustmentResponseDto,
  StockAdjustmentActionDto,
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
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
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
    userId: string = 'system',
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
      adjustedByUserId: userId,
      locationCode: createAdjustmentDto.locationCode || 'MAIN',
    });

    // Set initial status based on whether approval is required
    if (stockAdjustment.requiresApproval()) {
      stockAdjustment.status = StockAdjustmentStatus.PENDING_APPROVAL;
    } else {
      stockAdjustment.status = StockAdjustmentStatus.APPROVED;
    }

    const savedAdjustment = await this.stockAdjustmentRepository.save(stockAdjustment);

    // If auto-approved, process immediately
    if (savedAdjustment.status === StockAdjustmentStatus.APPROVED) {
      await this.processAdjustment(savedAdjustment.id, userId);
    }

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
      adjustedByUserId,
      approvedByUserId,
      locationCode,
      requiresApproval,
      search,
      sortBy = 'adjustmentDate',
      sortOrder = 'DESC',
    } = query;

    const queryBuilder = this.stockAdjustmentRepository
      .createQueryBuilder('adjustment')
      .leftJoinAndSelect('adjustment.product', 'product')
      .leftJoinAndSelect('product.category', 'category')
      .leftJoinAndSelect('adjustment.adjustedByUser', 'adjustedBy')
      .leftJoinAndSelect('adjustment.approvedByUser', 'approvedBy');

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

    if (adjustedByUserId) {
      queryBuilder.andWhere('adjustment.adjustedByUserId = :adjustedByUserId', {
        adjustedByUserId,
      });
    }

    if (approvedByUserId) {
      queryBuilder.andWhere('adjustment.approvedByUserId = :approvedByUserId', {
        approvedByUserId,
      });
    }

    if (locationCode) {
      queryBuilder.andWhere('adjustment.locationCode = :locationCode', {
        locationCode,
      });
    }

    if (requiresApproval !== undefined) {
      if (requiresApproval) {
        queryBuilder.andWhere(
          '(ABS(adjustment.totalValueImpact) > 100 OR ABS((adjustment.adjustmentQuantity / NULLIF(adjustment.systemQuantity, 0)) * 100) > 10 OR adjustment.type IN (:...significantTypes))',
          { significantTypes: [StockAdjustmentType.THEFT, StockAdjustmentType.WRITE_OFF] },
        );
      } else {
        queryBuilder.andWhere(
          '(ABS(adjustment.totalValueImpact) <= 100 AND ABS((adjustment.adjustmentQuantity / NULLIF(adjustment.systemQuantity, 0)) * 100) <= 10 AND adjustment.type NOT IN (:...significantTypes))',
          { significantTypes: [StockAdjustmentType.THEFT, StockAdjustmentType.WRITE_OFF] },
        );
      }
    }

    if (search) {
      queryBuilder.andWhere(
        '(adjustment.adjustmentNumber ILIKE :search OR product.name ILIKE :search OR product.barcode ILIKE :search OR adjustment.reason ILIKE :search),',
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
      relations: ['product', 'product.category', 'adjustedByUser', 'approvedByUser'],
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
    userId: string = 'system',
  ): Promise<StockAdjustmentResponseDto> {
    this.logger.log(`Updating stock adjustment: ${id}`);

    const adjustment = await this.stockAdjustmentRepository.findOne({
      where: { id },
      relations: ['product', 'adjustedByUser'],
    });

    if (!adjustment) {
      throw new NotFoundException(`Stock adjustment with ID '${id}' not found`);
    }

    // Check if adjustment can be modified
    if (!adjustment.isPending) {
      throw new BadRequestException('Cannot modify adjustment that is not in pending status');
    }

    // Only allow the creator or admin to modify
    if (adjustment.adjustedByUserId !== userId) {
      throw new ForbiddenException('You can only modify your own adjustments');
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
    if (updateAdjustmentDto.systemQuantity || updateAdjustmentDto.physicalQuantity) {
      adjustment.adjustmentQuantity = Number(adjustment.physicalQuantity) - Number(adjustment.systemQuantity);
    }

    // Recalculate value impact if unit cost or quantities changed
    if (updateAdjustmentDto.unitCost || updateAdjustmentDto.systemQuantity || updateAdjustmentDto.physicalQuantity) {
      if (adjustment.unitCost) {
        adjustment.totalValueImpact = Number(adjustment.adjustmentQuantity) * Number(adjustment.unitCost);
      }
    }

    // Update approval status if requirements changed
    if (adjustment.requiresApproval()) {
      adjustment.status = StockAdjustmentStatus.PENDING_APPROVAL;
    } else if (adjustment.status === StockAdjustmentStatus.PENDING_APPROVAL) {
      adjustment.status = StockAdjustmentStatus.APPROVED;
    }

    const updatedAdjustment = await this.stockAdjustmentRepository.save(adjustment);

    // If auto-approved after update, process immediately
    if (updatedAdjustment.status === StockAdjustmentStatus.APPROVED && updatedAdjustment.adjustmentQuantity !== 0) {
      await this.processAdjustment(updatedAdjustment.id, userId);
    }

    // Audit logging removed with authentication system

    this.logger.log(`Stock adjustment updated successfully: ${updatedAdjustment.id}`);
    return this.toResponseDto(updatedAdjustment);
  }

  /**
   * Approve a stock adjustment
   */
  async approve(
    id: string,
    actionDto: StockAdjustmentActionDto,
    userId: string = 'system',
  ): Promise<StockAdjustmentResponseDto> {
    this.logger.log(`Approving stock adjustment: ${id}`);

    const adjustment = await this.stockAdjustmentRepository.findOne({
      where: { id },
      relations: ['product', 'adjustedByUser'],
    });

    if (!adjustment) {
      throw new NotFoundException(`Stock adjustment with ID '${id}' not found`);
    }

    if (!adjustment.canApprove) {
      throw new BadRequestException('Stock adjustment cannot be approved');
    }

    // Validate business rules unless forced
    if (!actionDto.forceApproval) {
      const validationErrors = adjustment.validateAdjustment();
      if (validationErrors.length > 0) {
        throw new BadRequestException(`Validation failed: ${validationErrors.join(', ')}`);
      }
    }

    // Approve the adjustment
    adjustment.approve(userId, actionDto.notes);
    const approvedAdjustment = await this.stockAdjustmentRepository.save(adjustment);

    // Process the adjustment (create stock movement and update product)
    await this.processAdjustment(approvedAdjustment.id, userId);

    // Audit logging removed with authentication system

    this.logger.log(`Stock adjustment approved successfully: ${approvedAdjustment.id}`);
    return this.toResponseDto(approvedAdjustment);
  }

  /**
   * Reject a stock adjustment
   */
  async reject(
    id: string,
    actionDto: StockAdjustmentActionDto,
    userId: string = 'system',
  ): Promise<StockAdjustmentResponseDto> {
    this.logger.log(`Rejecting stock adjustment: ${id}`);

    const adjustment = await this.stockAdjustmentRepository.findOne({
      where: { id },
      relations: ['product', 'adjustedByUser'],
    });

    if (!adjustment) {
      throw new NotFoundException(`Stock adjustment with ID '${id}' not found`);
    }

    if (!adjustment.canReject) {
      throw new BadRequestException('Stock adjustment cannot be rejected');
    }

    if (!actionDto.notes) {
      throw new BadRequestException('Rejection reason is required');
    }

    // Reject the adjustment
    adjustment.reject(userId, actionDto.notes);
    const rejectedAdjustment = await this.stockAdjustmentRepository.save(adjustment);

    // Audit logging removed with authentication system

    this.logger.log(`Stock adjustment rejected successfully: ${rejectedAdjustment.id}`);
    return this.toResponseDto(rejectedAdjustment);
  }

  /**
   * Cancel a stock adjustment (only if pending)
   */
  async cancel(
    id: string,
    reason: string,
    userId: string = 'system',
  ): Promise<StockAdjustmentResponseDto> {
    this.logger.log(`Cancelling stock adjustment: ${id}`);

    const adjustment = await this.stockAdjustmentRepository.findOne({
      where: { id },
      relations: ['product', 'adjustedByUser'],
    });

    if (!adjustment) {
      throw new NotFoundException(`Stock adjustment with ID '${id}' not found`);
    }

    if (!adjustment.isPending) {
      throw new BadRequestException('Only pending adjustments can be cancelled');
    }

    // Only allow the creator to cancel
    if (adjustment.adjustedByUserId !== userId) {
      throw new ForbiddenException('You can only cancel your own adjustments');
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
    userId: string = 'system',
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
        const adjustment = await this.create(completeAdjustmentDto, userId);
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
   * Get pending approvals count
   */
  async getPendingApprovalsCount(): Promise<number> {
    return this.stockAdjustmentRepository.count({
      where: { status: StockAdjustmentStatus.PENDING_APPROVAL },
    });
  }

  /**
   * Get adjustments requiring approval
   */
  async getAdjustmentsRequiringApproval() {
    const adjustments = await this.stockAdjustmentRepository.find({
      where: { status: StockAdjustmentStatus.PENDING_APPROVAL },
      relations: ['product', 'product.category', 'adjustedByUser'],
      order: { adjustmentDate: 'ASC' },
    });

    return adjustments.map(adjustment => this.toResponseDto(adjustment));
  }

  /**
   * Process an approved adjustment (create stock movement and update product)
   */
  private async processAdjustment(adjustmentId: string, userId: string): Promise<void> {
    const adjustment = await this.stockAdjustmentRepository.findOne({
      where: { id: adjustmentId },
      relations: ['product'],
    });

    if (!adjustment || adjustment.status !== StockAdjustmentStatus.APPROVED) {
      return;
    }

    // Create stock movement
    if (adjustment.adjustmentQuantity !== 0) {
      const movementData = StockMovement.createAdjustmentMovement(
        adjustment.productId,
        Number(adjustment.adjustmentQuantity),
        adjustment.reason,
        adjustment.id,
        userId,
      );

      await this.stockMovementService.create(movementData as any, userId);
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
      approvedDate: adjustment.approvedDate,
      systemQuantity: Number(adjustment.systemQuantity),
      physicalQuantity: Number(adjustment.physicalQuantity),
      adjustmentQuantity: Number(adjustment.adjustmentQuantity),
      unitCost: adjustment.unitCost ? Number(adjustment.unitCost) : undefined,
      totalValueImpact: adjustment.totalValueImpact ? Number(adjustment.totalValueImpact) : undefined,
      locationCode: adjustment.locationCode,
      binLocation: adjustment.binLocation,
      batchNumber: adjustment.batchNumber,
      expiryDate: adjustment.expiryDate,
      reason: adjustment.reason,
      notes: adjustment.notes,
      approvalNotes: adjustment.approvalNotes,
      countedBy: adjustment.countedBy,
      countedAt: adjustment.countedAt,
      countDetails: adjustment.countDetails,
      attachments: adjustment.attachments,
      product: {
        id: adjustment.product.id,
        sku: adjustment.product.barcode,
        name: adjustment.product.name,
        unit: adjustment.product.unit,
      },
      adjustedByUser: {
        id: adjustment.adjustedByUser.id,
        email: adjustment.adjustedByUser.email,
        firstName: adjustment.adjustedByUser.firstName,
        lastName: adjustment.adjustedByUser.lastName,
      },
      approvedByUser: adjustment.approvedByUser ? {
        id: adjustment.approvedByUser.id,
        email: adjustment.approvedByUser.email,
        firstName: adjustment.approvedByUser.firstName,
        lastName: adjustment.approvedByUser.lastName,
      } : undefined,
      isIncrease: adjustment.isIncrease,
      isDecrease: adjustment.isDecrease,
      adjustmentPercent: adjustment.adjustmentPercent,
      isPending: adjustment.isPending,
      isCompleted: adjustment.isCompleted,
      canApprove: adjustment.canApprove,
      canReject: adjustment.canReject,
      requiresApproval: adjustment.requiresApproval(),
      isSignificant: Math.abs(adjustment.adjustmentPercent) > 5 || Math.abs(Number(adjustment.totalValueImpact || 0)) > 50,
      createdAt: adjustment.createdAt,
      updatedAt: adjustment.updatedAt,
    };
  }
}