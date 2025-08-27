import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { 
  PurchaseRequisition, 
  PurchaseRequisitionItem,
  PurchaseRequisitionStatus, 
  PurchaseRequisitionPriority,
  PurchaseRequisitionType,
  User,
  Product,
  PurchaseOrder
} from '../../../database/entities';
import {
  CreatePurchaseRequisitionDto,
  UpdatePurchaseRequisitionDto,
  PurchaseRequisitionQueryDto,
  PurchaseRequisitionResponseDto,
  PurchaseRequisitionListResponseDto,
  ApprovePurchaseRequisitionDto,
  RejectPurchaseRequisitionDto,
  CancelPurchaseRequisitionDto,
  ConvertToPurchaseOrderDto,
  PurchaseRequisitionSummaryDto,
} from '../dto';
import { PurchaseOrderService } from './purchase-order.service';

@Injectable()
export class PurchaseRequisitionService {
  private readonly logger = new Logger(PurchaseRequisitionService.name);

  constructor(
    @InjectRepository(PurchaseRequisition)
    private readonly requisitionRepository: Repository<PurchaseRequisition>,
    @InjectRepository(PurchaseRequisitionItem)
    private readonly requisitionItemRepository: Repository<PurchaseRequisitionItem>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,
    @InjectRepository(PurchaseOrder)
    private readonly purchaseOrderRepository: Repository<PurchaseOrder>,
  ) {}

  /**
   * Create a new purchase requisition
   */
  async create(
    createRequisitionDto: CreatePurchaseRequisitionDto, 
    userId: string
  ): Promise<PurchaseRequisitionResponseDto> {
    this.logger.log(`Creating purchase requisition for user: ${userId}`);

    // Validate user exists
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    try {
      // Create purchase requisition
      const requisition = this.requisitionRepository.create({
        ...createRequisitionDto,
        requestDate: new Date(createRequisitionDto.requestDate),
        requiredDate: new Date(createRequisitionDto.requiredDate),
        requestedByUserId: userId,
        status: PurchaseRequisitionStatus.DRAFT,
        priority: createRequisitionDto.priority || PurchaseRequisitionPriority.NORMAL,
        approvedBudget: createRequisitionDto.approvedBudget || 0,
        requiredApprovalLevels: createRequisitionDto.requiredApprovalLevels || 1,
        approvalLevel: 1,
      });

      // Generate requisition number
      requisition.generateRequisitionNumber();

      // Create requisition items
      const requisitionItems: PurchaseRequisitionItem[] = [];
      let estimatedTotal = 0;

      for (const itemDto of createRequisitionDto.items) {
        let product: Product | undefined;
        
        // Validate product if specified
        if (itemDto.productId) {
          product = await this.productRepository.findOne({
            where: { id: itemDto.productId },
          });
          
          if (!product) {
            throw new BadRequestException(`Product with ID ${itemDto.productId} not found`);
          }
        }

        const item = this.requisitionItemRepository.create({
          productId: itemDto.productId,
          description: itemDto.description,
          quantity: itemDto.quantity,
          unit: itemDto.unit || product?.unit,
          estimatedUnitPrice: itemDto.estimatedUnitPrice,
          suggestedSupplier: itemDto.suggestedSupplier,
          preferredBrand: itemDto.preferredBrand,
          specifications: itemDto.specifications,
          notes: itemDto.notes,
          category: itemDto.category,
          priority: itemDto.priority || 1,
          status: 'pending',
        });

        // Calculate estimated total
        item.calculateEstimatedTotal();
        requisitionItems.push(item);
        estimatedTotal += Number(item.estimatedTotal);
      }

      // Set estimated total
      requisition.estimatedTotal = estimatedTotal;

      // Save requisition
      const savedRequisition = await this.requisitionRepository.save(requisition);

      // Save requisition items
      for (const item of requisitionItems) {
        item.purchaseRequisitionId = savedRequisition.id;
      }
      
      await this.requisitionItemRepository.save(requisitionItems);
      savedRequisition.items = requisitionItems;

      this.logger.log(`Purchase requisition created successfully: ${savedRequisition.requisitionNumber}`);
      return await this.findOne(savedRequisition.id);
    } catch (error) {
      this.logger.error(`Error creating purchase requisition: ${error.message}`, error.stack);
      
      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      
      throw new BadRequestException('Failed to create purchase requisition');
    }
  }

