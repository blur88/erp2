import { Injectable, Logger, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, FindOptionsWhere, Like, In, Between } from 'typeorm';
import {
  Supplier,
  SupplierStatus,
  SupplierType,
  SupplierRating
} from '../../../database/entities/supplier.entity';
import {
  CreateSupplierDto,
  UpdateSupplierDto,
  SupplierQueryDto,
  SupplierResponseDto,
  SupplierListResponseDto,
  SupplierPerformanceDto,
  UpdateSupplierBalanceDto,
  SupplierPerformanceMetricsDto,
} from '../dto';

@Injectable()
export class SupplierService {
  private readonly logger = new Logger(SupplierService.name);

  constructor(
    @InjectRepository(Supplier)
    private readonly supplierRepository: Repository<Supplier>,
  ) {}

  /**
   * Create a new supplier
   */
  async create(createSupplierDto: CreateSupplierDto): Promise<SupplierResponseDto> {
    this.logger.log(`Creating supplier: ${createSupplierDto.companyName}`);

    // Check for duplicate email if provided
    if (createSupplierDto.email) {
      const existingByEmail = await this.supplierRepository.findOne({
        where: { email: createSupplierDto.email },
      });

      if (existingByEmail) {
        throw new ConflictException(`Supplier with email ${createSupplierDto.email} already exists`);
      }
    }

    try {
      const supplier = this.supplierRepository.create({
        ...createSupplierDto,
        status: createSupplierDto.status || SupplierStatus.ACTIVE,
        isActive: true,
        rating: SupplierRating.UNRATED,
        paymentTermsDays: createSupplierDto.paymentTermsDays || 30,
        currency: createSupplierDto.currency || 'USD',
        totalPurchases: 0,
        totalOrders: 0,
        averageDeliveryTime: 0,
        onTimeDeliveryRate: 100,
        qualityRate: 100,
      });

      const savedSupplier = await this.supplierRepository.save(supplier);
      this.logger.log(`Supplier created successfully: ${savedSupplier.id}`);

      return this.mapToResponseDto(savedSupplier);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorStack = error instanceof Error ? error.stack : undefined;
      this.logger.error(`Error creating supplier: ${errorMessage}`, errorStack);
      throw new BadRequestException('Failed to create supplier');
    }
  }

