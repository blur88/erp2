import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, In, Repository } from 'typeorm';
import { SalesOrder } from '../../../database/entities/sales-order.entity';
import { Payment } from '../../../database/entities/payment.entity';
import { Product } from '../../../database/entities/product.entity';
import { SalesOrderItem } from '../../../database/entities/sales-order-item.entity';
import { PurchaseOrderItem } from '../../../database/entities/purchase-order-item.entity';

@Injectable()
export class SalesAnalyticsReportService {
  constructor(
    @InjectRepository(SalesOrder)
    private readonly salesOrderRepository: Repository<SalesOrder>,
    @InjectRepository(Payment)
    private readonly paymentRepository: Repository<Payment>,
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,
    @InjectRepository(SalesOrderItem)
    private readonly salesOrderItemRepository: Repository<SalesOrderItem>,
    @InjectRepository(PurchaseOrderItem)
    private readonly purchaseOrderItemRepository: Repository<PurchaseOrderItem>,
  ) {}

  async getProductSummary(query: {
    dateFrom?: Date;
    dateTo?: Date;
    categoryId?: string;
    productIds?: string[];
  }) {
    // Build WHERE conditions for products
    const productWhere: any = { isActive: true };

    if (query.categoryId) {
      productWhere.categoryId = query.categoryId;
    }

    if (query.productIds && query.productIds.length > 0) {
      productWhere.id = In(query.productIds);
    }

    // Get all products matching the filter
    const products = await this.productRepository.find({
      where: productWhere,
      relations: { category: true },
    });

    // Build date range for sales and purchase orders
    const dateWhere: any = {};
    if (query.dateFrom && query.dateTo) {
      dateWhere.orderDate = Between(query.dateFrom, query.dateTo);
    } else if (query.dateFrom) {
      dateWhere.orderDate = Between(query.dateFrom, new Date());
    } else if (query.dateTo) {
      dateWhere.orderDate = Between(new Date('2000-01-01'), query.dateTo);
    }

    // Get sales data for each product
    const productSummaries = await Promise.all(
      products.map(async (product) => {
        // Get sales order items for this product
        const salesItemsQuery = this.salesOrderItemRepository
          .createQueryBuilder('item')
          .leftJoinAndSelect('item.salesOrder', 'order')
          .where('item.productId = :productId', { productId: product.id });

        if (query.dateFrom) {
          salesItemsQuery.andWhere('order.orderDate >= :dateFrom', {
            dateFrom: query.dateFrom,
          });
        }
        if (query.dateTo) {
          salesItemsQuery.andWhere('order.orderDate <= :dateTo', {
            dateTo: query.dateTo,
          });
        }

        const salesItems = await salesItemsQuery.getMany();

        // Calculate sales metrics
        const soldQty = salesItems.reduce((sum, item) => sum + Number(item.quantity), 0);
        const totalSales = salesItems.reduce(
          (sum, item) => sum + Number(item.quantity) * Number(item.unitPrice),
          0,
        );

        // Calculate COGS using actual unitCost from sales order items
        // This represents the cost of goods that were actually SOLD
        const cost = salesItems.reduce(
          (sum, item) => sum + Number(item.quantity) * Number(item.unitCost || 0),
          0,
        );

        // Get purchase order items for this product
        const purchaseItemsQuery = this.purchaseOrderItemRepository
          .createQueryBuilder('item')
          .leftJoinAndSelect('item.purchaseOrder', 'po')
          .where('item.productId = :productId', { productId: product.id });

        if (query.dateFrom) {
          purchaseItemsQuery.andWhere('po.orderDate >= :dateFrom', {
            dateFrom: query.dateFrom,
          });
        }
        if (query.dateTo) {
          purchaseItemsQuery.andWhere('po.orderDate <= :dateTo', {
            dateTo: query.dateTo,
          });
        }

        const purchaseItems = await purchaseItemsQuery.getMany();

        // Calculate purchase metrics
        const purchaseQty = purchaseItems.reduce((sum, item) => sum + Number(item.quantity), 0);
        const purchaseSubtotal = purchaseItems.reduce(
          (sum, item) => sum + Number(item.quantity) * Number(item.unitCost),
          0,
        );

        // Sales Profit = Revenue - COGS (profitability view)
        const salesProfit = totalSales - cost;

        // Total Profit = Revenue - Total Purchases (cash flow view)
        // This shows the net cash impact considering inventory purchases
        const totalProfit = totalSales - purchaseSubtotal;

        return {
          productId: product.id,
          productName: product.name,
          category: product.category?.name || 'Uncategorized',
          soldQty,
          totalSales,
          cost,
          salesProfit,
          purchaseQty,
          purchaseSubtotal,
          totalProfit,
        };
      }),
    );

    return {
      data: productSummaries,
    };
  }