  /**
   * Get all purchase requisitions with filtering and pagination
   */
  async findAll(query: PurchaseRequisitionQueryDto): Promise<PurchaseRequisitionListResponseDto> {
    this.logger.log(`Finding purchase requisitions with query: ${JSON.stringify(query)}`);

    const {
      page = 1,
      limit = 10,
      search,
      status,
      type,
      priority,
      requestedByUserId,
      department,
      requestDateFrom,
      requestDateTo,
      requiredDateFrom,
      requiredDateTo,
      isOverdue,
      isPendingApproval,
      sortBy = 'requestDate',
      sortOrder = 'DESC',
    } = query;

    const skip = (page - 1) * limit;
    const queryBuilder = this.requisitionRepository
      .createQueryBuilder('pr')
      .leftJoinAndSelect('pr.requestedByUser', 'requestedByUser')
      .leftJoinAndSelect('pr.approvedByUser', 'approvedByUser')
      .leftJoinAndSelect('pr.purchaseOrder', 'purchaseOrder')
      .leftJoinAndSelect('pr.items', 'items')
      .leftJoinAndSelect('items.product', 'product');

    // Apply search filter
    if (search) {
      queryBuilder.andWhere(
        '(pr.requisitionNumber ILIKE :search OR pr.department ILIKE :search OR pr.justification ILIKE :search)',
        { search: `%${search}%` }
      );
    }

    // Apply filters
    if (status) {
      queryBuilder.andWhere('pr.status = :status', { status });
    }

    if (type) {
      queryBuilder.andWhere('pr.type = :type', { type });
    }

    if (priority) {
      queryBuilder.andWhere('pr.priority = :priority', { priority });
    }

    if (requestedByUserId) {
      queryBuilder.andWhere('pr.requestedByUserId = :requestedByUserId', { requestedByUserId });
    }

    if (department) {
      queryBuilder.andWhere('pr.department ILIKE :department', { department: `%${department}%` });
    }

    if (requestDateFrom) {
      queryBuilder.andWhere('pr.requestDate >= :requestDateFrom', { 
        requestDateFrom: new Date(requestDateFrom) 
      });
    }

    if (requestDateTo) {
      queryBuilder.andWhere('pr.requestDate <= :requestDateTo', { 
        requestDateTo: new Date(requestDateTo) 
      });
    }

    if (requiredDateFrom) {
      queryBuilder.andWhere('pr.requiredDate >= :requiredDateFrom', { 
        requiredDateFrom: new Date(requiredDateFrom) 
      });
    }

    if (requiredDateTo) {
      queryBuilder.andWhere('pr.requiredDate <= :requiredDateTo', { 
        requiredDateTo: new Date(requiredDateTo) 
      });
    }

    if (isOverdue) {
      queryBuilder.andWhere('pr.requiredDate < :now', { now: new Date() });
      queryBuilder.andWhere('pr.status NOT IN (:...completedStatuses)', {
        completedStatuses: ['converted_to_po', 'cancelled']
      });
    }

    if (isPendingApproval) {
      queryBuilder.andWhere('pr.status = :pendingStatus', { 
        pendingStatus: PurchaseRequisitionStatus.PENDING_APPROVAL 
      });
    }

    // Apply sorting
    const validSortFields = [
      'requisitionNumber', 'requestDate', 'requiredDate', 'status', 'priority',
      'estimatedTotal', 'department', 'createdAt'
    ];

    if (validSortFields.includes(sortBy)) {
      queryBuilder.orderBy(`pr.${sortBy}`, sortOrder);
    } else {
      queryBuilder.orderBy('pr.requestDate', 'DESC');
    }

    // Add secondary sort by requisitionNumber if not primary sort
    if (sortBy !== 'requisitionNumber') {
      queryBuilder.addOrderBy('pr.requisitionNumber', 'DESC');
    }

    // Get total count
    const total = await queryBuilder.getCount();

    // Apply pagination
    queryBuilder.skip(skip).take(limit);

    const requisitions = await queryBuilder.getMany();
    const requisitionDtos = requisitions.map(req => this.mapToResponseDto(req));

    return {
      requisitions: requisitionDtos,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      hasNext: page < Math.ceil(total / limit),
      hasPrev: page > 1,
    };
  }

