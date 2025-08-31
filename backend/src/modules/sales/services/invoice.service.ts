import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, FindOptionsWhere, FindManyOptions, MoreThanOrEqual, LessThanOrEqual, ILike, In } from 'typeorm';
import { 
  Invoice, 
  InvoiceStatus, 
  InvoiceType 
} from '../../../database/entities/invoice.entity';
import { Customer } from '../../../database/entities/customer.entity';
import { SalesOrder } from '../../../database/entities/sales-order.entity';
import { Payment } from '../../../database/entities/payment.entity';
import {
  CreateInvoiceDto,
  UpdateInvoiceDto,
  QueryInvoicesDto,
  InvoiceResponseDto,
  InvoiceSummaryDto,
  SendInvoiceDto,
  InvoicePaymentAllocationDto,
  CreditNoteDto,
} from '../dto/invoice.dto';
// import { EmailService } from '../../auth/services/email.service'; // Temporarily disabled

@Injectable()
export class InvoiceService {
  constructor(
    @InjectRepository(Invoice)
    private readonly invoiceRepository: Repository<Invoice>,
    @InjectRepository(Customer)
    private readonly customerRepository: Repository<Customer>,
    @InjectRepository(SalesOrder)
    private readonly salesOrderRepository: Repository<SalesOrder>,
    @InjectRepository(Payment)
    private readonly paymentRepository: Repository<Payment>,
    // private readonly emailService: EmailService, // Temporarily disabled
  ) {}

  async create(createInvoiceDto: CreateInvoiceDto): Promise<InvoiceResponseDto> {
    const { customerId, salesOrderId, lineItems, ...invoiceData } = createInvoiceDto;

    // Verify customer exists
    const customer = await this.customerRepository.findOne({ where: { id: customerId } });
    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    // Verify sales order exists if provided
    let salesOrder: SalesOrder | null = null;
    if (salesOrderId) {
      salesOrder = await this.salesOrderRepository.findOne({ where: { id: salesOrderId } });
      if (!salesOrder) {
        throw new NotFoundException('Sales order not found');
      }
    }

    // Calculate totals
    const subtotal = createInvoiceDto.subtotal;
    const discountPercent = invoiceData.discountPercent || 0;
    const discountAmount = (subtotal * discountPercent) / 100;
    const taxPercent = invoiceData.taxPercent || 0;
    const taxableAmount = subtotal - discountAmount;
    const taxAmount = (taxableAmount * taxPercent) / 100;
    const additionalCharges = invoiceData.additionalCharges || 0;
    const totalAmount = taxableAmount + taxAmount + additionalCharges;

    // Create invoice
    const invoice = this.invoiceRepository.create({
      ...invoiceData,
      customerId,
      salesOrderId,
      customerName: customer.name,
      billingAddress: customer.fullAddress,
      customerTaxId: customer.taxId,
      invoiceDate: invoiceData.invoiceDate ? new Date(invoiceData.invoiceDate) : new Date(),
      dueDate: invoiceData.dueDate ? new Date(invoiceData.dueDate) : undefined,
      paymentTermsDays: invoiceData.paymentTermsDays || customer.paymentTermsDays || 30,
      subtotal,
      discountPercent,
      discountAmount,
      taxPercent,
      taxAmount,
      additionalCharges,
      totalAmount,
      balanceDue: totalAmount,
      lineItems,
      status: InvoiceStatus.DRAFT,
    });

    const savedInvoice = await this.invoiceRepository.save(invoice);
    return this.findById(savedInvoice.id);
  }

