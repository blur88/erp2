import { Injectable, Logger, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, FindOptionsWhere, Like, In, Between } from 'typeorm';
import {
  Supplier,
  SupplierType,
} from '../../../database/entities/supplier.entity';
import {
  CreateSupplierDto,
  UpdateSupplierDto,
  SupplierQueryDto,
  SupplierResponseDto,
  SupplierListResponseDto,
} from '../dto';
import { AuditLogService } from '../../audit-logs/services';

@Injectable()
export class SupplierService {
  private readonly logger = new Logger(SupplierService.name);

  constructor(
    @InjectRepository(Supplier)
    private readonly supplierRepository: Repository<Supplier>,
    private readonly auditLogService: AuditLogService,
  ) {}

  /**
   * Create a new supplier
   */
  async create(createSupplierDto: CreateSupplierDto): Promise<SupplierResponseDto> {
    this.logger.log(`Creating supplier: ${createSupplierDto.companyName}`);

    // Check for duplicate company name (case-insensitive)
    const existingSupplier = await this.supplierRepository
      .createQueryBuilder('supplier')
      .where('LOWER(supplier.companyName) = LOWER(:companyName)', {
        companyName: createSupplierDto.companyName
      })
      .getOne();

    if (existingSupplier) {
      this.logger.warn(`Duplicate company name detected: ${createSupplierDto.companyName}`);
      throw new ConflictException(`Supplier with company name "${createSupplierDto.companyName}" already exists`);
    }

    try {
      const supplier = this.supplierRepository.create({
        ...createSupplierDto,
        totalPurchases: 0,
        totalOrders: 0,
      });

      const savedSupplier = await this.supplierRepository.save(supplier);
      this.logger.log(`Supplier created successfully: ${savedSupplier.id}`);

      // Log audit trail for create
      await this.auditLogService.log(
        'CREATE',
        'Supplier',
        `Created supplier: ${savedSupplier.companyName}`,
        {
          entityId: savedSupplier.id,
          userId: 'system',
          newValues: {
            companyName: savedSupplier.companyName,
            contactPerson: savedSupplier.contactPerson,
            phone: savedSupplier.phone,
            type: savedSupplier.type,
          },
        }
      );

      return this.mapToResponseDto(savedSupplier);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorStack = error instanceof Error ? error.stack : undefined;
      this.logger.error(`Error creating supplier: ${errorMessage}`, errorStack);
      throw new BadRequestException('Failed to create supplier');
    }
  }

  /**
   * Get all suppliers with filtering (no pagination)
   */
  async findAll(query: SupplierQueryDto): Promise<SupplierListResponseDto> {
    this.logger.log(`Finding suppliers with query: ${JSON.stringify(query)}`);

    const {
      search,
      type,
      isActive,
      sortBy = 'companyName',
      sortOrder = 'ASC',
    } = query;

    const queryBuilder = this.supplierRepository.createQueryBuilder('supplier');

    // Apply search filter
    if (search) {
      queryBuilder.andWhere(
        '(supplier.companyName ILIKE :search OR supplier.contactPerson ILIKE :search)',
        { search: `%${search}%` }
      );
    }

    // Apply filters
    if (type) {
      queryBuilder.andWhere('supplier.type = :type', { type });
    }

    if (isActive !== undefined) {
      queryBuilder.andWhere('supplier.isActive = :isActive', { isActive });
    }

    // Apply sorting
    const validSortFields = [
      'companyName', 'type',
      'totalPurchases', 'totalOrders',
      'createdAt', 'lastPurchaseDate'
    ];

    if (validSortFields.includes(sortBy)) {
      queryBuilder.orderBy(`supplier.${sortBy}`, sortOrder);
    } else {
      queryBuilder.orderBy('supplier.companyName', 'ASC');
    }

    // Add secondary sort by companyName if not primary sort
    if (sortBy !== 'companyName') {
      queryBuilder.addOrderBy('supplier.companyName', 'ASC');
    }

    // Get all suppliers without pagination
    const suppliers = await queryBuilder.getMany();
    const total = suppliers.length;

    const supplierDtos = suppliers.map(supplier => this.mapToResponseDto(supplier));

    return {
      suppliers: supplierDtos,
      total,
      page: 1,
      limit: total,
      totalPages: 1,
      hasNext: false,
      hasPrev: false,
    };
  }

