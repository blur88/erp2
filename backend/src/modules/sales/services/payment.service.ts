import { AuditLogService } from '../../audit-logs/services';
import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, FindOptionsWhere, Between } from 'typeorm';
import { BaseCrudService } from '../../../common/services/base-crud.service';
import { Payment, PaymentStatus, SettlementStatusEnum } from '../../../database/entities/payment.entity';
import { Customer } from '../../../database/entities/customer.entity';
import { Invoice, InvoiceStatus } from '../../../database/entities/invoice.entity';
import { PaymentMethodEntity } from '../../../database/entities/payment-method.entity';
import {
  CreatePaymentDto,
  UpdatePaymentDto,
  QueryPaymentsDto,
  PaymentResponseDto,
  ProcessPaymentDto,
  AllocatePaymentDto,
  PaymentSummaryDto,
} from '../dto/payment.dto';
import { AccountingService } from '@modules/accounting/services/accounting.service';
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
    @InjectRepository(Invoice)
    private readonly invoiceRepository: Repository<Invoice>,
    @InjectRepository(PaymentMethodEntity)
    private readonly paymentMethodRepository: Repository<PaymentMethodEntity>,
    auditLogService: AuditLogService,
    private readonly accountingService: AccountingService,
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
    if (query.invoiceId) where.invoiceId = query.invoiceId;
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

    // Verify invoice exists if specified
    let invoice: Invoice | null = null;
    if (createPaymentDto.invoiceId) {
      invoice = await this.invoiceRepository.findOne({
        where: { id: createPaymentDto.invoiceId },
      });
      if (!invoice) {
        throw new NotFoundException('Invoice not found');
      }
      if (invoice.customerId !== createPaymentDto.customerId) {
        throw new BadRequestException('Invoice does not belong to the specified customer');
      }
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
      settlementStatus: paymentMethod.requiresSettlement
        ? SettlementStatusEnum.PENDING
        : SettlementStatusEnum.NOT_APPLICABLE,
    });

    const savedPayment = await this.paymentRepository.save(payment);

    // Update invoice if payment is allocated to specific invoice
    if (invoice && savedPayment.status === PaymentStatus.COMPLETED) {
      await this.allocatePaymentToInvoice(savedPayment, invoice);
    }

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
          settlementStatus: savedPayment.settlementStatus,
          status: savedPayment.status,
        },
      }
    );

    // Auto-post to accounting (don't fail payment on error)
    try {
      const fullPayment = await this.findPaymentWithRelations(savedPayment.id);
      await this.accountingService.postCustomerPaymentEntry(
        fullPayment,
        userId || 'system',
        username,
      );
      this.logger.log(`Posted accounting entry for payment ${fullPayment.paymentNumber}`);
    } catch (error) {
      this.logger.error(
        `Failed to post accounting entry for payment ${savedPayment.id}: ${error.message}`,
        error.stack,
      );
      // Continue - don't fail the payment creation
    }

    return this.mapToResponseDto(await this.findPaymentWithRelations(savedPayment.id));
  }

  async findAll(query: QueryPaymentsDto) {
    const {
      customerId,
      invoiceId,
      fromDate,
      toDate,
      search,
      sortBy = 'paymentDate',
      sortOrder = 'DESC',
      status,
    } = query;

    const where: FindOptionsWhere<Payment> = {};

    if (customerId) where.customerId = customerId;
    if (status) where.status = status as PaymentStatus;
    if (invoiceId) where.invoiceId = invoiceId;

    if (fromDate || toDate) {
      where.paymentDate = Between(
        fromDate || new Date('1900-01-01'),
        toDate || new Date(),
      );
    }

    // Use QueryBuilder for better control over nested relations
    const queryBuilder = this.paymentRepository
      .createQueryBuilder('payment')
      .leftJoinAndSelect('payment.customer', 'customer')
      .leftJoinAndSelect('payment.invoice', 'invoice')
      .leftJoinAndSelect('invoice.customer', 'invoiceCustomer')
      .leftJoinAndSelect('invoice.salesOrder', 'salesOrder')
      .leftJoinAndSelect('invoice.items', 'items')
      .leftJoinAndSelect('items.product', 'product')
      .leftJoinAndSelect('payment.paymentMethodEntity', 'paymentMethodEntity')
      .where(where)
      .orderBy(`payment.${sortBy}`, sortOrder);

    if (search) {
      queryBuilder.andWhere(
        '(payment.paymentNumber ILIKE :search OR customer.name ILIKE :search)',
        { search: `%${search}%` }
      );
    }

    const [payments, total] = await queryBuilder.getManyAndCount();

    return {
      data: payments.map(payment => this.mapToResponseDto(payment)),
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
      }
    );

    return this.mapToResponseDto(await this.findPaymentWithRelations(savedPayment.id));
  }

  async processPayment(processPaymentDto: ProcessPaymentDto): Promise<PaymentResponseDto> {
    return this.create({
      customerId: processPaymentDto.customerId,
      invoiceId: processPaymentDto.invoiceId,
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
      const invoice = await this.invoiceRepository.findOne({
        where: { id: allocation.invoiceId },
      });

      if (!invoice) {
        throw new NotFoundException(`Invoice ${allocation.invoiceId} not found`);
      }

      if (invoice.customerId !== payment.customerId) {
        throw new BadRequestException('Invoice does not belong to the payment customer');
      }

      // Allocate payment to invoice
      invoice.addPayment(allocation.amount);
      await this.invoiceRepository.save(invoice);
    }

    // Update payment to indicate it has been allocated
    payment.invoiceId = allocationDto.allocations[0]?.invoiceId; // Primary allocation
    await this.paymentRepository.save(payment);

    return this.mapToResponseDto(await this.findPaymentWithRelations(payment.id));
  }

  async getPaymentsByCustomer(customerId: string): Promise<PaymentSummaryDto[]> {
    const payments = await this.paymentRepository.find({
      where: { customerId },
      order: { paymentDate: 'DESC' },
    });

    return payments.map(payment => ({
      id: payment.id,
      paymentNumber: payment.paymentNumber,
      paymentDate: payment.paymentDate,
      amount: Number(payment.amount),
      paymentMethodId: payment.paymentMethodId,
      status: payment.status,
    }));
  }

  async getPaymentsByInvoice(invoiceId: string): Promise<PaymentSummaryDto[]> {
    const payments = await this.paymentRepository.find({
      where: { invoiceId },
      order: { paymentDate: 'DESC' },
    });

    return payments.map(payment => ({
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

  async complete(id: string, userId?: string, username?: string): Promise<PaymentResponseDto> {
    const payment = await this.findPaymentWithRelations(id);

    if (payment.status === PaymentStatus.COMPLETED) {
      throw new ConflictException('Payment is already completed');
    }

    payment.status = PaymentStatus.COMPLETED;
    const savedPayment = await this.paymentRepository.save(payment);

    // Handle payment completion logic
    await this.handlePaymentCompletion(savedPayment);

    // Log audit trail
    await this.auditLogService.log(
      'UPDATE',
      'Payment',
      `Completed payment ${payment.paymentNumber}`,
      {
        entityId: id,
        userId: userId || 'system',
        username,
        newValues: { status: PaymentStatus.COMPLETED },
      }
    );

    return this.mapToResponseDto(await this.findPaymentWithRelations(savedPayment.id));
  }

  async fail(id: string, reason?: string, userId?: string, username?: string): Promise<PaymentResponseDto> {
    const payment = await this.findPaymentWithRelations(id);

    if (payment.status === PaymentStatus.COMPLETED) {
      throw new BadRequestException('Cannot mark a completed payment as failed');
    }

    payment.status = PaymentStatus.FAILED;
    if (reason) {
      payment.notes = payment.notes ? `${payment.notes}\nFailed reason: ${reason}` : `Failed reason: ${reason}`;
    }

    const savedPayment = await this.paymentRepository.save(payment);

    // Log audit trail
    await this.auditLogService.log(
      'UPDATE',
      'Payment',
      `Marked payment ${payment.paymentNumber} as failed`,
      {
        entityId: id,
        userId: userId || 'system',
        username,
        newValues: { status: PaymentStatus.FAILED, reason },
      }
    );

    return this.mapToResponseDto(await this.findPaymentWithRelations(savedPayment.id));
  }

  async cancel(id: string, reason?: string, userId?: string, username?: string): Promise<PaymentResponseDto> {
    const payment = await this.findPaymentWithRelations(id);

    if (payment.status === PaymentStatus.COMPLETED) {
      throw new BadRequestException('Cannot cancel a completed payment. Use refund instead.');
    }

    payment.status = PaymentStatus.CANCELLED;
    if (reason) {
      payment.notes = payment.notes ? `${payment.notes}\nCancelled reason: ${reason}` : `Cancelled reason: ${reason}`;
    }

    const savedPayment = await this.paymentRepository.save(payment);

    // Log audit trail
    await this.auditLogService.log(
      'UPDATE',
      'Payment',
      `Cancelled payment ${payment.paymentNumber}`,
      {
        entityId: id,
        userId: userId || 'system',
        username,
        newValues: { status: PaymentStatus.CANCELLED, reason },
      }
    );

    return this.mapToResponseDto(await this.findPaymentWithRelations(savedPayment.id));
  }

  async refund(refundDto: {
    paymentId: string;
    amount: number;
    reason?: string;
  }, userId?: string, username?: string): Promise<PaymentResponseDto> {
    const originalPayment = await this.findPaymentWithRelations(refundDto.paymentId);

    if (originalPayment.status !== PaymentStatus.COMPLETED) {
      throw new BadRequestException('Can only refund completed payments');
    }

    if (refundDto.amount > Number(originalPayment.amount)) {
      throw new BadRequestException('Refund amount cannot exceed original payment amount');
    }

    const refundMethodCode = originalPayment.paymentMethodEntity?.code || 'CASH';

    // Create a refund payment record (negative amount)
    const refundPayment = this.paymentRepository.create({
      customerId: originalPayment.customerId,
      invoiceId: originalPayment.invoiceId,
      paymentDate: new Date(),
      amount: -refundDto.amount,
      status: PaymentStatus.REFUNDED,
      paymentMethodId: originalPayment.paymentMethodId,
      settlementStatus: originalPayment.settlementStatus,
      notes: refundDto.reason ? `Refund: ${refundDto.reason}` : `Refund of ${originalPayment.paymentNumber}`,
    });

    const savedRefund = await this.paymentRepository.save(refundPayment);

    // Update original payment status
    originalPayment.status = PaymentStatus.REFUNDED;
    await this.paymentRepository.save(originalPayment);

    // Update invoice if applicable
    if (originalPayment.invoice) {
      originalPayment.invoice.addPayment(-refundDto.amount);
      await this.invoiceRepository.save(originalPayment.invoice);
    }

    try {
      await this.accountingService.reverseSourceEntries('payment', originalPayment.id, userId || 'system');
    } catch (err) {
      this.logger.error(
        `Failed to post refund accounting entry for payment ${originalPayment.id}: ${err.message}`,
      );
      // Refund still succeeds - accounting inconsistency is logged
    }

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
      }
    );

    return this.mapToResponseDto(await this.findPaymentWithRelations(savedRefund.id));
  }

  // Private helper methods

  private async findPaymentWithRelations(id: string): Promise<Payment> {
    const payment = await this.paymentRepository.findOne({
      where: { id },
      relations: ['customer', 'invoice', 'invoice.salesOrder', 'invoice.items', 'invoice.items.product', 'paymentMethodEntity'],
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

    // Update invoice if payment is allocated to specific invoice
    if (payment.invoice) {
      await this.updateInvoiceFromPayment(payment.invoice, payment);
    }
  }

  private async updateCustomerBalance(customer: Customer, _payment: Payment): Promise<void> {
    // Note: Customer balance tracking removed - updateBalance method doesn't exist
    // This method is kept for backward compatibility but no longer updates balance
    await this.customerRepository.save(customer);
  }

  private async allocatePaymentToInvoice(payment: Payment, invoice: Invoice): Promise<void> {
    invoice.addPayment(Number(payment.amount));
    await this.invoiceRepository.save(invoice);
  }

  private async updateInvoiceFromPayment(invoice: Invoice, payment: Payment): Promise<void> {
    invoice.addPayment(Number(payment.amount));
    await this.invoiceRepository.save(invoice);
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

  async findDeleted(query: QueryPaymentsDto = {}) {
    const {
      search,
      customerId,
      sortBy = 'deletedAt',
      sortOrder = 'DESC',
    } = query;

    let queryBuilder = this.paymentRepository
      .createQueryBuilder('payment')
      .withDeleted() // Include soft-deleted records
      .leftJoinAndSelect('payment.customer', 'customer')
      .leftJoinAndSelect('payment.invoice', 'invoice')
      .leftJoinAndSelect('payment.paymentMethodEntity', 'paymentMethodEntity')
      .where('payment.deletedAt IS NOT NULL'); // Only get soft-deleted payments

    if (customerId) {
      queryBuilder = queryBuilder.andWhere('payment.customerId = :customerId', { customerId });
    }

    if (search) {
      queryBuilder = queryBuilder.andWhere(
        '(payment.paymentNumber ILIKE :search OR customer.name ILIKE :search)',
        { search: `%${search}%` }
      );
    }

    // Add sorting
    queryBuilder = queryBuilder.orderBy(`payment.${sortBy}`, sortOrder as 'ASC' | 'DESC');

    const [payments, total] = await queryBuilder.getManyAndCount();

    const data = payments.map(payment => this.mapToResponseDto(payment));

    return {
      data,
      meta: {
        total,
      },
    };
  }

  async restore(id: string, userId?: string, username?: string): Promise<PaymentResponseDto> {
    const payment = await this.paymentRepository.findOne({
      where: { id },
      withDeleted: true, // Include soft-deleted records
      relations: ['customer', 'invoice'],
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
      }
    );

    // Return the restored payment
    const restoredPayment = await this.paymentRepository.findOne({
      where: { id },
      relations: ['customer', 'invoice'],
    });

    return this.mapToResponseDto(restoredPayment);
  }

  async bulkRestore(
    paymentIds: string[],
    userId?: string,
    username?: string,
  ): Promise<{ restoredCount: number; failedIds: string[] }> {
    if (!paymentIds || paymentIds.length === 0) {
      return { restoredCount: 0, failedIds: [] };
    }

    const failedIds = [];
    let successCount = 0;

    for (const id of paymentIds) {
      try {
        await this.restore(id, userId, username);
        successCount++;
      } catch (error) {
        failedIds.push(id);
      }
    }

    return { restoredCount: successCount, failedIds };
  }

  private mapToResponseDto(payment: Payment): PaymentResponseDto {
    // Extract order info - check both nested salesOrder and direct properties
    const relatedOrderId = payment.invoice?.salesOrder?.id || (payment.invoice as any)?.salesOrderId;
    const relatedOrderNumber = payment.invoice?.salesOrder?.orderNumber;

    return {
      id: payment.id,
      paymentNumber: payment.paymentNumber,
      status: payment.status,
      paymentMethodId: payment.paymentMethodId,
      settlementStatus: payment.settlementStatus,
      settlementId: payment.settlementId,
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
      invoiceId: payment.invoiceId,
      createdAt: payment.createdAt,
      updatedAt: payment.updatedAt,
      deletedAt: payment.deletedAt,
      isCompleted: payment.isCompleted,
      customerName: payment.customer?.name || 'Unknown Customer',
      customer: payment.customer ? {
        id: payment.customer.id,
        name: payment.customer.name,
        phone: payment.customer.phone,
      } : undefined,
      invoice: payment.invoice ? {
        id: payment.invoice.id,
        invoiceNumber: payment.invoice.invoiceNumber,
        totalAmount: Number(payment.invoice.totalAmount),
        shippingAmount: Number(payment.invoice.shippingAmount),
        items: payment.invoice.items?.map(item => ({
          id: item.id,
          quantity: item.quantity,
          unitPrice: Number(item.unitPrice),
          discount: Number(item.discount),
          totalAmount: Number(item.totalAmount),
          product: item.product ? {
            id: item.product.id,
            name: item.product.name,
          } : undefined,
        })),
        customer: payment.invoice.customer || payment.customer ? {
          id: (payment.invoice.customer || payment.customer).id,
          name: (payment.invoice.customer || payment.customer).name,
          phone: (payment.invoice.customer || payment.customer).phone,
          streetAddress: (payment.invoice.customer || payment.customer).streetAddress,
          city: (payment.invoice.customer || payment.customer).city,
          state: (payment.invoice.customer || payment.customer).state,
          postalCode: (payment.invoice.customer || payment.customer).postalCode,
          country: (payment.invoice.customer || payment.customer).country,
        } : undefined,
      } : undefined,
      relatedInvoiceId: payment.invoice?.id,
      relatedInvoiceNumber: payment.invoice?.invoiceNumber,
      relatedOrderId: relatedOrderId,
      relatedOrderNumber: relatedOrderNumber,
    };
  }
}