  /**
   * Get purchase requisition by ID
   */
  async findOne(id: string): Promise<PurchaseRequisitionResponseDto> {
    this.logger.log(`Finding purchase requisition by ID: ${id}`);

    const requisition = await this.requisitionRepository
      .createQueryBuilder('pr')
      .leftJoinAndSelect('pr.requestedByUser', 'requestedByUser')
      .leftJoinAndSelect('pr.approvedByUser', 'approvedByUser')
      .leftJoinAndSelect('pr.purchaseOrder', 'purchaseOrder')
      .leftJoinAndSelect('pr.items', 'items')
      .leftJoinAndSelect('items.product', 'product')
      .where('pr.id = :id', { id })
      .getOne();

    if (!requisition) {
      throw new NotFoundException(`Purchase requisition with ID ${id} not found`);
    }

    return this.mapToResponseDto(requisition);
  }

  /**
   * Submit purchase requisition for approval
   */
  async submit(id: string): Promise<PurchaseRequisitionResponseDto> {
    this.logger.log(`Submitting purchase requisition: ${id}`);

    const requisition = await this.requisitionRepository.findOne({
      where: { id },
      relations: ['items'],
    });

    if (!requisition) {
      throw new NotFoundException(`Purchase requisition with ID ${id} not found`);
    }

    if (requisition.status !== PurchaseRequisitionStatus.DRAFT) {
      throw new BadRequestException('Only draft requisitions can be submitted');
    }

    try {
      // Recalculate estimated total
      requisition.calculateEstimatedTotal();
      
      // Submit for approval
      requisition.submit();
      
      const updatedRequisition = await this.requisitionRepository.save(requisition);

      this.logger.log(`Purchase requisition submitted successfully: ${updatedRequisition.requisitionNumber}`);
      return await this.findOne(updatedRequisition.id);
    } catch (error) {
      this.logger.error(`Error submitting purchase requisition: ${error.message}`, error.stack);
      throw new BadRequestException('Failed to submit purchase requisition');
    }
  }

  /**
   * Approve purchase requisition
   */
  async approve(
    id: string, 
    approveDto: ApprovePurchaseRequisitionDto, 
    userId: string
  ): Promise<PurchaseRequisitionResponseDto> {
    this.logger.log(`Approving purchase requisition: ${id}`);

    const requisition = await this.requisitionRepository.findOne({
      where: { id },
    });

    if (!requisition) {
      throw new NotFoundException(`Purchase requisition with ID ${id} not found`);
    }

    if (!requisition.canApprove) {
      throw new BadRequestException('Purchase requisition cannot be approved in current status');
    }

    try {
      const level = approveDto.level || 1;
      requisition.approve(userId, approveDto.comments, level);
      
      const updatedRequisition = await this.requisitionRepository.save(requisition);

      this.logger.log(`Purchase requisition approved successfully: ${updatedRequisition.requisitionNumber}`);
      return await this.findOne(updatedRequisition.id);
    } catch (error) {
      this.logger.error(`Error approving purchase requisition: ${error.message}`, error.stack);
      throw new BadRequestException('Failed to approve purchase requisition');
    }
  }

  /**
   * Reject purchase requisition
   */
  async reject(
    id: string, 
    rejectDto: RejectPurchaseRequisitionDto, 
    userId: string
  ): Promise<PurchaseRequisitionResponseDto> {
    this.logger.log(`Rejecting purchase requisition: ${id}`);

    const requisition = await this.requisitionRepository.findOne({
      where: { id },
    });

    if (!requisition) {
      throw new NotFoundException(`Purchase requisition with ID ${id} not found`);
    }

    if (!requisition.canApprove) {
      throw new BadRequestException('Purchase requisition cannot be rejected in current status');
    }

    try {
      const level = rejectDto.level || 1;
      requisition.reject(userId, rejectDto.reason, level);
      
      const updatedRequisition = await this.requisitionRepository.save(requisition);

      this.logger.log(`Purchase requisition rejected successfully: ${updatedRequisition.requisitionNumber}`);
      return await this.findOne(updatedRequisition.id);
    } catch (error) {
      this.logger.error(`Error rejecting purchase requisition: ${error.message}`, error.stack);
      throw new BadRequestException('Failed to reject purchase requisition');
    }
  }

