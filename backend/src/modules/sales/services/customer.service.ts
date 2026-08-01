import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, FindOptionsWhere } from 'typeorm';
import { applyPagination } from '../../../common/pagination/apply-pagination';
import { BaseCrudService } from '../../../common/services/base-crud.service';
import { Customer } from '../../../database/entities/customer.entity';
import { SalesOrder } from '../../../database/entities/sales-order.entity';
import {
  CreateCustomerDto,
  UpdateCustomerDto,
  QueryCustomersDto,
  CustomerResponseDto,
  CustomerSummaryDto,
} from '../dto/customer.dto';
import { GlobalSearchResultDto } from '../../search/dto/global-search-result.dto';
import { canSearchCustomers } from '../../search/search.permissions';
import {
  SEARCH_CANDIDATE_LIMIT,
  SCORE_EXACT_CODE,
  SCORE_STARTSWITH_CODE,
  SCORE_EXACT_NAME,
  SCORE_STARTSWITH_NAME,
  SCORE_CONTAINS,
  SCORE_FUZZY,
  BOOST_CUSTOMER,
  BOOST_EXACT_MATCH,
} from '../../search/search.constants';
import {
  ValidationUtil,
  BulkOperationUtil,
  BulkOperationResponse,
} from '../../../common/utils/validation.util';
import { TransactionManager, Transactional } from '../../../common/utils/transaction.util';
import { AuditLogService } from '../../audit-logs/services';
import { generateBaseSlug } from '../../../common/utils/slug.util';

/**
 * Fields the customer lists may be ordered by. `QueryCustomersDto` does not
 * constrain `sortBy`, so an invalid value reaches this service from HTTP as
 * well as from internal callers; resolving here keeps it out of the ORDER BY
 * clause. Deliberately not enforced as @IsIn — that would turn today's
 * fallback into a 400 and change the HTTP contract.
 */
const CUSTOMER_SORTABLE_FIELDS = [
  'name',
  'phone',
  'email',
  'type',
  'totalSales',
  'totalOrders',
  'lastPurchaseDate',
  'firstPurchaseDate',
  'createdAt',
  'updatedAt',
] as const;

@Injectable()
export class CustomerService extends BaseCrudService<
  Customer,
  CreateCustomerDto,
  UpdateCustomerDto,
  QueryCustomersDto
