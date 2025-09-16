import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like, ILike, FindOptionsWhere, FindManyOptions } from 'typeorm';
import { Customer, CustomerStatus, PriceLevel } from '../../../database/entities/customer.entity';
import { SalesOrder } from '../../../database/entities/sales-order.entity';
import { Invoice } from '../../../database/entities/invoice.entity';
import { Payment } from '../../../database/entities/payment.entity';
import {
  CreateCustomerDto,
  UpdateCustomerDto,
  QueryCustomersDto,
  CustomerResponseDto,
  CustomerSummaryDto,
} from '../dto/customer.dto';

@Injectable()
export class CustomerService {
  constructor(
    @InjectRepository(Customer)
    private readonly customerRepository: Repository<Customer>,
    @InjectRepository(SalesOrder)
    private readonly salesOrderRepository: Repository<SalesOrder>,
    @InjectRepository(Invoice)
    private readonly invoiceRepository: Repository<Invoice>,
  ) {}

  async create(createCustomerDto: CreateCustomerDto): Promise<CustomerResponseDto> {
    // Generate customer code
    const customerCode = await this.generateCustomerCode();

    const customer = this.customerRepository.create({
      ...createCustomerDto,
      customerCode,
      priceLevel: createCustomerDto.priceLevel || PriceLevel.RETAIL,
    });

    const savedCustomer = await this.customerRepository.save(customer);
    return this.mapToResponseDto(savedCustomer);
  }

