import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, FindManyOptions, FindOptionsWhere, Between } from 'typeorm';
import { Customer } from '../../../database/entities/customer.entity';
import { SalesOrder, SalesOrderStatus } from '../../../database/entities/sales-order.entity';
import { SalesOrderItem } from '../../../database/entities/sales-order-item.entity';
import { Product } from '../../../database/entities/product.entity';
import { User } from '../../../database/entities/user.entity';
import {
  CreateQuotationDto,
  UpdateQuotationDto,
  QueryQuotationsDto,
  QuotationResponseDto,
  QuotationSummaryDto,
  ConvertQuotationDto,
  SendQuotationDto,
  QuotationStatus,
  QuotationItemResponseDto,
} from '../dto/quotation.dto';

// Temporary entity for quotations (in a real implementation, this would be a proper entity)
export interface Quotation {
  id: string;
  quotationNumber: string;
  referenceNumber?: string;
  status: QuotationStatus;
  quotationDate: Date;
  validUntil: Date;
  subtotal: number;
  discountPercent: number;
  discountAmount: number;
  taxPercent: number;
  taxAmount: number;
  shippingAmount: number;
  totalAmount: number;
  terms?: string;
  notes?: string;
  customerId: string;
  createdByUserId: string;
  createdAt: Date;
  updatedAt: Date;
  items: QuotationItem[];
}

export interface QuotationItem {
  id: string;
  quotationId: string;
  productId: string;
  productName: string;
  productSku: string;
  quantity: number;
  unitPrice: number;
  discountPercent: number;
  discountAmount: number;
  totalAmount: number;
  notes?: string;
}

@Injectable()
export class QuotationService {
  private readonly quotations: Map<string, Quotation> = new Map();