  /**
   * Cancel purchase requisition
   */
  async cancel(
    id: string, 
    cancelDto: CancelPurchaseRequisitionDto
  ): Promise<PurchaseRequisitionResponseDto> {
    this.logger.log(`Cancelling purchase requisition: ${id}`);

    const requisition = await this.requisitionRepository.findOne({
      where: { id },
    });

    if (!requisition) {
      throw new NotFoundException(`Purchase requisition with ID ${id} not found`);
    }

    if (requisition.status === PurchaseRequisitionStatus.CONVERTED_TO_PO) {
      throw new BadRequestException('Cannot cancel requisition that has been converted to purchase order');
    }

    try {
      requisition.cancel(cancelDto.reason);
      const updatedRequisition = await this.requisitionRepository.save(requisition);

      this.logger.log(`Purchase requisition cancelled successfully: ${updatedRequisition.requisitionNumber}`);
      return await this.findOne(updatedRequisition.id);
    } catch (error) {
      this.logger.error(`Error cancelling purchase requisition: ${error.message}`, error.stack);
      throw new BadRequestException('Failed to cancel purchase requisition');
    }
  }

  /**
   * Convert purchase requisition to purchase order
   */
  async convertToPurchaseOrder(
    id: string,
    convertDto: ConvertToPurchaseOrderDto,
    userId: string
  ): Promise<{
    requisition: PurchaseRequisitionResponseDto;
    purchaseOrderId: string;
  }> {
    this.logger.log(`Converting purchase requisition to PO: ${id}`);

    const requisition = await this.requisitionRepository.findOne({
      where: { id },
      relations: ['items', 'items.product'],
    });

    if (!requisition) {
      throw new NotFoundException(`Purchase requisition with ID ${id} not found`);
    }

    if (!requisition.canConvertToPO) {
      throw new BadRequestException('Purchase requisition cannot be converted to purchase order');
    }

    try {
      // Filter items if specific items are selected
      let itemsToConvert = requisition.items;
      if (convertDto.selectedItemIds && convertDto.selectedItemIds.length > 0) {
        itemsToConvert = requisition.items.filter(item => 
          convertDto.selectedItemIds!.includes(item.id)
        );
      }

      if (itemsToConvert.length === 0) {
        throw new BadRequestException('No items selected for conversion');
      }

      // Create purchase order data
      const purchaseOrderData = {
        supplierId: convertDto.supplierId,
        priority: requisition.priority as any, // Map to PO priority
        orderDate: new Date().toISOString(),
        requiredDate: requisition.requiredDate.toISOString(),
        deliveryAddress: convertDto.deliveryAddress,
        notes: convertDto.notes || `Converted from requisition: ${requisition.requisitionNumber}`,
        internalNotes: `Original justification: ${requisition.justification}`,
        items: itemsToConvert.map(item => ({
          productId: item.productId,
          description: item.description,
          quantity: item.quantity,
          unitPrice: item.estimatedUnitPrice,
          unit: item.unit,
          notes: item.notes,
        })),
      };

      // This would require injecting PurchaseOrderService
      // For now, we'll just create a basic PO record
      const purchaseOrder = this.purchaseOrderRepository.create({
        supplierId: convertDto.supplierId,
        createdByUserId: userId,
        orderDate: new Date(),
        requiredDate: requisition.requiredDate,
        status: 'draft' as any,
        priority: 'normal' as any,
        subtotal: requisition.estimatedTotal,
        totalAmount: requisition.estimatedTotal,
        paymentTermsDays: 30,
        notes: convertDto.notes || `Converted from requisition: ${requisition.requisitionNumber}`,
      });

      // Generate order number
      purchaseOrder.generateOrderNumber();
      const savedPO = await this.purchaseOrderRepository.save(purchaseOrder);

      // Update requisition status
      requisition.convertToPO(savedPO.id);
      
      // Mark converted items
      for (const item of itemsToConvert) {
        item.convertToPOItem();
      }

      await this.requisitionItemRepository.save(itemsToConvert);
      const updatedRequisition = await this.requisitionRepository.save(requisition);

      this.logger.log(`Purchase requisition converted to PO successfully: ${updatedRequisition.requisitionNumber} -> ${savedPO.orderNumber}`);
      
      return {
        requisition: await this.findOne(updatedRequisition.id),
        purchaseOrderId: savedPO.id,
      };
    } catch (error) {
      this.logger.error(`Error converting purchase requisition to PO: ${error.message}`, error.stack);
      
      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      
      throw new BadRequestException('Failed to convert purchase requisition to purchase order');
    }
  }

