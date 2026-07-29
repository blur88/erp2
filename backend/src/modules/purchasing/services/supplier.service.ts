import { Injectable, Logger, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, FindOptionsWhere, FindManyOptions, Like, In, Between } from 'typeorm';
import { BaseCrudService } from '../../../common/services/base-crud.service';
import { applyPagination, paginationOptions } from '@/common/pagination/apply-pagination';
import {
  Supplier,
  SupplierType,
} from '../../../database/entities/supplier.entity';
import { PurchaseOrder } from '../../../database/entities/purchase-order.entity';
import { VendorPayment } from '../../../database/entities/vendor-payment.entity';
import {
  CreateSupplierDto,
  UpdateSupplierDto,
  SupplierQueryDto,
  SupplierResponseDto,
  SupplierListResponseDto,
} from '../dto';
import { AuditLogService } from '../../audit-logs/services';
import { GlobalSearchResultDto } from '../../search/dto/global-search-result.dto';
import { canSearchSuppliers } from '../../search/search.permissions';
import {
  SEARCH_CANDIDATE_LIMIT,
  SCORE_EXACT_NAME,
  SCORE_STARTSWITH_NAME,
  SCORE_CONTAINS,
  SCORE_FUZZY,
  BOOST_SUPPLIER,
  BOOST_EXACT_MATCH,
} from '../../search/search.constants';
import { JwtPayload } from '../../auth/strategies/jwt.strategy';
import { UserRole } from '../../../database/entities/user.entity';
import { generateBaseSlug } from '../../../common/utils/slug.util';

@Injectable()
export class SupplierService extends BaseCrudService<
  Supplier,
  CreateSupplierDto,
  UpdateSupplierDto,
  SupplierQueryDto