  async getProductDetails(query: {
    dateFrom?: Date;
    dateTo?: Date;
    categoryId?: string;
    productIds?: string[];
  }) {
    // Build WHERE conditions for products
    const productWhere: any = { isActive: true };

    if (query.categoryId) {
      productWhere.categoryId = query.categoryId;
    }

    if (query.productIds && query.productIds.length > 0) {
      productWhere.id = In(query.productIds);
    }

    // Get all products matching the filter
    const products = await this.productRepository.find({
      where: productWhere,
      relations: { category: true },
    });

    // Get all transaction details for each product
    const productDetails: any[] = [];

    for (const product of products) {
      // Get sales order items for this product
      const salesItemsQuery = this.salesOrderItemRepository
        .createQueryBuilder('item')
        .leftJoinAndSelect('item.salesOrder', 'order')
        .leftJoinAndSelect('order.customer', 'customer')
        .where('item.productId = :productId', { productId: product.id });

      if (query.dateFrom) {
        salesItemsQuery.andWhere('order.orderDate >= :dateFrom', {
          dateFrom: query.dateFrom,
        });
      }
      if (query.dateTo) {
        salesItemsQuery.andWhere('order.orderDate <= :dateTo', {
          dateTo: query.dateTo,
        });
      }

      const salesItems = await salesItemsQuery.orderBy('order.orderDate', 'DESC').getMany();

      // Transform sales items to detail records
      for (const item of salesItems) {
        const order = item.salesOrder;
        const quantity = Number(item.quantity);
        const unitPrice = Number(item.unitPrice);
        const unitCost = Number(item.unitCost || 0); // Use cost from sales order item
        const totalAmount = quantity * unitPrice;
        const totalCost = quantity * unitCost;
        const profit = totalAmount - totalCost;

        // Determine price level from customer's price list or default to retail
        let pricingScheme = 'Retail';
        if (order.customer?.priceList) {
          pricingScheme = order.customer.priceList.name;
        }

        productDetails.push({
          transactionType: 'Sale',
          transactionDate: order.orderDate,
          documentNumber: order.orderNumber,
          customerSupplier: order.customer?.name || 'Unknown',
          productId: product.id,
          productName: product.name,
          category: product.category?.name || 'Uncategorized',
          quantity: quantity,
          unitPrice: unitPrice,
          pricingScheme: pricingScheme,
          totalAmount: totalAmount,
          cost: totalCost,
          profit: profit,
        });
      }
    }

    // Sort by transaction date descending
    productDetails.sort((a, b) => {
      const dateA = new Date(a.transactionDate).getTime();
      const dateB = new Date(b.transactionDate).getTime();
      return dateB - dateA;
    });

    return {
      data: productDetails,
    };
  }

