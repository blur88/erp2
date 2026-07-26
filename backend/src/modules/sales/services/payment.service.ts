import { AuditLogService } from '../../audit-logs/services';
import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, FindOptionsWhere, Between, In } from 'typeorm';
import { applyPagination } from '@/common/pagination/apply-pagination';
import { BaseCrudService } from '../../../common/services/base-crud.service';
import {
  Payment,
  PaymentStatus,
} from '../../../database/entities/payment.entity';
import { Customer } from '../../../database/entities/customer.entity';
import { SalesOrder } from '../../../database/entities/sales-order.entity';
import { PaymentMethodEntity } from '../../../database/entities/payment-method.entity';
import {
  CreatePaymentDto,
  UpdatePaymentDto,
  QueryPaymentsDto,
  PaymentResponseDto,
  ProcessPaymentDto,
  AllocatePaymentDto,
  PaymentSummaryDto,
  PAYMENT_SORT_FIELDS,
} from '../dto/payment.dto';
import { CustomerPrintDto } from '../dto/customer.dto';
import { GlobalSearchResultDto } from '../../search/dto/global-search-result.dto';
import { canSearchCustomerPayments } from '../../search/search.permissions';
import {
  SEARCH_CANDIDATE_LIMIT,
  SCORE_EXACT_CODE,
  SCORE_STARTSWITH_CODE,
  SCORE_CONTAINS,
  SCORE_FUZZY,
  BOOST_CUSTOMER_PAYMENT,
  BOOST_EXACT_MATCH,
} from '../../search/search.constants';
import { JwtPayload } from '../../auth/strategies/jwt.strategy';
import { UserRole } from '../../../database/entities/user.entity';
import { SettingsService } from '../../settings/settings.service';

@Injectable()
export class PaymentService extends BaseCrudService<
  Payment,
  CreatePaymentDto,
  UpdatePaymentDto,
  QueryPaymentsDto
