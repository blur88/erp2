import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, LessThanOrEqual, MoreThanOrEqual } from 'typeorm';
import { VendorPayment, PurchaseOrder, GoodsReceivedNote } from '../../../database/entities';
import {
  CreateVendorPaymentDto,
  UpdateVendorPaymentDto,
  QueryVendorPaymentsDto,
  PaginatedResponse,
} from '../dto';
import { AuditLogService } from '../../audit-logs/services';

@Injectable()
export class VendorPaymentService {
  constructor(
    @InjectRepository(VendorPayment)
    private vendorPaymentRepository: Repository<VendorPayment>,
    @InjectRepository(PurchaseOrder)
    private purchaseOrderRepository: Repository<PurchaseOrder>,
    @InjectRepository(GoodsReceivedNote)
    private grnRepository: Repository<GoodsReceivedNote>,
    private readonly auditLogService: AuditLogService,
  ) {}

  /**
   * Create a new vendor payment
   */
  async create(
    createDto: CreateVendorPaymentDto,
    user: string = 'system',
  ): Promise<VendorPayment> {
    const paymentNumber = await this.generatePaymentNumber();

    // Automatically link GRN if purchaseOrderId is provided but grnId is not
    let grnId = createDto.grnId;
    if (createDto.purchaseOrderId && !grnId) {
      const grn = await this.grnRepository.findOne({
        where: { purchaseOrderId: createDto.purchaseOrderId },
      });
      if (grn) {
        grnId = grn.id;
      }
    }

    const vendorPayment = this.vendorPaymentRepository.create({
      ...createDto,
      paymentNumber,
      grnId,
    });

    const savedPayment = await this.vendorPaymentRepository.save(vendorPayment);

    // Touch the purchase order to update its updatedAt timestamp
    if (createDto.purchaseOrderId) {
      // Force TypeORM to update by using the update query
      await this.purchaseOrderRepository.update(createDto.purchaseOrderId, {});
    }

    // Log audit trail for create
    await this.auditLogService.log(
      'CREATE',
      'VendorPayment',
      `Created vendor payment: ${savedPayment.paymentNumber}`,
      {
        entityId: savedPayment.id,
        userId: user,
        newValues: {
          paymentNumber: savedPayment.paymentNumber,
          amount: savedPayment.amount,
          status: savedPayment.status,
        },
      }
    );

    return savedPayment;
  }

  /**
   * Find all vendor payments with filters (no pagination)
   */
  async findAll(
    query: QueryVendorPaymentsDto,
  ): Promise<PaginatedResponse<VendorPayment>> {
    const {
      supplierId,
      status,
      paymentMethod,
      startDate,
      endDate,
      sortBy = 'paymentDate',
      sortOrder = 'DESC',
      search,
    } = query;

    const queryBuilder = this.vendorPaymentRepository
      .createQueryBuilder('vendorPayment')
      .leftJoinAndSelect('vendorPayment.supplier', 'supplier')
      .leftJoinAndSelect('vendorPayment.purchaseOrder', 'purchaseOrder')
      .leftJoinAndSelect('purchaseOrder.items', 'purchaseOrderItems')
      .leftJoinAndSelect('purchaseOrderItems.product', 'product')
      .leftJoinAndSelect('vendorPayment.grn', 'grn')
      .where('vendorPayment.isActive = :isActive', { isActive: true });

    // Apply search
    if (search) {
      queryBuilder.andWhere(
        '(vendorPayment.paymentNumber ILIKE :search OR vendorPayment.referenceNumber ILIKE :search OR supplier.companyName ILIKE :search)',
        { search: `%${search}%` },
      );
    }

    // Apply filters
    if (supplierId) {
      queryBuilder.andWhere('vendorPayment.supplierId = :supplierId', {
        supplierId,
      });
    }

    if (status) {
      queryBuilder.andWhere('vendorPayment.status = :status', { status });
    }

    if (paymentMethod) {
      queryBuilder.andWhere('vendorPayment.paymentMethod = :paymentMethod', {
        paymentMethod,
      });
    }

    if (startDate && endDate) {
      queryBuilder.andWhere(
        'vendorPayment.paymentDate BETWEEN :startDate AND :endDate',
        { startDate, endDate },
      );
    } else if (startDate) {
      queryBuilder.andWhere('vendorPayment.paymentDate >= :startDate', {
        startDate,
      });
    } else if (endDate) {
      queryBuilder.andWhere('vendorPayment.paymentDate <= :endDate', {
        endDate,
      });
    }

    // Dynamic sorting
    const order = sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
    queryBuilder.orderBy(`vendorPayment.${sortBy}`, order);

    const data = await queryBuilder.getMany();
    const total = data.length;

    return {
      data,
      total,
      page: 1,
      limit: total,
      totalPages: 1,
      hasNext: false,
      hasPrev: false,
    };
  }

