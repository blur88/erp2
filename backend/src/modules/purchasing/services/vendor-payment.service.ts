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

@Injectable()
export class VendorPaymentService {
  constructor(
    @InjectRepository(VendorPayment)
    private vendorPaymentRepository: Repository<VendorPayment>,
    @InjectRepository(PurchaseOrder)
    private purchaseOrderRepository: Repository<PurchaseOrder>,
    @InjectRepository(GoodsReceivedNote)
    private grnRepository: Repository<GoodsReceivedNote>,
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

    return savedPayment;
  }

  /**
   * Find all vendor payments with filters and pagination
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
      page = 1,
      limit = 20,
    } = query;

    const queryBuilder = this.vendorPaymentRepository
      .createQueryBuilder('vendorPayment')
      .leftJoinAndSelect('vendorPayment.supplier', 'supplier')
      .leftJoinAndSelect('vendorPayment.purchaseOrder', 'purchaseOrder')
      .leftJoinAndSelect('vendorPayment.grn', 'grn')
      .where('vendorPayment.isActive = :isActive', { isActive: true });

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

    // Pagination
    const skip = (page - 1) * limit;
    queryBuilder.skip(skip).take(limit);

    // Order by payment date descending
    queryBuilder.orderBy('vendorPayment.paymentDate', 'DESC');

    const [data, total] = await queryBuilder.getManyAndCount();

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      hasNext: page < Math.ceil(total / limit),
      hasPrev: page > 1,
    };
  }

  /**
   * Find one vendor payment by ID
   */
  async findOne(id: string): Promise<VendorPayment> {
    const vendorPayment = await this.vendorPaymentRepository.findOne({
      where: { id, isActive: true },
      relations: ['supplier', 'purchaseOrder', 'grn'],
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

    return savedPayment;
  }

  /**
   * Find deleted vendor payments with filters and pagination
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
      page = 1,
      limit = 20,
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

    // Pagination
    const skip = (page - 1) * limit;
    queryBuilder.skip(skip).take(limit);

    // Order by payment date descending
    queryBuilder.orderBy('vendorPayment.paymentDate', 'DESC');

    const [data, total] = await queryBuilder.getManyAndCount();

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      hasNext: page < Math.ceil(total / limit),
      hasPrev: page > 1,
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
    return this.vendorPaymentRepository.save(vendorPayment);
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

    return this.vendorPaymentRepository.save(vendorPayment);
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