  async getSalesOrderProfitReport(query: {
    dateFrom?: Date;
    dateTo?: Date;
    customerId?: string;
    status?: string;
    paymentStatus?: string;
  }) {
    // Build WHERE conditions for sales orders
    const orderWhere: any = {};

    if (query.customerId) {
      orderWhere.customerId = query.customerId;
    }

    // Filter by fulfillment status if specified
    if (query.status && query.status !== 'all') {
      if (query.status === 'fulfilled') {
        orderWhere.isFulfilled = true;
      } else if (query.status === 'unfulfilled') {
        orderWhere.isFulfilled = false;
      }
    }

    // Build date range for orders
    if (query.dateFrom && query.dateTo) {
      orderWhere.orderDate = Between(query.dateFrom, query.dateTo);
    } else if (query.dateFrom) {
      orderWhere.orderDate = Between(query.dateFrom, new Date());
    } else if (query.dateTo) {
      orderWhere.orderDate = Between(new Date('2000-01-01'), query.dateTo);
    }

    // Get all sales orders with items and invoices for payment status
    const orders = await this.salesOrderRepository.find({
      where: orderWhere,
      relations: { customer: true, items: { product: true }, payments: true },
      order: { orderNumber: 'ASC' },
    });

    // Calculate profit for each order and filter by payment status if needed
    let profitReports = orders.map((order) => {
      const items = order.items || [];

      // Calculate totals from items
      const totalRevenue = items.reduce((sum, item) => {
        return sum + Number(item.totalAmount || 0);
      }, 0);

      const totalCost = items.reduce((sum, item) => {
        const quantity = Number(item.quantity || 0);
        const unitCost = Number(item.unitCost || 0);
        return sum + quantity * unitCost;
      }, 0);

      const grossProfit = totalRevenue - totalCost;

      // Calculate payment status from order payments
      const totalInvoiced = Number(order.totalAmount || 0);
      const payments = order.payments || [];
      const totalPaid = payments.reduce((sum, p) => sum + Number(p.amount || 0), 0);

      let paymentStatus = 'unpaid';
      if (totalPaid >= totalInvoiced && totalInvoiced > 0) {
        paymentStatus = totalPaid > totalInvoiced ? 'overpaid' : 'paid';
      } else if (totalPaid > 0) {
        paymentStatus = 'partial';
      }

      return {
        orderNumber: order.orderNumber,
        orderDate: order.orderDate,
        customerName: order.customer?.name || 'Unknown',
        inventoryStatus: order.isFulfilled ? 'fulfilled' : 'unfulfilled',
        paymentStatus,
        totalRevenue,
        totalCost,
        grossProfit,
      };
    });

    // Filter by payment status if specified
    if (query.paymentStatus && query.paymentStatus !== 'all') {
      profitReports = profitReports.filter(
        (report) => report.paymentStatus === query.paymentStatus,
      );
    }

    // Sort by order number (extract numeric part for proper sorting)
    profitReports.sort((a, b) => {
      const numA = parseInt(a.orderNumber.replace(/\D/g, ''), 10) || 0;
      const numB = parseInt(b.orderNumber.replace(/\D/g, ''), 10) || 0;
      return numA - numB;
    });

    return {
      data: profitReports,
    };
  }

  async getCustomerPaymentSummary(query: {
    dateFrom?: Date;
    dateTo?: Date;
    customerId?: string;
    paymentStatus?: string;
  }) {
    // Build WHERE conditions for sales orders
    const orderWhere: any = {};

    if (query.customerId) {
      orderWhere.customerId = query.customerId;
    }

    // Build date range for orders
    if (query.dateFrom && query.dateTo) {
      orderWhere.orderDate = Between(query.dateFrom, query.dateTo);
    } else if (query.dateFrom) {
      orderWhere.orderDate = Between(query.dateFrom, new Date());
    } else if (query.dateTo) {
      orderWhere.orderDate = Between(new Date('2000-01-01'), query.dateTo);
    }

    // Get all sales orders with invoices and payments
    const orders = await this.salesOrderRepository.find({
      where: orderWhere,
      relations: { customer: true, payments: true },
      order: { orderDate: 'DESC' },
    });

    // Group by customer and calculate payment status
    const customerPaymentMap = new Map<
      string,
      {
        customerId: string;
        customerName: string;
        customerPhone: string;
        totalInvoiced: number;
        totalPaid: number;
        totalPayments: number;
        paymentCount: number;
        lastPaymentDate: Date | null;
        firstPaymentDate: Date | null;
        lastOrderDate: Date | null;
        invoicesPaid: number;
        averagePaymentAmount: number;
        paymentStatus: string;
        orderCount: number;
      }
    >();

    orders.forEach((order) => {
      const customerId = order.customer?.id;
      const customerName = order.customer?.name || 'Unknown';
      const customerPhone = order.customer?.phone || '';

      if (!customerId) return;

      if (!customerPaymentMap.has(customerId)) {
        customerPaymentMap.set(customerId, {
          customerId,
          customerName,
          customerPhone,
          totalInvoiced: 0,
          totalPaid: 0,
          totalPayments: 0,
          paymentCount: 0,
          lastPaymentDate: null,
          firstPaymentDate: null,
          lastOrderDate: null,
          invoicesPaid: 0,
          averagePaymentAmount: 0,
          paymentStatus: 'unpaid',
          orderCount: 0,
        });
      }

      const customerData = customerPaymentMap.get(customerId)!;
      customerData.orderCount += 1;

      // Track last order date
      const orderDate = new Date(order.orderDate);
      if (!customerData.lastOrderDate || orderDate > customerData.lastOrderDate) {
        customerData.lastOrderDate = orderDate;
      }

      // Process payments
      const orderPayments = order.payments || [];
      customerData.totalInvoiced += Number(order.totalAmount || 0);
      orderPayments.forEach((payment) => {
        const paymentAmount = Number(payment.amount || 0);
        customerData.totalPaid += paymentAmount;
        customerData.totalPayments += paymentAmount;
        customerData.paymentCount += 1;

        const paymentDate = new Date(payment.paymentDate);

        // Track date ranges
        if (!customerData.lastPaymentDate || paymentDate > customerData.lastPaymentDate) {
          customerData.lastPaymentDate = paymentDate;
        }
        if (!customerData.firstPaymentDate || paymentDate < customerData.firstPaymentDate) {
          customerData.firstPaymentDate = paymentDate;
        }
      });

      // Count orders that have payments
      if (orderPayments.length > 0) {
        customerData.invoicesPaid += 1;
      }
    });

    // Calculate payment status and averages for each customer
    const customerSummaries = Array.from(customerPaymentMap.values()).map((customer) => {
      // Calculate payment status based on total invoiced vs total paid
      if (customer.totalPaid >= customer.totalInvoiced && customer.totalInvoiced > 0) {
        customer.paymentStatus = customer.totalPaid > customer.totalInvoiced ? 'overpaid' : 'paid';
      } else if (customer.totalPaid > 0) {
        customer.paymentStatus = 'partial';
      } else {
        customer.paymentStatus = 'unpaid';
      }

      // Calculate average payment amount
      customer.averagePaymentAmount =
        customer.paymentCount > 0 ? customer.totalPayments / customer.paymentCount : 0;

      return customer;
    });

    // Filter by payment status if specified
    let filteredSummaries = customerSummaries;
    if (query.paymentStatus && query.paymentStatus !== 'all') {
      filteredSummaries = customerSummaries.filter(
        (customer) => customer.paymentStatus === query.paymentStatus,
      );
    }

    // Sort by total payments descending
    filteredSummaries.sort((a, b) => b.totalPayments - a.totalPayments);

    return {
      data: filteredSummaries,
    };
  }

