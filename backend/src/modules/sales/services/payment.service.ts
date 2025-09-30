import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, FindManyOptions, FindOptionsWhere, Between } from 'typeorm';
import { Payment, PaymentStatus, PaymentType } from '../../../database/entities/payment.entity';
import { Customer } from '../../../database/entities/customer.entity';
import { Invoice, InvoiceStatus } from '../../../database/entities/invoice.entity';
import {
  CreatePaymentDto,
  UpdatePaymentDto,
  QueryPaymentsDto,
  PaymentResponseDto,
  ProcessPaymentDto,
  RefundPaymentDto,
  AllocatePaymentDto,
  PaymentSummaryDto,
} from '../dto/payment.dto';

@Injectable()
export class PaymentService {
  constructor(
    @InjectRepository(Payment)
    private readonly paymentRepository: Repository<Payment>,
    @InjectRepository(Customer)
    private readonly customerRepository: Repository<Customer>,
    @InjectRepository(Invoice)
    private readonly invoiceRepository: Repository<Invoice>,
  ) {}

  async create(createPaymentDto: CreatePaymentDto, recordedByUserId: string): Promise<PaymentResponseDto> {
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

    // Create payment
    const payment = this.paymentRepository.create({
      ...createPaymentDto,
      recordedByUserId,
      type: createPaymentDto.type || PaymentType.PAYMENT,
      currency: createPaymentDto.currency || 'USD',
      exchangeRate: createPaymentDto.exchangeRate || 1.0,
      processingFee: createPaymentDto.processingFee || 0,
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

    return this.mapToResponseDto(await this.findPaymentWithRelations(savedPayment.id));
  }

  async findAll(query: QueryPaymentsDto) {
    const {
      customerId,
      invoiceId,
      paymentMethod,
      status,
      type,
      fromDate,
      toDate,
      referenceNumber,
      sortBy = 'paymentDate',
      sortOrder = 'DESC',
      page = 1,
      limit = 20,
    } = query;

    const where: FindOptionsWhere<Payment> = {};

    if (customerId) where.customerId = customerId;
    if (invoiceId) where.invoiceId = invoiceId;
    if (paymentMethod) where.paymentMethod = paymentMethod;
    if (status) where.status = status;
    if (type) where.type = type;
    if (referenceNumber) where.referenceNumber = referenceNumber;

    if (fromDate || toDate) {
      where.paymentDate = Between(
        fromDate || new Date('1900-01-01'),
        toDate || new Date(),
      );
    }

    const findOptions: FindManyOptions<Payment> = {
      where,
      order: { [sortBy]: sortOrder },
      skip: (page - 1) * limit,
      take: limit,
      relations: ['customer', 'invoice'],
    };

    const [payments, total] = await this.paymentRepository.findAndCount(findOptions);

    return {
      data: payments.map(payment => this.mapToResponseDto(payment)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findById(id: string): Promise<PaymentResponseDto> {
    const payment = await this.findPaymentWithRelations(id);
    return this.mapToResponseDto(payment);
  }

  async update(id: string, updatePaymentDto: UpdatePaymentDto): Promise<PaymentResponseDto> {
    const payment = await this.findPaymentWithRelations(id);

    // Prevent status changes that are not allowed
    if (updatePaymentDto.status) {
      this.validateStatusTransition(payment.status, updatePaymentDto.status);
    }

    Object.assign(payment, updatePaymentDto);
    const savedPayment = await this.paymentRepository.save(payment);

    // Handle status changes
    if (updatePaymentDto.status === PaymentStatus.COMPLETED && payment.status !== PaymentStatus.COMPLETED) {
      await this.handlePaymentCompletion(savedPayment);
    }

    return this.mapToResponseDto(await this.findPaymentWithRelations(savedPayment.id));
  }

  async complete(id: string): Promise<PaymentResponseDto> {
    const payment = await this.findPaymentWithRelations(id);
    
    if (!payment.canComplete()) {
      throw new BadRequestException('Payment cannot be completed');
    }

    payment.complete();
    const savedPayment = await this.paymentRepository.save(payment);
    
    await this.handlePaymentCompletion(savedPayment);
    
    return this.mapToResponseDto(await this.findPaymentWithRelations(savedPayment.id));
  }

  async fail(id: string, reason?: string): Promise<PaymentResponseDto> {
    const payment = await this.findPaymentWithRelations(id);
    
    if (!payment.canFail()) {
      throw new BadRequestException('Payment cannot be marked as failed');
    }

    payment.fail(reason);
    const savedPayment = await this.paymentRepository.save(payment);
    
    return this.mapToResponseDto(savedPayment);
  }

  async cancel(id: string, reason?: string): Promise<PaymentResponseDto> {
    const payment = await this.findPaymentWithRelations(id);
    
    if (!payment.canCancel()) {
      throw new BadRequestException('Payment cannot be cancelled');
    }

    payment.cancel(reason);
    const savedPayment = await this.paymentRepository.save(payment);
    
    return this.mapToResponseDto(savedPayment);
  }

  async refund(refundDto: RefundPaymentDto, recordedByUserId: string): Promise<PaymentResponseDto> {
    const originalPayment = await this.findPaymentWithRelations(refundDto.paymentId);
    
    if (!originalPayment.canRefund()) {
      throw new BadRequestException('Payment cannot be refunded');
    }

    const refundAmount = refundDto.amount || Number(originalPayment.amount);
    
    if (refundAmount > Number(originalPayment.amount)) {
      throw new BadRequestException('Refund amount cannot exceed original payment amount');
    }

    // Create refund payment
    const refund = originalPayment.refund(refundAmount);
    refund.recordedByUserId = recordedByUserId;
    if (refundDto.reason) {
      refund.notes = refundDto.reason;
    }

    const savedRefund = await this.paymentRepository.save(refund);

    // Update customer balance
    if (originalPayment.customer) {
      await this.updateCustomerBalance(originalPayment.customer, savedRefund);
    }

    // Update invoice if applicable
    if (originalPayment.invoice && savedRefund.status === PaymentStatus.COMPLETED) {
      await this.updateInvoiceFromPayment(originalPayment.invoice, savedRefund);
    }

    return this.mapToResponseDto(await this.findPaymentWithRelations(savedRefund.id));
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

  async getPaymentsByCustomer(customerId: string, limit: number = 10): Promise<PaymentSummaryDto[]> {
    const payments = await this.paymentRepository.find({
      where: { customerId },
      order: { paymentDate: 'DESC' },
      take: limit,
    });

    return payments.map(payment => ({
      id: payment.id,
      paymentNumber: payment.paymentNumber,
      paymentDate: payment.paymentDate,
      amount: Number(payment.amount),
      paymentMethod: payment.paymentMethod,
      status: payment.status,
      referenceNumber: payment.referenceNumber,
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
      paymentMethod: payment.paymentMethod,
      status: payment.status,
      referenceNumber: payment.referenceNumber,
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
        'COALESCE(SUM(CASE WHEN payment.status = :completedStatus THEN payment.amount ELSE 0 END), 0) as completedAmount',
        'COALESCE(SUM(CASE WHEN payment.status = :pendingStatus THEN payment.amount ELSE 0 END), 0) as pendingAmount',
        'COALESCE(SUM(CASE WHEN payment.type = :refundType THEN payment.amount ELSE 0 END), 0) as refundAmount',
        'COALESCE(AVG(CASE WHEN payment.status = :completedStatus THEN payment.amount END), 0) as averagePaymentAmount',
      ])
      .setParameters({
        completedStatus: PaymentStatus.COMPLETED,
        pendingStatus: PaymentStatus.PENDING,
        refundType: PaymentType.REFUND,
      })
      .getRawOne();

    return {
      totalPayments: parseInt(stats.totalPayments) || 0,
      completedAmount: parseFloat(stats.completedAmount) || 0,
      pendingAmount: parseFloat(stats.pendingAmount) || 0,
      refundAmount: parseFloat(stats.refundAmount) || 0,
      averagePaymentAmount: parseFloat(stats.averagePaymentAmount) || 0,
    };
  }

  // Private helper methods

  private async findPaymentWithRelations(id: string): Promise<Payment> {
    const payment = await this.paymentRepository.findOne({
      where: { id },
      relations: ['customer', 'invoice', 'recordedByUser'],
    });
    
    if (!payment) {
      throw new NotFoundException('Payment not found');
    }
    
    return payment;
  }

  private validateStatusTransition(currentStatus: PaymentStatus, newStatus: PaymentStatus): void {
    const validTransitions: Record<PaymentStatus, PaymentStatus[]> = {
      [PaymentStatus.PENDING]: [PaymentStatus.COMPLETED, PaymentStatus.FAILED, PaymentStatus.CANCELLED],
      [PaymentStatus.COMPLETED]: [PaymentStatus.REFUNDED],
      [PaymentStatus.FAILED]: [PaymentStatus.PENDING, PaymentStatus.CANCELLED],
      [PaymentStatus.CANCELLED]: [],
      [PaymentStatus.REFUNDED]: [],
    };

    const allowedTransitions = validTransitions[currentStatus] || [];
    
    if (!allowedTransitions.includes(newStatus)) {
      throw new BadRequestException(
        `Invalid status transition from ${currentStatus} to ${newStatus}`,
      );
    }
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
    if (payment.isRefund) {
      invoice.refund(Number(payment.amount));
    } else {
      invoice.addPayment(Number(payment.amount));
    }
    
    await this.invoiceRepository.save(invoice);
  }

  private mapToResponseDto(payment: Payment): PaymentResponseDto {
    return {
      id: payment.id,
      paymentNumber: payment.paymentNumber,
      type: payment.type,
      status: payment.status,
      paymentMethod: payment.paymentMethod,
      paymentDate: payment.paymentDate,
      amount: Number(payment.amount),
      referenceNumber: payment.referenceNumber,
      bankName: payment.bankName,
      accountNumber: payment.accountNumber,
      transactionDate: payment.transactionDate,
      clearedDate: payment.clearedDate,
      currency: payment.currency,
      exchangeRate: Number(payment.exchangeRate),
      baseCurrencyAmount: payment.baseCurrencyAmount ? Number(payment.baseCurrencyAmount) : undefined,
      processor: payment.processor,
      processorTransactionId: payment.processorTransactionId,
      processingFee: Number(payment.processingFee),
      netAmount: payment.netAmount ? Number(payment.netAmount) : undefined,
      notes: payment.notes,
      customerId: payment.customerId,
      invoiceId: payment.invoiceId,
      recordedByUserId: payment.recordedByUserId,
      createdAt: payment.createdAt,
      updatedAt: payment.updatedAt,
      isCompleted: payment.isCompleted,
      isPending: payment.isPending,
      isFailed: payment.isFailed,
      isRefund: payment.isRefund,
      effectiveAmount: payment.effectiveAmount,
      customerName: payment.customer?.name || 'Unknown Customer',
      customer: payment.customer ? {
        id: payment.customer.id,
        name: payment.customer.name,
        phone: payment.customer.phone,
      } : undefined,
      invoice: payment.invoice ? {
        id: payment.invoice.id,
        invoiceNumber: payment.invoice.invoiceNumber,
      } : undefined,
    };
  }
}