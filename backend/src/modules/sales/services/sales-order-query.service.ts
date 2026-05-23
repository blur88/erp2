import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Between,
  ILike,
  IsNull,
  LessThanOrEqual,
  MoreThanOrEqual,
  Repository,
} from 'typeorm';
import { SalesOrder } from '../../../database/entities/sales-order.entity';
import { Product } from '../../../database/entities/product.entity';
import { Invoice } from '../../../database/entities/invoice.entity';
import { Payment } from '../../../database/entities/payment.entity';
import { CustomerPrintDto } from '../dto/customer.dto';
import { QuerySalesOrdersDto, SalesOrderResponseDto } from '../dto/sales-order.dto';
import { mapSalesOrderToResponseDto } from './sales-order.mapper';

@Injectable()
export class SalesOrderQueryService {
  constructor(
    @InjectRepository(SalesOrder)
    private readonly salesOrderRepository: Repository<SalesOrder>,
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,
    @InjectRepository(Invoice)
    private readonly invoiceRepository: Repository<Invoice>,
    @InjectRepository(Payment)
    private readonly paymentRepository: Repository<Payment>,
  ) {}

  async findPreviousOrder(currentOrderNumber: string): Promise<SalesOrderResponseDto | null> {
    const match = currentOrderNumber.match(/^SO-(\d+)$/);
    if (!match) {
      return null;
    }

    const currentNumber = parseInt(match[1]);
    if (currentNumber <= 1) {
      return null;
    }

    const previousNumber = currentNumber - 1;
    const previousOrderNumber = `SO-${previousNumber.toString().padStart(6, '0')}`;

    const previousOrder = await this.salesOrderRepository.findOne({
      where: { orderNumber: previousOrderNumber },
      relations: { customer: true, items: { product: true } },
      withDeleted: true,
    });

    return previousOrder ? mapSalesOrderToResponseDto(previousOrder) : null;
  }

