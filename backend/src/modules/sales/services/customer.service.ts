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
  CreditCheckResponseDto,
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
    @InjectRepository(Payment)
    private readonly paymentRepository: Repository<Payment>,
  ) {}

  async create(createCustomerDto: CreateCustomerDto): Promise<CustomerResponseDto> {
    // Check if customer with email already exists
    if (createCustomerDto.email) {
      const existingCustomer = await this.customerRepository.findOne({
        where: { email: createCustomerDto.email },
      });
      if (existingCustomer) {
        throw new ConflictException('Customer with this email already exists');
      }
    }

    // Generate customer code
    const customerCode = await this.generateCustomerCode();

    const customer = this.customerRepository.create({
      ...createCustomerDto,
      customerCode,
      priceLevel: createCustomerDto.priceLevel || PriceLevel.RETAIL,
      creditLimit: createCustomerDto.creditLimit || 0,
      paymentTermsDays: createCustomerDto.paymentTermsDays || 30,
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

    const searchConditions = [];
    if (search) {
      searchConditions.push(
        { name: ILike(`%${search}%`) },
        { email: ILike(`%${search}%`) },
        { phone: ILike(`%${search}%`) },
        { customerCode: ILike(`%${search}%`) },
      );
    }

    const findOptions: FindManyOptions<Customer> = {
      where: searchConditions.length > 0 ? searchConditions.map(condition => ({ ...where, ...condition })) : where,
      order: { [sortBy]: sortOrder },
      skip: (page - 1) * limit,
      take: limit,
    };

    const [customers, total] = await this.customerRepository.findAndCount(findOptions);

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
      select: ['id', 'customerCode', 'name', 'email', 'phone', 'status', 'currentBalance', 'creditLimit'],
    });

    return customers.map(customer => ({
      id: customer.id,
      customerCode: customer.customerCode,
      name: customer.name,
      email: customer.email,
      phone: customer.phone,
      status: customer.status,
      currentBalance: Number(customer.currentBalance),
      creditLimit: Number(customer.creditLimit),
      availableCredit: customer.availableCredit,
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

    // Check email uniqueness if email is being updated
    if (updateCustomerDto.email && updateCustomerDto.email !== customer.email) {
      const existingCustomer = await this.customerRepository.findOne({
        where: { email: updateCustomerDto.email },
      });
      if (existingCustomer) {
        throw new ConflictException('Customer with this email already exists');
      }
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

    // Check if customer has orders
    const orderCount = await this.salesOrderRepository.count({ where: { customerId: id } });
    if (orderCount > 0) {
      throw new ConflictException('Cannot delete customer with existing orders');
    }

    // Check if customer has invoices
    const invoiceCount = await this.invoiceRepository.count({ where: { customerId: id } });
    if (invoiceCount > 0) {
      throw new ConflictException('Cannot delete customer with existing invoices');
    }

    await this.customerRepository.remove(customer);
  }

  async checkCredit(customerId: string, amount: number): Promise<CreditCheckResponseDto> {
    const customer = await this.findCustomerEntity(customerId);

    const approved = customer.canPurchase(amount);
    const remainingCreditAfterPurchase = Number(customer.availableCredit) - amount;

    return {
      approved,
      creditLimit: Number(customer.creditLimit),
      currentBalance: Number(customer.currentBalance),
      availableCredit: customer.availableCredit,
      requestedAmount: amount,
      remainingCreditAfterPurchase,
      message: approved 
        ? 'Credit approved' 
        : `Credit limit exceeded. Available credit: ${customer.availableCredit.toFixed(2)}`,
    };
  }

  async updateCreditLimit(id: string, creditLimit: number): Promise<CustomerResponseDto> {
    const customer = await this.findCustomerEntity(id);
    customer.creditLimit = creditLimit;
    const savedCustomer = await this.customerRepository.save(customer);
    return this.mapToResponseDto(savedCustomer);
  }

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

    // Get payment statistics
    const paymentStats = await this.paymentRepository
      .createQueryBuilder('payment')
      .where('payment.customerId = :customerId', { customerId })
      .andWhere('payment.status = :status', { status: 'completed' })
      .select([
        'COUNT(*) as totalPayments',
        'COALESCE(SUM(payment.amount), 0) as totalPaid',
        'COALESCE(AVG(payment.amount), 0) as averagePaymentAmount',
        'MAX(payment.paymentDate) as lastPaymentDate',
      ])
      .getRawOne();

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
        creditLimit: Number(customer.creditLimit),
        currentBalance: Number(customer.currentBalance),
        availableCredit: customer.availableCredit,
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
    const count = await this.customerRepository.count();
    const sequence = (count + 1).toString().padStart(4, '0');
    return `CUST${year}${sequence}`;
  }

  private mapToResponseDto(customer: Customer): CustomerResponseDto {
    return {
      id: customer.id,
      customerCode: customer.customerCode,
      type: customer.type,
      name: customer.name,
      contactPerson: customer.contactPerson,
      email: customer.email,
      phone: customer.phone,
      alternativePhone: customer.alternativePhone,
      taxId: customer.taxId,
      billingAddress: customer.billingAddress,
      billingCity: customer.billingCity,
      billingState: customer.billingState,
      billingPostalCode: customer.billingPostalCode,
      billingCountry: customer.billingCountry,
      shippingAddress: customer.shippingAddress,
      shippingCity: customer.shippingCity,
      shippingState: customer.shippingState,
      shippingPostalCode: customer.shippingPostalCode,
      shippingCountry: customer.shippingCountry,
      status: customer.status,
      isActive: customer.isActive,
      priceLevel: customer.priceLevel,
      creditLimit: Number(customer.creditLimit),
      currentBalance: Number(customer.currentBalance),
      paymentTermsDays: customer.paymentTermsDays,
      totalSales: Number(customer.totalSales),
      totalOrders: customer.totalOrders,
      lastPurchaseDate: customer.lastPurchaseDate,
      firstPurchaseDate: customer.firstPurchaseDate,
      notes: customer.notes,
      createdAt: customer.createdAt,
      updatedAt: customer.updatedAt,
      fullAddress: customer.fullAddress,
      fullShippingAddress: customer.fullShippingAddress,
      availableCredit: customer.availableCredit,
      isOverCreditLimit: customer.isOverCreditLimit,
      averageOrderValue: customer.averageOrderValue,
    };
  }
}