  async findAll(query: QueryInvoicesDto) {
    const {
      search,
      customerId,
      salesOrderId,
      status,
      type,
      fromDate,
      toDate,
      overdue,
      unpaid,
      sortBy = 'invoiceDate',
      sortOrder = 'DESC',
      page = 1,
      limit = 20,
    } = query;

    const where: FindOptionsWhere<Invoice> = {};

    if (customerId) where.customerId = customerId;
    if (salesOrderId) where.salesOrderId = salesOrderId;
    if (status) where.status = status;
    if (type) where.type = type;
    
    if (fromDate) {
      where.invoiceDate = MoreThanOrEqual(new Date(fromDate));
    }
    if (toDate) {
      const endDate = new Date(toDate);
      endDate.setHours(23, 59, 59, 999);
      where.invoiceDate = LessThanOrEqual(endDate);
    }
    if (fromDate && toDate) {
      where.invoiceDate = {
        ...MoreThanOrEqual(new Date(fromDate)),
        ...LessThanOrEqual(new Date(toDate)),
      } as any;
    }

    const searchConditions = [];
    if (search) {
      searchConditions.push(
        { invoiceNumber: ILike(`%${search}%`) },
        { customerName: ILike(`%${search}%`) },
      );
    }

    const findOptions: FindManyOptions<Invoice> = {
      where: searchConditions.length > 0 ? searchConditions.map(condition => ({ ...where, ...condition })) : where,
      relations: ['customer', 'salesOrder'],
      order: { [sortBy]: sortOrder },
      skip: (page - 1) * limit,
      take: limit,
    };

    let [invoices, total] = await this.invoiceRepository.findAndCount(findOptions);

    // Filter overdue and unpaid invoices if requested
    if (overdue !== undefined || unpaid !== undefined) {
      invoices = invoices.filter(invoice => {
        let match = true;
        if (overdue !== undefined) {
          match = match && (invoice.isOverdue === overdue);
        }
        if (unpaid !== undefined) {
          match = match && (Number(invoice.balanceDue) > 0) === unpaid;
        }
        return match;
      });
      total = invoices.length;
    }

    return {
      data: invoices.map(invoice => this.mapToResponseDto(invoice)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findSummaries(): Promise<InvoiceSummaryDto[]> {
    const invoices = await this.invoiceRepository.find({
      relations: ['customer'],
      order: { invoiceDate: 'DESC' },
      take: 100, // Limit to recent invoices
    });

    return invoices.map(invoice => ({
      id: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      status: invoice.status,
      invoiceDate: invoice.invoiceDate,
      dueDate: invoice.dueDate,
      customerName: invoice.customer?.name || invoice.customerName,
      totalAmount: Number(invoice.totalAmount),
      balanceDue: Number(invoice.balanceDue),
      isOverdue: invoice.isOverdue,
      daysPastDue: invoice.daysPastDue,
    }));
  }

  async getDashboardStats() {
    const today = new Date();
    const thisMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const thisWeek = new Date(today.setDate(today.getDate() - today.getDay()));

    const [
      totalInvoices,
      draftInvoices,
      sentInvoices,
      paidInvoices,
      overdueInvoices,
      thisMonthInvoices,
      thisWeekInvoices,
    ] = await Promise.all([
      this.invoiceRepository.count(),
      this.invoiceRepository.count({ where: { status: InvoiceStatus.DRAFT } }),
      this.invoiceRepository.count({ where: { status: InvoiceStatus.SENT } }),
      this.invoiceRepository.count({ where: { status: InvoiceStatus.PAID } }),
      this.invoiceRepository
        .createQueryBuilder('invoice')
        .where('invoice.dueDate < :today', { today: new Date() })
        .andWhere('invoice.status NOT IN (:...paidStatuses)', {
          paidStatuses: [InvoiceStatus.PAID, InvoiceStatus.CANCELLED, InvoiceStatus.REFUNDED],
        })
        .getCount(),
      this.invoiceRepository.count({ where: { invoiceDate: MoreThanOrEqual(thisMonth) } }),
      this.invoiceRepository.count({ where: { invoiceDate: MoreThanOrEqual(thisWeek) } }),
    ]);

    const totalRevenueResult = await this.invoiceRepository
      .createQueryBuilder('invoice')
      .select('COALESCE(SUM(invoice.totalAmount), 0)', 'total')
      .where('invoice.status != :cancelled', { cancelled: InvoiceStatus.CANCELLED })
      .getRawOne();

    const outstandingAmountResult = await this.invoiceRepository
      .createQueryBuilder('invoice')
      .select('COALESCE(SUM(invoice.balanceDue), 0)', 'total')
      .where('invoice.balanceDue > 0')
      .andWhere('invoice.status NOT IN (:...paidStatuses)', {
        paidStatuses: [InvoiceStatus.PAID, InvoiceStatus.CANCELLED, InvoiceStatus.REFUNDED],
      })
      .getRawOne();

    const thisMonthRevenueResult = await this.invoiceRepository
      .createQueryBuilder('invoice')
      .select('COALESCE(SUM(invoice.paidAmount), 0)', 'total')
      .where('invoice.invoiceDate >= :startDate', { startDate: thisMonth })
      .getRawOne();

    return {
      invoices: {
        total: totalInvoices,
        draft: draftInvoices,
        sent: sentInvoices,
        paid: paidInvoices,
        overdue: overdueInvoices,
        thisMonth: thisMonthInvoices,
        thisWeek: thisWeekInvoices,
      },
      revenue: {
        total: parseFloat(totalRevenueResult.total) || 0,
        outstanding: parseFloat(outstandingAmountResult.total) || 0,
        thisMonth: parseFloat(thisMonthRevenueResult.total) || 0,
      },
    };
  }

  async getOverdueInvoices(): Promise<InvoiceSummaryDto[]> {
    const invoices = await this.invoiceRepository
      .createQueryBuilder('invoice')
      .leftJoinAndSelect('invoice.customer', 'customer')
      .where('invoice.dueDate < :today', { today: new Date() })
      .andWhere('invoice.balanceDue > 0')
      .andWhere('invoice.status NOT IN (:...excludedStatuses)', {
        excludedStatuses: [InvoiceStatus.PAID, InvoiceStatus.CANCELLED, InvoiceStatus.REFUNDED],
      })
      .orderBy('invoice.dueDate', 'ASC')
      .getMany();

    return invoices.map(invoice => ({
      id: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      status: invoice.status,
      invoiceDate: invoice.invoiceDate,
      dueDate: invoice.dueDate,
      customerName: invoice.customer?.name || invoice.customerName,
      totalAmount: Number(invoice.totalAmount),
      balanceDue: Number(invoice.balanceDue),
      isOverdue: invoice.isOverdue,
      daysPastDue: invoice.daysPastDue,
    }));
  }

  async getAgingReport() {
    const today = new Date();
    
    const agingBuckets = {
      current: 0,
      days1to30: 0,
      days31to60: 0,
      days61to90: 0,
      over90Days: 0,
    };

    const overdueInvoices = await this.invoiceRepository
      .createQueryBuilder('invoice')
      .where('invoice.balanceDue > 0')
      .andWhere('invoice.status NOT IN (:...excludedStatuses)', {
        excludedStatuses: [InvoiceStatus.PAID, InvoiceStatus.CANCELLED, InvoiceStatus.REFUNDED],
      })
      .getMany();

    overdueInvoices.forEach(invoice => {
      const daysPastDue = invoice.daysPastDue;
      const balanceDue = Number(invoice.balanceDue);

      if (daysPastDue <= 0) {
        agingBuckets.current += balanceDue;
      } else if (daysPastDue <= 30) {
        agingBuckets.days1to30 += balanceDue;
      } else if (daysPastDue <= 60) {
        agingBuckets.days31to60 += balanceDue;
      } else if (daysPastDue <= 90) {
        agingBuckets.days61to90 += balanceDue;
      } else {
        agingBuckets.over90Days += balanceDue;
      }
    });

    const totalOutstanding = Object.values(agingBuckets).reduce((sum, amount) => sum + amount, 0);

    return {
      agingBuckets,
      totalOutstanding,
      invoiceCount: overdueInvoices.length,
      generatedAt: new Date(),
    };
  }

  async findById(id: string): Promise<InvoiceResponseDto> {
    const invoice = await this.invoiceRepository.findOne({
      where: { id },
      relations: ['customer', 'salesOrder'],
    });

    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }

    return this.mapToResponseDto(invoice);
  }

  async findByInvoiceNumber(invoiceNumber: string): Promise<InvoiceResponseDto> {
    const invoice = await this.invoiceRepository.findOne({
      where: { invoiceNumber },
      relations: ['customer', 'salesOrder'],
    });

    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }

    return this.mapToResponseDto(invoice);
  }

  async update(id: string, updateInvoiceDto: UpdateInvoiceDto): Promise<InvoiceResponseDto> {
    const invoice = await this.invoiceRepository.findOne({ where: { id } });
    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }

    // Check if invoice can be updated
    if ([InvoiceStatus.PAID, InvoiceStatus.CANCELLED, InvoiceStatus.REFUNDED].includes(invoice.status)) {
      throw new ConflictException('Cannot update invoice in current status');
    }

    Object.assign(invoice, updateInvoiceDto);

    // Recalculate totals if financial data changed
    if (updateInvoiceDto.discountPercent !== undefined || 
        updateInvoiceDto.taxPercent !== undefined || 
        updateInvoiceDto.additionalCharges !== undefined ||
        updateInvoiceDto.lineItems !== undefined) {
      
      if (updateInvoiceDto.lineItems) {
        const subtotal = updateInvoiceDto.lineItems.reduce((sum, item) => sum + item.totalAmount, 0);
        invoice.subtotal = subtotal;
      }
      
      invoice.calculateTotals();
    }

    const savedInvoice = await this.invoiceRepository.save(invoice);
    return this.findById(savedInvoice.id);
  }