> {
  private readonly logger = new Logger(SupplierService.name);

  constructor(
    @InjectRepository(Supplier)
    private readonly supplierRepository: Repository<Supplier>,
    @InjectRepository(PurchaseOrder)
    private readonly purchaseOrderRepository: Repository<PurchaseOrder>,
    @InjectRepository(VendorPayment)
    private readonly vendorPaymentRepository: Repository<VendorPayment>,
    auditLogService: AuditLogService,
  ) {
    super(supplierRepository, auditLogService);
  }

  getEntityType(): string {
    return 'Supplier';
  }

  buildWhereClause(query: SupplierQueryDto): FindOptionsWhere<Supplier> {
    const where: FindOptionsWhere<Supplier> = {};

    if (query.type) {
      where.type = query.type;
    }

    if (query.isActive !== undefined) {
      where.isActive = query.isActive;
    }

    return where;
  }

  protected async afterDelete(entity: Supplier): Promise<void> {
    const activePurchaseOrdersCount = await this.supplierRepository
      .createQueryBuilder('supplier')
      .leftJoin('supplier.purchaseOrders', 'po')
      .where('supplier.id = :id', { id: entity.id })
      .andWhere('po.deletedAt IS NULL')
      .andWhere('po.isActive = :isActive', { isActive: true })
      .getCount();

    if (activePurchaseOrdersCount > 0) {
      throw new BadRequestException('Cannot deactivate supplier with active purchase orders');
    }
  }

  /**
   * Create a new supplier
   */
  async create(
    createSupplierDto: CreateSupplierDto,
    userId?: string,
    username?: string,
  ): Promise<SupplierResponseDto> {
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
      supplier.slug = await this.generateUniqueSlug(createSupplierDto.companyName);

      const savedSupplier = await this.supplierRepository.save(supplier);
      this.logger.log(`Supplier created successfully: ${savedSupplier.id}`);

      // Log audit trail for create
      await this.auditLogService.log(
        'CREATE',
        'Supplier',
        `Created supplier: ${savedSupplier.companyName}`,
        {
          entityId: savedSupplier.id,
          userId: userId || 'system',
          username,
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
   * Get suppliers with filtering and optional pagination.
   */
  async findAll(query: SupplierQueryDto): Promise<SupplierListResponseDto> {
    this.logger.log(`Finding suppliers with query: ${JSON.stringify(query)}`);

    const {
      search,
      type,
      isActive,
      sortBy = 'companyName',
      sortOrder = 'ASC',
      page,
      limit,
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

    const shouldPaginate = page !== undefined && limit !== undefined;
    applyPagination(queryBuilder, page, limit);

    const [suppliers, total] = await queryBuilder.getManyAndCount();
    const supplierDtos = suppliers.map(supplier => this.mapToResponseDto(supplier));

    return {
      data: supplierDtos,
      meta: {
        total,
        ...(shouldPaginate && { page, limit }),
      },
    };
  }

  async searchGlobal(query: string, user: JwtPayload): Promise<GlobalSearchResultDto[]> {
    if (!canSearchSuppliers(user.role as UserRole)) return [];

    const trimmed = query.trim();
    const q = trimmed.toLowerCase();

    const results = await this.supplierRepository
      .createQueryBuilder('supplier')
      .where('supplier.deletedAt IS NULL')
      .andWhere('supplier.companyName ILIKE :q', { q: `%${trimmed}%` })
      .take(SEARCH_CANDIDATE_LIMIT)
      .getMany();

    if (results.length > 0) {
      return results.map((supplier) => this.mapSupplier(supplier, q, false));
    }

    const fuzzyResults = await this.supplierRepository
      .createQueryBuilder('supplier')
      .addSelect('similarity(supplier.companyName, :q)', 'sim')
      .where('supplier.deletedAt IS NULL')
      // Threshold is pg_trgm's similarity limit, default 0.3 — read it with
      // show_limit(). PostgreSQL 18 removed the pg_trgm.similarity_threshold
      // GUC name; the limit and its default are unchanged.
      .andWhere('supplier.companyName % :q')
      .orderBy('sim', 'DESC')
      .setParameter('q', trimmed)
      .take(SEARCH_CANDIDATE_LIMIT)
      .getMany();

    return fuzzyResults.map((supplier) => this.mapSupplier(supplier, q, true));
  }

  /**
   * Get supplier by ID
   */
  async findOne(id: string): Promise<SupplierResponseDto> {
    this.logger.log(`Finding supplier by ID: ${id}`);

    const supplier = await this.supplierRepository.findOne({
      where: { id },
      relations: { purchaseOrders: true },
    });

    if (!supplier) {
      throw new NotFoundException(`Supplier with ID ${id} not found`);
    }

    return this.mapToResponseDto(supplier);
  }

  async findBySlug(slug: string): Promise<SupplierResponseDto> {
    const supplier = await this.supplierRepository.findOne({ where: { slug } });
    if (!supplier) throw new NotFoundException(`Supplier with slug '${slug}' not found`);
    return this.mapToResponseDto(supplier);
  }

  /**
   * Update supplier
   */
  async update(
    id: string,
    updateSupplierDto: UpdateSupplierDto,
    userId?: string,
    username?: string,
  ): Promise<SupplierResponseDto> {
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

      const nameChanged = updateSupplierDto.companyName !== undefined && updateSupplierDto.companyName !== supplier.companyName;
      Object.assign(supplier, updateSupplierDto);
      if (nameChanged) {
        supplier.slug = await this.generateUniqueSlug(supplier.companyName, id);
      }
      const updatedSupplier = await this.supplierRepository.save(supplier);

      // Log audit trail for update
      if (Object.keys(changes).length > 0) {
        await this.auditLogService.log(
          'UPDATE',
          'Supplier',
          `Updated supplier: ${updatedSupplier.companyName}`,
          {
            entityId: id,
            userId: userId || 'system',
            username,
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
  ): Promise<{ exists: boolean; isInactive?: boolean; supplier?: SupplierResponseDto; message?: string }> {
    this.logger.log(`Checking duplicate company name: ${companyName}`);

    // First check active suppliers
    const activeQueryBuilder = this.supplierRepository
      .createQueryBuilder('supplier')
      .where('LOWER(supplier.companyName) = LOWER(:companyName)', { companyName });

    if (excludeId) {
      activeQueryBuilder.andWhere('supplier.id != :excludeId', { excludeId });
    }

    activeQueryBuilder.andWhere('supplier.deletedAt IS NULL');

    const activeSupplier = await activeQueryBuilder.getOne();

    if (activeSupplier) {
      return {
        exists: true,
        isInactive: false,
        message: `Supplier with company name "${companyName}" already exists`,
      };
    }

    // Then check soft-deleted (inactive) suppliers
    const inactiveQueryBuilder = this.supplierRepository
      .createQueryBuilder('supplier')
      .withDeleted()
      .where('LOWER(supplier.companyName) = LOWER(:companyName)', { companyName })
      .andWhere('(supplier.deletedAt IS NOT NULL OR supplier.isActive = false)');

    if (excludeId) {
      inactiveQueryBuilder.andWhere('supplier.id != :excludeId', { excludeId });
    }

    const inactiveSupplier = await inactiveQueryBuilder.getOne();

    if (inactiveSupplier) {
      return {
        exists: true,
        isInactive: true,
        supplier: this.mapToResponseDto(inactiveSupplier),
        message: `Supplier with company name "${companyName}" exists but is inactive`,
      };
    }

    return { exists: false };
  }

  /**
   * Soft delete supplier (deactivate)
   */


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
   * Restore a soft-deleted supplier
   */
  async restore(id: string, userId?: string, username?: string): Promise<SupplierResponseDto> {
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
          userId: userId || 'system',
          username,
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
  async permanentDelete(id: string, userId?: string, username?: string): Promise<void> {
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
        userId: userId || 'system',
        username,
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

  async getSupplierPurchaseOrders(
    supplierId: string,
    query: { page?: number; limit?: number } = {},
  ): Promise<{ data: PurchaseOrder[]; meta: { total: number } }> {
    const { page, limit } = query;
    const options: FindManyOptions<PurchaseOrder> = {
      where: { supplierId },
      order: { orderNumber: 'ASC' },
      ...paginationOptions(page, limit),
    };
    const [data, total] = await this.purchaseOrderRepository.findAndCount(options);

    return { data, meta: { total } };
  }

  async getSupplierPayments(
    supplierId: string,
    query: { page?: number; limit?: number } = {},
  ): Promise<{ data: VendorPayment[]; meta: { total: number } }> {
    const { page, limit } = query;
    const options: FindManyOptions<VendorPayment> = {
      where: { supplierId },
      relations: { paymentMethodEntity: true, purchaseOrder: true },
      order: { paymentDate: 'DESC', createdAt: 'DESC', id: 'DESC' },
      ...paginationOptions(page, limit),
    };
    const [data, total] = await this.vendorPaymentRepository.findAndCount(options);

    return { data, meta: { total } };
  }

  /**
   * Map supplier entity to response DTO
   */
  private mapToResponseDto(supplier: Supplier): SupplierResponseDto {
    return {
      id: supplier.id,
      slug: supplier.slug,
      type: supplier.type,
      companyName: supplier.companyName,
      isActive: supplier.isActive,
      contactPerson: supplier.contactPerson,
      phone: supplier.phone,
      email: supplier.email,
      billingStreetAddress: supplier.billingStreetAddress,
      billingStreetAddress2: supplier.billingStreetAddress2,
      billingCity: supplier.billingCity,
      billingState: supplier.billingState,
      billingPostalCode: supplier.billingPostalCode,
      billingCountry: supplier.billingCountry,
      shippingStreetAddress: supplier.shippingStreetAddress,
      shippingStreetAddress2: supplier.shippingStreetAddress2,
      shippingCity: supplier.shippingCity,
      shippingState: supplier.shippingState,
      shippingPostalCode: supplier.shippingPostalCode,
      shippingCountry: supplier.shippingCountry,
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

  private async generateUniqueSlug(companyName: string, excludeId?: string): Promise<string> {
    const base = generateBaseSlug(companyName);
    let slug = base;
    let counter = 1;

    while (true) {
      const existing = await this.supplierRepository.findOne({
        where: { slug },
        withDeleted: true,
      });
      if (!existing || existing.id === excludeId) return slug;
      slug = `${base}-${counter++}`;
    }
  }

  private mapSupplier(
    supplier: Supplier,
    q: string,
    fuzzy: boolean,
  ): GlobalSearchResultDto {
    const name = supplier.companyName?.toLowerCase() ?? '';
    const baseScore = fuzzy
      ? SCORE_FUZZY
      : name === q
        ? SCORE_EXACT_NAME
        : name.startsWith(q)
          ? SCORE_STARTSWITH_NAME
          : SCORE_CONTAINS;

    return {
      type: 'supplier',
      id: supplier.id,
      label: supplier.companyName,
      description: supplier.phone ?? undefined,
      route: `/purchasing/suppliers/${supplier.id}`,
      score:
        baseScore +
        BOOST_SUPPLIER +
        (baseScore === SCORE_EXACT_NAME ? BOOST_EXACT_MATCH : 0),
    };
  }
}