  async getCustomerPaymentByOrder(query: {
    dateFrom?: Date;
    dateTo?: Date;
    customerId?: string;
    paymentStatus?: string;
  }) {
    // Build WHERE conditions for sales orders
    const orderWhere: any = {};

    if (query.customerId) {
      orderWhere.customerId = query.customerId;
    }

    // Build date range for orders
    if (query.dateFrom && query.dateTo) {
      orderWhere.orderDate = Between(query.dateFrom, query.dateTo);
    } else if (query.dateFrom) {
      orderWhere.orderDate = Between(query.dateFrom, new Date());
    } else if (query.dateTo) {
      orderWhere.orderDate = Between(new Date('2000-01-01'), query.dateTo);
    }

    // Get all sales orders with invoices and payments
    const orders = await this.salesOrderRepository.find({
      where: orderWhere,
      relations: { customer: true, payments: true },
      order: { orderNumber: 'ASC' },
    });

    // Transform to payment by order report format
    const paymentByOrderData: any[] = [];

    orders.forEach((order) => {
      const orderPayments = order.payments || [];

      // Calculate payment totals for this order
      const totalPaid = orderPayments.reduce((sum, p) => sum + Number(p.amount || 0), 0);
      const totalAmount = Number(order.totalAmount || 0);
      const balance = totalAmount - totalPaid;

      // Determine payment status
      let paymentStatus = 'unpaid';
      if (totalPaid >= totalAmount && totalAmount > 0) {
        paymentStatus = totalPaid > totalAmount ? 'overpaid' : 'paid';
      } else if (totalPaid > 0) {
        paymentStatus = 'partial';
      }

      // Find last payment date for this order
      let lastPaymentDate: Date | null = null;
      if (orderPayments.length > 0) {
        lastPaymentDate = orderPayments.reduce(
          (latest, p) => {
            const pDate = new Date(p.paymentDate);
            return !latest || pDate > latest ? pDate : latest;
          },
          null as Date | null,
        );
      }

      paymentByOrderData.push({
        customerId: order.customer?.id || '',
        customerName: order.customer?.name || 'Unknown',
        orderNumber: order.orderNumber,
        orderDate: order.orderDate,
        invoiceNumber: '',
        invoiceDate: null,
        inventoryStatus: order.isFulfilled ? 'fulfilled' : 'unfulfilled',
        totalAmount,
        paidAmount: totalPaid,
        balance,
        paymentStatus,
        lastPaymentDate,
      });
    });

    // Filter by payment status if specified
    let filteredData = paymentByOrderData;
    if (query.paymentStatus && query.paymentStatus !== 'all') {
      filteredData = paymentByOrderData.filter(
        (item) => item.paymentStatus === query.paymentStatus,
      );
    }

    // Sort by order number (extract numeric part for proper sorting)
    filteredData.sort((a, b) => {
      const numA = parseInt(a.orderNumber.replace(/\D/g, ''), 10) || 0;
      const numB = parseInt(b.orderNumber.replace(/\D/g, ''), 10) || 0;
      return numA - numB;
    });

    return {
      data: filteredData,
    };
  }