> {
  constructor(
    @InjectRepository(Customer)
    private readonly customerRepository: Repository<Customer>,
    @InjectRepository(SalesOrder)
    private readonly salesOrderRepository: Repository<SalesOrder>,
    private readonly transactionManager: TransactionManager,
    auditLogService: AuditLogService,
  ) {
    super(customerRepository, auditLogService);
  }

  getEntityType(): string {
    return 'Customer';
  }

  buildWhereClause(query: QueryCustomersDto): FindOptionsWhere<Customer> {
    const where: FindOptionsWhere<Customer> = {};

    if (query.type !== undefined && query.type !== null) where.type = query.type;
    if (query.isActive !== undefined) where.isActive = query.isActive;

    return where;
  }

  protected applyQueryBuilder(qb: any, query: QueryCustomersDto): any {
    qb = qb.leftJoinAndSelect('customer.priceList', 'priceList');

    if (query.priceListId) {
      qb = qb.andWhere('customer.priceListId = :priceListId', {
        priceListId: query.priceListId,
      });
    }

    return qb;
  }

  protected async afterDelete(entity: Customer): Promise<void> {
    const activeOrderCount = await this.salesOrderRepository.count({
      where: { customerId: entity.id },
    });

    if (activeOrderCount > 0) {
      throw new BadRequestException({
        message: `Cannot delete customer '${entity.name}' because they have ${activeOrderCount} order${activeOrderCount === 1 ? '' : 's'}.`,
        code: 'DELETION_PREVENTED_BY_DEPENDENCIES',
        customerName: entity.name,
        customerId: entity.id,
        dependencies: {
          orders: activeOrderCount,
        },
        suggestions: [
          `Complete or cancel the ${activeOrderCount} pending order${activeOrderCount === 1 ? '' : 's'} first`,
        ],
        details: `Customer '${entity.name}' (${entity.id}) cannot be deleted due to existing business relationships. This is a safety measure to preserve data integrity.`,
      });
    }
  }

  async create(
    createCustomerDto: CreateCustomerDto,
    userId?: string,
    username?: string,
  ): Promise<CustomerResponseDto> {
    // Check for phone number duplicate if phone is provided
    if (createCustomerDto.phone) {
      await this.validatePhoneUniqueness(createCustomerDto.phone);
    }

    // Customer pricing is now handled via priceListId (not pricingScheme)
    const customer = this.customerRepository.create({
      ...createCustomerDto,
    });
    customer.slug = await this.generateUniqueSlug(createCustomerDto.name);

    const savedCustomer = await this.customerRepository.save(customer);

    // Log audit trail
    await this.auditLogService.log(
      'CREATE',
      'Customer',
      `Created customer: ${savedCustomer.name} (${savedCustomer.phone || 'no phone'})`,
      {
        entityId: savedCustomer.id,
        userId: userId || 'system',
        username,
        newValues: {
          name: savedCustomer.name,
          phone: savedCustomer.phone,
          type: savedCustomer.type,
          priceListId: savedCustomer.priceListId,
        },
      },
    );

    return this.mapToResponseDto(savedCustomer);
  }

  async findAll(query: QueryCustomersDto) {
    const {
      search,
      type,
      priceListId,
      isActive,
      sortBy = 'name',
      sortOrder = 'ASC',
      page,
      limit,
    } = query;

    const where: FindOptionsWhere<Customer> = {};

    if (type !== undefined && type !== null) where.type = type;
    // pricingScheme removed in Phase 8 - use priceListId instead
    if (isActive !== undefined) where.isActive = isActive;

    // Use query builder for case-insensitive sorting
    let queryBuilder = this.customerRepository
      .createQueryBuilder('customer')
      .leftJoinAndSelect('customer.priceList', 'priceList');

    // Apply base where conditions
    Object.entries(where).forEach(([key, value]) => {
      queryBuilder.andWhere(`customer.${key} = :${key}`, { [key]: value });
    });

    if (priceListId) {
      queryBuilder.andWhere('customer.priceListId = :priceListId', {
        priceListId,
      });
    }

    // Apply search conditions
    if (search) {
      queryBuilder.andWhere('(customer.name ILIKE :search OR customer.phone ILIKE :search)', {
        search: `%${search}%`,
      });
    }

    // Apply sorting - use COLLATE for case-insensitive name sorting
    const sortField = CUSTOMER_SORTABLE_FIELDS.find((field) => field === sortBy) ?? 'name';
    if (sortField === 'name') {
      queryBuilder.orderBy('customer.name', sortOrder, 'NULLS LAST');
    } else {
      queryBuilder.orderBy(`customer.${sortField}`, sortOrder);
    }

    const shouldPaginate = page !== undefined && limit !== undefined;
    applyPagination(queryBuilder, page, limit);

    const [customers, total] = await queryBuilder.getManyAndCount();

    return {
      data: customers.map((customer) => this.mapToResponseDto(customer)),
      meta: {
        total,
        ...(shouldPaginate && { page, limit }),
      },
    };
  }

  async searchGlobal(query: string, user: any): Promise<GlobalSearchResultDto[]> {
    if (!canSearchCustomers(user.role)) return [];

    const trimmed = query.trim();
    const q = trimmed.toLowerCase();

    const customers = await this.customerRepository
      .createQueryBuilder('customer')
      .where('customer.deletedAt IS NULL')
      .andWhere('(customer.name ILIKE :q OR customer.phone ILIKE :q)', {
        q: `%${trimmed}%`,
      })
      .take(SEARCH_CANDIDATE_LIMIT)
      .getMany();

    if (customers.length > 0) {
      return customers.map((customer) => this.mapCustomer(customer, q, false));
    }

    const fuzzyResults = await this.customerRepository
      .createQueryBuilder('customer')
      .addSelect('GREATEST(similarity(customer.name, :q), similarity(customer.phone, :q))', 'sim')
      .where('customer.deletedAt IS NULL')
      // Threshold is pg_trgm's similarity limit, default 0.3 — read it with
      // show_limit(). PostgreSQL 18 removed the pg_trgm.similarity_threshold
      // GUC name; the limit and its default are unchanged.
      .andWhere('(customer.name % :q OR customer.phone % :q)')
      .orderBy('sim', 'DESC')
      .setParameter('q', trimmed)
      .take(SEARCH_CANDIDATE_LIMIT)
      .getMany();

    return fuzzyResults.map((customer) => this.mapCustomer(customer, q, true));
  }

  private mapCustomer(customer: Customer, q: string, fuzzy: boolean): GlobalSearchResultDto {
    const name = customer.name?.toLowerCase() ?? '';
    const phone = customer.phone?.toLowerCase() ?? '';
    const baseScore = fuzzy
      ? SCORE_FUZZY
      : phone && phone === q
        ? SCORE_EXACT_CODE
        : phone && phone.startsWith(q)
          ? SCORE_STARTSWITH_CODE
          : name === q
            ? SCORE_EXACT_NAME
            : name.startsWith(q)
              ? SCORE_STARTSWITH_NAME
              : SCORE_CONTAINS;

    return {
      type: 'customer',
      id: customer.id,
      label: customer.name,
      description: customer.phone ?? undefined,
      route: `/sales/customers/${customer.id}`,
      score:
        baseScore +
        BOOST_CUSTOMER +
        (baseScore === SCORE_EXACT_CODE || baseScore === SCORE_EXACT_NAME ? BOOST_EXACT_MATCH : 0),
    };
  }

  async findDeleted(query: QueryCustomersDto) {
    const { search, sortBy = 'name', sortOrder = 'ASC' } = query;

    const queryBuilder = this.customerRepository
      .createQueryBuilder('customer')
      .where('customer.deletedAt IS NOT NULL')
      .withDeleted(); // Include soft-deleted records

    // Add search conditions
    if (search) {
      queryBuilder.andWhere('(customer.name ILIKE :search OR customer.phone ILIKE :search)', {
        search: `%${search}%`,
      });
    }

    // Add case-insensitive ordering for name field, regular ordering for others
    const sortField = CUSTOMER_SORTABLE_FIELDS.find((field) => field === sortBy) ?? 'name';
    if (sortField === 'name') {
      queryBuilder.orderBy('UPPER(customer.name)', sortOrder);
    } else {
      queryBuilder.orderBy(`customer.${sortField}`, sortOrder);
    }

    const customers = await queryBuilder.getMany();

    return {
      data: customers.map((customer) => this.mapToResponseDto(customer)),
      total: customers.length,
    };
  }

  async findSummaries(): Promise<CustomerSummaryDto[]> {
    const customers = await this.customerRepository.find({
      where: { isActive: true },
      order: { name: 'ASC' },
      select: { id: true, name: true, phone: true },
    });

    return customers.map((customer) => ({
      id: customer.id,
      name: customer.name,
      phone: customer.phone,
    }));
  }

  async findById(id: string): Promise<CustomerResponseDto> {
    const customer = await this.customerRepository.findOne({
      where: { id },
      relations: { priceList: true },
    });
    if (!customer) {
      throw new NotFoundException('Customer not found');
    }
    return this.mapToResponseDto(customer);
  }

  async findBySlug(slug: string): Promise<CustomerResponseDto> {
    const customer = await this.customerRepository.findOne({
      where: { slug },
      relations: { priceList: true },
    });
    if (!customer) throw new NotFoundException(`Customer with slug '${slug}' not found`);
    return this.mapToResponseDto(customer);
  }

  async update(
    id: string,
    updateCustomerDto: UpdateCustomerDto,
    userId?: string,
    username?: string,
  ): Promise<CustomerResponseDto> {
    const customer = await this.customerRepository.findOne({ where: { id } });
    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    // Store old values for audit
    const oldValues = {
      name: customer.name,
      phone: customer.phone,
      type: customer.type,
      priceListId: customer.priceListId,
    };

    // Check for phone number duplicate if phone is being updated
    if (updateCustomerDto.phone && updateCustomerDto.phone !== customer.phone) {
      await this.validatePhoneUniqueness(updateCustomerDto.phone, id);
    }

    const nameChanged =
      updateCustomerDto.name !== undefined && updateCustomerDto.name !== customer.name;
    Object.assign(customer, updateCustomerDto);
    if (nameChanged) {
      customer.slug = await this.generateUniqueSlug(customer.name, id);
    }
    const savedCustomer = await this.customerRepository.save(customer);

    // Log audit trail
    await this.auditLogService.log(
      'UPDATE',
      'Customer',
      `Updated customer: ${savedCustomer.name}`,
      {
        entityId: savedCustomer.id,
        userId: userId || 'system',
        username,
        oldValues,
        newValues: {
          name: savedCustomer.name,
          phone: savedCustomer.phone,
          type: savedCustomer.type,
          priceListId: savedCustomer.priceListId,
        },
      },
    );

    return this.mapToResponseDto(savedCustomer);
  }

  async restore(id: string, userId?: string, username?: string): Promise<CustomerResponseDto> {
    // Find the customer first to validate
    const customer = await this.customerRepository.findOne({
      where: { id },
      withDeleted: true,
    });

    // Use standardized validation
    ValidationUtil.validateForRestore(customer, 'Customer', id);

    // Restore the customer
    await this.customerRepository.restore(id);

    // Log audit trail
    await this.auditLogService.log('RESTORE', 'Customer', `Restored customer: ${customer.name}`, {
      entityId: id,
      userId: userId || 'system',
      username,
      newValues: {
        name: customer.name,
        phone: customer.phone,
      },
    });

    return this.mapToResponseDto(customer);
  }

  // Credit management methods removed - fields don't exist in current entity

  async getSalesHistory(customerId: string) {
    await this.findCustomerEntity(customerId); // Verify customer exists

    const orders = await this.salesOrderRepository.find({
      where: { customerId },
      order: { orderDate: 'DESC' },
      relations: { items: true },
    });

    return {
      customerId,
      orders: orders.map((order) => ({
        id: order.id,
        orderNumber: order.orderNumber,
        orderDate: order.orderDate,
        isFulfilled: order.isFulfilled,
        isPaid: order.isPaidInFull,
        totalAmount: Number(order.totalAmount),
        itemsCount: order.items?.length || 0,
      })),
    };
  }

  async getCustomerStatistics(customerId: string) {
    const customer = await this.findCustomerEntity(customerId);

    // Get order statistics
    const orderStats = await this.salesOrderRepository
      .createQueryBuilder('order')
      .where('order.customerId = :customerId', { customerId })
      .andWhere('order.deletedAt IS NULL')
      .andWhere('order.isFulfilled = :isFulfilled', { isFulfilled: true })
      .select([
        'COUNT(*) as totalorders',
        'COALESCE(AVG(order.totalAmount), 0) as averageordervalue',
        'COALESCE(SUM(order.totalAmount), 0) as totalsales',
        'MIN(order.orderDate) as firstorderdate',
        'MAX(order.orderDate) as lastorderdate',
      ])
      .getRawOne();

    // Payment statistics temporarily disabled (Payment entity not available)
    const paymentStats = {
      totalPayments: 0,
      totalPaid: 0,
      averagePaymentAmount: 0,
      lastPaymentDate: null,
    };

    return {
      customerId,
      customer: {
        name: customer.name,
      },
      orders: {
        totalOrders: parseInt(orderStats.totalorders) || 0,
        totalSales: parseFloat(orderStats.totalsales) || 0,
        averageOrderValue: parseFloat(orderStats.averageordervalue) || 0,
        firstOrderDate: orderStats.firstorderdate,
        lastOrderDate: orderStats.lastorderdate,
      },
      payments: {
        totalPayments: paymentStats.totalPayments || 0,
        totalPaid: paymentStats.totalPaid || 0,
        averagePaymentAmount: paymentStats.averagePaymentAmount || 0,
        lastPaymentDate: paymentStats.lastPaymentDate,
      },
    };
  }

  async bulkRestore(
    customerIds: string[],
    userId?: string,
    username?: string,
  ): Promise<BulkOperationResponse> {
    if (!customerIds || customerIds.length === 0) {
      return BulkOperationUtil.createResponse('restored', 'customer', 0, []);
    }

    const failedItems = [];
    let successCount = 0;

    for (const customerId of customerIds) {
      try {
        // Verify customer exists and is deleted
        const customer = await this.customerRepository.findOne({
          where: { id: customerId },
          withDeleted: true,
        });

        // Use standardized validation
        try {
          ValidationUtil.validateForRestore(customer, 'Customer', customerId);
        } catch (error) {
          BulkOperationUtil.addFailure(failedItems, customerId, error.message, 'VALIDATION_ERROR');
          continue;
        }

        await this.customerRepository.restore(customerId);
        await this.auditLogService.log(
          'RESTORE',
          'Customer',
          `Restored customer: ${customer.name}`,
          {
            entityId: customerId,
            userId: userId || 'system',
            username,
            newValues: {
              name: customer.name,
              phone: customer.phone,
            },
          },
        );
        successCount++;
      } catch (error) {
        BulkOperationUtil.addFailure(failedItems, customerId, error.message, 'UNEXPECTED_ERROR');
      }
    }

    return BulkOperationUtil.createResponse('restored', 'customer', successCount, failedItems);
  }

  async bulkPermanentDelete(
    customerIds: string[],
    userId?: string,
    username?: string,
  ): Promise<BulkOperationResponse> {
    if (!customerIds || customerIds.length === 0) {
      return BulkOperationUtil.createResponse('permanently deleted', 'customer', 0, []);
    }

    const failedItems = [];
    let successCount = 0;

    for (const customerId of customerIds) {
      try {
        // Verify customer exists and is soft-deleted
        const customer = await this.customerRepository.findOne({
          where: { id: customerId },
          withDeleted: true,
        });

        // Use standardized validation
        try {
          ValidationUtil.validateForPermanentDelete(customer, 'Customer', customerId);
        } catch (error) {
          BulkOperationUtil.addFailure(failedItems, customerId, error.message, 'VALIDATION_ERROR');
          continue;
        }

        // Check for active references with comprehensive dependency checking
        // Only check for non-soft-deleted records since soft-deleted records can coexist
        const orderCount = await this.salesOrderRepository.count({
          where: { customerId },
          withDeleted: false,
        });

        if (orderCount > 0) {
          BulkOperationUtil.addFailure(
            failedItems,
            customerId,
            `Cannot permanently delete customer '${customer.name}' (${customer.id}) due to ${orderCount} active order${orderCount > 1 ? 's' : ''}. Complete all business transactions first.`,
            'DEPENDENCY_ERROR',
            {
              customerName: customer.name,
              dependencies: {
                orders: orderCount,
              },
            },
          );
          continue;
        }

        // Before deleting customer, permanently delete any soft-deleted related records
        // This prevents foreign key constraint violations
        await Promise.all([
          // Delete soft-deleted sales orders
          this.salesOrderRepository
            .createQueryBuilder()
            .delete()
            .where('customerId = :customerId', { customerId })
            .andWhere('deletedAt IS NOT NULL')
            .execute(),
        ]);

        // Log audit trail for permanent delete
        await this.auditLogService.log(
          'PERMANENT_DELETE',
          'Customer',
          `Permanently deleted customer: ${customer.name}`,
          {
            entityId: customerId,
            userId: userId || 'system',
            username,
            oldValues: {
              name: customer.name,
              phone: customer.phone,
              type: customer.type,
              priceListId: customer.priceListId,
            },
          },
        );

        // Perform hard delete
        await this.customerRepository.delete(customerId);
        successCount++;
      } catch (error) {
        BulkOperationUtil.addFailure(failedItems, customerId, error.message, 'UNEXPECTED_ERROR');
      }
    }

    return BulkOperationUtil.createResponse(
      'permanently deleted',
      'customer',
      successCount,
      failedItems,
    );
  }

  @Transactional('Customer permanent deletion with financial integrity validation')
  async permanentDelete(id: string, userId?: string, username?: string): Promise<void> {
    // Verify customer exists and is soft-deleted
    console.log(`Looking for customer with ID: ${id}`);
    const customer = await this.customerRepository.findOne({
      where: { id },
      withDeleted: true,
    });
    console.log(
      `Found customer:`,
      customer
        ? {
            id: customer.id,
            name: customer.name,
            deletedAt: customer.deletedAt,
          }
        : 'null',
    );

    // Use standardized validation
    ValidationUtil.validateForPermanentDelete(customer, 'Customer', id);

    // Check for active references with comprehensive dependency checking
    // Only check for non-soft-deleted records since soft-deleted records can coexist
    const orderCount = await this.salesOrderRepository.count({
      where: { customerId: id },
      withDeleted: false,
    });

    if (orderCount > 0) {
      const errorResponse = {
        message: `Cannot permanently delete customer '${customer.name}' due to active business relationships`,
        code: 'PERMANENT_DELETE_PREVENTED_BY_DEPENDENCIES',
        customerName: customer.name,
        customerId: customer.id,
        dependencies: {
          orders: orderCount,
        },
        details: `Customer '${customer.name}' (${customer.id}) has ${orderCount} active order${orderCount > 1 ? 's' : ''}. Permanent deletion is blocked to preserve financial audit trails and data integrity.`,
        suggestions: [
          'Complete and archive all pending orders first',
          'Consider using soft delete instead if you need to hide the customer',
        ],
      };

      // Use BadRequestException with the full error object
      throw new BadRequestException(errorResponse);
    }

    // Validate financial consistency before deletion
    // Temporarily skip financial consistency check for soft-deleted customers
    // TODO: Fix TransactionManager to properly handle soft-deleted customers
    try {
      const consistencyCheck = await this.transactionManager.validateFinancialConsistency(id);
      if (!consistencyCheck.isValid) {
        // Only fail if the customer was not found due to other reasons
        if (consistencyCheck.discrepancies.some((d) => d.includes('Customer not found'))) {
          console.log('Skipping financial consistency check for soft-deleted customer');
        } else {
          throw new BadRequestException(
            `Customer financial data inconsistency detected: ${consistencyCheck.discrepancies.join(', ')}`,
          );
        }
      }
    } catch (error) {
      console.log('Error in financial consistency check, proceeding with deletion:', error.message);
    }

    // Before deleting customer, permanently delete any soft-deleted related records
    // This prevents foreign key constraint violations
    await Promise.all([
      // Delete soft-deleted sales orders
      this.salesOrderRepository
        .createQueryBuilder()
        .delete()
        .where('customerId = :customerId', { customerId: id })
        .andWhere('deletedAt IS NOT NULL')
        .execute(),
    ]);

    // Log audit trail for permanent delete
    await this.auditLogService.log(
      'PERMANENT_DELETE',
      'Customer',
      `Permanently deleted customer: ${customer.name}`,
      {
        entityId: id,
        userId: userId || 'system',
        username,
        oldValues: {
          name: customer.name,
          phone: customer.phone,
          type: customer.type,
          priceListId: customer.priceListId,
        },
      },
    );

    // Perform hard delete
    await this.customerRepository.delete(id);
  }

  /**
   * Validate and correct customer financial totals
   * Use for data integrity maintenance
   */
  async validateCustomerFinancials(
    customerId: string,
  ): Promise<{ isValid: boolean; discrepancies: string[] }> {
    const customer = await this.customerRepository.findOne({
      where: { id: customerId },
    });
    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    return this.transactionManager.validateFinancialConsistency(customerId);
  }

  /**
   * Correct customer financial totals based on actual sales data
   * Use when data inconsistencies are detected
   */
  @Transactional('Customer financial totals correction')
  async correctCustomerFinancials(customerId: string): Promise<CustomerResponseDto> {
    const customer = await this.customerRepository.findOne({
      where: { id: customerId },
    });
    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    await this.transactionManager.correctCustomerTotals(customerId);

    // Return updated customer
    const updatedCustomer = await this.customerRepository.findOne({
      where: { id: customerId },
    });
    return this.mapToResponseDto(updatedCustomer);
  }

  /**
   * Update customer metrics for a specific customer based on their sales orders
   */
  async updateCustomerMetrics(customerId: string): Promise<void> {
    const customer = await this.customerRepository.findOne({
      where: { id: customerId },
      withDeleted: true,
    });
    if (!customer) {
      throw new NotFoundException(
        `Customer not found for metric update (customerId: ${customerId}) — possible orphaned order`,
      );
    }

    // Calculate actual totals from sales orders
    const orderStats = await this.salesOrderRepository
      .createQueryBuilder('order')
      .where('order.customerId = :customerId', { customerId })
      .andWhere('order.deletedAt IS NULL')
      .andWhere('order.isFulfilled = :isFulfilled', { isFulfilled: true })
      .select([
        'COUNT(*) as totalorders',
        'COALESCE(SUM(order.totalAmount), 0) as totalsales',
        'MIN(order.orderDate) as firstorderdate',
        'MAX(order.orderDate) as lastorderdate',
      ])
      .getRawOne();

    customer.totalOrders = parseInt(orderStats.totalorders) || 0;
    customer.totalSales = parseFloat(orderStats.totalsales) || 0;
    customer.firstPurchaseDate = orderStats.firstorderdate;
    customer.lastPurchaseDate = orderStats.lastorderdate;

    await this.customerRepository.save(customer);
  }

  // Internal helper methods

  private async validatePhoneUniqueness(phone: string, excludeId?: string): Promise<void> {
    // Normalize phone number by removing common formatting characters
    const normalizedPhone = phone.replace(/[\s\-\(\)\+]/g, '');

    if (!normalizedPhone) {
      return; // Skip validation for empty phone numbers
    }

    // Get ALL customers (including soft-deleted) to check phone duplicates
    const queryBuilder = this.customerRepository
      .createQueryBuilder('customer')
      .withDeleted() // Include soft-deleted records
      .where('customer.phone IS NOT NULL')
      .andWhere('customer.phone != :empty', { empty: '' });

    // Exclude current customer when updating
    if (excludeId) {
      queryBuilder.andWhere('customer.id != :excludeId', { excludeId });
    }

    const existingCustomers = await queryBuilder.getMany();

    // Check for normalized phone number matches
    const duplicateCustomer = existingCustomers.find((customer) => {
      if (!customer.phone) return false;
      const existingNormalizedPhone = customer.phone.replace(/[\s\-\(\)\+]/g, '');
      return existingNormalizedPhone === normalizedPhone;
    });

    if (duplicateCustomer) {
      throw new ConflictException(
        `A customer with phone number "${phone}" already exists (Customer: ${duplicateCustomer.name})`,
      );
    }
  }

  private async findCustomerEntity(id: string): Promise<Customer> {
    const customer = await this.customerRepository.findOne({
      where: { id },
      relations: { priceList: true },
    });
    if (!customer) {
      throw new NotFoundException('Customer not found');
    }
    return customer;
  }

  private async generateUniqueSlug(name: string, excludeId?: string): Promise<string> {
    const base = generateBaseSlug(name);
    let slug = base;
    let counter = 1;

    while (true) {
      const existing = await this.customerRepository.findOne({
        where: { slug },
        withDeleted: true,
      });
      if (!existing || existing.id === excludeId) return slug;
      slug = `${base}-${counter++}`;
    }
  }

  private mapToResponseDto(customer: Customer): CustomerResponseDto {
    return {
      id: customer.id,
      slug: customer.slug,
      type: customer.type,
      name: customer.name,
      phone: customer.phone,
      email: customer.email,
      billingStreetAddress: customer.billingStreetAddress,
      billingCity: customer.billingCity,
      billingState: customer.billingState,
      billingPostalCode: customer.billingPostalCode,
      billingCountry: customer.billingCountry,
      shippingStreetAddress: customer.shippingStreetAddress,
      shippingCity: customer.shippingCity,
      shippingState: customer.shippingState,
      shippingPostalCode: customer.shippingPostalCode,
      shippingCountry: customer.shippingCountry,
      isActive: customer.isActive,
      priceListId: customer.priceListId,
      priceList: customer.priceList
        ? {
            id: customer.priceList.id,
            name: customer.priceList.name,
            code: customer.priceList.code,
            isDefault: customer.priceList.isDefault,
            isActive: customer.priceList.isActive,
          }
        : undefined,
      totalSales: Number(customer.totalSales),
      totalOrders: customer.totalOrders,
      lastPurchaseDate: customer.lastPurchaseDate,
      firstPurchaseDate: customer.firstPurchaseDate,
      notes: customer.notes,
      createdAt: customer.createdAt,
      updatedAt: customer.updatedAt,
      deletedAt: customer.deletedAt,
      averageOrderValue: customer.averageOrderValue,
    };
  }
}
