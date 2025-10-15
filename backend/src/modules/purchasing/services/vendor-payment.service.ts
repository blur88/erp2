import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, LessThanOrEqual, MoreThanOrEqual } from 'typeorm';
import { VendorPayment } from '../../../database/entities/vendor-payment.entity';
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
  ) {}

  /**
   * Create a new vendor payment
   */
  async create(
    createDto: CreateVendorPaymentDto,
    user: string = 'system',
  ): Promise<VendorPayment> {
    const paymentNumber = await this.generatePaymentNumber();

    const vendorPayment = this.vendorPaymentRepository.create({
      ...createDto,
      paymentNumber,
    });

    return this.vendorPaymentRepository.save(vendorPayment);
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
      relations: ['supplier', 'purchaseOrder'],
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

    return this.vendorPaymentRepository.save(vendorPayment);
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
  }

  /**
   * Generate unique payment number
   */
  private async generatePaymentNumber(): Promise<string> {
    const prefix = 'VPAY';
    const date = new Date();
    const year = date.getFullYear().toString().slice(-2);
    const month = (date.getMonth() + 1).toString().padStart(2, '0');

    // Find the last payment number for this month
    const lastPayment = await this.vendorPaymentRepository
      .createQueryBuilder('vendorPayment')
      .where('vendorPayment.paymentNumber LIKE :pattern', {
        pattern: `${prefix}-${year}${month}%`,
      })
      .orderBy('vendorPayment.paymentNumber', 'DESC')
      .getOne();

    let sequence = 1;
    if (lastPayment) {
      const lastSequence = parseInt(
        lastPayment.paymentNumber.split('-')[1].slice(4),
      );
      sequence = lastSequence + 1;
    }

    return `${prefix}-${year}${month}${sequence.toString().padStart(4, '0')}`;
  }
}