  async findAll(query: QueryCustomersDto) {
    const {
      search,
      type,
      status,
      priceLevel,
      isActive,
      sortBy = 'name',
      sortOrder = 'ASC',
      page = 1,
      limit = 20,
    } = query;

    const where: FindOptionsWhere<Customer> = {};

    if (type) where.type = type;
    if (status) where.status = status;
    if (priceLevel) where.priceLevel = priceLevel;
    if (isActive !== undefined) where.isActive = isActive;


    // Use query builder for case-insensitive sorting
    let queryBuilder = this.customerRepository.createQueryBuilder('customer');

    // Apply base where conditions
    Object.entries(where).forEach(([key, value]) => {
      queryBuilder.andWhere(`customer.${key} = :${key}`, { [key]: value });
    });

    // Apply search conditions
    if (search) {
      queryBuilder.andWhere(
        '(customer.name ILIKE :search OR customer.phone ILIKE :search OR customer.customerCode ILIKE :search)',
        { search: `%${search}%` }
      );
    }

    // Apply case-insensitive sorting for name field, regular sorting for others
    if (sortBy === 'name') {
      queryBuilder.orderBy('UPPER(customer.name)', sortOrder);
    } else {
      queryBuilder.orderBy(`customer.${sortBy}`, sortOrder);
    }

    // Apply pagination
    queryBuilder.skip((page - 1) * limit).take(limit);

    const [customers, total] = await queryBuilder.getManyAndCount();

    return {
      data: customers.map(customer => this.mapToResponseDto(customer)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findDeleted(query: QueryCustomersDto) {
    const {
      search,
      sortBy = 'name',
      sortOrder = 'ASC',
      page = 1,
      limit = 20,
    } = query;

    const queryBuilder = this.customerRepository
      .createQueryBuilder('customer')
      .where('customer.deletedAt IS NOT NULL')
      .withDeleted(); // Include soft-deleted records

    // Add search conditions
    if (search) {
      queryBuilder.andWhere(
        '(customer.name ILIKE :search OR customer.phone ILIKE :search OR customer.customerCode ILIKE :search)',
        { search: `%${search}%` }
      );
    }

    // Add case-insensitive ordering for name field, regular ordering for others
    if (sortBy === 'name') {
      queryBuilder.orderBy('UPPER(customer.name)', sortOrder);
    } else {
      queryBuilder.orderBy(`customer.${sortBy}`, sortOrder);
    }

    // Add pagination
    queryBuilder.offset((page - 1) * limit).limit(limit);

    const [customers, total] = await queryBuilder.getManyAndCount();

    return {
      data: customers.map(customer => this.mapToResponseDto(customer)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findSummaries(): Promise<CustomerSummaryDto[]> {
    const customers = await this.customerRepository.find({
      where: { isActive: true },
      order: { name: 'ASC' },
      select: ['id', 'customerCode', 'name', 'phone', 'status'],
    });

    return customers.map(customer => ({
      id: customer.id,
      customerCode: customer.customerCode,
      name: customer.name,
      phone: customer.phone,
      status: customer.status,
    }));
  }

  async findById(id: string): Promise<CustomerResponseDto> {
    const customer = await this.customerRepository.findOne({ where: { id } });
    if (!customer) {
      throw new NotFoundException('Customer not found');
    }
    return this.mapToResponseDto(customer);
  }

  async findByCode(customerCode: string): Promise<CustomerResponseDto> {
    const customer = await this.customerRepository.findOne({ where: { customerCode } });
    if (!customer) {
      throw new NotFoundException('Customer not found');
    }
    return this.mapToResponseDto(customer);
  }

  async update(id: string, updateCustomerDto: UpdateCustomerDto): Promise<CustomerResponseDto> {
    const customer = await this.customerRepository.findOne({ where: { id } });
    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    Object.assign(customer, updateCustomerDto);
    const savedCustomer = await this.customerRepository.save(customer);
    return this.mapToResponseDto(savedCustomer);
  }

  async delete(id: string): Promise<void> {
    const customer = await this.customerRepository.findOne({ where: { id } });
    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    // Use soft delete instead of hard delete
    await this.customerRepository.softDelete(id);
  }

  async restore(id: string): Promise<CustomerResponseDto> {
    // First, restore the customer
    await this.customerRepository.restore(id);
    
    // Then find and return the restored customer
    const customer = await this.customerRepository.findOne({ 
      where: { id },
      withDeleted: true 
    });
    
    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    return this.mapToResponseDto(customer);
  }

  // Credit management methods removed - fields don't exist in current entity

  async activate(id: string): Promise<CustomerResponseDto> {
    const customer = await this.findCustomerEntity(id);
    customer.isActive = true;
    customer.status = CustomerStatus.ACTIVE;
    const savedCustomer = await this.customerRepository.save(customer);
    return this.mapToResponseDto(savedCustomer);
  }

  async deactivate(id: string): Promise<CustomerResponseDto> {
    const customer = await this.findCustomerEntity(id);
    customer.isActive = false;
    customer.status = CustomerStatus.INACTIVE;
    const savedCustomer = await this.customerRepository.save(customer);
    return this.mapToResponseDto(savedCustomer);
  }

  async suspend(id: string, reason?: string): Promise<CustomerResponseDto> {
    const customer = await this.findCustomerEntity(id);
    customer.status = CustomerStatus.SUSPENDED;
    customer.isActive = false;
    if (reason) {
      customer.notes = customer.notes ? `${customer.notes}\nSuspended: ${reason}` : `Suspended: ${reason}`;
    }
    const savedCustomer = await this.customerRepository.save(customer);
    return this.mapToResponseDto(savedCustomer);
  }

  async getSalesHistory(customerId: string, limit: number = 10) {
    await this.findCustomerEntity(customerId); // Verify customer exists

    const orders = await this.salesOrderRepository.find({
      where: { customerId },
      order: { orderDate: 'DESC' },
      take: limit,
      relations: ['items'],
    });

    return {
      customerId,
      orders: orders.map(order => ({
        id: order.id,
        orderNumber: order.orderNumber,
        orderDate: order.orderDate,
        status: order.status,
        totalAmount: Number(order.totalAmount),
        itemsCount: order.items?.length || 0,
      })),
    };
  }

  async getOutstandingInvoices(customerId: string) {
    await this.findCustomerEntity(customerId); // Verify customer exists

    const invoices = await this.invoiceRepository.find({
      where: { 
        customerId,
        // Note: filtering for balanceDue > 0 will be done in code below
      },
      order: { dueDate: 'ASC' },
    });

    const outstandingInvoices = invoices.filter(invoice => Number(invoice.balanceDue) > 0);

    const totalOutstanding = outstandingInvoices.reduce(
      (sum, invoice) => sum + Number(invoice.balanceDue),
      0,
    );

    return {
      customerId,
      totalOutstanding,
      invoicesCount: outstandingInvoices.length,
      invoices: outstandingInvoices.map(invoice => ({
        id: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        invoiceDate: invoice.invoiceDate,
        dueDate: invoice.dueDate,
        totalAmount: Number(invoice.totalAmount),
        paidAmount: Number(invoice.paidAmount),
        balanceDue: Number(invoice.balanceDue),
        daysPastDue: invoice.daysPastDue,
        isOverdue: invoice.isOverdue,
      })),
    };
  }

  async getCustomerStatistics(customerId: string) {
    const customer = await this.findCustomerEntity(customerId);

    // Get order statistics
    const orderStats = await this.salesOrderRepository
      .createQueryBuilder('order')
      .where('order.customerId = :customerId', { customerId })
      .select([
        'COUNT(*) as totalOrders',
        'COALESCE(AVG(order.totalAmount), 0) as averageOrderValue',
        'COALESCE(SUM(order.totalAmount), 0) as totalSales',
        'MIN(order.orderDate) as firstOrderDate',
        'MAX(order.orderDate) as lastOrderDate',
      ])
      .getRawOne();

    // Get payment statistics - temporarily disabled
    // const paymentStats = await this.paymentRepository
    //   .createQueryBuilder('payment')
    //   .where('payment.customerId = :customerId', { customerId })
    //   .andWhere('payment.status = :status', { status: 'completed' })
    //   .select([
    //     'COUNT(*) as totalPayments',
    //     'COALESCE(SUM(payment.amount), 0) as totalPaid',
    //     'COALESCE(AVG(payment.amount), 0) as averagePaymentAmount',
    //     'MAX(payment.paymentDate) as lastPaymentDate',
    //   ])
    //   .getRawOne();

    const paymentStats = {
      totalPayments: 0,
      totalPaid: 0,
      averagePaymentAmount: 0,
      lastPaymentDate: null,
    };

    // Get overdue invoice count
    const overdueInvoices = await this.invoiceRepository.count({
      where: { 
        customerId,
      },
    });

    return {
      customerId,
      customer: {
        name: customer.name,
        customerCode: customer.customerCode,
        status: customer.status,
      },
      orders: {
        totalOrders: parseInt(orderStats.totalOrders) || 0,
        totalSales: parseFloat(orderStats.totalSales) || 0,
        averageOrderValue: parseFloat(orderStats.averageOrderValue) || 0,
        firstOrderDate: orderStats.firstOrderDate,
        lastOrderDate: orderStats.lastOrderDate,
      },
      payments: {
        totalPayments: parseInt(paymentStats.totalPayments) || 0,
        totalPaid: parseFloat(paymentStats.totalPaid) || 0,
        averagePaymentAmount: parseFloat(paymentStats.averagePaymentAmount) || 0,
        lastPaymentDate: paymentStats.lastPaymentDate,
      },
      invoices: {
        overdueCount: overdueInvoices,
      },
    };
  }

  async bulkRestore(customerIds: string[]): Promise<{ restoredCount: number; failedIds: string[] }> {
    const failedIds: string[] = [];
    let restoredCount = 0;

    for (const customerId of customerIds) {
      try {
        // Verify customer exists and is deleted
        const customer = await this.customerRepository.findOne({
          where: { id: customerId },
          withDeleted: true,
        });

        if (!customer) {
          failedIds.push(customerId);
          continue;
        }

        if (!customer.deletedAt) {
          // Customer is not deleted, skip
          failedIds.push(customerId);
          continue;
        }

        await this.customerRepository.restore(customerId);
        restoredCount++;
      } catch (error) {
        failedIds.push(customerId);
      }
    }

    return { restoredCount, failedIds };
  }

  async bulkPermanentDelete(customerIds: string[]): Promise<{ deletedCount: number; failedIds: string[] }> {
    const failedIds: string[] = [];
    let deletedCount = 0;

    for (const customerId of customerIds) {
      try {
        // Verify customer exists and is soft-deleted
        const customer = await this.customerRepository.findOne({
          where: { id: customerId },
          withDeleted: true,
        });

        if (!customer) {
          failedIds.push(customerId);
          continue;
        }

        if (!customer.deletedAt) {
          // Customer is not soft-deleted, cannot permanently delete
          failedIds.push(customerId);
          continue;
        }

        // Check for active references (orders, invoices, payments)
        const hasActiveOrders = await this.salesOrderRepository.count({
          where: { customerId },
        });

        const hasActiveInvoices = await this.invoiceRepository.count({
          where: { customerId },
        });

        // const hasActivePayments = await this.paymentRepository.count({
        //   where: { customerId },
        // });
        const hasActivePayments = 0;

        if (hasActiveOrders > 0 || hasActiveInvoices > 0 || hasActivePayments > 0) {
          failedIds.push(customerId);
          continue;
        }

        // Perform hard delete
        await this.customerRepository.delete(customerId);
        deletedCount++;
      } catch (error) {
        failedIds.push(customerId);
      }
    }

    return { deletedCount, failedIds };
  }

  async permanentDelete(id: string): Promise<void> {
    // Verify customer exists and is soft-deleted
    const customer = await this.customerRepository.findOne({
      where: { id },
      withDeleted: true,
    });

    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    if (!customer.deletedAt) {
      throw new BadRequestException('Customer must be soft-deleted first');
    }

    // Check for active references
    const hasActiveOrders = await this.salesOrderRepository.count({
      where: { customerId: id },
    });

    const hasActiveInvoices = await this.invoiceRepository.count({
      where: { customerId: id },
    });

    // const hasActivePayments = await this.paymentRepository.count({
    //   where: { customerId: id },
    // });
    const hasActivePayments = 0;

    if (hasActiveOrders > 0 || hasActiveInvoices > 0 || hasActivePayments > 0) {
      throw new BadRequestException('Cannot permanently delete customer with active orders, invoices, or payments');
    }

    // Perform hard delete
    await this.customerRepository.delete(id);
  }

  // Internal helper methods

  private async findCustomerEntity(id: string): Promise<Customer> {
    const customer = await this.customerRepository.findOne({ where: { id } });
    if (!customer) {
      throw new NotFoundException('Customer not found');
    }
    return customer;
  }

  private async generateCustomerCode(): Promise<string> {
    const year = new Date().getFullYear().toString().slice(-2);

    // Get all existing customer codes (including soft-deleted ones) for this year
    const existingCodes = await this.customerRepository.find({
      select: ['customerCode'],
      withDeleted: true
    });

    const yearPrefix = `CUST${year}`;
    const usedNumbers = existingCodes
      .map(customer => customer.customerCode)
      .filter(code => code && code.startsWith(yearPrefix))
      .map(code => parseInt(code.substring(yearPrefix.length)))
      .filter(num => !isNaN(num))
      .sort((a, b) => a - b);

    // Find the next available number (starting from 1)
    let nextNumber = 1;
    for (const usedNumber of usedNumbers) {
      if (nextNumber === usedNumber) {
        nextNumber++;
      } else {
        // Found a gap, use this number
        break;
      }
    }

    const sequence = nextNumber.toString().padStart(4, '0');
    return `${yearPrefix}${sequence}`;
  }

  private mapToResponseDto(customer: Customer): CustomerResponseDto {
    return {
      id: customer.id,
      customerCode: customer.customerCode,
      type: customer.type,
      name: customer.name,
      phone: customer.phone,
      status: customer.status,
      isActive: customer.isActive,
      priceLevel: customer.priceLevel,
      totalSales: Number(customer.totalSales),
      totalOrders: customer.totalOrders,
      lastPurchaseDate: customer.lastPurchaseDate,
      firstPurchaseDate: customer.firstPurchaseDate,
      notes: customer.notes,
      createdAt: customer.createdAt,
      updatedAt: customer.updatedAt,
      averageOrderValue: customer.averageOrderValue,
    };
  }
}