  async getCustomerPaymentDetails(query: {
    dateFrom?: Date;
    dateTo?: Date;
    customerId?: string;
    paymentStatus?: string;
  }) {
    // Build WHERE conditions for payments
    let paymentQuery = this.paymentRepository
      .createQueryBuilder('payment')
      .leftJoinAndSelect('payment.salesOrder', 'salesOrder')
      .leftJoinAndSelect('salesOrder.customer', 'customer');

    // Apply date range filter on payment date
    if (query.dateFrom && query.dateTo) {
      paymentQuery = paymentQuery.andWhere('payment.paymentDate BETWEEN :dateFrom AND :dateTo', {
        dateFrom: query.dateFrom,
        dateTo: query.dateTo,
      });
    } else if (query.dateFrom) {
      paymentQuery = paymentQuery.andWhere('payment.paymentDate >= :dateFrom', {
        dateFrom: query.dateFrom,
      });
    } else if (query.dateTo) {
      paymentQuery = paymentQuery.andWhere('payment.paymentDate <= :dateTo', {
        dateTo: query.dateTo,
      });
    }

    // Apply customer filter
    if (query.customerId) {
      paymentQuery = paymentQuery.andWhere('customer.id = :customerId', {
        customerId: query.customerId,
      });
    }

    // Get all payments
    const payments = await paymentQuery
      .orderBy('payment.paymentDate', 'DESC')
      .addOrderBy('payment.paymentNumber', 'DESC')
      .getMany();

    // Transform to payment details format
    const paymentDetailsData = payments.map((payment) => {
      const salesOrder = payment.salesOrder;
      const customer = salesOrder?.customer;

      return {
        paymentId: payment.id,
        paymentNumber: payment.paymentNumber,
        paymentDate: payment.paymentDate,
        paymentAmount: Number(payment.amount || 0),
        paymentMethod: payment.paymentMethodEntity?.code?.toLowerCase() || 'cash',
        customerId: customer?.id || '',
        customerName: customer?.name || 'Unknown',
        orderNumber: salesOrder?.orderNumber || '',
        orderDate: salesOrder?.orderDate || null,
        invoiceNumber: '',
        invoiceDate: null,
        invoiceTotal: 0,
        invoicePaid: 0,
        invoiceBalance: 0,
        paymentStatus: 'paid',
        inventoryStatus: salesOrder?.isFulfilled ? 'fulfilled' : 'unfulfilled',
        notes: payment.notes || '',
      };
    });

    // Filter by payment status if specified
    let filteredData = paymentDetailsData;
    if (query.paymentStatus && query.paymentStatus !== 'all') {
      filteredData = paymentDetailsData.filter(
        (item) => item.paymentStatus === query.paymentStatus,
      );
    }

    return {
      data: filteredData,
    };
  }