  async findAll(query: QuerySalesOrdersDto) {
    const {
      search,
      customerId,
      fromDate,
      toDate,
      paymentStatus,
      fulfillmentStatus,
      sortBy = 'orderNumber',
      sortOrder = 'ASC',
      page = 1,
      limit = 1000,
    } = query;

    let queryBuilder = this.salesOrderRepository
      .createQueryBuilder('order')
      .leftJoinAndSelect('order.customer', 'customer')
      .leftJoinAndSelect('order.items', 'items')
      .leftJoinAndSelect('items.product', 'product')
      .select([
        'order.id',
        'order.orderNumber',
        'order.orderDate',
        'order.totalAmount',
        'order.paidAmount',
        'order.isFulfilled',
        'order.customerId',
        'order.createdAt',
        'order.updatedAt',
        'customer.id',
        'customer.name',
        'customer.phone',
        'customer.streetAddress',
        'customer.city',
        'customer.state',
        'customer.postalCode',
        'customer.country',
        'items.id',
        'items.quantity',
        'items.unitPrice',
        'items.totalAmount',
        'items.productId',
        'product.id',
        'product.name',
        'product.baseCost',
      ])
      .where('order.deletedAt IS NULL');

    if (customerId) {
      queryBuilder = queryBuilder.andWhere('order.customerId = :customerId', { customerId });
    }

    if (fromDate) {
      queryBuilder = queryBuilder.andWhere('order.orderDate >= :fromDate', {
        fromDate: new Date(fromDate),
      });
    }

    if (toDate) {
      const endDate = new Date(toDate);
      endDate.setHours(23, 59, 59, 999);
      queryBuilder = queryBuilder.andWhere('order.orderDate <= :toDate', { toDate: endDate });
    }

    if (search) {
      queryBuilder = queryBuilder.andWhere(
        '(order.orderNumber ILIKE :search OR customer.name ILIKE :search OR product.name ILIKE :search)',
        { search: `%${search}%` },
      );
    }

    if (paymentStatus && paymentStatus !== 'all') {
      switch (paymentStatus) {
        case 'unpaid':
          queryBuilder = queryBuilder.andWhere('(order.paidAmount = 0 OR order.paidAmount IS NULL)');
          break;
        case 'partial':
          queryBuilder = queryBuilder.andWhere(
            'order.paidAmount > 0 AND order.paidAmount < order.totalAmount',
          );
          break;
        case 'paid':
          queryBuilder = queryBuilder.andWhere(
            'order.paidAmount >= order.totalAmount AND order.paidAmount > 0',
          );
          break;
        case 'overpaid':
          queryBuilder = queryBuilder.andWhere('order.paidAmount > order.totalAmount');
          break;
      }
    }

    if (fulfillmentStatus && fulfillmentStatus !== 'all') {
      switch (fulfillmentStatus) {
        case 'fulfilled':
          queryBuilder = queryBuilder.andWhere('order.isFulfilled = true');
          break;
        case 'unfulfilled':
          queryBuilder = queryBuilder.andWhere('order.isFulfilled = false');
          break;
      }
    }

    queryBuilder = queryBuilder
      .orderBy(`order.${sortBy}`, sortOrder as 'ASC' | 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const countQuery = this.salesOrderRepository
      .createQueryBuilder('order')
      .where('order.deletedAt IS NULL')
      .select('COUNT(order.id)', 'count')
      .leftJoin('order.customer', 'customer');

    if (customerId) {
      countQuery.andWhere('order.customerId = :customerId', { customerId });
    }
    if (fromDate) {
      countQuery.andWhere('order.orderDate >= :fromDate', { fromDate: new Date(fromDate) });
    }
    if (toDate) {
      const endDate = new Date(toDate);
      endDate.setHours(23, 59, 59, 999);
      countQuery.andWhere('order.orderDate <= :toDate', { toDate: endDate });
    }
    if (search) {
      countQuery.andWhere(
        `(order.orderNumber ILIKE :search
          OR customer.name ILIKE :search
          OR EXISTS (
            SELECT 1 FROM sales_order_items i
            JOIN products p ON p.id = i."productId"
            WHERE i."salesOrderId" = order.id
            AND p.name ILIKE :search
          ))`,
        { search: `%${search}%` },
      );
    }

    if (paymentStatus && paymentStatus !== 'all') {
      switch (paymentStatus) {
        case 'unpaid':
          countQuery.andWhere('(order.paidAmount = 0 OR order.paidAmount IS NULL)');
          break;
        case 'partial':
          countQuery.andWhere('order.paidAmount > 0 AND order.paidAmount < order.totalAmount');
          break;
        case 'paid':
          countQuery.andWhere('order.paidAmount >= order.totalAmount AND order.paidAmount > 0');
          break;
        case 'overpaid':
          countQuery.andWhere('order.paidAmount > order.totalAmount');
          break;
      }
    }

    if (fulfillmentStatus && fulfillmentStatus !== 'all') {
      switch (fulfillmentStatus) {
        case 'fulfilled':
          countQuery.andWhere('order.isFulfilled = true');
          break;
        case 'unfulfilled':
          countQuery.andWhere('order.isFulfilled = false');
          break;
      }
    }

    const { count } = await countQuery.getRawOne();
    const total = parseInt(count);
    const orders = await queryBuilder.getMany();

    return {
      data: orders.map((order) => ({
        id: order.id,
        orderNumber: order.orderNumber,
        orderDate: order.orderDate,
        totalAmount: Number(order.totalAmount),
        paidAmount: Number(order.paidAmount || 0),
        balanceDue: Math.max(0, Number(order.totalAmount) - Number(order.paidAmount || 0)),
        isPaidInFull: Number(order.paidAmount || 0) >= Number(order.totalAmount),
        isFulfilled: order.isFulfilled,
        customerId: order.customerId,
        customer: order.customer,
        items: order.items,
        createdAt: order.createdAt,
        updatedAt: order.updatedAt,
      })),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async testInvoiceRelations(orderNumber: string): Promise<any> {
    const order = await this.salesOrderRepository.findOne({
      where: { orderNumber },
      relations: { invoices: true, customer: true, items: true },
    });

    return {
      order,
      invoicesCount: order?.invoices?.length || 0,
      invoices: order?.invoices || null,
    };
  }

  async findSummaries(query: QuerySalesOrdersDto = {}): Promise<any> {
    const {
      customerId,
      fromDate,
      toDate,
      sortBy = 'orderNumber',
      sortOrder = 'ASC',
    } = query;

    const findOptions: any = {
      relations: { customer: true, items: { product: true }, invoices: true },
      where: { deletedAt: IsNull() },
      order: { [sortBy]: sortOrder },
    };

    if (customerId) {
      findOptions.where.customerId = customerId;
    }

    if (fromDate && toDate) {
      const endDate = new Date(toDate);
      endDate.setHours(23, 59, 59, 999);
      findOptions.where.orderDate = Between(new Date(fromDate), endDate);
    } else if (fromDate) {
      findOptions.where.orderDate = MoreThanOrEqual(new Date(fromDate));
    } else if (toDate) {
      const endDate = new Date(toDate);
      endDate.setHours(23, 59, 59, 999);
      findOptions.where.orderDate = LessThanOrEqual(endDate);
    }

    const total = await this.salesOrderRepository.count({ where: findOptions.where });
    const orders = await this.salesOrderRepository.find(findOptions);

    const data = orders.map((order) => {
      const paidAmount = Number(order.paidAmount || 0);
      const totalAmount = Number(order.totalAmount);
      const balanceDue = Math.max(0, totalAmount - paidAmount);
      const isPaidInFull = paidAmount >= totalAmount;

      return {
        id: order.id,
        orderNumber: order.orderNumber,
        orderDate: order.orderDate,
        totalAmount,
        paidAmount,
        balanceDue,
        isPaidInFull,
        isFulfilled: order.isFulfilled || false,
        fulfilledDate: order.fulfilledDate,
        canFulfill: isPaidInFull && !order.isFulfilled,
        canUnfulfill: order.isFulfilled || false,
        customerId: order.customerId,
        customer: order.customer
          ? ({
              id: order.customer.id,
              name: order.customer.name,
              phone: order.customer.phone,
              streetAddress: order.customer.billingStreetAddress,
              city: order.customer.billingCity,
              state: order.customer.billingState,
              postalCode: order.customer.billingPostalCode,
              country: order.customer.billingCountry,
            } satisfies CustomerPrintDto)
          : null,
        customerName: order.customer?.name || 'Unknown Customer',
        items:
          order.items?.map((item) => ({
            ...item,
            product: item.product || null,
            productId: item.productId,
          })) || [],
        itemsCount: order.items?.length || 0,
        invoices:
          order.invoices?.map((invoice) => ({
            id: invoice.id,
            invoiceNumber: invoice.invoiceNumber,
            status: invoice.status,
            invoiceDate: invoice.invoiceDate,
            shippingAmount: Number(invoice.shippingAmount || 0),
            totalAmount: Number(invoice.totalAmount),
            paidAmount: Number(invoice.paidAmount),
            balanceDue: Number(invoice.balanceDue),
            customerName: invoice.customer?.name,
            customerId: invoice.customerId,
            salesOrderId: invoice.salesOrderId,
            salesOrder: {
              id: order.id,
              orderNumber: order.orderNumber,
              orderDate: order.orderDate,
            },
            orderNumber: order.orderNumber,
          })) || [],
        isOverdue: false,
        notes: order.notes,
        createdAt: order.createdAt,
        updatedAt: order.updatedAt,
      };
    });

    return {
      data,
      total,
    };
  }

  async getDashboardStats() {
    const today = new Date();
    const thisMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const thisWeek = new Date(today.setDate(today.getDate() - today.getDay()));

    const [totalOrders, fulfilledOrders, unfulfilledOrders, thisMonthOrders, thisWeekOrders] =
      await Promise.all([
        this.salesOrderRepository.count(),
        this.salesOrderRepository.count({ where: { isFulfilled: true } }),
        this.salesOrderRepository.count({ where: { isFulfilled: false } }),
        this.salesOrderRepository.count({ where: { orderDate: MoreThanOrEqual(thisMonth) } }),
        this.salesOrderRepository.count({ where: { orderDate: MoreThanOrEqual(thisWeek) } }),
      ]);

    const totalSalesResult = await this.salesOrderRepository
      .createQueryBuilder('order')
      .select('COALESCE(SUM(order.totalAmount), 0)', 'total')
      .getRawOne();

    const thisMonthSalesResult = await this.salesOrderRepository
      .createQueryBuilder('order')
      .select('COALESCE(SUM(order.totalAmount), 0)', 'total')
      .where('order.orderDate >= :startDate', { startDate: thisMonth })
      .getRawOne();

    return {
      orders: {
        total: totalOrders,
        fulfilled: fulfilledOrders,
        unfulfilled: unfulfilledOrders,
        thisMonth: thisMonthOrders,
        thisWeek: thisWeekOrders,
      },
      sales: {
        total: parseFloat(totalSalesResult.total) || 0,
        thisMonth: parseFloat(thisMonthSalesResult.total) || 0,
      },
    };
  }

  async findById(id: string): Promise<SalesOrderResponseDto> {
    const order = await this.salesOrderRepository
      .createQueryBuilder('salesOrder')
      .leftJoinAndSelect('salesOrder.customer', 'customer')
      .leftJoinAndSelect('salesOrder.items', 'items')
      .leftJoinAndSelect('items.product', 'product')
      .leftJoinAndSelect('salesOrder.invoices', 'invoices')
      .leftJoinAndSelect('invoices.payments', 'payments')
      .leftJoinAndSelect('invoices.items', 'invoiceItems')
      .leftJoinAndSelect('invoiceItems.product', 'invoiceItemProduct')
      .where('salesOrder.id = :id', { id })
      .getOne();

    if (!order) {
      throw new NotFoundException('Sales order not found');
    }

    if (order.invoices && order.invoices.length > 0) {
      order.invoices.forEach((invoice) => {
        if (invoice.payments && invoice.payments.length > 0) {
          invoice.payments = invoice.payments.filter((payment) => payment.isActive && !payment.deletedAt);
        }
      });
    }

    if (order.items && order.items.length > 0) {
      for (const item of order.items) {
        if (!item.product && item.productId) {
          item.product = await this.productRepository.findOne({ where: { id: item.productId } });
        }
      }
    }

    try {
      const directPayments = await this.paymentRepository.find({
        where: {
          customerId: order.customerId,
          notes: ILike(`%sales order ${order.orderNumber}%`),
          invoiceId: null as any,
        },
      });

      return mapSalesOrderToResponseDto(order, directPayments);
    } catch (error) {
      console.error('Failed to fetch direct payments:', error);
      return mapSalesOrderToResponseDto(order);
    }
  }

  async findByOrderNumber(orderNumber: string): Promise<SalesOrderResponseDto> {
    const order = await this.salesOrderRepository.findOne({
      where: { orderNumber },
      relations: { customer: true, items: { product: true }, invoices: true },
    });

    if (!order) {
      throw new NotFoundException('Sales order not found');
    }

    return mapSalesOrderToResponseDto(order);
  }

  async findOrdersByCustomer(customerId: string, limit: number = 10) {
    const orders = await this.salesOrderRepository.find({
      where: { customerId },
      relations: { items: true },
      order: { orderDate: 'DESC' },
      take: limit,
    });

    return orders.map((order) => ({
      id: order.id,
      orderNumber: order.orderNumber,
      orderDate: order.orderDate,
      totalAmount: Number(order.totalAmount),
      itemsCount: order.items?.length || 0,
    }));
  }

  async getOrderInvoices(id: string) {
    const order = await this.salesOrderRepository.findOne({ where: { id } });
    if (!order) {
      throw new NotFoundException('Sales order not found');
    }

    const invoices = await this.invoiceRepository.find({
      where: { salesOrderId: id },
      order: { invoiceDate: 'DESC' },
    });

    return {
      orderId: id,
      orderNumber: order.orderNumber,
      invoices: invoices.map((invoice) => ({
        id: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        status: invoice.status,
        invoiceDate: invoice.invoiceDate,
        shippingAmount: Number(invoice.shippingAmount || 0),
        totalAmount: Number(invoice.totalAmount),
        paidAmount: Number(invoice.paidAmount),
        balanceDue: Number(invoice.balanceDue),
        customerName: invoice.customer?.name,
        customerId: invoice.customerId,
        salesOrderId: invoice.salesOrderId,
        salesOrder: {
          id: order.id,
          orderNumber: order.orderNumber,
          orderDate: order.orderDate,
        },
        orderNumber: order.orderNumber,
      })),
    };
  }

  async findDeleted(query: QuerySalesOrdersDto = {}): Promise<any> {
    const {
      search,
      customerId,
      sortBy = 'deletedAt',
      sortOrder = 'ASC',
      page = 1,
      limit = 20,
    } = query;

    let queryBuilder = this.salesOrderRepository
      .createQueryBuilder('order')
      .withDeleted()
      .leftJoinAndSelect('order.customer', 'customer')
      .leftJoinAndSelect('order.items', 'items')
      .where('order.deletedAt IS NOT NULL');

    if (customerId) {
      queryBuilder = queryBuilder.andWhere('order.customerId = :customerId', { customerId });
    }

    if (search) {
      queryBuilder = queryBuilder.andWhere(
        '(order.orderNumber ILIKE :search OR customer.name ILIKE :search)',
        { search: `%${search}%` },
      );
    }

    queryBuilder = queryBuilder.orderBy(`order.${sortBy}`, sortOrder as 'ASC' | 'DESC');
    const offset = (page - 1) * limit;
    queryBuilder = queryBuilder.skip(offset).take(limit);

    const [orders, total] = await queryBuilder.getManyAndCount();
    const data = orders.map((order) => mapSalesOrderToResponseDto(order));

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }
}