  /**
   * Get supplier by ID
   */
  async findOne(id: string): Promise<SupplierResponseDto> {
    this.logger.log(`Finding supplier by ID: ${id}`);

    const supplier = await this.supplierRepository.findOne({
      where: { id },
      relations: ['purchaseOrders', 'goodsReceivedNotes'],
    });

    if (!supplier) {
      throw new NotFoundException(`Supplier with ID ${id} not found`);
    }

    return this.mapToResponseDto(supplier);
  }

  /**
   * Update supplier
   */
  async update(id: string, updateSupplierDto: UpdateSupplierDto): Promise<SupplierResponseDto> {
    this.logger.log(`Updating supplier: ${id}`);

    const supplier = await this.supplierRepository.findOne({ where: { id } });

    if (!supplier) {
      throw new NotFoundException(`Supplier with ID ${id} not found`);
    }

    // Check for duplicate company name (case-insensitive, excluding current supplier)
    if (updateSupplierDto.companyName) {
      const existingSupplier = await this.supplierRepository
        .createQueryBuilder('supplier')
        .where('LOWER(supplier.companyName) = LOWER(:companyName)', { companyName: updateSupplierDto.companyName })
        .andWhere('supplier.id != :id', { id })
        .getOne();

      if (existingSupplier) {
        this.logger.warn(`Duplicate company name detected: ${updateSupplierDto.companyName}`);
        throw new ConflictException(`Supplier with company name "${updateSupplierDto.companyName}" already exists`);
      }
    }

    try {
      // Track changes for audit
      const changes: Record<string, { from: any; to: any }> = {};
      Object.keys(updateSupplierDto).forEach(key => {
        if (updateSupplierDto[key] !== supplier[key]) {
          changes[key] = { from: supplier[key], to: updateSupplierDto[key] };
        }
      });

      Object.assign(supplier, updateSupplierDto);
      const updatedSupplier = await this.supplierRepository.save(supplier);

      // Log audit trail for update
      if (Object.keys(changes).length > 0) {
        await this.auditLogService.log(
          'UPDATE',
          'Supplier',
          `Updated supplier: ${updatedSupplier.companyName}`,
          {
            entityId: id,
            userId: 'system',
            oldValues: Object.fromEntries(
              Object.entries(changes).map(([key, val]) => [key, val.from])
            ),
            newValues: Object.fromEntries(
              Object.entries(changes).map(([key, val]) => [key, val.to])
            ),
          }
        );
      }

      this.logger.log(`Supplier updated successfully: ${updatedSupplier.id}`);
      return this.mapToResponseDto(updatedSupplier);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorStack = error instanceof Error ? error.stack : undefined;
      this.logger.error(`Error updating supplier: ${errorMessage}`, errorStack);
      throw new BadRequestException('Failed to update supplier');
    }
  }

  /**
   * Check if company name already exists (case-insensitive)
   */
  async checkDuplicateCompanyName(
    companyName: string,
    excludeId?: string,
  ): Promise<{ exists: boolean; message?: string }> {
    this.logger.log(`Checking duplicate company name: ${companyName}`);

    const queryBuilder = this.supplierRepository
      .createQueryBuilder('supplier')
      .where('LOWER(supplier.companyName) = LOWER(:companyName)', { companyName });

    if (excludeId) {
      queryBuilder.andWhere('supplier.id != :excludeId', { excludeId });
    }

    const existingSupplier = await queryBuilder.getOne();

    if (existingSupplier) {
      return {
        exists: true,
        message: `Supplier with company name "${companyName}" already exists`,
      };
    }

    return { exists: false };
  }

