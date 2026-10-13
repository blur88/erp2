import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, FindOptionsWhere } from 'typeorm';
import { applyPagination } from '../../../common/pagination/apply-pagination';
import { Customer } from '../../../database/entities/customer.entity';
import { SalesOrder, SalesOrderStatus } from '../../../database/entities/sales-order.entity';
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
import { recalculateCustomerMetrics } from './customer-metrics';
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

/** Derived from fulfilled orders by recalculateCustomerMetrics; never written by an edit. */
const CUSTOMER_METRIC_COLUMNS: ReadonlySet<string> = new Set([
  'totalOrders',
  'totalSales',
  'firstPurchaseDate',
  'lastPurchaseDate',
]);

@Injectable()
export class CustomerService {
  constructor(
    @InjectRepository(Customer)
    private readonly customerRepository: Repository<Customer>,
    @InjectRepository(SalesOrder)
    private readonly salesOrderRepository: Repository<SalesOrder>,
    private readonly auditLogService: AuditLogService,
  ) {}

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

    // Write only the columns this edit supplies. save(customer) would compare
    // the entity loaded above with the row as it is now and write back every
    // column that differs, including the four order metrics: a fulfilment that
    // committed in between would have its recalculated metrics replaced by the
    // values this request read (#1355). The metrics are never part of an edit.
    const changes: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(updateCustomerDto)) {
      if (value !== undefined && !CUSTOMER_METRIC_COLUMNS.has(key)) {
        changes[key] = value;
      }
    }
    if (nameChanged) {
      changes.slug = await this.generateUniqueSlug(updateCustomerDto.name, id);
    }
    if (Object.keys(changes).length > 0) {
      await this.customerRepository.update(id, changes);
    }
    const savedCustomer = await this.customerRepository.findOne({ where: { id } });
    if (!savedCustomer) {
      throw new NotFoundException('Customer not found');
    }

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
      .andWhere('order.status = :status', { status: SalesOrderStatus.FULFILLED })
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

  /**
   * Recalculate a customer's stored order metrics from their fulfilled sales
   * orders. Fulfil and unfulfil do this inside their own transaction
   * (recalculateCustomerMetrics); this is the on-demand route.
   */
  async updateCustomerMetrics(customerId: string): Promise<void> {
    const found = await this.customerRepository.manager.transaction((manager) =>
      recalculateCustomerMetrics(manager, customerId),
    );
    if (!found) {
      throw new NotFoundException(
        `Customer not found for metric update (customerId: ${customerId}) — possible orphaned order`,
      );
    }
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