  async delete(id: string): Promise<void> {
    const invoice = await this.invoiceRepository.findOne({ where: { id } });
    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }

    if (![InvoiceStatus.DRAFT, InvoiceStatus.SENT].includes(invoice.status)) {
      throw new ConflictException('Cannot delete invoice in current status');
    }

    // Check if invoice has payments
    const paymentCount = await this.paymentRepository.count({ where: { invoiceId: id } });
    if (paymentCount > 0) {
      throw new ConflictException('Cannot delete invoice with payments');
    }

    // Soft delete by setting status to cancelled
    invoice.status = InvoiceStatus.CANCELLED;
    invoice.internalNotes = `${invoice.internalNotes || ''}\nDeleted on ${new Date().toISOString()}`;
    
    await this.invoiceRepository.save(invoice);
  }

  async sendInvoice(id: string, sendInvoiceDto: SendInvoiceDto): Promise<InvoiceResponseDto> {
    const invoice = await this.invoiceRepository.findOne({
      where: { id },
      relations: ['customer'],
    });

    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }

    if ([InvoiceStatus.PAID, InvoiceStatus.CANCELLED, InvoiceStatus.REFUNDED].includes(invoice.status)) {
      throw new ConflictException('Cannot send invoice in current status');
    }

    const emailAddresses = sendInvoiceDto.emailAddresses || 
      (invoice.customer?.email ? [invoice.customer.email] : []);
    
    if (emailAddresses.length === 0) {
      throw new BadRequestException('No email addresses provided and customer has no email');
    }

    const subject = sendInvoiceDto.subject || 
      `Invoice ${invoice.invoiceNumber} from Your Company`;
    
    const message = sendInvoiceDto.message || 
      `Please find attached your invoice. Payment is due by ${invoice.dueDate.toLocaleDateString()}.`;

    // Generate PDF (implement PDF generation service)
    const pdfBuffer = await this.generatePdf(id);

    // Send email with PDF attachment
    for (const email of emailAddresses) {
      /* 
      await this.emailService.sendEmail({ // Temporarily disabled
        to: email,
        subject,
        body: message,
        attachments: [{
          filename: `invoice-${invoice.invoiceNumber}.pdf`,
          content: pdfBuffer,
          contentType: 'application/pdf',
        }],
      });
      */
    }

    // Mark as sent if requested
    if (sendInvoiceDto.markAsSent !== false) {
      invoice.markAsSent();
    }

    const savedInvoice = await this.invoiceRepository.save(invoice);
    return this.findById(savedInvoice.id);
  }

  async markAsSent(id: string): Promise<InvoiceResponseDto> {
    const invoice = await this.invoiceRepository.findOne({ where: { id } });
    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }

    invoice.markAsSent();
    const savedInvoice = await this.invoiceRepository.save(invoice);
    return this.findById(savedInvoice.id);
  }

  async allocatePayment(id: string, allocationDto: InvoicePaymentAllocationDto): Promise<InvoiceResponseDto> {
    const invoice = await this.invoiceRepository.findOne({ where: { id } });
    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }

    const payment = await this.paymentRepository.findOne({ 
      where: { id: allocationDto.paymentId } 
    });
    if (!payment) {
      throw new NotFoundException('Payment not found');
    }

    // Validate allocation amount
    if (allocationDto.amount > Number(invoice.balanceDue)) {
      throw new ConflictException('Allocation amount exceeds balance due');
    }

    if (allocationDto.amount > Number(payment.amount)) {
      throw new ConflictException('Allocation amount exceeds payment amount');
    }

    // Apply payment to invoice
    invoice.addPayment(allocationDto.amount);
    
    // Update payment invoice reference if not already set
    if (!payment.invoiceId) {
      payment.invoiceId = id;
      await this.paymentRepository.save(payment);
    }

    const savedInvoice = await this.invoiceRepository.save(invoice);
    return this.findById(savedInvoice.id);
  }

  async voidInvoice(id: string, reason: string): Promise<InvoiceResponseDto> {
    const invoice = await this.invoiceRepository.findOne({
      where: { id },
      relations: ['customer'],
    });

    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }

    if (invoice.status === InvoiceStatus.PAID && Number(invoice.paidAmount) > 0) {
      throw new ConflictException('Cannot void paid invoice. Create a credit note instead.');
    }

    // Revert customer balance if invoice was sent
    if ([InvoiceStatus.SENT, InvoiceStatus.PARTIALLY_PAID].includes(invoice.status)) {
      const customer = invoice.customer;
      if (customer) {
        customer.updateBalance(Number(invoice.totalAmount), 'decrease');
        await this.customerRepository.save(customer);
      }
    }

    invoice.cancel();
    invoice.internalNotes = `${invoice.internalNotes || ''}\nVoided: ${reason}`;
    
    const savedInvoice = await this.invoiceRepository.save(invoice);
    return this.findById(savedInvoice.id);
  }

  async createCreditNote(id: string, creditNoteDto: CreditNoteDto): Promise<InvoiceResponseDto> {
    const originalInvoice = await this.invoiceRepository.findOne({
      where: { id },
      relations: ['customer'],
    });

    if (!originalInvoice) {
      throw new NotFoundException('Invoice not found');
    }

    if (creditNoteDto.creditAmount > Number(originalInvoice.totalAmount)) {
      throw new ConflictException('Credit amount cannot exceed original invoice amount');
    }

    const creditNote = this.invoiceRepository.create({
      customerId: originalInvoice.customerId,
      type: InvoiceType.CREDIT_NOTE,
      invoiceDate: new Date(),
      dueDate: new Date(), // Credit notes are immediate
      customerName: originalInvoice.customerName,
      billingAddress: originalInvoice.billingAddress,
      customerTaxId: originalInvoice.customerTaxId,
      subtotal: -Math.abs(creditNoteDto.creditAmount), // Negative amount
      totalAmount: -Math.abs(creditNoteDto.creditAmount),
      balanceDue: -Math.abs(creditNoteDto.creditAmount),
      status: InvoiceStatus.SENT,
      notes: `Credit note for Invoice ${originalInvoice.invoiceNumber}`,
      internalNotes: creditNoteDto.reason,
      lineItems: creditNoteDto.lineItems || [],
    });

    // Apply credit note to original invoice
    originalInvoice.paidAmount = Number(originalInvoice.paidAmount) + creditNoteDto.creditAmount;
    originalInvoice.calculateTotals();
    originalInvoice.updateStatus();

    const [savedCreditNote] = await Promise.all([
      this.invoiceRepository.save(creditNote),
      this.invoiceRepository.save(originalInvoice),
    ]);

    return this.findById(savedCreditNote.id);
  }

  async duplicateInvoice(id: string): Promise<InvoiceResponseDto> {
    const originalInvoice = await this.invoiceRepository.findOne({ where: { id } });
    if (!originalInvoice) {
      throw new NotFoundException('Invoice not found');
    }

    const duplicateData: CreateInvoiceDto = {
      customerId: originalInvoice.customerId,
      salesOrderId: originalInvoice.salesOrderId,
      type: originalInvoice.type,
      subtotal: Number(originalInvoice.subtotal),
      discountPercent: Number(originalInvoice.discountPercent),
      taxPercent: Number(originalInvoice.taxPercent),
      additionalCharges: Number(originalInvoice.additionalCharges),
      paymentTermsDays: originalInvoice.paymentTermsDays,
      paymentTerms: originalInvoice.paymentTerms,
      notes: originalInvoice.notes,
      customerPoNumber: originalInvoice.customerPoNumber,
      lineItems: originalInvoice.lineItems || [],
    };

    return this.create(duplicateData);
  }

  async generatePdf(id: string): Promise<Buffer> {
    const invoice = await this.findById(id);
    
    // This is a placeholder - implement actual PDF generation using a library like PDFKit or Puppeteer
    // For now, return a simple buffer
    const pdfContent = `Invoice: ${invoice.invoiceNumber}\nCustomer: ${invoice.customerName}\nAmount: $${invoice.totalAmount}`;
    return Buffer.from(pdfContent, 'utf-8');
  }

  async getInvoicePayments(id: string) {
    const invoice = await this.invoiceRepository.findOne({ where: { id } });
    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }

    const payments = await this.paymentRepository.find({
      where: { invoiceId: id },
      order: { paymentDate: 'DESC' },
    });

    return {
      invoiceId: id,
      invoiceNumber: invoice.invoiceNumber,
      totalAmount: Number(invoice.totalAmount),
      paidAmount: Number(invoice.paidAmount),
      balanceDue: Number(invoice.balanceDue),
      payments: payments.map(payment => ({
        id: payment.id,
        paymentNumber: payment.paymentNumber,
        paymentDate: payment.paymentDate,
        amount: Number(payment.amount),
        paymentMethod: payment.paymentMethod,
        status: payment.status,
        referenceNumber: payment.referenceNumber,
      })),
    };
  }

  async findInvoicesByCustomer(customerId: string, limit: number = 10) {
    const invoices = await this.invoiceRepository.find({
      where: { customerId },
      order: { invoiceDate: 'DESC' },
      take: limit,
    });

    return invoices.map(invoice => ({
      id: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      status: invoice.status,
      invoiceDate: invoice.invoiceDate,
      dueDate: invoice.dueDate,
      totalAmount: Number(invoice.totalAmount),
      balanceDue: Number(invoice.balanceDue),
      isOverdue: invoice.isOverdue,
      daysPastDue: invoice.daysPastDue,
    }));
  }

  async getInvoiceHistory(id: string) {
    const invoice = await this.invoiceRepository.findOne({
      where: { id },
      relations: ['payments'],
    });

    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }

    // Build history from status changes and payments
    const history = [];

    // Add creation event
    history.push({
      date: invoice.createdAt,
      event: 'created',
      description: `Invoice ${invoice.invoiceNumber} created`,
      amount: Number(invoice.totalAmount),
    });

    // Add sent event if applicable
    if (invoice.sentDate) {
      history.push({
        date: invoice.sentDate,
        event: 'sent',
        description: 'Invoice sent to customer',
      });
    }

    // Add payment events
    if (invoice.payments) {
      invoice.payments.forEach(payment => {
        if (payment.status === 'completed') {
          history.push({
            date: payment.paymentDate,
            event: 'payment',
            description: `Payment received: ${payment.paymentMethod}`,
            amount: Number(payment.amount),
            reference: payment.referenceNumber,
          });
        }
      });
    }

    // Add paid event if applicable
    if (invoice.paidDate) {
      history.push({
        date: invoice.paidDate,
        event: 'paid',
        description: 'Invoice fully paid',
      });
    }

    // Sort by date
    history.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    return {
      invoiceId: id,
      invoiceNumber: invoice.invoiceNumber,
      history,
    };
  }

  async batchSendInvoices(invoiceIds: string[]) {
    const results = [];
    
    for (const invoiceId of invoiceIds) {
      try {
        const invoice = await this.sendInvoice(invoiceId, { markAsSent: true });
        results.push({
          invoiceId,
          invoiceNumber: invoice.invoiceNumber,
          success: true,
          message: 'Invoice sent successfully',
        });
      } catch (error) {
        results.push({
          invoiceId,
          success: false,
          error: error.message,
        });
      }
    }

    return {
      totalProcessed: invoiceIds.length,
      successful: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
      results,
    };
  }

  async getRevenueStatistics(fromDate?: string, toDate?: string) {
    let query = this.invoiceRepository
      .createQueryBuilder('invoice')
      .where('invoice.status != :cancelled', { cancelled: InvoiceStatus.CANCELLED });

    if (fromDate) {
      query = query.andWhere('invoice.invoiceDate >= :fromDate', { fromDate: new Date(fromDate) });
    }
    if (toDate) {
      query = query.andWhere('invoice.invoiceDate <= :toDate', { toDate: new Date(toDate) });
    }

    const [
      totalRevenue,
      paidRevenue,
      outstandingRevenue,
      invoiceCount,
      averageInvoiceValue,
    ] = await Promise.all([
      query.clone().select('COALESCE(SUM(invoice.totalAmount), 0)', 'total').getRawOne(),
      query.clone().select('COALESCE(SUM(invoice.paidAmount), 0)', 'total').getRawOne(),
      query.clone().select('COALESCE(SUM(invoice.balanceDue), 0)', 'total').getRawOne(),
      query.clone().getCount(),
      query.clone().select('COALESCE(AVG(invoice.totalAmount), 0)', 'average').getRawOne(),
    ]);

    return {
      period: {
        fromDate: fromDate || null,
        toDate: toDate || null,
      },
      revenue: {
        total: parseFloat(totalRevenue.total) || 0,
        paid: parseFloat(paidRevenue.total) || 0,
        outstanding: parseFloat(outstandingRevenue.total) || 0,
      },
      invoices: {
        count: invoiceCount,
        averageValue: parseFloat(averageInvoiceValue.average) || 0,
      },
      generatedAt: new Date(),
    };
  }

  // Helper methods

  private mapToResponseDto(invoice: Invoice): InvoiceResponseDto {
    return {
      id: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      type: invoice.type,
      status: invoice.status,
      invoiceDate: invoice.invoiceDate,
      dueDate: invoice.dueDate,
      sentDate: invoice.sentDate,
      paidDate: invoice.paidDate,
      subtotal: Number(invoice.subtotal),
      discountPercent: Number(invoice.discountPercent),
      discountAmount: Number(invoice.discountAmount),
      taxPercent: Number(invoice.taxPercent),
      taxAmount: Number(invoice.taxAmount),
      additionalCharges: Number(invoice.additionalCharges),
      totalAmount: Number(invoice.totalAmount),
      paidAmount: Number(invoice.paidAmount),
      balanceDue: Number(invoice.balanceDue),
      paymentTermsDays: invoice.paymentTermsDays,
      paymentTerms: invoice.paymentTerms,
      notes: invoice.notes,
      internalNotes: invoice.internalNotes,
      customerName: invoice.customerName,
      billingAddress: invoice.billingAddress,
      customerTaxId: invoice.customerTaxId,
      customerPoNumber: invoice.customerPoNumber,
      lineItems: invoice.lineItems,
      customerId: invoice.customerId,
      salesOrderId: invoice.salesOrderId,
      customer: invoice.customer ? {
        id: invoice.customer.id,
        customerCode: invoice.customer.customerCode,
        name: invoice.customer.name,
        email: invoice.customer.email,
        phone: invoice.customer.phone,
      } : undefined,
      salesOrder: invoice.salesOrder ? {
        id: invoice.salesOrder.id,
        orderNumber: invoice.salesOrder.orderNumber,
        orderDate: invoice.salesOrder.orderDate,
        status: invoice.salesOrder.status,
      } : undefined,
      createdAt: invoice.createdAt,
      updatedAt: invoice.updatedAt,
      isOverdue: invoice.isOverdue,
      daysPastDue: invoice.daysPastDue,
      isPartiallyPaid: invoice.isPartiallyPaid,
      isFullyPaid: invoice.isFullyPaid,
      paymentProgress: invoice.paymentProgress,
    };
  }
}