  async getCustomerOrderHistory(query: {
    dateFrom?: Date;
    dateTo?: Date;
    customerId?: string;
    categoryId?: string;
    productIds?: string[];
    inventoryStatus?: string;
    paymentStatus?: string;
  }) {
    // Build WHERE conditions for sales orders
    let orderQuery = this.salesOrderRepository
      .createQueryBuilder('salesOrder')
      .leftJoinAndSelect('salesOrder.customer', 'customer')
      .leftJoinAndSelect('customer.priceList', 'priceList')
      .leftJoinAndSelect('salesOrder.items', 'items')
      .leftJoinAndSelect('items.product', 'product')
      .leftJoinAndSelect('product.category', 'category')
      .leftJoinAndSelect('salesOrder.payments', 'payments');

    // Apply date range filter on order date
    if (query.dateFrom && query.dateTo) {
      orderQuery = orderQuery.andWhere('salesOrder.orderDate BETWEEN :dateFrom AND :dateTo', {
        dateFrom: query.dateFrom,
        dateTo: query.dateTo,
      });
    } else if (query.dateFrom) {
      orderQuery = orderQuery.andWhere('salesOrder.orderDate >= :dateFrom', {
        dateFrom: query.dateFrom,
      });
    } else if (query.dateTo) {
      orderQuery = orderQuery.andWhere('salesOrder.orderDate <= :dateTo', {
        dateTo: query.dateTo,
      });
    }

    // Apply customer filter
    if (query.customerId) {
      orderQuery = orderQuery.andWhere('customer.id = :customerId', {
        customerId: query.customerId,
      });
    }

    // Apply category filter
    if (query.categoryId) {
      orderQuery = orderQuery.andWhere('category.id = :categoryId', {
        categoryId: query.categoryId,
      });
    }

    // Apply product filter
    if (query.productIds && query.productIds.length > 0) {
      orderQuery = orderQuery.andWhere('product.id IN (:...productIds)', {
        productIds: query.productIds,
      });
    }

    // Apply inventory status filter
    if (query.inventoryStatus && query.inventoryStatus !== 'all') {
      if (query.inventoryStatus === 'fulfilled') {
        orderQuery = orderQuery.andWhere('salesOrder.isFulfilled = :isFulfilled', {
          isFulfilled: true,
        });
      } else if (query.inventoryStatus === 'unfulfilled') {
        orderQuery = orderQuery.andWhere('salesOrder.isFulfilled = :isFulfilled', {
          isFulfilled: false,
        });
      }
    }

    // Get all orders
    const orders = await orderQuery
      .orderBy('salesOrder.orderDate', 'DESC')
      .addOrderBy('salesOrder.orderNumber', 'DESC')
      .getMany();

    // Remove duplicates if filtering by products (since one order can have multiple products)
    const uniqueOrders = Array.from(new Map(orders.map((order) => [order.id, order])).values());

    // Transform to order history format - return individual line items
    const orderHistoryData: any[] = [];

    uniqueOrders.forEach((order) => {
      const customer = order.customer;
      const items = order.items || [];
      const paymentsData = order.payments || [];

      // Calculate total amount from items
      const totalAmount = items.reduce((sum, item) => sum + Number(item.totalAmount || 0), 0);

      // Calculate paid amount from all payments
      const paidAmount = paymentsData.reduce(
        (sum, payment) => sum + Number(payment.amount || 0),
        0,
      );

      // Determine payment status
      let paymentStatus = 'unpaid';
      if (paidAmount >= totalAmount && totalAmount > 0) {
        paymentStatus = paidAmount > totalAmount ? 'overpaid' : 'paid';
      } else if (paidAmount > 0) {
        paymentStatus = 'partial';
      }

      // Create a row for each line item
      items.forEach((item) => {
        const product = item.product;
        const quantity = Number(item.quantity || 0);
        const unitPrice = Number(item.unitPrice || 0);
        const amount = Number(item.totalAmount || 0);
        const unitCost = Number(product?.baseCost || 0);
        const cost = unitCost * quantity;
        const profit = amount - cost;

        orderHistoryData.push({
          orderId: order.id,
          orderNumber: order.orderNumber,
          orderDate: order.orderDate,
          customerId: customer?.id || '',
          customerName: customer?.name || 'Unknown',
          productId: product?.id || '',
          productName: product?.name || 'Unknown Product',
          categoryName: product?.category?.name || '-',
          quantity,
          amount,
          cost,
          profit,
          paymentStatus,
          inventoryStatus: order.isFulfilled ? 'fulfilled' : 'unfulfilled',
        });
      });
    });

    // Filter by payment status if specified
    let filteredData = orderHistoryData;
    if (query.paymentStatus && query.paymentStatus !== 'all') {
      filteredData = orderHistoryData.filter((item) => item.paymentStatus === query.paymentStatus);
    }

    return {
      data: filteredData,
    };
  }

