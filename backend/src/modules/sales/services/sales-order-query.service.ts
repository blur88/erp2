import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import {
  Between,
  In,
  IsNull,
  LessThanOrEqual,
  MoreThanOrEqual,
  Repository,
} from "typeorm";
import { Product } from "../../../database/entities/product.entity";
import {
  SalesOrder,
  SalesOrderStatus,
} from "../../../database/entities/sales-order.entity";
import { SalesOrderPayment } from "../../../database/entities/sales-order-payment.entity";
import {
  QuerySalesOrdersDto,
  SalesOrderResponseDto,
} from "../dto/sales-order.dto";
import { mapSalesOrderToResponseDto } from "./sales-order.mapper";

@Injectable()
export class SalesOrderQueryService {
  constructor(
    @InjectRepository(SalesOrder)
    private readonly salesOrderRepository: Repository<SalesOrder>,
    @InjectRepository(SalesOrderPayment)
    private readonly salesOrderPaymentRepository: Repository<SalesOrderPayment>,
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,
  ) {}

  async findAll(query: QuerySalesOrdersDto) {
    const {
      search,
      customerId,
      fromDate,
      toDate,
      paymentStatus,
      status,
      sortBy = "orderNumber",
      sortOrder = "ASC",
      page = 1,
      limit = 1000,
    } = query;

    let queryBuilder = this.salesOrderRepository
      .createQueryBuilder("order")
      .leftJoinAndSelect("order.customer", "customer")
      .leftJoinAndSelect("order.items", "items")
      .leftJoinAndSelect("items.product", "product")
      .select([
        "order.id",
        "order.orderNumber",
        "order.orderDate",
        "order.status",
        "order.paymentStatus",
        "order.subtotal",
        "order.shippingAmount",
        "order.totalAmount",
        "order.customerId",
        "order.createdAt",
        "order.updatedAt",
        "customer.id",
        "customer.name",
        "customer.phone",
        "customer.billingStreetAddress",
        "customer.billingCity",
        "customer.billingState",
        "customer.billingPostalCode",
        "customer.billingCountry",
        "items.id",
        "items.quantity",
        "items.unitPrice",
        "items.totalAmount",
        "items.productId",
        "product.id",
        "product.name",
        "product.baseCost",
      ])
      .where("order.deletedAt IS NULL");

    if (customerId) {
      queryBuilder = queryBuilder.andWhere("order.customerId = :customerId", {
        customerId,
      });
    }

    if (fromDate) {
      queryBuilder = queryBuilder.andWhere("order.orderDate >= :fromDate", {
        fromDate: new Date(fromDate),
      });
    }

    if (toDate) {
      const endDate = new Date(toDate);
      endDate.setHours(23, 59, 59, 999);
      queryBuilder = queryBuilder.andWhere("order.orderDate <= :toDate", {
        toDate: endDate,
      });
    }

    if (search) {
      queryBuilder = queryBuilder.andWhere(
        "(order.orderNumber ILIKE :search OR customer.name ILIKE :search OR product.name ILIKE :search)",
        { search: `%${search}%` },
      );
    }

    if (paymentStatus && paymentStatus !== "all") {
      queryBuilder = queryBuilder.andWhere(
        "order.paymentStatus = :paymentStatus",
        {
          paymentStatus: paymentStatus.toUpperCase(),
        },
      );
    }

    if (status && status !== "all") {
      queryBuilder = queryBuilder.andWhere("order.status = :status", {
        status: status.toUpperCase(),
      });
    }

    queryBuilder = queryBuilder
      .orderBy(`order.${sortBy}`, sortOrder as "ASC" | "DESC")
      .skip((page - 1) * limit)
      .take(limit);

    // Deterministic tiebreaker: orders sharing the same primary sort value
    // (e.g. same orderDate) fall back to newest order number first, so a
    // freshly created/duplicated order reliably appears at the top.
    if (sortBy !== "orderNumber") {
      queryBuilder = queryBuilder.addOrderBy("order.orderNumber", "DESC");
    }

    const [orders, total] = await queryBuilder.getManyAndCount();

    return {
      data: orders.map((order) => mapSalesOrderToResponseDto(order)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findSummaries(query: QuerySalesOrdersDto = {}): Promise<any> {
    const {
      customerId,
      fromDate,
      toDate,
      sortBy = "orderNumber",
      sortOrder = "ASC",
    } = query;

    const findOptions: any = {
      relations: { customer: true, items: { product: true } },
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

    const total = await this.salesOrderRepository.count({
      where: findOptions.where,
    });
    const orders = await this.salesOrderRepository.find(findOptions);

    return {
      data: orders.map((order) => ({
        ...mapSalesOrderToResponseDto(order),
        customerName: order.customer?.name || "Unknown Customer",
        itemsCount: order.items?.length || 0,
        isOverdue: false,
      })),
      total,
    };
  }

  async getDashboardStats() {
    const today = new Date();
    const thisMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const thisWeek = new Date(today.setDate(today.getDate() - today.getDay()));

    const [
      totalOrders,
      fulfilledOrders,
      unfulfilledOrders,
      thisMonthOrders,
      thisWeekOrders,
    ] = await Promise.all([
      this.salesOrderRepository.count(),
      this.salesOrderRepository.count({
        where: { status: SalesOrderStatus.FULFILLED },
      }),
      // Unfulfilled = everything not yet shipped and not cancelled. A paid order
      // awaiting fulfillment is READY (not DRAFT), so both must be counted here.
      this.salesOrderRepository.count({
        where: { status: In([SalesOrderStatus.DRAFT, SalesOrderStatus.READY]) },
      }),
      this.salesOrderRepository.count({
        where: { orderDate: MoreThanOrEqual(thisMonth) },
      }),
      this.salesOrderRepository.count({
        where: { orderDate: MoreThanOrEqual(thisWeek) },
      }),
    ]);

    const totalSalesResult = await this.salesOrderRepository
      .createQueryBuilder("order")
      .select("COALESCE(SUM(order.totalAmount), 0)", "total")
      .getRawOne();

    const thisMonthSalesResult = await this.salesOrderRepository
      .createQueryBuilder("order")
      .select("COALESCE(SUM(order.totalAmount), 0)", "total")
      .where("order.orderDate >= :startDate", { startDate: thisMonth })
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
    const order = await this.salesOrderRepository.findOne({
      where: { id },
      relations: { customer: true, items: { product: true } },
    });

    if (!order) throw new NotFoundException("Sales order not found");

    if (order.items && order.items.length > 0) {
      for (const item of order.items) {
        if (!item.product && item.productId) {
          item.product = await this.productRepository.findOne({
            where: { id: item.productId },
          });
        }
      }
    }

    const payments = await this.salesOrderPaymentRepository.find({
      where: { salesOrderId: id },
      order: { paymentDate: "ASC" },
      relations: { paymentMethod: true },
    });

    return mapSalesOrderToResponseDto(order, payments);
  }

  async findByOrderNumber(orderNumber: string): Promise<SalesOrderResponseDto> {
    const order = await this.salesOrderRepository.findOne({
      where: { orderNumber },
      relations: { customer: true, items: { product: true } },
    });

    if (!order) {
      throw new NotFoundException("Sales order not found");
    }

    const payments = await this.salesOrderPaymentRepository.find({
      where: { salesOrderId: order.id },
      order: { paymentDate: "ASC" },
      relations: { paymentMethod: true },
    });

    return mapSalesOrderToResponseDto(order, payments);
  }

  async findOrdersByCustomer(customerId: string, limit: number = 10) {
    const orders = await this.salesOrderRepository.find({
      where: { customerId },
      relations: { items: true },
      order: { orderDate: "DESC" },
      take: limit,
    });

    return orders.map((order) => ({
      id: order.id,
      orderNumber: order.orderNumber,
      orderDate: order.orderDate,
      totalAmount: Number(order.totalAmount),
      status: order.status,
      paymentStatus: order.paymentStatus,
      itemsCount: order.items?.length || 0,
    }));
  }
}
