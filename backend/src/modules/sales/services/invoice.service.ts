import { AuditLogService } from '../../audit-logs/services';
import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, FindOptionsWhere, FindManyOptions, MoreThanOrEqual, LessThanOrEqual, Between, ILike, In } from 'typeorm';
import {
  Invoice,
  InvoiceStatus
} from '../../../database/entities/invoice.entity';
import { Customer } from '../../../database/entities/customer.entity';
import { SalesOrder } from '../../../database/entities/sales-order.entity';
import { Payment } from '../../../database/entities/payment.entity';
import { Product } from '../../../database/entities/product.entity';
import { InvoiceItem } from '../../../database/entities/invoice-item.entity';
import {
  CreateInvoiceDto,
  UpdateInvoiceDto,
  QueryInvoicesDto,
  InvoiceResponseDto,
  InvoiceSummaryDto,
  SendInvoiceDto,
  InvoicePaymentAllocationDto,
} from '../dto/invoice.dto';
import { GlobalSearchResultDto } from '../../search/dto/global-search-result.dto';
import { canSearchInvoices } from '../../search/search.permissions';
import {
  SEARCH_CANDIDATE_LIMIT,
  SCORE_EXACT_CODE,
  SCORE_STARTSWITH_CODE,
  SCORE_CONTAINS,
  SCORE_FUZZY,
  BOOST_INVOICE,
  BOOST_EXACT_MATCH,
} from '../../search/search.constants';
import { JwtPayload } from '../../auth/strategies/jwt.strategy';
import { UserRole } from '../../../database/entities/user.entity';
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
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,
    @InjectRepository(InvoiceItem)
    private readonly invoiceItemRepository: Repository<InvoiceItem>,
    private readonly auditLogService: AuditLogService,
    // private readonly emailService: EmailService, // Temporarily disabled
  ) {}

  private async generateSequentialInvoiceNumber(): Promise<string> {
    // Get all existing invoice numbers that match the sequential format
    const invoices = await this.invoiceRepository.find({
      select: ['invoiceNumber']
    });

    let maxNumber = 0;
    for (const invoice of invoices) {
      // Extract number from format INV-000001 (only sequential format)
      const match = invoice.invoiceNumber.match(/^INV-(\d+)$/);
      if (match) {
        const num = parseInt(match[1]);
        if (num > maxNumber) {
          maxNumber = num;
        }
      }
    }

    // Next sequential number
    const nextNumber = maxNumber + 1;

    // Format with leading zeros (6 digits)
    return `INV-${nextNumber.toString().padStart(6, '0')}`;
  }

  async create(
    createInvoiceDto: CreateInvoiceDto,
    userId?: string,
    username?: string,
  ): Promise<InvoiceResponseDto> {
    const { customerId, salesOrderId, ...invoiceData } = createInvoiceDto;

    // Verify customer exists
    const customer = await this.customerRepository.findOne({ where: { id: customerId } });
    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    // Verify sales order exists if provided and load its items
    let salesOrder: SalesOrder | null = null;
    if (salesOrderId) {
      salesOrder = await this.salesOrderRepository.findOne({
        where: { id: salesOrderId },
        relations: ['items']
      });
      if (!salesOrder) {
        throw new NotFoundException('Sales order not found');
      }
    }

    // Calculate total amount from sales order or use provided amount
    const totalAmount = createInvoiceDto.totalAmount || (salesOrder?.totalAmount || 0);

    // Generate sequential invoice number
    const invoiceNumber = await this.generateSequentialInvoiceNumber();

    // Create invoice
    const invoice = this.invoiceRepository.create({
      ...invoiceData,
      invoiceNumber,
      customerId,
      salesOrderId,
            invoiceDate: invoiceData.invoiceDate ? new Date(invoiceData.invoiceDate) : new Date(),
      totalAmount,
      balanceDue: totalAmount,
      paidAmount: 0,
      status: InvoiceStatus.DRAFT,
    });

    const savedInvoice = await this.invoiceRepository.save(invoice);

    // Copy sales order items to invoice items if sales order exists
    if (salesOrder && salesOrder.items && salesOrder.items.length > 0) {
      const invoiceItemsData = salesOrder.items.map(soItem => ({
        invoiceId: savedInvoice.id,
        lineNumber: soItem.lineNumber,
        productId: soItem.productId,
        quantity: Number(soItem.quantity),
        unitPrice: Number(soItem.unitPrice),
        discountType: soItem.discountType,
        discountPercent: Number(soItem.discountPercent || 0),
        discount: Number(soItem.discountAmount),
        totalAmount: Number(soItem.totalAmount),
      }));

      await this.invoiceItemRepository.insert(invoiceItemsData);
    }

    // Log audit trail for create
    await this.auditLogService.log(
      'CREATE',
      'Invoice',
      `Created invoice: ${savedInvoice.invoiceNumber}`,
      {
        entityId: savedInvoice.id,
        userId: userId || 'system',
        username,
        newValues: {
          invoiceNumber: savedInvoice.invoiceNumber,
          customerId,
          totalAmount,
          status: savedInvoice.status,
        },
      }
    );

    return this.findById(savedInvoice.id);
  }

  async findAll(query: QueryInvoicesDto) {
    const {
      search,
      customerId,
      salesOrderId,
      status,
      fromDate,
      toDate,
      overdue,
      unpaid,
      sortBy = 'invoiceDate',
      sortOrder = 'DESC',
    } = query;

    const where: FindOptionsWhere<Invoice> = {};

    if (customerId) where.customerId = customerId;
    if (salesOrderId) where.salesOrderId = salesOrderId;
    if (status) where.status = status;

    if (fromDate && toDate) {
      const endDate = new Date(toDate);
      endDate.setHours(23, 59, 59, 999);
      where.invoiceDate = Between(new Date(fromDate), endDate);
    } else if (fromDate) {
      where.invoiceDate = MoreThanOrEqual(new Date(fromDate));
    } else if (toDate) {
      const endDate = new Date(toDate);
      endDate.setHours(23, 59, 59, 999);
      where.invoiceDate = LessThanOrEqual(endDate);
    }

    const searchConditions = [];
    if (search) {
      searchConditions.push(
        { invoiceNumber: ILike(`%${search}%`) },
        { customer: { name: ILike(`%${search}%`) } },
      );
    }

    const findOptions: FindManyOptions<Invoice> = {
      where: searchConditions.length > 0 ? searchConditions.map(condition => ({ ...where, ...condition })) : where,
      relations: ['customer', 'salesOrder', 'payments', 'items', 'items.product'],
      order: { [sortBy]: sortOrder },
    };

    let [invoices, total] = await this.invoiceRepository.findAndCount(findOptions);

    // Filter unpaid invoices if requested (overdue filtering removed as it depends on dueDate)
    if (unpaid !== undefined) {
      invoices = invoices.filter(invoice => (Number(invoice.balanceDue) > 0) === unpaid);
      total = invoices.length;
    }

    // Map invoices to response DTOs with product information
    const data = await Promise.all(
      invoices.map(invoice => this.mapToResponseDto(invoice))
    );

    return {
      data,
      meta: {
        total,
      },
    };
  }

  async findSummaries(): Promise<InvoiceSummaryDto[]> {
    const invoices = await this.invoiceRepository.find({
      relations: ['customer'],
      order: { invoiceDate: 'DESC' },
    });

    return invoices.map(invoice => ({
      id: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      status: invoice.status,
      invoiceDate: invoice.invoiceDate,
      customerName: invoice.customer?.name,
      shippingAmount: Number(invoice.shippingAmount || 0),
      totalAmount: Number(invoice.totalAmount),
      balanceDue: Number(invoice.balanceDue),
    }));
  }

  async searchGlobal(query: string, user: JwtPayload): Promise<GlobalSearchResultDto[]> {
    if (!canSearchInvoices(user.role as UserRole)) return [];

    const trimmed = query.trim();
    const q = trimmed.toLowerCase();

    const results = await this.invoiceRepository
      .createQueryBuilder('invoice')
      .leftJoinAndSelect('invoice.customer', 'customer')
      .where('invoice.deletedAt IS NULL')
      .andWhere('invoice.invoiceNumber ILIKE :q', { q: `%${trimmed}%` })
      .take(SEARCH_CANDIDATE_LIMIT)
      .getMany();

    if (results.length > 0) {
      return results.map((inv) => this.mapInvoice(inv, q, false));
    }

    const fuzzyResults = await this.invoiceRepository
      .createQueryBuilder('invoice')
      .addSelect('similarity(invoice.invoiceNumber, :q)', 'sim')
      .leftJoinAndSelect('invoice.customer', 'customer')
      .where('invoice.deletedAt IS NULL')
      .andWhere('similarity(invoice.invoiceNumber, :q) > 0.3')
      .orderBy('sim', 'DESC')
      .setParameter('q', trimmed)
      .take(SEARCH_CANDIDATE_LIMIT)
      .getMany();

    return fuzzyResults.map((inv) => this.mapInvoice(inv, q, true));
  }

  private mapInvoice(inv: Invoice, q: string, fuzzy: boolean): GlobalSearchResultDto {
    const num = inv.invoiceNumber?.toLowerCase() ?? '';
    const baseScore = fuzzy
      ? SCORE_FUZZY
      : num === q
        ? SCORE_EXACT_CODE
        : num.startsWith(q)
          ? SCORE_STARTSWITH_CODE
          : SCORE_CONTAINS;

    return {
      type: 'invoice',
      id: inv.id,
      label: inv.invoiceNumber,
      description: inv.customer?.name ?? undefined,
      route: `/sales/invoices/${inv.id}`,
      score:
        baseScore +
        BOOST_INVOICE +
        (baseScore === SCORE_EXACT_CODE ? BOOST_EXACT_MATCH : 0),
    };
  }

  async getDashboardStats() {
    const today = new Date();
    const thisMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const thisWeek = new Date(today.setDate(today.getDate() - today.getDay()));

    const [
      totalInvoices,
      draftInvoices,
      partialPaidInvoices,
      paidInvoices,
      thisMonthInvoices,
      thisWeekInvoices,
    ] = await Promise.all([
      this.invoiceRepository.count(),
      this.invoiceRepository.count({ where: { status: InvoiceStatus.DRAFT } }),
      this.invoiceRepository.count({ where: { status: InvoiceStatus.PARTIAL_PAID } }),
      this.invoiceRepository.count({ where: { status: InvoiceStatus.PAID } }),
      // Overdue calculation removed as it depends on dueDate
      this.invoiceRepository.count({ where: { invoiceDate: MoreThanOrEqual(thisMonth) } }),
      this.invoiceRepository.count({ where: { invoiceDate: MoreThanOrEqual(thisWeek) } }),
    ]);

    const totalRevenueResult = await this.invoiceRepository
      .createQueryBuilder('invoice')
      .select('COALESCE(SUM(invoice.totalAmount), 0)', 'total')
      .getRawOne();

    const outstandingAmountResult = await this.invoiceRepository
      .createQueryBuilder('invoice')
      .select('COALESCE(SUM(invoice.balanceDue), 0)', 'total')
      .where('invoice.balanceDue > 0')
      .andWhere('invoice.status != :paid', { paid: InvoiceStatus.PAID })
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
        partialPaid: partialPaidInvoices,
        paid: paidInvoices,
        overdue: 0, // Overdue tracking removed as it depends on dueDate
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

  async getOverdueInvoices() {
    // Since we don't have dueDate field, return empty array
    // This endpoint is kept for API compatibility
    return {
      data: [],
      meta: {
        total: 0,
      },
    };
  }

  async getAgingReport() {
    // Since we don't have dueDate field, return empty aging buckets
    // This endpoint is kept for API compatibility
    return {
      aging0to30: 0,
      aging31to60: 0,
      aging61to90: 0,
      aging90Plus: 0,
      totalOutstanding: 0,
    };
  }

  async findById(id: string): Promise<InvoiceResponseDto> {
    const invoice = await this.invoiceRepository.findOne({
      where: { id },
      relations: ['customer', 'salesOrder', 'items', 'items.product'],
    });

    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }

    return this.mapToResponseDto(invoice);
  }

  async findByInvoiceNumber(invoiceNumber: string): Promise<InvoiceResponseDto> {
    const invoice = await this.invoiceRepository.findOne({
      where: { invoiceNumber },
      relations: ['customer', 'salesOrder', 'items', 'items.product'],
    });

    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }

    return this.mapToResponseDto(invoice);
  }

  async update(
    id: string,
    updateInvoiceDto: UpdateInvoiceDto,
    userId?: string,
    username?: string,
  ): Promise<InvoiceResponseDto> {
    const invoice = await this.invoiceRepository.findOne({ where: { id } });
    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }

    // Check if invoice can be updated
    if (invoice.status === InvoiceStatus.PAID) {
      throw new ConflictException('Cannot update invoice that is fully paid');
    }

    Object.assign(invoice, updateInvoiceDto);

    // No direct field updates in current implementation

    const savedInvoice = await this.invoiceRepository.save(invoice);

    await this.auditLogService.log(
      'UPDATE',
      'Invoice',
      `Updated invoice: ${savedInvoice.invoiceNumber}`,
      {
        entityId: savedInvoice.id,
        userId: userId || 'system',
        username,
        newValues: updateInvoiceDto,
      }
    );

    return this.findById(savedInvoice.id);
  }

  async syncItemsFromSalesOrder(invoiceId: string, userId?: string, username?: string): Promise<InvoiceResponseDto> {
    const invoice = await this.invoiceRepository.findOne({
      where: { id: invoiceId }
    });

    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }

    if (!invoice.salesOrderId) {
      throw new BadRequestException('Invoice is not linked to a sales order');
    }

    // Check if invoice can be updated
    if (invoice.status === InvoiceStatus.PAID) {
      throw new ConflictException('Cannot sync items for fully paid invoice');
    }

    // Load the sales order with items
    const salesOrder = await this.salesOrderRepository.findOne({
      where: { id: invoice.salesOrderId },
      relations: ['items']
    });

    if (!salesOrder) {
      throw new NotFoundException('Related sales order not found');
    }

    if (!salesOrder.items || salesOrder.items.length === 0) {
      throw new BadRequestException('Sales order has no items to sync');
    }

    // Delete existing invoice items using delete query
    await this.invoiceItemRepository.delete({ invoiceId: invoice.id });

    // Create new invoice items from sales order using insert (bypasses hooks)
    const invoiceItemsData = salesOrder.items.map(soItem => ({
      invoiceId: invoice.id,
      lineNumber: soItem.lineNumber,
      productId: soItem.productId,
      quantity: Number(soItem.quantity),
      unitPrice: Number(soItem.unitPrice),
      discountType: soItem.discountType,
      discountPercent: Number(soItem.discountPercent || 0),
      discount: Number(soItem.discountAmount),
      totalAmount: Number(soItem.totalAmount),
    }));

    // Insert all items directly
    await this.invoiceItemRepository.insert(invoiceItemsData);

    // Update invoice total amount and notes from sales order
    // IMPORTANT: Preserve existing paidAmount - only update totalAmount, notes, and recalculate balanceDue
    const currentPaidAmount = Number(invoice.paidAmount);
    invoice.totalAmount = Number(salesOrder.totalAmount);
    invoice.balanceDue = Number(salesOrder.totalAmount) - currentPaidAmount;
    invoice.notes = salesOrder.notes; // Sync notes from sales order

    // Update status based on payment state
    invoice.calculateTotals();
    invoice.updateStatus();

    await this.invoiceRepository.save(invoice);

    // Log audit trail for update
    await this.auditLogService.log(
      'UPDATE',
      'Invoice',
      `Updated invoice: ${invoice.invoiceNumber}`,
      {
        entityId: invoice.id,
        userId: userId || 'system',
        username,
        newValues: {
          status: invoice.status,
          totalAmount: invoice.totalAmount,
        },
      }
    );

    return this.findById(invoice.id);
  }

  async delete(id: string, userId?: string, username?: string): Promise<void> {
    const invoice = await this.invoiceRepository.findOne({ where: { id } });
    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }

    // Can only delete DRAFT invoices (no payments allowed)
    if (invoice.status !== InvoiceStatus.DRAFT) {
      throw new ConflictException('Can only delete invoices that are in DRAFT status');
    }

    // Check if invoice has payments
    const paymentCount = await this.paymentRepository.count({ where: { invoiceId: id } });
    if (paymentCount > 0) {
      throw new ConflictException('Cannot delete invoice with payments');
    }

    // Check if any payment has been recorded
    if (Number(invoice.paidAmount) > 0) {
      throw new ConflictException('Cannot delete invoice with recorded payments');
    }

    // Soft delete using TypeORM
    await this.invoiceRepository.softDelete(id);

    // Log audit trail for delete
    await this.auditLogService.log(
      'DELETE',
      'Invoice',
      `Deleted invoice: ${invoice.invoiceNumber}`,
      {
        entityId: id,
        userId: userId || 'system',
        username,
        oldValues: {
          invoiceNumber: invoice.invoiceNumber,
          status: invoice.status,
          totalAmount: invoice.totalAmount,
        },
      }
    );
  }

  async sendInvoice(id: string, sendInvoiceDto: SendInvoiceDto): Promise<InvoiceResponseDto> {
    const invoice = await this.invoiceRepository.findOne({
      where: { id },
      relations: ['customer'],
    });

    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }

    if (invoice.status === InvoiceStatus.PAID) {
      throw new ConflictException('Cannot send invoice that is already paid');
    }

    const emailAddresses = sendInvoiceDto.emailAddresses || [];

    if (emailAddresses.length === 0) {
      throw new BadRequestException('No email addresses provided and customer has no email');
    }

    // Email subject and message prepared but not used until email service is implemented
    // const subject = sendInvoiceDto.subject ||
    //   `Invoice ${invoice.invoiceNumber} from Your Company`;
    // const message = sendInvoiceDto.message ||
    //   `Please find attached your invoice.`;

    // Generate PDF (implement PDF generation service)
    // TODO: Implement PDF generation
    // const pdfBuffer = await this.generatePdf(id);

    // Send email with PDF attachment
    // Email functionality temporarily disabled
    // for (const email of emailAddresses) {
    //   // Send email logic here
    // }

    // Invoice sent successfully

    const savedInvoice = await this.invoiceRepository.save(invoice);
    return this.findById(savedInvoice.id);
  }

  async markAsSent(id: string): Promise<InvoiceResponseDto> {
    const invoice = await this.invoiceRepository.findOne({ where: { id } });
    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }

    // Invoice marked as sent
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

  async voidInvoice(id: string, _reason: string): Promise<InvoiceResponseDto> {
    const invoice = await this.invoiceRepository.findOne({
      where: { id },
      relations: ['customer'],
    });

    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }

    // Can only void unpaid invoices
    if (invoice.status === InvoiceStatus.PAID) {
      throw new ConflictException('Cannot void paid invoice. Create a credit note instead.');
    }

    // Mark as voided (reason parameter reserved for future audit logging)
    invoice.cancel();

    const savedInvoice = await this.invoiceRepository.save(invoice);
    return this.findById(savedInvoice.id);
  }

  
  async duplicateInvoice(id: string): Promise<InvoiceResponseDto> {
    const originalInvoice = await this.invoiceRepository.findOne({ where: { id } });
    if (!originalInvoice) {
      throw new NotFoundException('Invoice not found');
    }

    const duplicateData: CreateInvoiceDto = {
      customerId: originalInvoice.customerId,
      salesOrderId: originalInvoice.salesOrderId,
      totalAmount: Number(originalInvoice.totalAmount),
    };

    return this.create(duplicateData);
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
        paymentMethodId: payment.paymentMethodId,
        paymentMethod: payment.paymentMethodEntity?.code?.toLowerCase() || 'cash',
        status: payment.status,
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
      totalAmount: Number(invoice.totalAmount),
      balanceDue: Number(invoice.balanceDue),
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

    // Invoice sent event would be tracked here if needed

    // Add payment events
    if (invoice.payments) {
      invoice.payments.forEach(payment => {
        if (payment.status === 'completed') {
          history.push({
            date: payment.paymentDate,
            event: 'payment',
            description: `Payment received: ${payment.paymentMethodEntity?.name || payment.paymentMethodEntity?.code || 'Cash'}`,
            amount: Number(payment.amount),
            reference: payment.paymentNumber,
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
        const invoice = await this.sendInvoice(invoiceId, {});
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
      .createQueryBuilder('invoice');

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

  async findDeleted(query: QueryInvoicesDto = {}): Promise<any> {
    const {
      search,
      customerId,
      salesOrderId,
      sortBy = 'deletedAt',
      sortOrder = 'DESC',
    } = query;

    let queryBuilder = this.invoiceRepository
      .createQueryBuilder('invoice')
      .withDeleted() // Include soft-deleted records
      .leftJoinAndSelect('invoice.customer', 'customer')
      .leftJoinAndSelect('invoice.salesOrder', 'salesOrder')
      .where('invoice.deletedAt IS NOT NULL'); // Only get soft-deleted invoices

    if (customerId) {
      queryBuilder = queryBuilder.andWhere('invoice.customerId = :customerId', { customerId });
    }

    if (salesOrderId) {
      queryBuilder = queryBuilder.andWhere('invoice.salesOrderId = :salesOrderId', { salesOrderId });
    }

    if (search) {
      queryBuilder = queryBuilder.andWhere(
        '(invoice.invoiceNumber ILIKE :search OR customer.name ILIKE :search)',
        { search: `%${search}%` }
      );
    }

    // Add sorting
    queryBuilder = queryBuilder.orderBy(`invoice.${sortBy}`, sortOrder as 'ASC' | 'DESC');

    const [invoices, total] = await queryBuilder.getManyAndCount();

    // Map invoices to response DTOs with product information
    const data = await Promise.all(
      invoices.map(invoice => this.mapToResponseDto(invoice))
    );

    return {
      data,
      meta: {
        total,
      },
    };
  }

  async restore(id: string, userId?: string, username?: string): Promise<InvoiceResponseDto> {
    const invoice = await this.invoiceRepository.findOne({
      where: { id },
      withDeleted: true, // Include soft-deleted records
      relations: ['customer', 'salesOrder'],
    });

    if (!invoice) {
      throw new NotFoundException(`Invoice with ID ${id} not found`);
    }

    if (!invoice.deletedAt) {
      throw new ConflictException('Invoice is not deleted');
    }

    // Restore the invoice
    await this.invoiceRepository.restore(id);

    // Log audit trail for restore
    await this.auditLogService.log(
      'RESTORE',
      'Invoice',
      `Restored invoice: ${invoice.invoiceNumber}`,
      {
        entityId: id,
        userId: userId || 'system',
        username,
        newValues: {
          invoiceNumber: invoice.invoiceNumber,
          status: invoice.status,
          totalAmount: invoice.totalAmount,
        },
      }
    );

    // Return the restored invoice
    const restoredInvoice = await this.invoiceRepository.findOne({
      where: { id },
      relations: ['customer', 'salesOrder'],
    });

    return this.mapToResponseDto(restoredInvoice);
  }

  async bulkRestore(
    invoiceIds: string[],
    userId?: string,
    username?: string,
  ): Promise<{ message: string; restoredCount: number; failedIds: string[] }> {
    if (!invoiceIds || invoiceIds.length === 0) {
      return {
        message: 'No invoices to restore',
        restoredCount: 0,
        failedIds: [],
      };
    }

    const failedIds = [];
    let restoredCount = 0;

    for (const id of invoiceIds) {
      try {
        await this.restore(id, userId, username);
        restoredCount++;
      } catch (error) {
        failedIds.push(id);
      }
    }

    return {
      message: `Successfully restored ${restoredCount} of ${invoiceIds.length} invoices`,
      restoredCount,
      failedIds,
    };
  }

  // Helper methods

  private async mapToResponseDto(invoice: Invoice): Promise<InvoiceResponseDto> {
    return {
      id: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      status: invoice.status,
      invoiceDate: invoice.invoiceDate,
      paidDate: invoice.paidDate,
      shippingAmount: Number(invoice.shippingAmount || 0),
      totalAmount: Number(invoice.totalAmount),
      paidAmount: Number(invoice.paidAmount),
      balanceDue: Number(invoice.balanceDue),
      customerName: invoice.customer?.name,
      customerId: invoice.customerId,
      salesOrderId: invoice.salesOrderId,
      customer: invoice.customer ? {
        id: invoice.customer.id,
        name: invoice.customer.name,
        email: undefined, // Customer email field removed from entity
        phone: invoice.customer.phone,
        streetAddress: invoice.customer.streetAddress,
        city: invoice.customer.city,
        state: invoice.customer.state,
        postalCode: invoice.customer.postalCode,
        country: invoice.customer.country,
      } : undefined,
      salesOrder: invoice.salesOrder ? {
        id: invoice.salesOrder.id,
        orderNumber: invoice.salesOrder.orderNumber,
        orderDate: invoice.salesOrder.orderDate,
      } : undefined,
      payments: invoice.payments ? invoice.payments.map(payment => ({
        id: payment.id,
        paymentNumber: payment.paymentNumber,
        paymentDate: payment.paymentDate,
        amount: Number(payment.amount),
        paymentMethodId: payment.paymentMethodId,
        paymentMethod: payment.paymentMethodEntity?.code?.toLowerCase() || 'cash',
        status: payment.status,
      })) : undefined,
      items: invoice.items ? invoice.items.map(item => ({
        id: item.id,
        lineNumber: item.lineNumber,
        productId: item.productId,
        quantity: Number(item.quantity),
        unitPrice: Number(item.unitPrice),
        discountType: item.discountType,
        discountPercent: Number(item.discountPercent || 0),
        discount: Number(item.discount),
        totalAmount: Number(item.totalAmount),
        product: item.product ? {
          id: item.product.id,
          name: item.product.name,
          barcode: item.product.barcode,
        } : undefined,
      })) : undefined,
      notes: invoice.notes,
      createdAt: invoice.createdAt,
      updatedAt: invoice.updatedAt,
      deletedAt: invoice.deletedAt,
      // isOverdue and daysPastDue removed as they depend on dueDate
      isPartiallyPaid: invoice.isPartiallyPaid,
      isFullyPaid: invoice.isFullyPaid,
      paymentProgress: invoice.paymentProgress,
    };
  }
}