  constructor(
    @InjectRepository(Customer)
    private readonly customerRepository: Repository<Customer>,
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,
    @InjectRepository(SalesOrder)
    private readonly salesOrderRepository: Repository<SalesOrder>,
    @InjectRepository(SalesOrderItem)
    private readonly salesOrderItemRepository: Repository<SalesOrderItem>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  async create(createQuotationDto: CreateQuotationDto, createdByUserId: string): Promise<QuotationResponseDto> {
    // Verify customer exists
    const customer = await this.customerRepository.findOne({
      where: { id: createQuotationDto.customerId },
    });
    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    // Validate and process items
    const quotationItems: QuotationItem[] = [];
    let subtotal = 0;

    for (const itemDto of createQuotationDto.items) {
      const product = await this.productRepository.findOne({
        where: { id: itemDto.productId },
      });
      if (!product) {
        throw new NotFoundException(`Product ${itemDto.productId} not found`);
      }

      const itemDiscountAmount = (itemDto.unitPrice * itemDto.quantity * (itemDto.discountPercent || 0)) / 100;
      const itemTotalAmount = (itemDto.unitPrice * itemDto.quantity) - itemDiscountAmount;

      const quotationItem: QuotationItem = {
        id: this.generateId(),
        quotationId: '', // Will be set after quotation is created
        productId: itemDto.productId,
        productName: product.name,
        productSku: product.sku,
        quantity: itemDto.quantity,
        unitPrice: itemDto.unitPrice,
        discountPercent: itemDto.discountPercent || 0,
        discountAmount: itemDiscountAmount,
        totalAmount: itemTotalAmount,
        notes: itemDto.notes,
      };

      quotationItems.push(quotationItem);
      subtotal += itemTotalAmount;
    }

    // Create quotation
    const quotationId = this.generateId();
    const quotationNumber = await this.generateQuotationNumber();

    const quotation: Quotation = {
      id: quotationId,
      quotationNumber,
      referenceNumber: createQuotationDto.referenceNumber,
      status: QuotationStatus.DRAFT,
      quotationDate: createQuotationDto.quotationDate,
      validUntil: createQuotationDto.validUntil,
      subtotal,
      discountPercent: createQuotationDto.discountPercent || 0,
      discountAmount: 0,
      taxPercent: createQuotationDto.taxPercent || 0,
      taxAmount: 0,
      shippingAmount: createQuotationDto.shippingAmount || 0,
      totalAmount: 0,
      terms: createQuotationDto.terms,
      notes: createQuotationDto.notes,
      customerId: createQuotationDto.customerId,
      createdByUserId,
      createdAt: new Date(),
      updatedAt: new Date(),
      items: quotationItems.map(item => ({ ...item, quotationId })),
    };

    // Calculate totals
    this.calculateTotals(quotation);

    this.quotations.set(quotationId, quotation);

    return this.mapToResponseDto(quotation, customer);
  }

  async findAll(query: QueryQuotationsDto) {
    const {
      customerId,
      status,
      fromDate,
      toDate,
      search,
      expiringInDays,
      sortBy = 'quotationDate',
      sortOrder = 'DESC',
      page = 1,
      limit = 20,
    } = query;

    let quotations = Array.from(this.quotations.values());

    // Apply filters
    if (customerId) {
      quotations = quotations.filter(q => q.customerId === customerId);
    }

    if (status) {
      quotations = quotations.filter(q => q.status === status);
    }

    if (fromDate || toDate) {
      quotations = quotations.filter(q => {
        const quotationDate = q.quotationDate;
        const after = fromDate ? quotationDate >= fromDate : true;
        const before = toDate ? quotationDate <= toDate : true;
        return after && before;
      });
    }

    if (search) {
      const searchLower = search.toLowerCase();
      quotations = quotations.filter(q => 
        q.quotationNumber.toLowerCase().includes(searchLower) ||
        (q.referenceNumber && q.referenceNumber.toLowerCase().includes(searchLower))
      );
    }

    if (expiringInDays) {
      const expirationDate = new Date();
      expirationDate.setDate(expirationDate.getDate() + expiringInDays);
      quotations = quotations.filter(q => 
        q.validUntil <= expirationDate && q.status === QuotationStatus.SENT
      );
    }

    // Sort
    quotations.sort((a, b) => {
      const aValue = a[sortBy as keyof Quotation] as any;
      const bValue = b[sortBy as keyof Quotation] as any;
      
      if (sortOrder === 'ASC') {
        return aValue > bValue ? 1 : aValue < bValue ? -1 : 0;
      } else {
        return aValue < bValue ? 1 : aValue > bValue ? -1 : 0;
      }
    });

    // Paginate
    const total = quotations.length;
    const startIndex = (page - 1) * limit;
    const paginatedQuotations = quotations.slice(startIndex, startIndex + limit);

    // Get customer data for response
    const customerIds = [...new Set(paginatedQuotations.map(q => q.customerId))];
    const customers = await this.customerRepository.findByIds(customerIds);
    const customerMap = new Map(customers.map(c => [c.id, c]));

    return {
      data: paginatedQuotations.map(quotation => 
        this.mapToResponseDto(quotation, customerMap.get(quotation.customerId))
      ),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findById(id: string): Promise<QuotationResponseDto> {
    const quotation = this.quotations.get(id);
    if (!quotation) {
      throw new NotFoundException('Quotation not found');
    }

    const customer = await this.customerRepository.findOne({
      where: { id: quotation.customerId },
    });

    return this.mapToResponseDto(quotation, customer);
  }

  async update(id: string, updateQuotationDto: UpdateQuotationDto): Promise<QuotationResponseDto> {
    const quotation = this.quotations.get(id);
    if (!quotation) {
      throw new NotFoundException('Quotation not found');
    }

    // Prevent updates to converted or expired quotations
    if (quotation.status === QuotationStatus.CONVERTED) {
      throw new BadRequestException('Cannot update converted quotation');
    }
    if (quotation.status === QuotationStatus.EXPIRED) {
      throw new BadRequestException('Cannot update expired quotation');
    }

    // Update quotation properties
    Object.assign(quotation, updateQuotationDto);
    quotation.updatedAt = new Date();

    // Update items if provided
    if (updateQuotationDto.items) {
      const updatedItems: QuotationItem[] = [];
      let subtotal = 0;

      for (const itemDto of updateQuotationDto.items) {
        const product = await this.productRepository.findOne({
          where: { id: itemDto.productId },
        });
        if (!product) {
          throw new NotFoundException(`Product ${itemDto.productId} not found`);
        }

        const itemDiscountAmount = (itemDto.unitPrice * itemDto.quantity * (itemDto.discountPercent || 0)) / 100;
        const itemTotalAmount = (itemDto.unitPrice * itemDto.quantity) - itemDiscountAmount;

        const quotationItem: QuotationItem = {
          id: this.generateId(),
          quotationId: id,
          productId: itemDto.productId,
          productName: product.name,
          productSku: product.sku,
          quantity: itemDto.quantity,
          unitPrice: itemDto.unitPrice,
          discountPercent: itemDto.discountPercent || 0,
          discountAmount: itemDiscountAmount,
          totalAmount: itemTotalAmount,
          notes: itemDto.notes,
        };

        updatedItems.push(quotationItem);
        subtotal += itemTotalAmount;
      }

      quotation.items = updatedItems;
      quotation.subtotal = subtotal;
    }

    // Recalculate totals
    this.calculateTotals(quotation);

    this.quotations.set(id, quotation);

    const customer = await this.customerRepository.findOne({
      where: { id: quotation.customerId },
    });

    return this.mapToResponseDto(quotation, customer);
  }

  async send(sendQuotationDto: SendQuotationDto): Promise<QuotationResponseDto> {
    const quotation = this.quotations.get(sendQuotationDto.quotationId);
    if (!quotation) {
      throw new NotFoundException('Quotation not found');
    }

    if (quotation.status !== QuotationStatus.DRAFT) {
      throw new BadRequestException('Only draft quotations can be sent');
    }

    // Update status
    quotation.status = QuotationStatus.SENT;
    quotation.updatedAt = new Date();

    this.quotations.set(quotation.id, quotation);

    // In a real implementation, you would send email here
    // await this.emailService.sendQuotation(quotation, sendQuotationDto.emailAddresses);

    const customer = await this.customerRepository.findOne({
      where: { id: quotation.customerId },
    });

    return this.mapToResponseDto(quotation, customer);
  }

  async accept(id: string): Promise<QuotationResponseDto> {
    const quotation = this.quotations.get(id);
    if (!quotation) {
      throw new NotFoundException('Quotation not found');
    }

    if (quotation.status !== QuotationStatus.SENT) {
      throw new BadRequestException('Only sent quotations can be accepted');
    }

    if (this.isExpired(quotation)) {
      quotation.status = QuotationStatus.EXPIRED;
      throw new BadRequestException('Quotation has expired');
    }

    quotation.status = QuotationStatus.ACCEPTED;
    quotation.updatedAt = new Date();

    this.quotations.set(id, quotation);

    const customer = await this.customerRepository.findOne({
      where: { id: quotation.customerId },
    });

    return this.mapToResponseDto(quotation, customer);
  }

  async reject(id: string, reason?: string): Promise<QuotationResponseDto> {
    const quotation = this.quotations.get(id);
    if (!quotation) {
      throw new NotFoundException('Quotation not found');
    }

    if (quotation.status !== QuotationStatus.SENT) {
      throw new BadRequestException('Only sent quotations can be rejected');
    }

    quotation.status = QuotationStatus.REJECTED;
    quotation.updatedAt = new Date();
    
    if (reason) {
      quotation.notes = quotation.notes ? `${quotation.notes}\nRejection reason: ${reason}` : `Rejection reason: ${reason}`;
    }

    this.quotations.set(id, quotation);

    const customer = await this.customerRepository.findOne({
      where: { id: quotation.customerId },
    });

    return this.mapToResponseDto(quotation, customer);
  }

  async convertToSalesOrder(convertDto: ConvertQuotationDto, createdByUserId: string): Promise<string> {
    const quotation = this.quotations.get(convertDto.quotationId);
    if (!quotation) {
      throw new NotFoundException('Quotation not found');
    }

    if (!this.canConvert(quotation)) {
      throw new BadRequestException('Quotation cannot be converted to sales order');
    }

    // Create sales order
    const salesOrder = this.salesOrderRepository.create({
      customerId: quotation.customerId,
      createdByUserId,
      orderDate: new Date(),
      requiredDate: convertDto.requiredDate,
      customerPoNumber: convertDto.customerPoNumber,
      subtotal: quotation.subtotal,
      discountPercent: quotation.discountPercent,
      discountAmount: quotation.discountAmount,
      taxPercent: quotation.taxPercent,
      taxAmount: quotation.taxAmount,
      shippingAmount: quotation.shippingAmount,
      totalAmount: quotation.totalAmount,
      notes: convertDto.shippingInstructions,
      internalNotes: `Converted from quotation ${quotation.quotationNumber}`,
      status: SalesOrderStatus.PENDING,
    });

    const savedOrder = await this.salesOrderRepository.save(salesOrder);

    // Create sales order items
    const orderItems = quotation.items.map(item => 
      this.salesOrderItemRepository.create({
        salesOrderId: savedOrder.id,
        productId: item.productId,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        discountPercent: item.discountPercent,
        discountAmount: item.discountAmount,
        totalAmount: item.totalAmount,
        notes: item.notes,
      })
    );

    await this.salesOrderItemRepository.save(orderItems);

    // Update quotation status
    quotation.status = QuotationStatus.CONVERTED;
    quotation.updatedAt = new Date();
    quotation.notes = quotation.notes 
      ? `${quotation.notes}\nConverted to sales order ${savedOrder.orderNumber}` 
      : `Converted to sales order ${savedOrder.orderNumber}`;

    this.quotations.set(quotation.id, quotation);

    return savedOrder.id;
  }

  async getSummaries(customerId?: string): Promise<QuotationSummaryDto[]> {
    let quotations = Array.from(this.quotations.values());
    
    if (customerId) {
      quotations = quotations.filter(q => q.customerId === customerId);
    }

    // Get customer names
    const customerIds = [...new Set(quotations.map(q => q.customerId))];
    const customers = await this.customerRepository.findByIds(customerIds);
    const customerMap = new Map(customers.map(c => [c.id, c.name]));

    return quotations.map(quotation => ({
      id: quotation.id,
      quotationNumber: quotation.quotationNumber,
      customerName: customerMap.get(quotation.customerId) || 'Unknown',
      quotationDate: quotation.quotationDate,
      validUntil: quotation.validUntil,
      totalAmount: quotation.totalAmount,
      status: quotation.status,
      daysUntilExpiry: this.getDaysUntilExpiry(quotation),
    }));
  }

  async updateExpiredQuotations(): Promise<number> {
    const now = new Date();
    let updatedCount = 0;

    for (const quotation of this.quotations.values()) {
      if (quotation.status === QuotationStatus.SENT && quotation.validUntil < now) {
        quotation.status = QuotationStatus.EXPIRED;
        quotation.updatedAt = now;
        this.quotations.set(quotation.id, quotation);
        updatedCount++;
      }
    }

    return updatedCount;
  }

  // Private helper methods

  private calculateTotals(quotation: Quotation): void {
    // Calculate discount amount
    if (quotation.discountPercent > 0) {
      quotation.discountAmount = (quotation.subtotal * quotation.discountPercent) / 100;
    }

    // Calculate tax amount (on subtotal after discount)
    const taxableAmount = quotation.subtotal - quotation.discountAmount;
    if (quotation.taxPercent > 0) {
      quotation.taxAmount = (taxableAmount * quotation.taxPercent) / 100;
    }

    // Calculate total
    quotation.totalAmount = taxableAmount + quotation.taxAmount + quotation.shippingAmount;
  }

  private isExpired(quotation: Quotation): boolean {
    return new Date() > quotation.validUntil;
  }

  private canConvert(quotation: Quotation): boolean {
    return quotation.status === QuotationStatus.ACCEPTED && !this.isExpired(quotation);
  }

  private getDaysUntilExpiry(quotation: Quotation): number {
    if (quotation.status !== QuotationStatus.SENT) return 0;
    
    const now = new Date();
    const diffTime = quotation.validUntil.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    return Math.max(0, diffDays);
  }

  private async generateQuotationNumber(): Promise<string> {
    const year = new Date().getFullYear();
    const count = this.quotations.size + 1;
    const sequence = count.toString().padStart(4, '0');
    return `QUO-${year}-${sequence}`;
  }

  private generateId(): string {
    return `${Date.now().toString(36)}-${Math.random().toString(36).substring(2)}`;
  }

  private mapToResponseDto(quotation: Quotation, customer?: Customer): QuotationResponseDto {
    const items: QuotationItemResponseDto[] = quotation.items.map(item => ({
      id: item.id,
      productId: item.productId,
      productName: item.productName,
      productSku: item.productSku,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      discountPercent: item.discountPercent,
      discountAmount: item.discountAmount,
      totalAmount: item.totalAmount,
      notes: item.notes,
    }));

    return {
      id: quotation.id,
      quotationNumber: quotation.quotationNumber,
      referenceNumber: quotation.referenceNumber,
      status: quotation.status,
      quotationDate: quotation.quotationDate,
      validUntil: quotation.validUntil,
      subtotal: quotation.subtotal,
      discountPercent: quotation.discountPercent,
      discountAmount: quotation.discountAmount,
      taxPercent: quotation.taxPercent,
      taxAmount: quotation.taxAmount,
      shippingAmount: quotation.shippingAmount,
      totalAmount: quotation.totalAmount,
      terms: quotation.terms,
      notes: quotation.notes,
      customerId: quotation.customerId,
      createdByUserId: quotation.createdByUserId,
      createdAt: quotation.createdAt,
      updatedAt: quotation.updatedAt,
      items,
      isExpired: this.isExpired(quotation),
      daysUntilExpiry: this.getDaysUntilExpiry(quotation),
      canConvert: this.canConvert(quotation),
      canEdit: quotation.status === QuotationStatus.DRAFT,
    };
  }
}