> {
  private readonly logger = new Logger(PaymentService.name);

  constructor(
    @InjectRepository(Payment)
    private readonly paymentRepository: Repository<Payment>,
    @InjectRepository(Customer)
    private readonly customerRepository: Repository<Customer>,
    @InjectRepository(PaymentMethodEntity)
    private readonly paymentMethodRepository: Repository<PaymentMethodEntity>,
    @InjectRepository(SalesOrder)
    private readonly salesOrderRepository: Repository<SalesOrder>,
    auditLogService: AuditLogService,
    private readonly settingsService: SettingsService,
  ) {
    super(paymentRepository, auditLogService);
  }

  getEntityType(): string {
    return 'Payment';
  }

  buildWhereClause(query: QueryPaymentsDto): FindOptionsWhere<Payment> {
    const where: FindOptionsWhere<Payment> = {};

    if (query.customerId) where.customerId = query.customerId;
    if (query.status) where.status = query.status as PaymentStatus;
    if (query.salesOrderId) where.salesOrderId = query.salesOrderId;
    if (query.fromDate || query.toDate) {
      where.paymentDate = Between(
        query.fromDate || new Date('1900-01-01'),
        query.toDate || new Date(),
      );
    }

    return where;
  }

  async create(
    createPaymentDto: CreatePaymentDto,
    userId?: string,
    username?: string,
  ): Promise<PaymentResponseDto> {
    // Verify customer exists
    const customer = await this.customerRepository.findOne({
      where: { id: createPaymentDto.customerId },
    });
    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    const paymentMethod = await this.paymentMethodRepository.findOne({
      where: { id: createPaymentDto.paymentMethodId, isActive: true },
    });
    if (!paymentMethod || paymentMethod.deletedAt) {
      throw new NotFoundException('Payment method not found');
    }

    const paymentNumber = await this.settingsService.generateDocumentNumber('Payments');

    // Create payment
    const payment = this.paymentRepository.create({
      ...createPaymentDto,
      paymentNumber,
      status: PaymentStatus.COMPLETED,
      paymentMethodId: paymentMethod.id,
    });

    const savedPayment = await this.paymentRepository.save(payment);

    // Update customer balance for completed payments
    if (savedPayment.status === PaymentStatus.COMPLETED) {
      await this.updateCustomerBalance(customer, savedPayment);
    }

    // Log audit trail for create
    await this.auditLogService.log(
      'CREATE',
      'Payment',
      `Created payment: ${savedPayment.amount} for ${customer.name}`,
      {
        entityId: savedPayment.id,
        userId: userId || 'system',
        username,
        newValues: {
          amount: savedPayment.amount,
          paymentMethodId: savedPayment.paymentMethodId,
          status: savedPayment.status,
        },
      },
    );

    return this.mapToResponseDto(await this.findPaymentWithRelations(savedPayment.id));
  }

  async findAll(query: QueryPaymentsDto) {
    const {
      customerId,
      salesOrderId,
      fromDate,
      toDate,
      search,
      sortBy = 'paymentDate',
      sortOrder = 'DESC',
      status,
      page,
      limit,
    } = query;

    const where: FindOptionsWhere<Payment> = {};

    if (customerId) where.customerId = customerId;
    if (status) where.status = status as PaymentStatus;
    if (salesOrderId) where.salesOrderId = salesOrderId;

    if (fromDate || toDate) {
      where.paymentDate = Between(fromDate || new Date('1900-01-01'), toDate || new Date());
    }

    // Use QueryBuilder for better control over nested relations
    const queryBuilder = this.paymentRepository
      .createQueryBuilder('payment')
      .leftJoinAndSelect('payment.customer', 'customer')
      .leftJoinAndSelect('payment.salesOrder', 'salesOrder')
      .leftJoinAndSelect('salesOrder.customer', 'salesOrderCustomer')
      .leftJoinAndSelect('salesOrder.items', 'items')
      .leftJoinAndSelect('items.product', 'product')
      .leftJoinAndSelect('payment.paymentMethodEntity', 'paymentMethodEntity')
      .where(where)
      .orderBy(
        `payment.${(PAYMENT_SORT_FIELDS as readonly string[]).includes(sortBy) ? sortBy : 'paymentDate'}`,
        sortOrder,
      );

    if (search) {
      queryBuilder.andWhere(
        '(payment.paymentNumber ILIKE :search OR customer.name ILIKE :search)',
        { search: `%${search}%` },
      );
    }

    applyPagination(queryBuilder, page, limit);

    const [payments, total] = await queryBuilder.getManyAndCount();

    return {
      data: payments.map((payment) => this.mapToResponseDto(payment)),
      meta: {
        total,
      },
    };
  }

  async findById(id: string): Promise<PaymentResponseDto> {
    const payment = await this.findPaymentWithRelations(id);
    return this.mapToResponseDto(payment);
  }

  async update(
    id: string,
    updatePaymentDto: UpdatePaymentDto,
    userId?: string,
    username?: string,
  ): Promise<PaymentResponseDto> {
    const payment = await this.findPaymentWithRelations(id);

    Object.assign(payment, updatePaymentDto);
    const savedPayment = await this.paymentRepository.save(payment);

    // Log audit trail for update
    await this.auditLogService.log(
      'UPDATE',
      'Payment',
      `Updated payment for ${payment.customer?.name || 'customer'}`,
      {
        entityId: id,
        userId: userId || 'system',
        username,
        newValues: {
          amount: savedPayment.amount,
          status: savedPayment.status,
        },
      },
    );

    return this.mapToResponseDto(await this.findPaymentWithRelations(savedPayment.id));
  }

  async processPayment(processPaymentDto: ProcessPaymentDto): Promise<PaymentResponseDto> {
    return this.create({
      customerId: processPaymentDto.customerId,
      salesOrderId: processPaymentDto.salesOrderId,
      paymentMethodId: processPaymentDto.paymentMethodId,
      paymentDate: new Date(),
      amount: processPaymentDto.amount,
      notes: processPaymentDto.notes,
    });
  }

  async allocatePayment(allocationDto: AllocatePaymentDto): Promise<PaymentResponseDto> {
    const payment = await this.findPaymentWithRelations(allocationDto.paymentId);

    if (payment.status !== PaymentStatus.COMPLETED) {
      throw new BadRequestException('Only completed payments can be allocated');
    }

    const totalAllocationAmount = allocationDto.allocations.reduce(
      (sum, allocation) => sum + allocation.amount,
      0,
    );

    if (totalAllocationAmount > Number(payment.amount)) {
      throw new BadRequestException('Total allocation amount exceeds payment amount');
    }

    // Process each allocation
    for (const allocation of allocationDto.allocations) {
      const salesOrder = await this.salesOrderRepository.findOne({
        where: { id: allocation.salesOrderId },
      });

      if (!salesOrder) {
        throw new NotFoundException(`Sales order ${allocation.salesOrderId} not found`);
      }

      if (salesOrder.customerId !== payment.customerId) {
        throw new BadRequestException('Sales order does not belong to the payment customer');
      }

      // Update sales order paid amount and balance
      const allocatedAmount = Number(allocation.amount);
      salesOrder.paidAmount = Number(salesOrder.paidAmount) + allocatedAmount;
      salesOrder.balanceDue = Number(salesOrder.totalAmount) - Number(salesOrder.paidAmount);
      await this.salesOrderRepository.save(salesOrder);
    }

    // Update payment to indicate it has been allocated
    payment.salesOrderId = allocationDto.allocations[0]?.salesOrderId; // Primary allocation
    await this.paymentRepository.save(payment);

    return this.mapToResponseDto(await this.findPaymentWithRelations(payment.id));
  }

  async getPaymentsByCustomer(customerId: string): Promise<PaymentSummaryDto[]> {
    const payments = await this.paymentRepository.find({
      where: { customerId },
      order: { paymentDate: 'DESC' },
    });

    return payments.map((payment) => ({
      id: payment.id,
      paymentNumber: payment.paymentNumber,
      paymentDate: payment.paymentDate,
      amount: Number(payment.amount),
      paymentMethodId: payment.paymentMethodId,
      status: payment.status,
    }));
  }

  async getPaymentsBySalesOrder(salesOrderId: string): Promise<PaymentSummaryDto[]> {
    const payments = await this.paymentRepository.find({
      where: { salesOrderId },
      order: { paymentDate: 'DESC' },
    });

    return payments.map((payment) => ({
      id: payment.id,
      paymentNumber: payment.paymentNumber,
      paymentDate: payment.paymentDate,
      amount: Number(payment.amount),
      paymentMethodId: payment.paymentMethodId,
      status: payment.status,
    }));
  }

  async getPaymentStatistics(customerId?: string, fromDate?: Date, toDate?: Date) {
    const queryBuilder = this.paymentRepository.createQueryBuilder('payment');

    if (customerId) {
      queryBuilder.where('payment.customerId = :customerId', { customerId });
    }

    if (fromDate || toDate) {
      queryBuilder.andWhere('payment.paymentDate BETWEEN :fromDate AND :toDate', {
        fromDate: fromDate || new Date('1900-01-01'),
        toDate: toDate || new Date(),
      });
    }

    const stats = await queryBuilder
      .select([
        'COUNT(*) as totalPayments',
        'COALESCE(SUM(payment.amount), 0) as completedAmount',
        'COALESCE(AVG(payment.amount), 0) as averagePaymentAmount',
      ])
      .getRawOne();

    return {
      totalPayments: parseInt(stats.totalPayments) || 0,
      completedAmount: parseFloat(stats.completedAmount) || 0,
      averagePaymentAmount: parseFloat(stats.averagePaymentAmount) || 0,
    };
  }

  async getPaidTotalForSalesOrder(salesOrderId: string): Promise<number> {
    // Include REFUNDED rows: a refund flips the original payment to REFUNDED and
    // adds a negative-amount REFUNDED row. Summing COMPLETED + REFUNDED nets the
    // refunded amount out correctly (full refund -> 0, partial -> remaining paid).
    const payments = await this.paymentRepository.find({
      where: {
        salesOrderId,
        status: In([PaymentStatus.COMPLETED, PaymentStatus.REFUNDED]),
      },
    });
    return payments.reduce((sum, p) => sum + Number(p.amount), 0);
  }

  async refund(
    refundDto: {
      paymentId: string;
      amount: number;
      reason?: string;
    },
    userId?: string,
    username?: string,
  ): Promise<PaymentResponseDto> {
    const originalPayment = await this.findPaymentWithRelations(refundDto.paymentId);

    if (originalPayment.status !== PaymentStatus.COMPLETED) {
      throw new BadRequestException('Can only refund completed payments');
    }

    if (refundDto.amount > Number(originalPayment.amount)) {
      throw new BadRequestException('Refund amount cannot exceed original payment amount');
    }

    const refundMethodCode = originalPayment.paymentMethodEntity?.code || 'CASH';

    const refundNumber = await this.settingsService.generateDocumentNumber('Payments');

    // Create a refund payment record (negative amount)
    const refundPayment = this.paymentRepository.create({
      customerId: originalPayment.customerId,
      salesOrderId: originalPayment.salesOrderId,
      paymentDate: new Date(),
      amount: -refundDto.amount,
      paymentNumber: refundNumber,
      status: PaymentStatus.REFUNDED,
      paymentMethodId: originalPayment.paymentMethodId,
      notes: refundDto.reason
        ? `Refund: ${refundDto.reason}`
        : `Refund of ${originalPayment.paymentNumber}`,
    });

    const savedRefund = await this.paymentRepository.save(refundPayment);

    // Update original payment status
    originalPayment.status = PaymentStatus.REFUNDED;
    await this.paymentRepository.save(originalPayment);

    // Log audit trail
    await this.auditLogService.log(
      'CREATE',
      'Payment',
      `Created refund for payment ${originalPayment.paymentNumber}`,
      {
        entityId: savedRefund.id,
        userId: userId || 'system',
        username,
        newValues: {
          amount: savedRefund.amount,
          status: savedRefund.status,
          originalPaymentId: originalPayment.id,
          refundMethodCode,
        },
      },
    );

    return this.mapToResponseDto(await this.findPaymentWithRelations(savedRefund.id));
  }

  // Private helper methods

  private async findPaymentWithRelations(id: string): Promise<Payment> {
    const payment = await this.paymentRepository.findOne({
      where: { id },
      relations: {
        customer: true,
        salesOrder: { items: { product: true } },
        paymentMethodEntity: true,
      },
    });

    if (!payment) {
      throw new NotFoundException('Payment not found');
    }

    return payment;
  }

  private async handlePaymentCompletion(payment: Payment): Promise<void> {
    // Update customer balance
    if (payment.customer) {
      await this.updateCustomerBalance(payment.customer, payment);
    }

    // Update sales order if payment is allocated to specific order
    if (payment.salesOrder) {
      const allocatedAmount = Number(payment.amount);
      payment.salesOrder.paidAmount = Number(payment.salesOrder.paidAmount) + allocatedAmount;
      payment.salesOrder.balanceDue =
        Number(payment.salesOrder.totalAmount) - Number(payment.salesOrder.paidAmount);
      await this.salesOrderRepository.save(payment.salesOrder);
    }
  }

  private async updateCustomerBalance(customer: Customer, _payment: Payment): Promise<void> {
    // Note: Customer balance tracking removed - updateBalance method doesn't exist
    // This method is kept for backward compatibility but no longer updates balance
    await this.customerRepository.save(customer);
  }

  async searchGlobal(query: string, user: JwtPayload): Promise<GlobalSearchResultDto[]> {
    if (!canSearchCustomerPayments(user.role as UserRole)) return [];

    const trimmed = query.trim();
    const q = trimmed.toLowerCase();

    const results = await this.paymentRepository
      .createQueryBuilder('payment')
      .where('payment.deletedAt IS NULL')
      .andWhere('payment.paymentNumber ILIKE :q', { q: `%${trimmed}%` })
      .take(SEARCH_CANDIDATE_LIMIT)
      .getMany();

    if (results.length > 0) {
      return results.map((p) => this.mapPayment(p, q, false));
    }

    const fuzzyResults = await this.paymentRepository
      .createQueryBuilder('payment')
      .addSelect('similarity(payment.paymentNumber, :q)', 'sim')
      .where('payment.deletedAt IS NULL')
      .andWhere('similarity(payment.paymentNumber, :q) > 0.3')
      .orderBy('sim', 'DESC')
      .setParameter('q', trimmed)
      .take(SEARCH_CANDIDATE_LIMIT)
      .getMany();

    return fuzzyResults.map((p) => this.mapPayment(p, q, true));
  }

  private mapPayment(p: Payment, q: string, fuzzy: boolean): GlobalSearchResultDto {
    const num = p.paymentNumber?.toLowerCase() ?? '';
    const baseScore = fuzzy
      ? SCORE_FUZZY
      : num === q
        ? SCORE_EXACT_CODE
        : num.startsWith(q)
          ? SCORE_STARTSWITH_CODE
          : SCORE_CONTAINS;

    return {
      type: 'customer_payment',
      id: p.id,
      label: p.paymentNumber,
      description: undefined,
      route: `/sales/payments/${p.id}`,
      score:
        baseScore +
        BOOST_CUSTOMER_PAYMENT +
        (baseScore === SCORE_EXACT_CODE ? BOOST_EXACT_MATCH : 0),
    };
  }

  async restore(id: string, userId?: string, username?: string): Promise<PaymentResponseDto> {
    const payment = await this.paymentRepository.findOne({
      where: { id },
      withDeleted: true, // Include soft-deleted records
      relations: { customer: true },
    });

    if (!payment) {
      throw new NotFoundException(`Payment with ID ${id} not found`);
    }

    if (!payment.deletedAt) {
      throw new ConflictException(`Payment ${payment.paymentNumber} is not deleted`);
    }

    // Restore the payment
    await this.paymentRepository.restore(id);

    await this.auditLogService.log(
      'RESTORE',
      'Payment',
      `Restored payment: ${payment.paymentNumber}`,
      {
        entityId: id,
        userId: userId || 'system',
        username,
        newValues: {
          paymentNumber: payment.paymentNumber,
          amount: payment.amount,
          status: payment.status,
        },
      },
    );

    // Return the restored payment
    const restoredPayment = await this.paymentRepository.findOne({
      where: { id },
      relations: { customer: true },
    });

    return this.mapToResponseDto(restoredPayment);
  }

  private mapToResponseDto(payment: Payment): PaymentResponseDto {
    return {
      id: payment.id,
      paymentNumber: payment.paymentNumber,
      status: payment.status,
      paymentMethodId: payment.paymentMethodId,
      paymentMethodEntity: payment.paymentMethodEntity
        ? {
            id: payment.paymentMethodEntity.id,
            code: payment.paymentMethodEntity.code,
            name: payment.paymentMethodEntity.name,
          }
        : undefined,
      paymentDate: payment.paymentDate,
      amount: Number(payment.amount),
      notes: payment.notes,
      customerId: payment.customerId,
      salesOrderId: payment.salesOrderId,
      createdAt: payment.createdAt,
      updatedAt: payment.updatedAt,
      deletedAt: payment.deletedAt,
      isCompleted: payment.isCompleted,
      customerName: payment.customer?.name || 'Unknown Customer',
      customer: payment.customer
        ? {
            id: payment.customer.id,
            name: payment.customer.name,
            phone: payment.customer.phone,
          }
        : undefined,
      salesOrder: payment.salesOrder
        ? {
            id: payment.salesOrder.id,
            orderNumber: payment.salesOrder.orderNumber,
            totalAmount: Number(payment.salesOrder.totalAmount),
            shippingAmount: Number(payment.salesOrder.shippingAmount),
            items: payment.salesOrder.items?.map((item) => ({
              id: item.id,
              quantity: item.quantity,
              unitPrice: Number(item.unitPrice),
              discount: Number(item.discountAmount),
              totalAmount: Number(item.totalAmount),
              product: item.product
                ? {
                    id: item.product.id,
                    name: item.product.name,
                  }
                : undefined,
            })),
            customer:
              payment.salesOrder.customer || payment.customer
                ? ({
                    id: (payment.salesOrder.customer || payment.customer).id,
                    name: (payment.salesOrder.customer || payment.customer).name,
                    phone: (payment.salesOrder.customer || payment.customer).phone,
                    streetAddress: (payment.salesOrder.customer || payment.customer)
                      .billingStreetAddress,
                    city: (payment.salesOrder.customer || payment.customer).billingCity,
                    state: (payment.salesOrder.customer || payment.customer).billingState,
                    postalCode: (payment.salesOrder.customer || payment.customer).billingPostalCode,
                    country: (payment.salesOrder.customer || payment.customer).billingCountry,
                  } satisfies CustomerPrintDto)
                : undefined,
          }
        : undefined,
      relatedSalesOrderId: payment.salesOrder?.id,
      relatedSalesOrderNumber: payment.salesOrder?.orderNumber,
    };
  }
}