  /**
   * Get all suppliers with filtering and pagination
   */
  async findAll(query: SupplierQueryDto): Promise<SupplierListResponseDto> {
    this.logger.log(`Finding suppliers with query: ${JSON.stringify(query)}`);

    const {
      page = 1,
      limit = 10,
      search,
      type,
      status,
      rating,
      isActive,
      sortBy = 'companyName',
      sortOrder = 'ASC',
    } = query;

    const skip = (page - 1) * limit;
    const queryBuilder = this.supplierRepository.createQueryBuilder('supplier');

    // Apply search filter
    if (search) {
      queryBuilder.andWhere(
        '(supplier.companyName ILIKE :search OR supplier.contactPerson ILIKE :search OR supplier.email ILIKE :search)',
        { search: `%${search}%` }
      );
    }

    // Apply filters
    if (type) {
      queryBuilder.andWhere('supplier.type = :type', { type });
    }

    if (status) {
      queryBuilder.andWhere('supplier.status = :status', { status });
    }

    if (rating) {
      queryBuilder.andWhere('supplier.rating = :rating', { rating });
    }

    if (isActive !== undefined) {
      queryBuilder.andWhere('supplier.isActive = :isActive', { isActive });
    }

    // Apply sorting
    const validSortFields = [
      'companyName', 'type', 'status', 'rating',
      'totalPurchases', 'totalOrders', 'onTimeDeliveryRate', 'qualityRate',
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

    // Get total count
    const total = await queryBuilder.getCount();

    // Apply pagination
    queryBuilder.skip(skip).take(limit);

    const suppliers = await queryBuilder.getMany();

    const supplierDtos = suppliers.map(supplier => this.mapToResponseDto(supplier));

    return {
      suppliers: supplierDtos,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      hasNext: page < Math.ceil(total / limit),
      hasPrev: page > 1,
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

    // Check for duplicate email if changed
    if (updateSupplierDto.email && updateSupplierDto.email !== supplier.email) {
      const existingByEmail = await this.supplierRepository.findOne({
        where: { email: updateSupplierDto.email },
      });

      if (existingByEmail) {
        throw new ConflictException(`Supplier with email ${updateSupplierDto.email} already exists`);
      }
    }

    try {
      Object.assign(supplier, updateSupplierDto);
      const updatedSupplier = await this.supplierRepository.save(supplier);

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
   * Soft delete supplier (deactivate)
   */
  async remove(id: string): Promise<void> {
    this.logger.log(`Deactivating supplier: ${id}`);

    const supplier = await this.supplierRepository.findOne({ where: { id } });

    if (!supplier) {
      throw new NotFoundException(`Supplier with ID ${id} not found`);
    }

    // Check if supplier has active purchase orders
    const activePurchaseOrdersCount = await this.supplierRepository
      .createQueryBuilder('supplier')
      .leftJoinAndSelect('supplier.purchaseOrders', 'po')
      .where('supplier.id = :id', { id })
      .andWhere('po.status NOT IN (:...statuses)', { 
        statuses: ['completed', 'cancelled'] 
      })
      .getCount();

    if (activePurchaseOrdersCount > 0) {
      throw new BadRequestException('Cannot deactivate supplier with active purchase orders');
    }

    try {
      // Soft delete the supplier using TypeORM's soft delete
      await this.supplierRepository.softDelete(id);

      this.logger.log(`Supplier soft deleted successfully: ${id}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorStack = error instanceof Error ? error.stack : undefined;
      this.logger.error(`Error soft deleting supplier: ${errorMessage}`, errorStack);
      throw new BadRequestException('Failed to soft delete supplier');
    }
  }

  /**
   * Update supplier performance metrics
   */
  async updatePerformanceMetrics(
    supplierId: string, 
    performanceData: SupplierPerformanceDto
  ): Promise<void> {
    this.logger.log(`Updating performance metrics for supplier: ${supplierId}`);

    const supplier = await this.supplierRepository.findOne({ 
      where: { id: supplierId } 
    });

    if (!supplier) {
      throw new NotFoundException(`Supplier with ID ${supplierId} not found`);
    }

    try {
      supplier.updatePerformanceMetrics(
        performanceData.deliveryTime,
        performanceData.wasOnTime,
        performanceData.wasQualityAccepted
      );

      await this.supplierRepository.save(supplier);
      this.logger.log(`Performance metrics updated for supplier: ${supplierId}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorStack = error instanceof Error ? error.stack : undefined;
      this.logger.error(`Error updating performance metrics: ${errorMessage}`, errorStack);
      throw new BadRequestException('Failed to update performance metrics');
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
   * Get supplier performance metrics
   */
  async getPerformanceMetrics(
    supplierIds?: string[],
    includeInactive: boolean = false
  ): Promise<SupplierPerformanceMetricsDto[]> {
    this.logger.log('Getting supplier performance metrics');

    const queryBuilder = this.supplierRepository.createQueryBuilder('supplier');

    if (supplierIds && supplierIds.length > 0) {
      queryBuilder.andWhere('supplier.id IN (:...supplierIds)', { supplierIds });
    }

    if (!includeInactive) {
      queryBuilder.andWhere('supplier.isActive = true');
    }

    queryBuilder
      .andWhere('supplier.totalOrders > 0')
      .orderBy('supplier.totalPurchases', 'DESC');

    const suppliers = await queryBuilder.getMany();

    // Calculate total spend for percentage calculations
    const totalSpend = suppliers.reduce((sum, s) => sum + Number(s.totalPurchases), 0);

    return suppliers.map(supplier => ({
      supplierId: supplier.id,
      companyName: supplier.companyName,
      rating: supplier.rating,
      totalOrders: supplier.totalOrders,
      totalPurchases: Number(supplier.totalPurchases),
      averageDeliveryTime: Number(supplier.averageDeliveryTime),
      onTimeDeliveryRate: Number(supplier.onTimeDeliveryRate),
      qualityRate: Number(supplier.qualityRate),
      performanceScore: supplier.overallPerformanceScore,
      spendPercentage: totalSpend > 0 ? (Number(supplier.totalPurchases) / totalSpend) * 100 : 0,
    }));
  }

  /**
   * Check if supplier can make purchase
   *
   * NOTE: Amount checking is not implemented as credit limit functionality has been removed.
   * This method only checks if the supplier is generally eligible to make purchases.
   */
  async canPurchase(supplierId: string, amount: number): Promise<boolean> {
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

  /**
   * Get suppliers by rating
   */
  async findByRating(rating: SupplierRating): Promise<SupplierResponseDto[]> {
    this.logger.log(`Finding suppliers by rating: ${rating}`);

    const suppliers = await this.supplierRepository.find({
      where: { rating, isActive: true },
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
   * Get top suppliers by purchase volume
   */
  async getTopSuppliers(limit: number = 10): Promise<SupplierPerformanceMetricsDto[]> {
    this.logger.log(`Getting top ${limit} suppliers by purchase volume`);

    const suppliers = await this.supplierRepository.find({
      where: { isActive: true },
      order: { totalPurchases: 'DESC' },
      take: limit,
    });

    const totalSpend = suppliers.reduce((sum, s) => sum + Number(s.totalPurchases), 0);

    return suppliers.map(supplier => ({
      supplierId: supplier.id,
      companyName: supplier.companyName,
      rating: supplier.rating,
      totalOrders: supplier.totalOrders,
      totalPurchases: Number(supplier.totalPurchases),
      averageDeliveryTime: Number(supplier.averageDeliveryTime),
      onTimeDeliveryRate: Number(supplier.onTimeDeliveryRate),
      qualityRate: Number(supplier.qualityRate),
      performanceScore: supplier.overallPerformanceScore,
      spendPercentage: totalSpend > 0 ? (Number(supplier.totalPurchases) / totalSpend) * 100 : 0,
    }));
  }

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
      supplier.status = SupplierStatus.ACTIVE;
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
      supplier.status = SupplierStatus.SUSPENDED;
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
      status,
      rating,
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
        '(supplier.companyName ILIKE :search OR supplier.email ILIKE :search OR supplier.contactPerson ILIKE :search)',
        { search: `%${search}%` }
      );
    }

    if (type) {
      queryBuilder.andWhere('supplier.type = :type', { type });
    }

    if (status) {
      queryBuilder.andWhere('supplier.status = :status', { status });
    }

    if (rating) {
      queryBuilder.andWhere('supplier.rating = :rating', { rating });
    }

    // Count total
    const total = await queryBuilder.getCount();

    // Apply sorting and pagination
    const validSortFields = ['companyName', 'type', 'status', 'rating', 'createdAt', 'deletedAt'];
    const sortField = validSortFields.includes(sortBy) ? sortBy : 'companyName';
    queryBuilder.orderBy(`supplier.${sortField}`, sortOrder as 'ASC' | 'DESC');
    queryBuilder.skip(skip).take(take);

    const suppliers = await queryBuilder.getMany();

    const totalPages = Math.ceil(total / take);

    return {
      data: suppliers.map(supplier => this.mapToResponseDto(supplier)),
      meta: {
        page,
        limit: take,
        total,
        totalPages,
      },
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

      // Reactivate if needed
      restoredSupplier.isActive = true;
      restoredSupplier.status = SupplierStatus.ACTIVE;
      await this.supplierRepository.save(restoredSupplier);

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
   * Map supplier entity to response DTO
   */
  private mapToResponseDto(supplier: Supplier): SupplierResponseDto {
    return {
      id: supplier.id,
      type: supplier.type,
      companyName: supplier.companyName,
      contactPerson: supplier.contactPerson,
      contactTitle: supplier.contactTitle,
      email: supplier.email,
      phone: supplier.phone,
      alternativePhone: supplier.alternativePhone,
      fax: supplier.fax,
      website: supplier.website,
      taxId: supplier.taxId,
      fullAddress: supplier.fullAddress,
      status: supplier.status,
      isActive: supplier.isActive,
      rating: supplier.rating,
      paymentTermsDays: supplier.paymentTermsDays,
      currency: supplier.currency,
      totalPurchases: Number(supplier.totalPurchases),
      totalOrders: supplier.totalOrders,
      averageOrderValue: supplier.averageOrderValue,
      lastPurchaseDate: supplier.lastPurchaseDate,
      firstPurchaseDate: supplier.firstPurchaseDate,
      averageDeliveryTime: Number(supplier.averageDeliveryTime),
      onTimeDeliveryRate: Number(supplier.onTimeDeliveryRate),
      qualityRate: Number(supplier.qualityRate),
      overallPerformanceScore: supplier.overallPerformanceScore,
      categories: supplier.categories,
      certifications: supplier.certifications,
      notes: supplier.notes,
      createdAt: supplier.createdAt,
      updatedAt: supplier.updatedAt,
    };
  }
}