  async getProductCustomerReport(query: {
    dateFrom?: Date;
    dateTo?: Date;
    productIds?: string[];
    categoryId?: string;
    inventoryStatus?: string;
    paymentStatus?: string;
  }) {
    // Build WHERE conditions for sales orders
    let orderQuery = this.salesOrderRepository
      .createQueryBuilder('salesOrder')
      .leftJoinAndSelect('salesOrder.customer', 'customer')
      .leftJoinAndSelect('customer.priceList', 'priceList')
      .leftJoinAndSelect('salesOrder.items', 'items')
      .leftJoinAndSelect('items.product', 'product')
      .leftJoinAndSelect('product.category', 'category')
      .leftJoinAndSelect('salesOrder.payments', 'payments');

    // Apply date range filter on order date
    if (query.dateFrom && query.dateTo) {
      orderQuery = orderQuery.andWhere('salesOrder.orderDate BETWEEN :dateFrom AND :dateTo', {
        dateFrom: query.dateFrom,
        dateTo: query.dateTo,
      });
    } else if (query.dateFrom) {
      orderQuery = orderQuery.andWhere('salesOrder.orderDate >= :dateFrom', {
        dateFrom: query.dateFrom,
      });
    } else if (query.dateTo) {
      orderQuery = orderQuery.andWhere('salesOrder.orderDate <= :dateTo', {
        dateTo: query.dateTo,
      });
    }

    // Apply product filter (multiple)
    if (query.productIds && query.productIds.length > 0) {
      orderQuery = orderQuery.andWhere('product.id IN (:...productIds)', {
        productIds: query.productIds,
      });
    }

    // Apply category filter
    if (query.categoryId) {
      orderQuery = orderQuery.andWhere('category.id = :categoryId', {
        categoryId: query.categoryId,
      });
    }

    // Apply inventory status filter
    if (query.inventoryStatus && query.inventoryStatus !== 'all') {
      if (query.inventoryStatus === 'fulfilled') {
        orderQuery = orderQuery.andWhere('salesOrder.isFulfilled = :isFulfilled', {
          isFulfilled: true,
        });
      } else if (query.inventoryStatus === 'unfulfilled') {
        orderQuery = orderQuery.andWhere('salesOrder.isFulfilled = :isFulfilled', {
          isFulfilled: false,
        });
      }
    }

    // Get all orders
    const orders = await orderQuery
      .orderBy('salesOrder.orderDate', 'DESC')
      .addOrderBy('salesOrder.orderNumber', 'DESC')
      .getMany();

    // Remove duplicates if filtering by products (since one order can have multiple products)
    const uniqueOrders = Array.from(new Map(orders.map((order) => [order.id, order])).values());

    // Transform to product-customer format - return individual line items
    const productCustomerData: any[] = [];

    uniqueOrders.forEach((order) => {
      const customer = order.customer;
      const items = order.items || [];
      const paymentsData = order.payments || [];

      // Calculate total amount from items
      const totalAmount = items.reduce((sum, item) => sum + Number(item.totalAmount || 0), 0);

      // Calculate paid amount from all payments
      const paidAmount = paymentsData.reduce(
        (sum, payment) => sum + Number(payment.amount || 0),
        0,
      );

      // Determine payment status
      let paymentStatus = 'unpaid';
      if (paidAmount >= totalAmount && totalAmount > 0) {
        paymentStatus = paidAmount > totalAmount ? 'overpaid' : 'paid';
      } else if (paidAmount > 0) {
        paymentStatus = 'partial';
      }

      // Create a row for each line item
      items.forEach((item) => {
        const product = item.product;
        const quantity = Number(item.quantity || 0);
        const unitPrice = Number(item.unitPrice || 0);
        const amount = Number(item.totalAmount || 0);
        const unitCost = Number(product?.baseCost || 0);
        const cost = unitCost * quantity;
        const profit = amount - cost;

        productCustomerData.push({
          productId: product?.id || '',
          productName: product?.name || 'Unknown Product',
          categoryName: product?.category?.name || '-',
          customerId: customer?.id || '',
          customerName: customer?.name || 'Unknown',
          orderId: order.id,
          orderNumber: order.orderNumber,
          orderDate: order.orderDate,
          quantity,
          amount,
          cost,
          profit,
          paymentStatus,
          inventoryStatus: order.isFulfilled ? 'fulfilled' : 'unfulfilled',
        });
      });
    });

    // Filter by payment status if specified
    let filteredData = productCustomerData;
    if (query.paymentStatus && query.paymentStatus !== 'all') {
      filteredData = productCustomerData.filter(
        (item) => item.paymentStatus === query.paymentStatus,
      );
    }

    return {
      data: filteredData,
    };
  }
}
