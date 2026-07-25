import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, LessThanOrEqual, MoreThanOrEqual, EntityManager } from 'typeorm';
import { BaseCrudService } from '../../../common/services/base-crud.service';
import {
  VendorPayment,
  PurchaseOrder,
  PaymentMethodEntity,
} from '../../../database/entities';
import {
  PurchaseOrderPaymentStatus,
  PurchaseOrderStatus,
} from '../../../database/entities/purchase-order.entity';
import {
  CreateVendorPaymentDto,
  UpdateVendorPaymentDto,
  QueryVendorPaymentsDto,
  PaginatedResponse,
} from '../dto';
import { AuditLogService } from '../../audit-logs/services';
import { SettingsService } from '@modules/settings/settings.service';
import { repoFor } from '../../../common/db/tx-helpers';

@Injectable()
export class VendorPaymentService extends BaseCrudService<
  VendorPayment,
  CreateVendorPaymentDto,
  UpdateVendorPaymentDto,
  QueryVendorPaymentsDto
> {
  private readonly logger = new Logger(VendorPaymentService.name);

  constructor(
    @InjectRepository(VendorPayment)
    private vendorPaymentRepository: Repository<VendorPayment>,
    @InjectRepository(PurchaseOrder)
    private purchaseOrderRepository: Repository<PurchaseOrder>,
    @InjectRepository(PaymentMethodEntity)
    private paymentMethodRepository: Repository<PaymentMethodEntity>,
    auditLogService: AuditLogService,
    private readonly settingsService: SettingsService,
  ) {
    super(vendorPaymentRepository, auditLogService);
  }

  getEntityType(): string {
    return 'VendorPayment';
  }

  buildWhereClause(query: QueryVendorPaymentsDto) {
    const where: Record<string, unknown> = {};
    if (query.supplierId) where.supplierId = query.supplierId;
    if (query.status) where.status = query.status;
    if (query.paymentMethodId) where.paymentMethodId = query.paymentMethodId;
    return where as any;
  }

  protected async afterDelete(vendorPayment: VendorPayment): Promise<void> {
    vendorPayment.isActive = false;
    await this.vendorPaymentRepository.save(vendorPayment);

    if (vendorPayment.purchaseOrderId) {
      await this.purchaseOrderRepository.update(vendorPayment.purchaseOrderId, {});
    }
  }

  /**
   * Create a new vendor payment
   */
  async create(
    createDto: CreateVendorPaymentDto,
    userId?: string,
    username?: string,
    manager?: EntityManager,
  ): Promise<VendorPayment> {
    const paymentRepo = repoFor(manager, VendorPayment, this.vendorPaymentRepository);
    const poRepo = repoFor(manager, PurchaseOrder, this.purchaseOrderRepository);

    const paymentNumber = await this.settingsService.generateDocumentNumber('Vendor Payments', manager);
    let paymentMethodId = createDto.paymentMethodId;

    if (!paymentMethodId) {
      const methodRepo = repoFor(manager, PaymentMethodEntity, this.paymentMethodRepository);
      const defaultPaymentMethod = await methodRepo.findOne({
        where: { code: 'BANK', isActive: true },
      });
      paymentMethodId = defaultPaymentMethod?.id || null;
    }

    const vendorPayment = paymentRepo.create({
      ...createDto,
      paymentMethodId,
      paymentNumber,
    });

    const savedPayment = await paymentRepo.save(vendorPayment);

    if (createDto.purchaseOrderId) {
      await poRepo.update(createDto.purchaseOrderId, {});
    }

    await this.auditLogService.log(
      'CREATE',
      'VendorPayment',
      `Created vendor payment: ${savedPayment.paymentNumber}`,
      {
        entityId: savedPayment.id,
        userId: userId || 'system',
        username,
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
      paymentMethodId,
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
      .leftJoinAndSelect('vendorPayment.paymentMethodEntity', 'paymentMethodEntity')
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

    if (paymentMethodId) {
      queryBuilder.andWhere('vendorPayment.paymentMethodId = :paymentMethodId', {
        paymentMethodId,
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
      relations: {
        supplier: true,
        purchaseOrder: { items: { product: true } },
        paymentMethodEntity: true,
      },
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
    userId?: string,
    username?: string,
  ): Promise<VendorPayment> {
    const vendorPayment = await this.findOne(id);

    Object.assign(vendorPayment, {
      ...updateDto,
      updatedBy: userId || 'system',
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
        userId: userId || 'system',
        username,
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
      paymentMethodId,
      startDate,
      endDate,
    } = query;

    const queryBuilder = this.vendorPaymentRepository
      .createQueryBuilder('vendorPayment')
      .leftJoinAndSelect('vendorPayment.supplier', 'supplier')
      .leftJoinAndSelect('vendorPayment.purchaseOrder', 'purchaseOrder')
      .leftJoinAndSelect('vendorPayment.paymentMethodEntity', 'paymentMethodEntity')
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

    if (paymentMethodId) {
      queryBuilder.andWhere('vendorPayment.paymentMethodId = :paymentMethodId', {
        paymentMethodId,
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
  async restore(id: string, userId?: string, username?: string): Promise<VendorPayment> {
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
        userId: userId || 'system',
        username,
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
    userId?: string,
    username?: string,
  ): Promise<{ restoredCount: number; failedIds: string[] }> {
    const failedIds: string[] = [];
    let restoredCount = 0;

    for (const id of ids) {
      try {
        await this.restore(id, userId, username);
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
  /**
   * Soft delete a vendor payment during unpay without additional audit logging.
   */
  async softDeleteForUnpay(id: string, manager?: EntityManager): Promise<void> {
    const paymentRepo = repoFor(manager, VendorPayment, this.vendorPaymentRepository);
    const payment = await paymentRepo.findOne({ where: { id } });
    if (!payment) return;

    payment.isActive = false;
    await paymentRepo.save(payment);
    await paymentRepo.softDelete(id);
  }

  /**
   * Create vendor payment for a purchase order
   */
  async createForPurchaseOrder(poId: string, userId?: string, username?: string, manager?: EntityManager): Promise<VendorPayment> {
    const poRepo = repoFor(manager, PurchaseOrder, this.purchaseOrderRepository);
    const paymentRepo = repoFor(manager, VendorPayment, this.vendorPaymentRepository);
    const methodRepo = repoFor(manager, PaymentMethodEntity, this.paymentMethodRepository);

    const purchaseOrder = await poRepo.findOne({
      where: { id: poId },
      relations: { supplier: true },
    });

    if (!purchaseOrder) {
      throw new NotFoundException('Purchase order not found');
    }

    const existingPayment = await paymentRepo.findOne({
      where: {
        purchaseOrderId: poId,
        isActive: true
      },
    });

    if (existingPayment) {
      throw new BadRequestException('Vendor payment already exists for this purchase order');
    }

    const paymentNumber = await this.settingsService.generateDocumentNumber('Vendor Payments', manager);
    const defaultPaymentMethod = await methodRepo.findOne({
      where: { code: 'BANK', isActive: true },
    });

    const vendorPayment = paymentRepo.create({
      paymentNumber,
      supplierId: purchaseOrder.supplierId,
      purchaseOrderId: poId,
      amount: Number(purchaseOrder.totalAmount),
      paymentDate: new Date(),
      paymentMethodId: defaultPaymentMethod?.id || null,
      status: 'completed',
      notes: `Auto-generated payment for PO ${purchaseOrder.orderNumber}`,
    });

    const savedPayment = await paymentRepo.save(vendorPayment);

    purchaseOrder.paidAmount = Number(purchaseOrder.totalAmount);
    purchaseOrder.paymentStatus = PurchaseOrderPaymentStatus.PAID;
    if (purchaseOrder.status === PurchaseOrderStatus.DRAFT) {
      purchaseOrder.status = PurchaseOrderStatus.READY;
    }
    await poRepo.save(purchaseOrder);

    await this.auditLogService.log(
      'CREATE',
      'VendorPayment',
      `Created vendor payment: ${savedPayment.paymentNumber} for PO ${purchaseOrder.orderNumber}`,
      {
        entityId: savedPayment.id,
        userId: userId || 'system',
        username,
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
        isActive: true,
      },
      relations: { supplier: true, purchaseOrder: true, paymentMethodEntity: true },
    });
  }

  /**
   * Find all vendor payments for a purchase order
   */
  async findAllByPurchaseOrder(poId: string, manager?: EntityManager): Promise<VendorPayment[]> {
    return repoFor(manager, VendorPayment, this.vendorPaymentRepository).find({
      where: {
        purchaseOrderId: poId,
        isActive: true,
      },
    });
  }

  /**
   * Hard delete vendor payment
   */
  async permanentDelete(id: string, userId?: string, username?: string): Promise<void> {
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
        userId: userId || 'system',
        username,
        oldValues: {
          paymentNumber: vendorPayment.paymentNumber,
          amount: vendorPayment.amount,
          status: vendorPayment.status,
          paymentMethodId: vendorPayment.paymentMethodId,
        },
      }
    );

    await this.vendorPaymentRepository.remove(vendorPayment);
  }

}
