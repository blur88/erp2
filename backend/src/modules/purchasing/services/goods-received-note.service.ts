import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like } from 'typeorm';
import {
  GoodsReceivedNote,
  PurchaseOrder,
  Supplier,
  User,
} from '../../../database/entities';
import { GrnType } from '../../../database/entities/goods-received-note.entity';
import {
  CreateGoodsReceivedNoteDto,
  UpdateGoodsReceivedNoteDto,
  GoodsReceivedNoteQueryDto,
  GoodsReceivedNoteResponseDto,
  GoodsReceivedNoteListResponseDto,
} from '../dto/goods-received-note.dto';

@Injectable()
export class GoodsReceivedNoteService {
  private readonly logger = new Logger(GoodsReceivedNoteService.name);

  constructor(
    @InjectRepository(GoodsReceivedNote)
    private readonly grnRepository: Repository<GoodsReceivedNote>,
    @InjectRepository(PurchaseOrder)
    private readonly purchaseOrderRepository: Repository<PurchaseOrder>,
    @InjectRepository(Supplier)
    private readonly supplierRepository: Repository<Supplier>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  /**
   * Create a new goods received note
   */
  async create(createDto: CreateGoodsReceivedNoteDto, receivedByUserId: string = 'system'): Promise<GoodsReceivedNoteResponseDto> {
    this.logger.log(`Creating GRN for PO: ${createDto.purchaseOrderId}`);

    // Validate purchase order exists
    const purchaseOrder = await this.purchaseOrderRepository.findOne({
      where: { id: createDto.purchaseOrderId },
      relations: ['supplier', 'items', 'items.product'],
    });

    if (!purchaseOrder) {
      throw new NotFoundException(`Purchase Order with ID ${createDto.purchaseOrderId} not found`);
    }

    // Check if a GRN already exists for this purchase order
    const existingGrn = await this.grnRepository.findOne({
      where: { purchaseOrderId: createDto.purchaseOrderId },
    });

    if (existingGrn) {
      throw new BadRequestException(`A Goods Received Note already exists for this purchase order (GRN: ${existingGrn.grnNumber})`);
    }

    // Get user (skip lookup if 'system' since auth was removed)
    const receivedByUser = receivedByUserId && receivedByUserId !== 'system'
      ? await this.userRepository.findOne({ where: { id: receivedByUserId } })
      : null;

    try {
      // Create GRN with items - either from DTO or auto-generated from PO items
      let itemsReceived: any[];

      if (createDto.items && createDto.items.length > 0) {
        // Use items from DTO if provided
        itemsReceived = createDto.items.map((item: any) => ({
          productId: item.productId,
          productSku: item.productSku || '',
          productName: item.productName || '',
          orderedQuantity: Number(item.orderedQuantity || 0),
          receivedQuantity: Number(item.receivedQuantity || 0),
          acceptedQuantity: Number(item.acceptedQuantity || 0),
          rejectedQuantity: Number(item.rejectedQuantity || 0),
          unitCost: Number(item.unitCost || 0),
          notes: item.notes || '',
          condition: item.condition || 'good',
        }));
      } else {
        // Auto-generate items from PO items
        itemsReceived = (purchaseOrder.items || []).map((item: any) => ({
          productId: item.product.id,
          productSku: item.product.barcode || item.product.id,
          productName: item.product.name,
          orderedQuantity: Number(item.quantity),
          receivedQuantity: Number(item.quantity), // Default to ordered quantity
          acceptedQuantity: Number(item.quantity),
          rejectedQuantity: 0,
          unitCost: Number(item.unitPrice),
          notes: '',
          condition: 'good' as const,
        }));
      }

      const grn = this.grnRepository.create({
        purchaseOrderId: purchaseOrder.id,
        supplierId: purchaseOrder.supplier.id,
        receivedByUserId: receivedByUser?.id || null, // Nullable since auth was removed
        receivedDate: new Date(createDto.receiptDate),
        deliveryReference: createDto.deliveryNoteRef,
        vehicleDetails: createDto.vehicleDetails,
        driverName: createDto.deliveryPerson,
        notes: createDto.notes,
        internalNotes: createDto.internalNotes,
        itemsReceived,
        qualityInspected: createDto.inspectionRequired || false,
        metadata: createDto.metadata,
        type: createDto.type || GrnType.STANDARD, // Add type support
      });

      const savedGrn = await this.grnRepository.save(grn);
      this.logger.log(`GRN created successfully: ${savedGrn.id}`);

      return this.findOne(savedGrn.id);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorStack = error instanceof Error ? error.stack : undefined;
      this.logger.error(`Error creating GRN: ${errorMessage}`, errorStack);
      throw new BadRequestException('Failed to create goods received note');
    }
  }

  /**
   * Get all GRNs with filtering and pagination
   */
  async findAll(query: GoodsReceivedNoteQueryDto): Promise<GoodsReceivedNoteListResponseDto> {
    this.logger.log(`Finding GRNs with query: ${JSON.stringify(query)}`);

    const {
      page = 1,
      limit = 10,
      search,
      status,
      type,
      supplierId,
      purchaseOrderId,
      sortBy = 'receivedDate',
      sortOrder = 'DESC',
    } = query;

    const skip = (page - 1) * limit;
    const queryBuilder = this.grnRepository
      .createQueryBuilder('grn')
      .leftJoinAndSelect('grn.supplier', 'supplier')
      .leftJoinAndSelect('grn.purchaseOrder', 'purchaseOrder')
      .leftJoinAndSelect('grn.receivedByUser', 'receivedByUser')
      .leftJoinAndSelect('grn.inspectedByUser', 'inspectedByUser')
      .where('grn.deletedAt IS NULL');

    // Apply search filter
    if (search) {
      queryBuilder.andWhere(
        '(grn.grnNumber ILIKE :search OR supplier.companyName ILIKE :search OR purchaseOrder.orderNumber ILIKE :search)',
        { search: `%${search}%` }
      );
    }

    // Apply filters
    if (status) {
      queryBuilder.andWhere('grn.status = :status', { status });
    }

    if (type) {
      queryBuilder.andWhere('grn.type = :type', { type });
    }

    if (supplierId) {
      queryBuilder.andWhere('grn.supplierId = :supplierId', { supplierId });
    }

    if (purchaseOrderId) {
      queryBuilder.andWhere('grn.purchaseOrderId = :purchaseOrderId', { purchaseOrderId });
    }

    // Apply sorting
    const validSortFields = ['grnNumber', 'receivedDate', 'status', 'totalValue'];
    if (validSortFields.includes(sortBy)) {
      queryBuilder.orderBy(`grn.${sortBy}`, sortOrder);
    } else {
      queryBuilder.orderBy('grn.receivedDate', 'DESC');
    }

    // Get total count
    const total = await queryBuilder.getCount();

    // Apply pagination
    queryBuilder.skip(skip).take(limit);

    const grns = await queryBuilder.getMany();

    const grnDtos = grns.map(grn => this.mapToResponseDto(grn));

    return {
      grns: grnDtos,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      hasNext: page < Math.ceil(total / limit),
      hasPrev: page > 1,
    };
  }

  /**
   * Get GRN by ID
   */
  async findOne(id: string): Promise<GoodsReceivedNoteResponseDto> {
    this.logger.log(`Finding GRN by ID: ${id}`);

    const grn = await this.grnRepository.findOne({
      where: { id },
      relations: ['supplier', 'purchaseOrder', 'receivedByUser', 'inspectedByUser'],
    });

    if (!grn) {
      throw new NotFoundException(`Goods Received Note with ID ${id} not found`);
    }

    return this.mapToResponseDto(grn);
  }

  /**
   * Update GRN
   */
  async update(id: string, updateDto: UpdateGoodsReceivedNoteDto): Promise<GoodsReceivedNoteResponseDto> {
    this.logger.log(`Updating GRN: ${id}`);

    const grn = await this.grnRepository.findOne({ where: { id } });

    if (!grn) {
      throw new NotFoundException(`Goods Received Note with ID ${id} not found`);
    }

    try {
      Object.assign(grn, {
        ...(updateDto.receiptDate && { receivedDate: new Date(updateDto.receiptDate) }),
        ...(updateDto.deliveryNoteRef && { deliveryReference: updateDto.deliveryNoteRef }),
        ...(updateDto.vehicleDetails && { vehicleDetails: updateDto.vehicleDetails }),
        ...(updateDto.deliveryPerson && { driverName: updateDto.deliveryPerson }),
        ...(updateDto.notes && { notes: updateDto.notes }),
        ...(updateDto.internalNotes && { internalNotes: updateDto.internalNotes }),
        ...(updateDto.status && { status: updateDto.status }),
        ...(updateDto.inspectionRequired !== undefined && { qualityInspected: updateDto.inspectionRequired }),
      });

      const updatedGrn = await this.grnRepository.save(grn);

      this.logger.log(`GRN updated successfully: ${updatedGrn.id}`);
      return this.findOne(updatedGrn.id);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorStack = error instanceof Error ? error.stack : undefined;
      this.logger.error(`Error updating GRN: ${errorMessage}`, errorStack);
      throw new BadRequestException('Failed to update goods received note');
    }
  }

  /**
   * Soft delete GRN
   */
  async remove(id: string): Promise<void> {
    this.logger.log(`Soft deleting GRN: ${id}`);

    const grn = await this.grnRepository.findOne({ where: { id } });

    if (!grn) {
      throw new NotFoundException(`Goods Received Note with ID ${id} not found`);
    }

    try {
      await this.grnRepository.softDelete(id);
      this.logger.log(`GRN soft deleted successfully: ${id}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorStack = error instanceof Error ? error.stack : undefined;
      this.logger.error(`Error soft deleting GRN: ${errorMessage}`, errorStack);
      throw new BadRequestException('Failed to soft delete goods received note');
    }
  }

  /**
   * Get all soft-deleted GRNs
   */
  async findDeleted(query: GoodsReceivedNoteQueryDto): Promise<GoodsReceivedNoteListResponseDto> {
    this.logger.log('Finding deleted GRNs');

    const {
      page = 1,
      limit = 10,
      search,
      sortBy = 'receivedDate',
      sortOrder = 'DESC',
    } = query;

    const skip = (page - 1) * Math.min(limit, 100);
    const take = Math.min(limit, 100);

    const queryBuilder = this.grnRepository
      .createQueryBuilder('grn')
      .leftJoinAndSelect('grn.supplier', 'supplier')
      .leftJoinAndSelect('grn.purchaseOrder', 'purchaseOrder')
      .leftJoinAndSelect('grn.receivedByUser', 'receivedByUser')
      .withDeleted()
      .where('grn.deletedAt IS NOT NULL');

    // Apply filters
    if (search) {
      queryBuilder.andWhere(
        '(grn.grnNumber ILIKE :search OR supplier.companyName ILIKE :search)',
        { search: `%${search}%` }
      );
    }

    // Count total
    const total = await queryBuilder.getCount();

    // Apply sorting and pagination
    const validSortFields = ['grnNumber', 'receivedDate', 'deletedAt'];
    const sortField = validSortFields.includes(sortBy) ? sortBy : 'receivedDate';
    queryBuilder.orderBy(`grn.${sortField}`, sortOrder as 'ASC' | 'DESC');
    queryBuilder.skip(skip).take(take);

    const grns = await queryBuilder.getMany();

    const totalPages = Math.ceil(total / take);

    return {
      grns: grns.map(grn => this.mapToResponseDto(grn)),
      total,
      page,
      limit: take,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    };
  }

  /**
   * Restore a soft-deleted GRN
   */
  async restore(id: string): Promise<GoodsReceivedNoteResponseDto> {
    this.logger.log(`Restoring GRN: ${id}`);

    const grn = await this.grnRepository.findOne({
      where: { id },
      withDeleted: true,
    });

    if (!grn) {
      throw new NotFoundException(`Goods Received Note with ID ${id} not found`);
    }

    if (!grn.deletedAt) {
      throw new BadRequestException('Goods Received Note is not deleted');
    }

    try {
      await this.grnRepository.restore(id);

      const restoredGrn = await this.grnRepository.findOne({
        where: { id },
        relations: ['supplier', 'purchaseOrder', 'receivedByUser'],
      });

      if (!restoredGrn) {
        throw new NotFoundException(`Goods Received Note with ID ${id} not found after restore`);
      }

      this.logger.log(`GRN restored successfully: ${id}`);
      return this.mapToResponseDto(restoredGrn);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorStack = error instanceof Error ? error.stack : undefined;
      this.logger.error(`Error restoring GRN: ${errorMessage}`, errorStack);
      throw new BadRequestException('Failed to restore goods received note');
    }
  }

  /**
   * Bulk restore GRNs
   */
  async bulkRestore(grnIds: string[]): Promise<{ restoredCount: number; failedIds: string[] }> {
    this.logger.log(`Bulk restoring ${grnIds.length} GRNs`);

    const failedIds: string[] = [];
    let restoredCount = 0;

    for (const id of grnIds) {
      try {
        await this.restore(id);
        restoredCount++;
      } catch (error) {
        this.logger.error(`Failed to restore GRN ${id}:`, error);
        failedIds.push(id);
      }
    }

    this.logger.log(`Bulk restore completed: ${restoredCount} restored, ${failedIds.length} failed`);
    return { restoredCount, failedIds };
  }

  /**
   * Permanently delete a GRN
   */
  async permanentDelete(id: string): Promise<void> {
    this.logger.log(`Permanently deleting GRN: ${id}`);

    const grn = await this.grnRepository.findOne({
      where: { id },
      withDeleted: true,
    });

    if (!grn) {
      throw new NotFoundException(`Goods Received Note with ID ${id} not found`);
    }

    if (!grn.deletedAt) {
      throw new BadRequestException('GRN must be soft-deleted before permanent deletion');
    }

    try {
      await this.grnRepository.remove(grn);
      this.logger.log(`GRN permanently deleted: ${id}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorStack = error instanceof Error ? error.stack : undefined;
      this.logger.error(`Error permanently deleting GRN: ${errorMessage}`, errorStack);
      throw new BadRequestException('Failed to permanently delete goods received note');
    }
  }

  /**
   * Bulk permanent delete GRNs
   */
  async bulkPermanentDelete(grnIds: string[]): Promise<{ deletedCount: number; failedIds: string[] }> {
    this.logger.log(`Bulk permanently deleting ${grnIds.length} GRNs`);

    const failedIds: string[] = [];
    let deletedCount = 0;

    for (const id of grnIds) {
      try {
        await this.permanentDelete(id);
        deletedCount++;
      } catch (error) {
        this.logger.error(`Failed to permanently delete GRN ${id}:`, error);
        failedIds.push(id);
      }
    }

    this.logger.log(`Bulk permanent delete completed: ${deletedCount} deleted, ${failedIds.length} failed`);
    return { deletedCount, failedIds };
  }

  /**
   * Map GRN entity to response DTO
   */
  private mapToResponseDto(grn: GoodsReceivedNote): GoodsReceivedNoteResponseDto {
    return {
      id: grn.id,
      grnNumber: grn.grnNumber,
      status: grn.status,
      type: grn.type,
      purchaseOrder: grn.purchaseOrder ? {
        id: grn.purchaseOrder.id,
        orderNumber: grn.purchaseOrder.orderNumber,
        totalAmount: Number(grn.purchaseOrder.totalAmount),
      } : null as any,
      supplier: grn.supplier ? {
        id: grn.supplier.id,
        supplierCode: grn.supplier.id.substring(0, 8).toUpperCase(),
        companyName: grn.supplier.companyName,
        contactPerson: grn.supplier.contactPerson,
      } : null as any,
      receivedByUser: grn.receivedByUser ? {
        id: grn.receivedByUser.id,
        username: grn.receivedByUser.username,
        firstName: grn.receivedByUser.firstName,
        lastName: grn.receivedByUser.lastName,
      } : null as any,
      inspectedByUser: grn.inspectedByUser ? {
        id: grn.inspectedByUser.id,
        username: grn.inspectedByUser.username,
        firstName: grn.inspectedByUser.firstName,
        lastName: grn.inspectedByUser.lastName,
      } : undefined,
      receiptDate: grn.receivedDate,
      inspectionDate: grn.inspectedDate,
      deliveryNoteRef: grn.deliveryReference,
      vehicleDetails: grn.vehicleDetails,
      deliveryPerson: grn.driverName,
      supplierInvoiceRef: undefined,
      inspectionRequired: grn.qualityInspected,
      inspectionResult: undefined,
      inspectionNotes: grn.inspectionNotes,
      totalAmount: Number(grn.totalValue),
      totalReceivedQuantity: Number(grn.totalQuantityReceived),
      totalAcceptedQuantity: Number(grn.totalQuantityAccepted),
      totalRejectedQuantity: Number(grn.totalQuantityRejected),
      overallAcceptanceRate: grn.acceptanceRate,
      hasQualityIssues: Number(grn.totalQuantityRejected) > 0,
      requiresInspection: grn.qualityInspected && !grn.inspectedDate,
      isCompleted: grn.status === 'accepted' || grn.status === 'rejected',
      canApprove: grn.status === 'inspected',
      notes: grn.notes,
      internalNotes: grn.internalNotes,
      items: [],
      createdAt: grn.createdAt,
      updatedAt: grn.updatedAt,
    };
  }
}