  /**
   * Find one vendor payment by ID
   */
  async findOne(id: string): Promise<VendorPayment> {
    const vendorPayment = await this.vendorPaymentRepository.findOne({
      where: { id, isActive: true },
      relations: ['supplier', 'purchaseOrder', 'purchaseOrder.items', 'purchaseOrder.items.product', 'grn'],
    });

    if (!vendorPayment) {
      throw new NotFoundException(`Vendor payment with ID ${id} not found`);
    }

    return vendorPayment;
  }

  /**
   * Update a vendor payment
   */
  async update(
    id: string,
    updateDto: UpdateVendorPaymentDto,
    user: string = 'system',
  ): Promise<VendorPayment> {
    const vendorPayment = await this.findOne(id);

    Object.assign(vendorPayment, {
      ...updateDto,
      updatedBy: user,
    });

    const savedPayment = await this.vendorPaymentRepository.save(vendorPayment);

    // Touch the purchase order to update its updatedAt timestamp
    if (vendorPayment.purchaseOrderId) {
      // Force TypeORM to update by using the update query
      await this.purchaseOrderRepository.update(vendorPayment.purchaseOrderId, {});
    }

    // Log audit trail for update
    await this.auditLogService.log(
      'UPDATE',
      'VendorPayment',
      `Updated vendor payment: ${savedPayment.paymentNumber}`,
      {
        entityId: id,
        userId: user,
        newValues: {
          paymentNumber: savedPayment.paymentNumber,
          amount: savedPayment.amount,
          status: savedPayment.status,
        },
      }
    );

    return savedPayment;
  }

  /**
   * Find deleted vendor payments with filters (no pagination)
   */
  async findDeleted(
    query: QueryVendorPaymentsDto,
  ): Promise<PaginatedResponse<VendorPayment>> {
    const {
      supplierId,
      status,
      paymentMethod,
      startDate,
      endDate,
    } = query;

    const queryBuilder = this.vendorPaymentRepository
      .createQueryBuilder('vendorPayment')
      .leftJoinAndSelect('vendorPayment.supplier', 'supplier')
      .leftJoinAndSelect('vendorPayment.purchaseOrder', 'purchaseOrder')
      .leftJoinAndSelect('vendorPayment.grn', 'grn')
      .where('vendorPayment.isActive = :isActive', { isActive: false });

    // Apply filters
    if (supplierId) {
      queryBuilder.andWhere('vendorPayment.supplierId = :supplierId', {
        supplierId,
      });
    }

    if (status) {
      queryBuilder.andWhere('vendorPayment.status = :status', { status });
    }

    if (paymentMethod) {
      queryBuilder.andWhere('vendorPayment.paymentMethod = :paymentMethod', {
        paymentMethod,
      });
    }

    if (startDate && endDate) {
      queryBuilder.andWhere(
        'vendorPayment.paymentDate BETWEEN :startDate AND :endDate',
        { startDate, endDate },
      );
    } else if (startDate) {
      queryBuilder.andWhere('vendorPayment.paymentDate >= :startDate', {
        startDate,
      });
    } else if (endDate) {
      queryBuilder.andWhere('vendorPayment.paymentDate <= :endDate', {
        endDate,
      });
    }

    // Order by payment date descending
    queryBuilder.orderBy('vendorPayment.paymentDate', 'DESC');

    const data = await queryBuilder.getMany();
    const total = data.length;

    return {
      data,
      total,
      page: 1,
      limit: total,
      totalPages: 1,
      hasNext: false,
      hasPrev: false,
    };
  }

  /**
   * Restore a soft deleted vendor payment
   */
  async restore(id: string, user: string = 'system'): Promise<VendorPayment> {
    const vendorPayment = await this.vendorPaymentRepository.findOne({
      where: { id, isActive: false },
      withDeleted: true,
    });

    if (!vendorPayment) {
      throw new NotFoundException(`Deleted vendor payment with ID ${id} not found`);
    }

    vendorPayment.isActive = true;

    await this.vendorPaymentRepository.restore(id);
    const restoredPayment = await this.vendorPaymentRepository.save(vendorPayment);

    // Log audit trail for restore
    await this.auditLogService.log(
      'RESTORE',
      'VendorPayment',
      `Restored vendor payment: ${restoredPayment.paymentNumber}`,
      {
        entityId: id,
        userId: user,
        newValues: {
          paymentNumber: restoredPayment.paymentNumber,
          amount: restoredPayment.amount,
          status: restoredPayment.status,
        },
      }
    );

    return restoredPayment;
  }

  /**
   * Bulk restore soft deleted vendor payments
   */
  async bulkRestore(
    ids: string[],
    user: string = 'system',
  ): Promise<{ restoredCount: number; failedIds: string[] }> {
    const failedIds: string[] = [];
    let restoredCount = 0;

    for (const id of ids) {
      try {
        await this.restore(id, user);
        restoredCount++;
      } catch (error) {
        failedIds.push(id);
      }
    }

    return { restoredCount, failedIds };
  }