  /**
   * Get purchase requisition summary
   */
  async getSummary(): Promise<PurchaseRequisitionSummaryDto> {
    this.logger.log('Getting purchase requisition summary');

    try {
      const [
        totalRequisitions,
        pendingApprovalCount,
        approvedCount,
        rejectedCount,
        convertedToPOCount,
        overdueCount,
        totalEstimatedAmount,
        byDepartment,
        byType,
        byPriority,
        averageProcessingTime,
      ] = await Promise.all([
        // Total requisitions count
        this.requisitionRepository.count(),
        
        // Pending approval count
        this.requisitionRepository.count({
          where: { status: PurchaseRequisitionStatus.PENDING_APPROVAL }
        }),

        // Approved count
        this.requisitionRepository.count({
          where: { status: PurchaseRequisitionStatus.APPROVED }
        }),

        // Rejected count
        this.requisitionRepository.count({
          where: { status: PurchaseRequisitionStatus.REJECTED }
        }),

        // Converted to PO count
        this.requisitionRepository.count({
          where: { status: PurchaseRequisitionStatus.CONVERTED_TO_PO }
        }),

        // Overdue count
        this.requisitionRepository
          .createQueryBuilder('pr')
          .where('pr.requiredDate < :now', { now: new Date() })
          .andWhere('pr.status NOT IN (:...statuses)', {
            statuses: ['converted_to_po', 'cancelled']
          })
          .getCount(),

        // Total estimated amount
        this.requisitionRepository
          .createQueryBuilder('pr')
          .select('SUM(pr.estimatedTotal)', 'total')
          .getRawOne()
          .then(result => parseFloat(result.total) || 0),

        // By department
        this.requisitionRepository
          .createQueryBuilder('pr')
          .select('pr.department', 'department')
          .addSelect('COUNT(*)', 'count')
          .groupBy('pr.department')
          .getRawMany()
          .then(results => 
            results.reduce((acc, row) => {
              acc[row.department] = parseInt(row.count);
              return acc;
            }, {} as Record<string, number>)
          ),

        // By type
        this.requisitionRepository
          .createQueryBuilder('pr')
          .select('pr.type', 'type')
          .addSelect('COUNT(*)', 'count')
          .groupBy('pr.type')
          .getRawMany()
          .then(results => 
            results.reduce((acc, row) => {
              acc[row.type] = parseInt(row.count);
              return acc;
            }, {} as Record<string, number>)
          ),

        // By priority
        this.requisitionRepository
          .createQueryBuilder('pr')
          .select('pr.priority', 'priority')
          .addSelect('COUNT(*)', 'count')
          .groupBy('pr.priority')
          .getRawMany()
          .then(results => 
            results.reduce((acc, row) => {
              acc[row.priority] = parseInt(row.count);
              return acc;
            }, {} as Record<string, number>)
          ),

        // Average processing time (from submitted to approved/rejected)
        this.requisitionRepository
          .createQueryBuilder('pr')
          .select('AVG(EXTRACT(EPOCH FROM (pr.approvalDate - pr.submittedDate)) / 86400)', 'avgDays')
          .where('pr.submittedDate IS NOT NULL')
          .andWhere('pr.approvalDate IS NOT NULL')
          .getRawOne()
          .then(result => parseFloat(result.avgDays) || 0),
      ]);

      return {
        totalRequisitions,
        pendingApprovalCount,
        approvedCount,
        rejectedCount,
        convertedToPOCount,
        overdueCount,
        totalEstimatedAmount,
        averageProcessingTime,
        byDepartment,
        byType,
        byPriority,
      };
    } catch (error) {
      this.logger.error(`Error getting purchase requisition summary: ${error.message}`, error.stack);
      throw new BadRequestException('Failed to get purchase requisition summary');
    }
  }