  /**
   * Soft delete supplier (deactivate)
   */
  async remove(id: string): Promise<void> {
    this.logger.log(`Deactivating supplier: ${id}`);

    const supplier = await this.supplierRepository.findOne({ where: { id } });

    if (!supplier) {
      throw new NotFoundException(`Supplier with ID ${id} not found`);
    }

    // Check if supplier has any active purchase orders (not soft-deleted)
    const activePurchaseOrdersCount = await this.supplierRepository
      .createQueryBuilder('supplier')
      .leftJoin('supplier.purchaseOrders', 'po')
      .where('supplier.id = :id', { id })
      .andWhere('po.deletedAt IS NULL')
      .andWhere('po.isActive = :isActive', { isActive: true })
      .getCount();

    if (activePurchaseOrdersCount > 0) {
      throw new BadRequestException('Cannot deactivate supplier with active purchase orders');
    }

    try {
      // Soft delete the supplier using TypeORM's soft delete
      await this.supplierRepository.softDelete(id);

      // Log audit trail for delete
      await this.auditLogService.log(
        'DELETE',
        'Supplier',
        `Deleted supplier: ${supplier.companyName}`,
        {
          entityId: id,
          userId: 'system',
          oldValues: {
            companyName: supplier.companyName,
            contactPerson: supplier.contactPerson,
            phone: supplier.phone,
            type: supplier.type,
          },
        }
      );

      this.logger.log(`Supplier soft deleted successfully: ${id}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorStack = error instanceof Error ? error.stack : undefined;
      this.logger.error(`Error soft deleting supplier: ${errorMessage}`, errorStack);
      throw new BadRequestException('Failed to soft delete supplier');
    }
  }


  /**
   * Update supplier purchase metrics
   */
  async updatePurchaseMetrics(
    supplierId: string, 
    orderAmount: number, 
    isFirstOrder: boolean = false
  ): Promise<void> {
    this.logger.log(`Updating purchase metrics for supplier: ${supplierId}`);

    const supplier = await this.supplierRepository.findOne({ 
      where: { id: supplierId } 
    });

    if (!supplier) {
      throw new NotFoundException(`Supplier with ID ${supplierId} not found`);
    }

    try {
      supplier.updatePurchaseMetrics(orderAmount, isFirstOrder);
      await this.supplierRepository.save(supplier);

      this.logger.log(`Purchase metrics updated for supplier: ${supplierId}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorStack = error instanceof Error ? error.stack : undefined;
      this.logger.error(`Error updating purchase metrics: ${errorMessage}`, errorStack);
      throw new BadRequestException('Failed to update purchase metrics');
    }
  }

  /**
   * Update supplier balance
   *
   * NOTE: This functionality is disabled due to missing balance fields and methods
   * in the Supplier entity. Credit/balance management has been removed from the system.
   */
  // async updateBalance(
  //   supplierId: string,
  //   balanceDto: UpdateSupplierBalanceDto
  // ): Promise<SupplierResponseDto> {
  //   this.logger.log(`Updating balance for supplier: ${supplierId}`);

  //   const supplier = await this.supplierRepository.findOne({
  //     where: { id: supplierId }
  //   });

  //   if (!supplier) {
  //     throw new NotFoundException(`Supplier with ID ${supplierId} not found`);
  //   }

  //   try {
  //     supplier.updateBalance(balanceDto.amount, balanceDto.type);
  //     const updatedSupplier = await this.supplierRepository.save(supplier);

  //     this.logger.log(`Balance updated for supplier: ${supplierId}`);
  //     return this.mapToResponseDto(updatedSupplier);
  //   } catch (error) {
  //     const errorMessage = error instanceof Error ? error.message : 'Unknown error';
  //     const errorStack = error instanceof Error ? error.stack : undefined;
  //     this.logger.error(`Error updating supplier balance: ${errorMessage}`, errorStack);
  //     throw new BadRequestException('Failed to update supplier balance');
  //   }
  // }


  /**
   * Check if supplier can make purchase
   *
   * NOTE: Amount checking is not implemented as credit limit functionality has been removed.
   * This method only checks if the supplier is generally eligible to make purchases.
   */
  async canPurchase(supplierId: string, _amount?: number): Promise<boolean> {
    this.logger.log(`Checking purchase eligibility for supplier: ${supplierId}`);

    const supplier = await this.supplierRepository.findOne({
      where: { id: supplierId }
    });

    if (!supplier) {
      throw new NotFoundException(`Supplier with ID ${supplierId} not found`);
    }

    // Note: amount parameter is ignored as credit limit functionality has been removed
    return supplier.canPurchase();
  }

  /**
   * Search suppliers by name or code
   */
  async searchSuppliers(query: string, limit: number = 10): Promise<SupplierResponseDto[]> {
    this.logger.log(`Searching suppliers with query: ${query}`);

    const suppliers = await this.supplierRepository.find({
      where: [
        { companyName: Like(`%${query}%`) },
        { contactPerson: Like(`%${query}%`) },
      ],
      take: limit,
      order: { companyName: 'ASC' },
    });

    return suppliers.map(supplier => this.mapToResponseDto(supplier));
  }

  /**
   * Get suppliers by type
   */
  async findByType(type: SupplierType): Promise<SupplierResponseDto[]> {
    this.logger.log(`Finding suppliers by type: ${type}`);

    const suppliers = await this.supplierRepository.find({
      where: { type, isActive: true },
      order: { companyName: 'ASC' },
    });

    return suppliers.map(supplier => this.mapToResponseDto(supplier));
  }


  // Credit limit functionality removed - method disabled
  // async findOverCreditLimit(): Promise<SupplierResponseDto[]> {
  //   this.logger.log('Finding suppliers over credit limit');
  //   const suppliers = await this.supplierRepository
  //     .createQueryBuilder('supplier')
  //     .where('supplier.isActive = true')
  //     .orderBy('supplier.companyName', 'ASC')
  //     .getMany();
  //   return suppliers.map(supplier => this.mapToResponseDto(supplier));
  // }


  /**
   * Activate supplier
   */
  async activate(supplierId: string): Promise<SupplierResponseDto> {
    this.logger.log(`Activating supplier: ${supplierId}`);

    const supplier = await this.supplierRepository.findOne({ 
      where: { id: supplierId } 
    });

    if (!supplier) {
      throw new NotFoundException(`Supplier with ID ${supplierId} not found`);
    }

    try {
      supplier.isActive = true;
      const updatedSupplier = await this.supplierRepository.save(supplier);

      this.logger.log(`Supplier activated successfully: ${supplierId}`);
      return this.mapToResponseDto(updatedSupplier);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorStack = error instanceof Error ? error.stack : undefined;
      this.logger.error(`Error activating supplier: ${errorMessage}`, errorStack);
      throw new BadRequestException('Failed to activate supplier');
    }
  }

  /**
   * Suspend supplier
   */
  async suspend(supplierId: string, reason: string): Promise<SupplierResponseDto> {
    this.logger.log(`Suspending supplier: ${supplierId}`);

    const supplier = await this.supplierRepository.findOne({ 
      where: { id: supplierId } 
    });

    if (!supplier) {
      throw new NotFoundException(`Supplier with ID ${supplierId} not found`);
    }

    try {
      supplier.notes = (supplier.notes || '') + `\nSuspended: ${reason}`;
      const updatedSupplier = await this.supplierRepository.save(supplier);

      this.logger.log(`Supplier suspended successfully: ${supplierId}`);
      return this.mapToResponseDto(updatedSupplier);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorStack = error instanceof Error ? error.stack : undefined;
      this.logger.error(`Error suspending supplier: ${errorMessage}`, errorStack);
      throw new BadRequestException('Failed to suspend supplier');
    }
  }

  /**
   * Get all soft-deleted suppliers
   */
  async findDeleted(query: SupplierQueryDto): Promise<SupplierListResponseDto> {
    this.logger.log('Finding deleted suppliers');

    const {
      page = 1,
      limit = 10,
      search,
      type,
      sortBy = 'companyName',
      sortOrder = 'ASC',
    } = query;

    const skip = (page - 1) * Math.min(limit, 100);
    const take = Math.min(limit, 100);

    const queryBuilder = this.supplierRepository
      .createQueryBuilder('supplier')
      .withDeleted()
      .where('supplier.deletedAt IS NOT NULL');

    // Apply filters
    if (search) {
      queryBuilder.andWhere(
        '(supplier.companyName ILIKE :search OR supplier.contactPerson ILIKE :search)',
        { search: `%${search}%` }
      );
    }

    if (type) {
      queryBuilder.andWhere('supplier.type = :type', { type });
    }

    // Count total
    const total = await queryBuilder.getCount();

    // Apply sorting and pagination
    const validSortFields = ['companyName', 'type', 'createdAt', 'deletedAt'];
    const sortField = validSortFields.includes(sortBy) ? sortBy : 'companyName';
    queryBuilder.orderBy(`supplier.${sortField}`, sortOrder as 'ASC' | 'DESC');
    queryBuilder.skip(skip).take(take);

    const suppliers = await queryBuilder.getMany();

    const totalPages = Math.ceil(total / take);

    return {
      suppliers: suppliers.map(supplier => this.mapToResponseDto(supplier)),
      total,
      page,
      limit: take,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    };
  }

  /**
   * Restore a soft-deleted supplier
   */
  async restore(id: string): Promise<SupplierResponseDto> {
    this.logger.log(`Restoring supplier: ${id}`);

    const supplier = await this.supplierRepository.findOne({
      where: { id },
      withDeleted: true,
    });

    if (!supplier) {
      throw new NotFoundException(`Supplier with ID ${id} not found`);
    }

    if (!supplier.deletedAt) {
      throw new BadRequestException('Supplier is not deleted');
    }

    try {
      await this.supplierRepository.restore(id);

      // Fetch the restored supplier
      const restoredSupplier = await this.supplierRepository.findOne({
        where: { id },
      });

      if (!restoredSupplier) {
        throw new NotFoundException(`Supplier with ID ${id} not found after restore`);
      }

      // No need to update status as it was removed

      // Log audit trail for restore
      await this.auditLogService.log(
        'RESTORE',
        'Supplier',
        `Restored supplier: ${restoredSupplier.companyName}`,
        {
          entityId: id,
          userId: 'system',
          newValues: {
            companyName: restoredSupplier.companyName,
            contactPerson: restoredSupplier.contactPerson,
            phone: restoredSupplier.phone,
            type: restoredSupplier.type,
          },
        }
      );

      this.logger.log(`Supplier restored successfully: ${id}`);
      return this.mapToResponseDto(restoredSupplier);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorStack = error instanceof Error ? error.stack : undefined;
      this.logger.error(`Error restoring supplier: ${errorMessage}`, errorStack);
      throw new BadRequestException('Failed to restore supplier');
    }
  }

  /**
   * Permanently delete a supplier
   */
  async permanentDelete(id: string): Promise<void> {
    this.logger.log(`Permanently deleting supplier: ${id}`);

    const supplier = await this.supplierRepository.findOne({
      where: { id },
      withDeleted: true,
    });

    if (!supplier) {
      throw new NotFoundException(`Supplier with ID ${id} not found`);
    }

    if (!supplier.deletedAt) {
      throw new BadRequestException('Supplier must be soft-deleted before permanent deletion');
    }

    // Log audit trail for permanent delete
    await this.auditLogService.log(
      'PERMANENT_DELETE',
      'Supplier',
      `Permanently deleted supplier: ${supplier.companyName}`,
      {
        entityId: id,
        userId: 'system',
        oldValues: {
          companyName: supplier.companyName,
          contactPerson: supplier.contactPerson,
          phone: supplier.phone,
          type: supplier.type,
        },
      }
    );

    try {
      await this.supplierRepository.remove(supplier);
      this.logger.log(`Supplier permanently deleted: ${id}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorStack = error instanceof Error ? error.stack : undefined;
      this.logger.error(`Error permanently deleting supplier: ${errorMessage}`, errorStack);
      throw new BadRequestException('Failed to permanently delete supplier');
    }
  }

  /**
   * Bulk restore suppliers
   */
  async bulkRestore(supplierIds: string[]): Promise<{ restoredCount: number; failedIds: string[] }> {
    this.logger.log(`Bulk restoring ${supplierIds.length} suppliers`);

    const failedIds: string[] = [];
    let restoredCount = 0;

    for (const id of supplierIds) {
      try {
        await this.restore(id);
        restoredCount++;
      } catch (error) {
        this.logger.error(`Failed to restore supplier ${id}:`, error);
        failedIds.push(id);
      }
    }

    this.logger.log(`Bulk restore completed: ${restoredCount} restored, ${failedIds.length} failed`);
    return { restoredCount, failedIds };
  }

  /**
   * Bulk permanent delete suppliers
   */
  async bulkPermanentDelete(supplierIds: string[]): Promise<{ deletedCount: number; failedIds: string[] }> {
    this.logger.log(`Bulk permanently deleting ${supplierIds.length} suppliers`);

    const failedIds: string[] = [];
    let deletedCount = 0;

    for (const id of supplierIds) {
      try {
        await this.permanentDelete(id);
        deletedCount++;
      } catch (error) {
        this.logger.error(`Failed to permanently delete supplier ${id}:`, error);
        failedIds.push(id);
      }
    }

    this.logger.log(`Bulk permanent delete completed: ${deletedCount} deleted, ${failedIds.length} failed`);
    return { deletedCount, failedIds };
  }

  /**
   * Map supplier entity to response DTO
   */
  private mapToResponseDto(supplier: Supplier): SupplierResponseDto {
    return {
      id: supplier.id,
      type: supplier.type,
      companyName: supplier.companyName,
      contactPerson: supplier.contactPerson,
      phone: supplier.phone,
      streetAddress: supplier.streetAddress,
      city: supplier.city,
      state: supplier.state,
      postalCode: supplier.postalCode,
      country: supplier.country,
      totalPurchases: Number(supplier.totalPurchases),
      totalOrders: supplier.totalOrders,
      averageOrderValue: supplier.averageOrderValue,
      lastPurchaseDate: supplier.lastPurchaseDate,
      firstPurchaseDate: supplier.firstPurchaseDate,
      notes: supplier.notes,
      createdAt: supplier.createdAt,
      updatedAt: supplier.updatedAt,
      deletedAt: supplier.deletedAt,
    };
  }
}