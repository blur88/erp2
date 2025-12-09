import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, FindManyOptions, FindOptionsWhere, Between } from 'typeorm';
import { Payment, PaymentStatus } from '../../../database/entities/payment.entity';
import { Customer } from '../../../database/entities/customer.entity';
import { Invoice, InvoiceStatus } from '../../../database/entities/invoice.entity';
import {
  CreatePaymentDto,
  UpdatePaymentDto,
  QueryPaymentsDto,
  PaymentResponseDto,
  ProcessPaymentDto,
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

  async create(createPaymentDto: CreatePaymentDto): Promise<PaymentResponseDto> {
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
      status: PaymentStatus.COMPLETED,
      paymentMethod: 'cash',
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
      fromDate,
      toDate,
      sortBy = 'paymentDate',
      sortOrder = 'DESC',
    } = query;

    const where: FindOptionsWhere<Payment> = {};

    if (customerId) where.customerId = customerId;
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
      .leftJoinAndSelect('invoice.salesOrder', 'salesOrder')
      .leftJoinAndSelect('invoice.items', 'items')
      .leftJoinAndSelect('items.product', 'product')
      .where(where)
      .orderBy(`payment.${sortBy}`, sortOrder);

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

  async update(id: string, updatePaymentDto: UpdatePaymentDto): Promise<PaymentResponseDto> {
    const payment = await this.findPaymentWithRelations(id);

    Object.assign(payment, updatePaymentDto);
    const savedPayment = await this.paymentRepository.save(payment);

    return this.mapToResponseDto(await this.findPaymentWithRelations(savedPayment.id));
  }

  async processPayment(processPaymentDto: ProcessPaymentDto): Promise<PaymentResponseDto> {
    return this.create({
      customerId: processPaymentDto.customerId,
      invoiceId: processPaymentDto.invoiceId,
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

  // Private helper methods

  private async findPaymentWithRelations(id: string): Promise<Payment> {
    const payment = await this.paymentRepository.findOne({
      where: { id },
      relations: ['customer', 'invoice', 'invoice.salesOrder', 'invoice.items', 'invoice.items.product'],
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

  async restore(id: string): Promise<PaymentResponseDto> {
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

    // Return the restored payment
    const restoredPayment = await this.paymentRepository.findOne({
      where: { id },
      relations: ['customer', 'invoice'],
    });

    return this.mapToResponseDto(restoredPayment);
  }

  async bulkRestore(paymentIds: string[]): Promise<{ restoredCount: number; failedIds: string[] }> {
    if (!paymentIds || paymentIds.length === 0) {
      return { restoredCount: 0, failedIds: [] };
    }

    const failedIds = [];
    let successCount = 0;

    for (const id of paymentIds) {
      try {
        await this.restore(id);
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
      paymentMethod: payment.paymentMethod,
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
        items: payment.invoice.items,
      } : undefined,
      relatedInvoiceId: payment.invoice?.id,
      relatedInvoiceNumber: payment.invoice?.invoiceNumber,
      relatedOrderId: relatedOrderId,
      relatedOrderNumber: relatedOrderNumber,
    };
  }
}