  /**
   * Map purchase requisition entity to response DTO
   */
  private mapToResponseDto(requisition: PurchaseRequisition): PurchaseRequisitionResponseDto {
    return {
      id: requisition.id,
      requisitionNumber: requisition.requisitionNumber,
      status: requisition.status,
      priority: requisition.priority,
      type: requisition.type,
      requestDate: requisition.requestDate,
      requiredDate: requisition.requiredDate,
      department: requisition.department,
      projectCode: requisition.projectCode,
      justification: requisition.justification,
      estimatedTotal: Number(requisition.estimatedTotal),
      approvedBudget: Number(requisition.approvedBudget),
      budgetCode: requisition.budgetCode,
      requestedByUser: {
        id: requisition.requestedByUser.id,
        username: requisition.requestedByUser.username,
        firstName: requisition.requestedByUser.firstName,
        lastName: requisition.requestedByUser.lastName,
      },
      approvedByUser: requisition.approvedByUser ? {
        id: requisition.approvedByUser.id,
        username: requisition.approvedByUser.username,
        firstName: requisition.approvedByUser.firstName,
        lastName: requisition.approvedByUser.lastName,
      } : undefined,
      purchaseOrder: requisition.purchaseOrder ? {
        id: requisition.purchaseOrder.id,
        orderNumber: requisition.purchaseOrder.orderNumber,
        status: requisition.purchaseOrder.status,
      } : undefined,
      submittedDate: requisition.submittedDate,
      approvalDate: requisition.approvalDate,
      approvalComments: requisition.approvalComments,
      approvalLevel: requisition.approvalLevel,
      requiredApprovalLevels: requisition.requiredApprovalLevels,
      approvalHistory: requisition.approvalHistory,
      suggestedSupplierId: requisition.suggestedSupplierId,
      suggestedSupplierName: requisition.suggestedSupplierName,
      notes: requisition.notes,
      deliveryInstructions: requisition.deliveryInstructions,
      isApprovalRequired: requisition.isApprovalRequired,
      isPendingApproval: requisition.isPendingApproval,
      isApproved: requisition.isApproved,
      canApprove: requisition.canApprove,
      canConvertToPO: requisition.canConvertToPO,
      isOverdue: requisition.isOverdue,
      daysUntilRequired: requisition.daysUntilRequired,
      totalItemCount: requisition.getTotalItemCount(),
      totalQuantity: requisition.getTotalQuantity(),
      isFullyApproved: requisition.isFullyApproved(),
      approvalStatus: requisition.getApprovalStatus(),
      items: requisition.items?.map(item => ({
        id: item.id,
        product: item.product ? {
          id: item.product.id,
          sku: item.product.sku,
          name: item.product.name,
          unit: item.product.unit,
        } : undefined,
        description: item.description,
        quantity: Number(item.quantity),
        unit: item.unit,
        estimatedUnitPrice: Number(item.estimatedUnitPrice),
        estimatedTotal: Number(item.estimatedTotal),
        status: item.status,
        suggestedSupplier: item.suggestedSupplier,
        preferredBrand: item.preferredBrand,
        specifications: item.specifications,
        notes: item.notes,
        category: item.category,
        priority: item.priority,
        isFromCatalog: item.isFromCatalog,
        formattedDescription: item.formattedDescription,
        unitOfMeasurement: item.unitOfMeasurement,
      })) || [],
      createdAt: requisition.createdAt,
      updatedAt: requisition.updatedAt,
    };
  }
}