  /**
   * Soft delete a vendor payment
   */
  async remove(id: string, user: string = 'system'): Promise<void> {
    const vendorPayment = await this.findOne(id);

    vendorPayment.isActive = false;

    await this.vendorPaymentRepository.save(vendorPayment);
    await this.vendorPaymentRepository.softDelete(id);

    // Log audit trail for delete
    await this.auditLogService.log(
      'DELETE',
      'VendorPayment',
      `Deleted vendor payment: ${vendorPayment.paymentNumber}`,
      {
        entityId: id,
        userId: user,
        oldValues: {
          paymentNumber: vendorPayment.paymentNumber,
          amount: vendorPayment.amount,
          status: vendorPayment.status,
        },
      }
    );

    // Touch the purchase order to update its updatedAt timestamp
    if (vendorPayment.purchaseOrderId) {
      // Force TypeORM to update by using the update query
      await this.purchaseOrderRepository.update(vendorPayment.purchaseOrderId, {});
    }
  }

  /**
   * Create vendor payment for a purchase order
   */
  async createForPurchaseOrder(poId: string, user: string = 'system'): Promise<VendorPayment> {
    // Find the purchase order
    const purchaseOrder = await this.purchaseOrderRepository.findOne({
      where: { id: poId },
      relations: ['supplier'],
    });

    if (!purchaseOrder) {
      throw new NotFoundException('Purchase order not found');
    }

    // Check if vendor payment already exists for this PO
    const existingPayment = await this.vendorPaymentRepository.findOne({
      where: {
        purchaseOrderId: poId,
        isActive: true
      },
    });

    if (existingPayment) {
      throw new BadRequestException('Vendor payment already exists for this purchase order');
    }

    // Find GRN for this purchase order
    const grn = await this.grnRepository.findOne({
      where: { purchaseOrderId: poId },
    });

    // Create vendor payment
    const paymentNumber = await this.generatePaymentNumber();

    const vendorPayment = this.vendorPaymentRepository.create({
      paymentNumber,
      supplierId: purchaseOrder.supplierId,
      purchaseOrderId: poId,
      grnId: grn?.id,
      amount: Number(purchaseOrder.totalAmount),
      paymentDate: new Date(),
      paymentMethod: 'bank_transfer', // Default payment method
      status: 'completed',
      notes: `Auto-generated payment for PO ${purchaseOrder.orderNumber}`,
    });

    const savedPayment = await this.vendorPaymentRepository.save(vendorPayment);

    // Log audit trail for create
    await this.auditLogService.log(
      'CREATE',
      'VendorPayment',
      `Created vendor payment: ${savedPayment.paymentNumber} for PO ${purchaseOrder.orderNumber}`,
      {
        entityId: savedPayment.id,
        userId: user,
        newValues: {
          paymentNumber: savedPayment.paymentNumber,
          purchaseOrderId: poId,
          amount: savedPayment.amount,
          status: savedPayment.status,
        },
      }
    );

    return savedPayment;
  }

  /**
   * Find vendor payment by purchase order ID
   */
  async findByPurchaseOrder(poId: string): Promise<VendorPayment | null> {
    return this.vendorPaymentRepository.findOne({
      where: {
        purchaseOrderId: poId,
        isActive: true
      },
      relations: ['supplier', 'purchaseOrder', 'grn'],
    });
  }

  /**
   * Hard delete vendor payment
   */
  async permanentDelete(id: string): Promise<{ message: string }> {
    const vendorPayment = await this.vendorPaymentRepository.findOne({
      where: { id },
      withDeleted: true,
    });

    if (!vendorPayment) {
      throw new NotFoundException('Vendor payment not found');
    }

    // Log audit trail for permanent delete
    await this.auditLogService.log(
      'PERMANENT_DELETE',
      'VendorPayment',
      `Permanently deleted vendor payment: ${vendorPayment.paymentNumber}`,
      {
        entityId: id,
        userId: 'system',
        oldValues: {
          paymentNumber: vendorPayment.paymentNumber,
          amount: vendorPayment.amount,
          status: vendorPayment.status,
          paymentMethod: vendorPayment.paymentMethod,
        },
      }
    );

    await this.vendorPaymentRepository.remove(vendorPayment);
    return { message: 'Vendor payment permanently deleted successfully' };
  }

  /**
   * Generate unique payment number
   */
  private async generatePaymentNumber(): Promise<string> {
    const prefix = 'VP';

    // Find the last payment number
    const lastPayment = await this.vendorPaymentRepository
      .createQueryBuilder('vendorPayment')
      .where('vendorPayment.paymentNumber LIKE :pattern', {
        pattern: `${prefix}-%`,
      })
      .orderBy('vendorPayment.paymentNumber', 'DESC')
      .getOne();

    let sequence = 1;
    if (lastPayment) {
      const lastSequence = parseInt(
        lastPayment.paymentNumber.split('-')[1],
      );
      sequence = lastSequence + 1;
    }

    return `${prefix}-${sequence.toString().padStart(6, '0')}`;
  }
}
