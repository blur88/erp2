import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  HttpException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, FindOptionsWhere, Like, In, Between } from "typeorm";
import { BaseCrudService } from "../../../common/services/base-crud.service";
import {
  PurchaseOrder,
  PurchaseOrderItem,
  Supplier,
  Product,
  GoodsReceivedNote,
  VendorPayment,
} from "../../../database/entities";
import {
  CreatePurchaseOrderDto,
  UpdatePurchaseOrderDto,
  PurchaseOrderQueryDto,
  PurchaseOrderResponseDto,
  PurchaseOrderListResponseDto,
  PurchaseOrderSummaryDto,
} from "../dto";
import { GlobalSearchResultDto } from "../../search/dto/global-search-result.dto";
import { canSearchPurchaseOrders } from "../../search/search.permissions";
import {
  SEARCH_CANDIDATE_LIMIT,
  SCORE_EXACT_CODE,
  SCORE_STARTSWITH_CODE,
  SCORE_CONTAINS,
  SCORE_FUZZY,
  BOOST_TRANSACTION,
  BOOST_EXACT_MATCH,
} from "../../search/search.constants";
import { SupplierService } from "./supplier.service";
import { GoodsReceivedNoteService } from "./goods-received-note.service";
import { VendorPaymentService } from "./vendor-payment.service";
import { GrnStatus } from "../../../database/entities/goods-received-note.entity";
import { BaseCostCalculatorService } from "../../inventory/services/base-cost-calculator.service";
import { StockMovementService } from "../../inventory/services/stock-movement.service";
import { CreateStockMovementDto } from "../../inventory/dto/stock.dto";
import { StockMovementType } from "../../../database/entities/stock-movement.entity";
import { SettingsService } from "../../settings/settings.service";
import { AuditLogService } from "../../audit-logs/services";
import { AccountingService } from "../../accounting/services/accounting.service";
import { PurchaseOrderLifecycleService } from "./purchase-order-lifecycle.service";

@Injectable()
export class PurchaseOrderService extends BaseCrudService<
  PurchaseOrder,
  CreatePurchaseOrderDto,
  UpdatePurchaseOrderDto,
  PurchaseOrderQueryDto
> {
  private readonly logger = new Logger(PurchaseOrderService.name);

  constructor(
    @InjectRepository(PurchaseOrder)
    private readonly purchaseOrderRepository: Repository<PurchaseOrder>,
    @InjectRepository(PurchaseOrderItem)
    private readonly purchaseOrderItemRepository: Repository<PurchaseOrderItem>,
    @InjectRepository(Supplier)
    private readonly supplierRepository: Repository<Supplier>,
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,
    @InjectRepository(GoodsReceivedNote)
    private readonly grnRepository: Repository<GoodsReceivedNote>,
    @InjectRepository(VendorPayment)
    private readonly vendorPaymentRepository: Repository<VendorPayment>,
    private readonly supplierService: SupplierService,
    private readonly grnService: GoodsReceivedNoteService,
    private readonly vendorPaymentService: VendorPaymentService,
    private readonly baseCostCalculator: BaseCostCalculatorService,
    private readonly stockMovementService: StockMovementService,
    private readonly settingsService: SettingsService,
    auditLogService: AuditLogService,
    private readonly accountingService: AccountingService,
    private readonly purchaseOrderLifecycleService: PurchaseOrderLifecycleService,
  ) {
    super(purchaseOrderRepository, auditLogService);
  }

  getEntityType(): string {
    return "PurchaseOrder";
  }

  buildWhereClause(
    query: PurchaseOrderQueryDto,
  ): FindOptionsWhere<PurchaseOrder> {
    const where: FindOptionsWhere<PurchaseOrder> = {};

    if (query.supplierId) where.supplierId = query.supplierId;

    return where;
  }

  protected applyQueryBuilder(qb: any, query: PurchaseOrderQueryDto): any {
    qb = qb
      .leftJoinAndSelect("po.supplier", "supplier")
      .leftJoinAndSelect("po.items", "items")
      .leftJoinAndSelect("items.product", "product")
      .leftJoinAndSelect("po.goodsReceivedNotes", "grns")
      .leftJoinAndSelect("po.vendorPayments", "vendorPayments");

    if (query.supplierId) {
      qb = qb.andWhere("po.supplierId = :supplierId", {
        supplierId: query.supplierId,
      });
    }
    if (query.orderDateFrom) {
      qb = qb.andWhere("po.orderDate >= :orderDateFrom", {
        orderDateFrom: new Date(query.orderDateFrom),
      });
    }
    if (query.orderDateTo) {
      qb = qb.andWhere("po.orderDate <= :orderDateTo", {
        orderDateTo: new Date(query.orderDateTo),
      });
    }

    switch (query.paymentStatus) {
      case "unpaid":
        qb = qb.andWhere("(po.paidAmount = 0 OR po.paidAmount IS NULL)");
        break;
      case "partial":
        qb = qb.andWhere(
          "po.paidAmount > 0 AND po.paidAmount < po.totalAmount",
        );
        break;
      case "paid":
        qb = qb.andWhere(
          "po.paidAmount >= po.totalAmount AND po.paidAmount > 0",
        );
        break;
      case "overpaid":
        qb = qb.andWhere("po.paidAmount > po.totalAmount");
        break;
    }

    if (query.status) {
      qb = qb.andWhere("grns.status = :grnStatus", { grnStatus: query.status });
    }

    return qb;
  }

  protected applySearch(qb: any, search: string, _alias: string): any {
    return qb.andWhere(
      "(po.orderNumber ILIKE :search OR supplier.companyName ILIKE :search OR po.notes ILIKE :search)",
      { search: `%${search}%` },
    );
  }

  protected get allowedSortFields(): string[] {
    return [
      "orderNumber",
      "orderDate",
      "status",
      "priority",
      "totalAmount",
      "createdAt",
      "deletedAt",
    ];
  }

  private buildPurchaseOrderListQuery(
    query: PurchaseOrderQueryDto,
    options: { includeDeleted: boolean },
  ) {
    let queryBuilder = this.purchaseOrderRepository.createQueryBuilder("po");

    if (options.includeDeleted) {
      queryBuilder = queryBuilder
        .withDeleted()
        .where("po.deletedAt IS NOT NULL");
    }

    if (query.search) {
      queryBuilder = this.applySearch(queryBuilder, query.search, "po");
    }

    return this.applyQueryBuilder(queryBuilder, query);
  }

  private applyListOrdering(
    queryBuilder: any,
    query: PurchaseOrderQueryDto,
    defaultSortField: "orderDate" | "deletedAt",
    options: { addSecondaryOrderNumber: boolean },
  ) {
    const sortField = this.allowedSortFields.includes(query.sortBy ?? "")
      ? query.sortBy!
      : defaultSortField;
    const sortOrder = query.sortOrder ?? "DESC";

    queryBuilder.orderBy(`po.${sortField}`, sortOrder);

    if (options.addSecondaryOrderNumber && sortField !== "orderNumber") {
      queryBuilder.addOrderBy("po.orderNumber", "DESC");
    }
  }

  /**
   * Generate sequential purchase order number in format PO-000001
   * Checks both active and soft-deleted orders to ensure unique numbering
   */
  private async generateSequentialOrderNumber(): Promise<string> {
    // Use document number settings to generate order number
    try {
      const orderNumber =
        await this.settingsService.generateDocumentNumber("Purchase Orders");
      this.logger.log(`Generated purchase order number: ${orderNumber}`);
      return orderNumber;
    } catch (error) {
      this.logger.error(`Error generating order number: ${error.message}`);
      // Fallback to legacy method
      const orders = await this.purchaseOrderRepository.find({
        select: { orderNumber: true },
        withDeleted: true,
      });

      let maxNumber = 0;
      for (const order of orders) {
        const match = order.orderNumber.match(/^PO-(\d+)$/);
        if (match) {
          const num = parseInt(match[1]);
          if (num > maxNumber) {
            maxNumber = num;
          }
        }
      }

      const nextNumber = maxNumber + 1;
      const fallbackNumber = `PO-${nextNumber.toString().padStart(6, "0")}`;
      this.logger.log(`Fallback purchase order number: ${fallbackNumber}`);
      return fallbackNumber;
    }
  }

  /**
   * Create a new purchase order
   */
  async create(
    createPurchaseOrderDto: CreatePurchaseOrderDto,
    userId?: string,
    username?: string,
  ): Promise<PurchaseOrderResponseDto> {
    this.logger.log(
      `Creating purchase order for supplier: ${createPurchaseOrderDto.supplierId}`,
    );

    // Validate supplier exists and is active
    const supplier = await this.supplierRepository.findOne({
      where: { id: createPurchaseOrderDto.supplierId },
    });

    if (!supplier) {
      throw new NotFoundException("Supplier not found");
    }

    if (!supplier.isActive) {
      throw new BadRequestException(
        "Cannot create purchase order for inactive supplier",
      );
    }

    try {
      // Generate sequential order number
      const orderNumber = await this.generateSequentialOrderNumber();

      // Create purchase order
      const purchaseOrder = this.purchaseOrderRepository.create({
        ...createPurchaseOrderDto,
        orderNumber,
        orderDate: new Date(createPurchaseOrderDto.orderDate),
      });

      // Create order items
      const orderItems: PurchaseOrderItem[] = [];
      let subtotal = 0;

      let lineNum = 1;
      for (const itemDto of createPurchaseOrderDto.items) {
        // Validate product
        const product = await this.productRepository.findOne({
          where: { id: itemDto.productId },
        });

        if (!product) {
          throw new BadRequestException(
            `Product with ID ${itemDto.productId} not found`,
          );
        }

        const item = this.purchaseOrderItemRepository.create({
          productId: itemDto.productId,
          quantity: itemDto.quantity,
          unitCost: itemDto.unitPrice,
          discountType: itemDto.discountType || "percentage",
          discountPercent: itemDto.discountPercent || 0,
          discountAmount: itemDto.discountAmount || 0,
          status: "pending" as any,
          receivedQuantity: 0,
          lineNumber: lineNum,
        });

        this.logger.debug(
          `Created item with lineNumber: ${item.lineNumber}, lineNum variable: ${lineNum}`,
        );

        // Calculate totals manually to get the amount before saving
        // Discount is applied to unit price first, then multiplied by quantity
        let unitDiscount = 0;
        if (item.discountType === "percentage") {
          unitDiscount =
            item.discountPercent > 0
              ? (Number(item.unitCost) * Number(item.discountPercent)) / 100
              : 0;
        } else if (item.discountType === "fixed_amount") {
          unitDiscount = Number(item.discountAmount) || 0;
        }
        const discountedUnitPrice = Number(item.unitCost) - unitDiscount;
        const totalAmount = discountedUnitPrice * Number(item.quantity);

        this.logger.debug(
          `After manual calculation, lineNumber: ${item.lineNumber}, totalAmount: ${totalAmount}`,
        );

        orderItems.push(item);
        subtotal += totalAmount;
        lineNum++;
      }

      this.logger.debug(
        `Total items created: ${orderItems.length}, checking lineNumbers: ${orderItems.map((i) => i.lineNumber).join(", ")}`,
      );

      // Set purchase order totals
      purchaseOrder.subtotal = subtotal;

      // Attach items to purchase order before calculating totals (needed for calculateTotals)
      purchaseOrder.items = orderItems;

      // Calculate totals after items are attached
      purchaseOrder.calculateTotals();

      // Check supplier credit limit
      const canPurchase = await this.supplierService.canPurchase(
        supplier.id,
        Number(purchaseOrder.totalAmount),
      );

      if (!canPurchase) {
        throw new BadRequestException(
          "Purchase amount exceeds supplier credit limit",
        );
      }

      // Save purchase order with items (cascade will save items automatically)
      const savedPurchaseOrder =
        await this.purchaseOrderRepository.save(purchaseOrder);

      // Update supplier metrics if this is a new order
      const isFirstOrder = supplier.totalOrders === 0;
      await this.supplierService.updatePurchaseMetrics(
        supplier.id,
        Number(savedPurchaseOrder.totalAmount),
        isFirstOrder,
      );

      // Auto-create GRN in draft status
      await this.createDraftGrn(savedPurchaseOrder, userId, username);

      // Log audit trail for create
      await this.auditLogService.log(
        "CREATE",
        "PurchaseOrder",
        `Created purchase order: ${savedPurchaseOrder.orderNumber}`,
        {
          entityId: savedPurchaseOrder.id,
          userId: userId || "system",
          username,
          newValues: {
            orderNumber: savedPurchaseOrder.orderNumber,
            supplierId: supplier.id,
            totalAmount: savedPurchaseOrder.totalAmount,
          },
        },
      );

      this.logger.log(
        `Purchase order created successfully: ${savedPurchaseOrder.orderNumber}`,
      );
      return await this.findOne(savedPurchaseOrder.id);
    } catch (error) {
      this.logger.error(
        `Error creating purchase order: ${error.message}`,
        error.stack,
      );

      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }

      throw new BadRequestException("Failed to create purchase order");
    }
  }

  /**
   * Get all purchase orders with filtering and pagination
   */
  async findAll(
    query: PurchaseOrderQueryDto,
  ): Promise<PurchaseOrderListResponseDto> {
    this.logger.log(
      `Finding purchase orders with query: ${JSON.stringify(query)}`,
    );

    const page = query.page || 1;
    const limit = query.limit;
    const skip = limit ? (page - 1) * limit : 0;
    const queryBuilder = this.buildPurchaseOrderListQuery(query, {
      includeDeleted: false,
    });

    this.applyListOrdering(queryBuilder, query, "orderDate", {
      addSecondaryOrderNumber: true,
    });

    const total = await queryBuilder.getCount();

    if (limit) {
      queryBuilder.skip(skip).take(limit);
    }

    const purchaseOrders = await queryBuilder.getMany();
    const orderDtos = purchaseOrders.map((order) =>
      this.mapToResponseDto(order),
    );

    return {
      orders: orderDtos,
      total,
      page,
      limit: limit || total,
      totalPages: limit ? Math.ceil(total / limit) : 1,
      hasNext: limit ? page < Math.ceil(total / limit) : false,
      hasPrev: page ? page > 1 : false,
    };
  }

  async searchGlobal(
    query: string,
    user: any,
  ): Promise<GlobalSearchResultDto[]> {
    if (!canSearchPurchaseOrders(user.role)) return [];

    const trimmed = query.trim();
    const q = trimmed.toLowerCase();
    const orders = await this.purchaseOrderRepository
      .createQueryBuilder("order")
      .leftJoinAndSelect("order.supplier", "supplier")
      .where("order.deletedAt IS NULL")
      .andWhere(
        "(order.orderNumber ILIKE :q OR supplier.companyName ILIKE :q)",
        {
          q: `%${trimmed}%`,
        },
      )
      .take(SEARCH_CANDIDATE_LIMIT)
      .getMany();

    if (orders.length > 0) {
      return orders.map((order) => this.mapPurchaseOrder(order, q, false));
    }

    const fuzzyOrders = await this.purchaseOrderRepository
      .createQueryBuilder("order")
      .addSelect("similarity(order.orderNumber, :q)", "sim")
      .leftJoinAndSelect("order.supplier", "supplier")
      .where("order.deletedAt IS NULL")
      .andWhere("similarity(order.orderNumber, :q) > 0.3")
      .orderBy("sim", "DESC")
      .setParameter("q", trimmed)
      .take(SEARCH_CANDIDATE_LIMIT)
      .getMany();

    return fuzzyOrders.map((order) => this.mapPurchaseOrder(order, q, true));
  }

  private mapPurchaseOrder(
    order: PurchaseOrder,
    q: string,
    fuzzy: boolean,
  ): GlobalSearchResultDto {
    const orderNumber = order.orderNumber?.toLowerCase() ?? "";
    const baseScore = fuzzy
      ? SCORE_FUZZY
      : orderNumber === q
        ? SCORE_EXACT_CODE
        : orderNumber.startsWith(q)
          ? SCORE_STARTSWITH_CODE
          : SCORE_CONTAINS;

    return {
      type: "transaction",
      id: order.id,
      label: order.orderNumber,
      description: order.supplier?.companyName ?? "",
      route: `/purchasing/orders/${order.id}/edit`,
      score:
        baseScore +
        BOOST_TRANSACTION +
        (baseScore === SCORE_EXACT_CODE ? BOOST_EXACT_MATCH : 0),
    };
  }

  /**
   * Get purchase order by ID
   */
  async findOne(id: string): Promise<PurchaseOrderResponseDto> {
    this.logger.log(`Finding purchase order by ID: ${id}`);

    const purchaseOrder = await this.purchaseOrderRepository
      .createQueryBuilder("po")
      .leftJoinAndSelect("po.supplier", "supplier")
      .leftJoinAndSelect("po.items", "items")
      .leftJoinAndSelect("items.product", "product")
      .leftJoinAndSelect("po.goodsReceivedNotes", "grns")
      .leftJoinAndSelect("po.vendorPayments", "vendorPayments")
      .where("po.id = :id", { id })
      .getOne();

    if (!purchaseOrder) {
      throw new NotFoundException(`Purchase order with ID ${id} not found`);
    }

    return this.mapToResponseDto(purchaseOrder);
  }

  async findByOrderNumber(
    orderNumber: string,
  ): Promise<PurchaseOrderResponseDto> {
    const purchaseOrder = await this.purchaseOrderRepository
      .createQueryBuilder("po")
      .leftJoinAndSelect("po.supplier", "supplier")
      .leftJoinAndSelect("po.items", "items")
      .leftJoinAndSelect("items.product", "product")
      .leftJoinAndSelect("po.goodsReceivedNotes", "grns")
      .leftJoinAndSelect("po.vendorPayments", "vendorPayments")
      .where("po.orderNumber = :orderNumber", { orderNumber })
      .getOne();

    if (!purchaseOrder) {
      throw new NotFoundException(`Purchase order '${orderNumber}' not found`);
    }

    return this.mapToResponseDto(purchaseOrder);
  }

  /**
   * Update purchase order
   */
  async update(
    id: string,
    updatePurchaseOrderDto: UpdatePurchaseOrderDto,
    userId?: string,
    username?: string,
  ): Promise<PurchaseOrderResponseDto> {
    this.logger.log(`Updating purchase order: ${id}`);

    const purchaseOrder = await this.purchaseOrderRepository.findOne({
      where: { id },
      // Don't load items relation to avoid cascade issues when we manually save them
    });

    if (!purchaseOrder) {
      throw new NotFoundException(`Purchase order with ID ${id} not found`);
    }

    if (updatePurchaseOrderDto.items) {
      await this.purchaseOrderLifecycleService.assertItemsNotLocked(id);
    }

    // Check if order can be modified
    try {
      // Track if orderDate is being changed
      const orderDateChanged =
        updatePurchaseOrderDto.orderDate &&
        new Date(updatePurchaseOrderDto.orderDate).getTime() !==
          new Date(purchaseOrder.orderDate).getTime();

      // Update basic fields (exclude items as they're handled separately)
      const { items: _, ...updateFields } = updatePurchaseOrderDto;
      Object.assign(purchaseOrder, {
        ...updateFields,
        orderDate: updatePurchaseOrderDto.orderDate
          ? new Date(updatePurchaseOrderDto.orderDate)
          : purchaseOrder.orderDate,
      });

      // Update items if provided
      if (updatePurchaseOrderDto.items) {
        // Remove existing items
        await this.purchaseOrderItemRepository.delete({ purchaseOrderId: id });

        // Create new items
        const orderItems: PurchaseOrderItem[] = [];
        let subtotal = 0;
        let lineNum = 1;

        for (const itemDto of updatePurchaseOrderDto.items) {
          let product: Product | undefined;

          if (itemDto.productId) {
            product = await this.productRepository.findOne({
              where: { id: itemDto.productId },
            });
          }

          if (!product) {
            throw new BadRequestException(
              `Product with ID ${itemDto.productId} not found`,
            );
          }

          const item = new PurchaseOrderItem();
          item.purchaseOrderId = id;
          item.productId = itemDto.productId;
          item.quantity = itemDto.quantity;
          item.unitCost = itemDto.unitPrice;
          item.discountType = itemDto.discountType || "percentage";
          item.discountPercent = itemDto.discountPercent || 0;
          item.discountAmount = itemDto.discountAmount || 0;
          item.status = "pending" as any;
          item.receivedQuantity = 0;
          item.lineNumber = lineNum;

          this.logger.debug(
            `Item before push - lineNumber: ${item.lineNumber}, productId: ${item.productId}, quantity: ${item.quantity}`,
          );

          // Calculate totals manually to get the amount before saving
          // Discount is applied to unit price first, then multiplied by quantity
          let unitDiscount = 0;
          if (item.discountType === "percentage") {
            unitDiscount =
              item.discountPercent > 0
                ? (Number(item.unitCost) * Number(item.discountPercent)) / 100
                : 0;
          } else if (item.discountType === "fixed_amount") {
            unitDiscount = Number(item.discountAmount) || 0;
          }
          const discountedUnitPrice = Number(item.unitCost) - unitDiscount;
          const totalAmount = discountedUnitPrice * Number(item.quantity);

          orderItems.push(item);
          subtotal += totalAmount;
          lineNum++;
        }

        this.logger.debug(
          `About to save ${orderItems.length} items. LineNumbers: ${orderItems.map((i) => `${i.lineNumber}`).join(", ")}`,
        );

        try {
          const savedItems =
            await this.purchaseOrderItemRepository.save(orderItems);
          this.logger.debug(`Saved ${savedItems.length} items successfully`);
        } catch (saveError) {
          this.logger.error(`Failed to save items: ${saveError.message}`);
          this.logger.debug(
            `Item details before save attempt: ${JSON.stringify(orderItems.map((i) => ({ lineNumber: i.lineNumber, productId: i.productId, quantity: i.quantity })))}`,
          );
          throw saveError;
        }

        purchaseOrder.subtotal = subtotal;
        // Attach items to purchase order before calculating totals
        purchaseOrder.items = orderItems;
        purchaseOrder.calculateTotals();
      }

      const updatedPurchaseOrder =
        await this.purchaseOrderRepository.save(purchaseOrder);

      // Sync GRN if it exists and is in draft status
      if (updatePurchaseOrderDto.items) {
        await this.syncDraftGrn(updatedPurchaseOrder.id);
      }

      if (updatePurchaseOrderDto.supplierId !== undefined) {
        await this.syncDraftGrnHeader(updatedPurchaseOrder.id);
      }

      // Sync GRN date if PO order date changed
      if (orderDateChanged) {
        await this.syncGrnDate(
          updatedPurchaseOrder.id,
          new Date(updatePurchaseOrderDto.orderDate),
        );
      }

      // Log audit trail for update
      await this.auditLogService.log(
        "UPDATE",
        "PurchaseOrder",
        `Updated purchase order: ${updatedPurchaseOrder.orderNumber}`,
        {
          entityId: updatedPurchaseOrder.id,
          userId: userId || "system",
          username,
          newValues: {
            orderNumber: updatedPurchaseOrder.orderNumber,
            totalAmount: updatedPurchaseOrder.totalAmount,
          },
        },
      );

      this.logger.log(
        `Purchase order updated successfully: ${updatedPurchaseOrder.orderNumber}`,
      );
      return await this.findOne(updatedPurchaseOrder.id);
    } catch (error) {
      this.logger.error(
        `Error updating purchase order: ${error.message}`,
        error.stack,
      );
      throw new BadRequestException("Failed to update purchase order");
    }
  }

  /**
   * Get purchase order summary
   */
  async getSummary(): Promise<PurchaseOrderSummaryDto> {
    this.logger.log("Getting purchase order summary");

    try {
      const [totalOrders, totalAmount, overdueOrders, topSuppliers] =
        await Promise.all([
          // Total orders count
          this.purchaseOrderRepository.count(),

          // Total amount
          this.purchaseOrderRepository
            .createQueryBuilder("po")
            .select("SUM(po.totalAmount)", "total")
            .getRawOne()
            .then((result) => parseFloat(result.total) || 0),

          // Overdue orders
          this.purchaseOrderRepository
            .createQueryBuilder("po")
            .where("1=0") // Always returns 0 since expectedDeliveryDate field was removed
            .getCount(),

          // Top suppliers by volume
          this.purchaseOrderRepository
            .createQueryBuilder("po")
            .leftJoinAndSelect("po.supplier", "supplier")
            .select("supplier.id", "supplierId")
            .addSelect("supplier.companyName", "companyName")
            .addSelect("COUNT(*)", "orderCount")
            .addSelect("SUM(po.totalAmount)", "totalAmount")
            .groupBy("supplier.id")
            .addGroupBy("supplier.companyName")
            .orderBy("SUM(po.totalAmount)", "DESC")
            .limit(5)
            .getRawMany()
            .then((results) =>
              results.map((row) => ({
                supplierId: row.supplierId,
                companyName: row.companyName,
                orderCount: parseInt(row.orderCount),
                totalAmount: parseFloat(row.totalAmount),
              })),
            ),
        ]);

      const averageOrderValue = totalOrders > 0 ? totalAmount / totalOrders : 0;

      return {
        totalOrders,
        totalAmount,
        averageOrderValue,
        overdueOrders,
        topSuppliers,
      };
    } catch (error) {
      this.logger.error(
        `Error getting purchase order summary: ${error.message}`,
        error.stack,
      );
      throw new BadRequestException("Failed to get purchase order summary");
    }
  }

  /**
   * Get deleted purchase orders
   */
  async findDeleted(
    query: PurchaseOrderQueryDto,
  ): Promise<PurchaseOrderListResponseDto> {
    this.logger.log("Getting deleted purchase orders");

    const page = query.page || 1;
    const limit = query.limit || 20;
    const skip = (page - 1) * limit;

    const queryBuilder = this.buildPurchaseOrderListQuery(query, {
      includeDeleted: true,
    });
    const total = await queryBuilder.getCount();

    this.applyListOrdering(queryBuilder, query, "deletedAt", {
      addSecondaryOrderNumber: false,
    });
    queryBuilder.skip(skip).take(limit);

    const purchaseOrders = await queryBuilder.getMany();

    return {
      orders: purchaseOrders.map((po) => this.mapToResponseDto(po)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      hasNext: page < Math.ceil(total / limit),
      hasPrev: page > 1,
    };
  }

  /**
   * Restore a deleted purchase order and its associated GRN (sets deletedAt to null for both)
   */
  async restore(
    id: string,
    userId?: string,
    username?: string,
  ): Promise<PurchaseOrderResponseDto> {
    this.logger.log(`Restoring purchase order: ${id}`);

    // Check if the order exists in deleted records
    const purchaseOrder = await this.purchaseOrderRepository.findOne({
      where: { id },
      withDeleted: true,
      relations: { supplier: true, items: { product: true } },
    });

    if (!purchaseOrder) {
      throw new NotFoundException("Purchase order not found");
    }

    if (!purchaseOrder.deletedAt) {
      throw new BadRequestException("Purchase order is not deleted");
    }

    // Find and restore associated GRN (set deletedAt to null)
    const grn = await this.grnRepository.findOne({
      where: { purchaseOrderId: id },
      withDeleted: true,
    });

    if (grn && grn.deletedAt) {
      await this.grnRepository
        .createQueryBuilder()
        .update()
        .set({ deletedAt: null })
        .where("id = :id", { id: grn.id })
        .execute();

      // Log audit trail for automatic GRN restoration
      await this.auditLogService.log(
        "RESTORE",
        "GoodsReceivedNote",
        `Restored GRN: ${grn.grnNumber} (auto-restored with PO)`,
        {
          entityId: grn.id,
          userId,
          username,
          newValues: {
            grnNumber: grn.grnNumber,
            purchaseOrderId: grn.purchaseOrderId,
            status: grn.status,
          },
        },
      );

      this.logger.log(
        `Associated GRN ${grn.grnNumber} restored (deletedAt set to null)`,
      );
    }

    // Restore PO (set deletedAt to null)
    await this.purchaseOrderRepository
      .createQueryBuilder()
      .update()
      .set({ deletedAt: null })
      .where("id = :id", { id })
      .execute();

    // Fetch the restored order
    const restoredOrder = await this.purchaseOrderRepository.findOne({
      where: { id },
      relations: { supplier: true, items: { product: true } },
    });

    // Log audit trail for PO restoration
    await this.auditLogService.log(
      "RESTORE",
      "PurchaseOrder",
      `Restored purchase order: ${purchaseOrder.orderNumber}`,
      {
        entityId: id,
        userId,
        username,
        newValues: {
          orderNumber: purchaseOrder.orderNumber,
          totalAmount: purchaseOrder.totalAmount,
        },
      },
    );

    this.logger.log(
      `Purchase order ${purchaseOrder.orderNumber} restored successfully (deletedAt set to null)`,
    );
    return this.mapToResponseDto(restoredOrder);
  }

  /**
   * Bulk restore deleted purchase orders
   */
  async bulkRestore(
    orderIds: string[],
    userId?: string,
    username?: string,
  ): Promise<{ restoredCount: number; failedIds: string[] }> {
    this.logger.log(`Bulk restoring ${orderIds.length} purchase orders`);

    const failedIds: string[] = [];
    let successCount = 0;

    for (const orderId of orderIds) {
      try {
        await this.restore(orderId, userId, username);
        successCount++;
      } catch (error) {
        this.logger.error(
          `Failed to restore purchase order ${orderId}: ${error.message}`,
        );
        failedIds.push(orderId);
      }
    }

    this.logger.log(
      `Bulk restore completed: ${successCount} restored, ${failedIds.length} failed`,
    );
    return { restoredCount: successCount, failedIds };
  }

  /**
   * Permanently delete a purchase order and its associated GRN
   */
  async permanentDelete(
    id: string,
    userId?: string,
    username?: string,
  ): Promise<void> {
    this.logger.log(`Permanently deleting purchase order: ${id}`);

    const purchaseOrder = await this.purchaseOrderRepository.findOne({
      where: { id },
      withDeleted: true,
    });

    if (!purchaseOrder) {
      throw new NotFoundException("Purchase order not found");
    }

    await this.purchaseOrderLifecycleService.assertPermanentDeleteAllowed(id);

    // Delete associated stock movements
    try {
      const stockMovementResult =
        await this.stockMovementService.deleteByReference("purchase_order", id);
      this.logger.log(
        `Deleted ${stockMovementResult.deletedCount} stock movements for purchase order ${purchaseOrder.orderNumber}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to delete stock movements for purchase order ${purchaseOrder.orderNumber}: ${error.message}`,
      );
      // Don't throw error - purchase order deletion should still succeed
    }

    // Find and permanently delete all associated VendorPayments (including soft-deleted)
    // Must be done before GRN deletion because vendor_payments.grnId references goods_received_notes
    const vendorPayments = await this.vendorPaymentRepository.find({
      where: { purchaseOrderId: id },
      withDeleted: true,
    });

    for (const payment of vendorPayments) {
      await this.auditLogService.log(
        "PERMANENT_DELETE",
        "VendorPayment",
        `Permanently deleted vendor payment: ${payment.paymentNumber} (auto-deleted with PO)`,
        {
          entityId: payment.id,
          userId: userId || "system",
          username,
          oldValues: {
            paymentNumber: payment.paymentNumber,
            amount: payment.amount,
            status: payment.status,
            paymentMethodId: payment.paymentMethodId,
          },
        },
      );
    }

    if (vendorPayments.length > 0) {
      await this.vendorPaymentRepository.remove(vendorPayments);
      this.logger.log(
        `Permanently deleted ${vendorPayments.length} vendor payment(s) for purchase order ${purchaseOrder.orderNumber}`,
      );
    }

    // Find and permanently delete associated GRN (including soft-deleted)
    const grn = await this.grnRepository.findOne({
      where: { purchaseOrderId: id },
      withDeleted: true,
    });

    if (grn) {
      // Log audit trail for GRN permanent delete
      await this.auditLogService.log(
        "PERMANENT_DELETE",
        "GoodsReceivedNote",
        `Permanently deleted GRN: ${grn.grnNumber} (auto-deleted with PO)`,
        {
          entityId: grn.id,
          userId: userId || "system",
          username,
          oldValues: {
            grnNumber: grn.grnNumber,
            purchaseOrderId: grn.purchaseOrderId,
            status: grn.status,
          },
        },
      );

      await this.grnRepository.remove(grn);
      this.logger.log(`Associated GRN ${grn.grnNumber} permanently deleted`);
    }

    // Log audit trail for PO permanent delete
    await this.auditLogService.log(
      "PERMANENT_DELETE",
      "PurchaseOrder",
      `Permanently deleted purchase order: ${purchaseOrder.orderNumber}`,
      {
        entityId: id,
        userId: userId || "system",
        username,
        oldValues: {
          orderNumber: purchaseOrder.orderNumber,
          supplierId: purchaseOrder.supplierId,
          totalAmount: purchaseOrder.totalAmount,
          isFullyReceived: purchaseOrder.isFullyReceived,
        },
      },
    );

    // Hard delete - remove from database completely
    await this.purchaseOrderRepository.remove(purchaseOrder);

    this.logger.log(
      `Permanently deleted purchase order: ${purchaseOrder.orderNumber}`,
    );
  }

  /**
   * Bulk permanently delete purchase orders
   */
  async bulkPermanentDelete(
    orderIds: string[],
    userId?: string,
    username?: string,
  ): Promise<{ deletedCount: number; failedIds: string[] }> {
    this.logger.log(
      `Bulk permanently deleting ${orderIds.length} purchase orders`,
    );

    const failedIds: string[] = [];
    let successCount = 0;

    for (const orderId of orderIds) {
      try {
        await this.permanentDelete(orderId, userId || "system", username);
        successCount++;
      } catch (error) {
        this.logger.error(
          `Failed to permanently delete purchase order ${orderId}: ${error.message}`,
        );
        failedIds.push(orderId);
      }
    }

    this.logger.log(
      `Bulk permanent delete completed: ${successCount} deleted, ${failedIds.length} failed`,
    );
    return { deletedCount: successCount, failedIds };
  }

  /**
   * Soft delete a purchase order and its associated GRN with same deletedAt timestamp
   */
  async remove(id: string, userId?: string, username?: string): Promise<void> {
    this.logger.log(`Soft deleting purchase order: ${id}`);
    await this.purchaseOrderLifecycleService.softDelete(id, userId, username);
  }

  /**
   * Sync draft GRN with updated PO items
   * Only syncs if GRN is in DRAFT status
   */
  private async syncDraftGrn(purchaseOrderId: string): Promise<void> {
    try {
      // Find GRN associated with this PO
      const grn = await this.grnRepository.findOne({
        where: { purchaseOrderId },
        relations: { items: true },
      });

      if (!grn) {
        this.logger.debug(`No GRN found for PO ${purchaseOrderId}`);
        return;
      }

      // Only sync if GRN is in DRAFT status
      if (grn.status !== GrnStatus.DRAFT) {
        this.logger.debug(
          `GRN ${grn.grnNumber} is in ${grn.status} status, skipping sync`,
        );
        return;
      }

      // Fetch full PO with relations
      const fullPO = await this.purchaseOrderRepository.findOne({
        where: { id: purchaseOrderId },
        relations: { supplier: true, items: { product: true } },
      });

      if (!fullPO) {
        this.logger.warn(`PO ${purchaseOrderId} not found during GRN sync`);
        return;
      }

      this.logger.log(
        `Syncing GRN ${grn.grnNumber} with updated PO ${fullPO.orderNumber}`,
      );

      // Remove existing GRN items (since PO items were updated)
      if (grn.items && grn.items.length > 0) {
        this.logger.debug(`Removing ${grn.items.length} existing GRN items`);
        await this.grnService.removeGrnItems(grn.id);
      }

      // Recreate GRN items from updated PO items
      const grnItems: any[] = [];
      let lineNumber = 1;

      for (const poItem of fullPO.items || []) {
        const grnItem = {
          grnId: grn.id,
          lineNumber: lineNumber++,
          productId: poItem.product.id,
          orderedQuantity: Number(poItem.quantity),
          receivedQuantity: 0, // Reset to 0 for draft
          purchaseOrderItemId: poItem.id,
        };

        grnItems.push(grnItem);
        this.logger.debug(
          `Created GRN item for product: ${poItem.product.name}, ordered: ${grnItem.orderedQuantity}`,
        );
      }

      this.logger.debug(`Saving ${grnItems.length} new GRN items`);
      // Save updated GRN items
      await this.grnService.updateGrnItems(grn.id, grnItems);

      // Reload GRN with fresh items from database
      this.logger.debug(`Reloading GRN ${grn.id} with items`);
      const updatedGrn = await this.grnRepository.findOne({
        where: { id: grn.id },
        relations: { items: true },
      });

      if (updatedGrn) {
        this.logger.debug(
          `Reloaded GRN has ${updatedGrn.items?.length || 0} items`,
        );
        // Update GRN totals with fresh data
        updatedGrn.calculateTotals();
        await this.grnRepository.save(updatedGrn);
        this.logger.log(
          `GRN ${grn.grnNumber} synced successfully with ${grnItems.length} items`,
        );
      } else {
        this.logger.warn(`Failed to reload GRN ${grn.id} after sync`);
      }
    } catch (error) {
      this.logger.error(
        `Error syncing draft GRN: ${error.message}`,
        error.stack,
      );
      // Don't throw - GRN sync failure shouldn't block PO update
    }
  }

  private async syncDraftGrnHeader(purchaseOrderId: string): Promise<void> {
    try {
      const grn = await this.grnRepository.findOne({
        where: { purchaseOrderId },
      });

      if (!grn || grn.status !== GrnStatus.DRAFT) {
        return;
      }

      const fullPO = await this.purchaseOrderRepository.findOne({
        where: { id: purchaseOrderId },
      });

      if (!fullPO) {
        this.logger.warn(
          `PO ${purchaseOrderId} not found during GRN header sync`,
        );
        return;
      }

      grn.supplierId = fullPO.supplierId;

      await this.grnRepository.save(grn);
      this.logger.log(
        `GRN ${grn.grnNumber} header synced from PO ${fullPO.orderNumber}`,
      );
    } catch (error) {
      this.logger.error(
        `Error syncing draft GRN header: ${error.message}`,
        error.stack,
      );
    }
  }

  /**
   * Sync GRN receivedDate with PO orderDate when PO date is changed
   */
  private async syncGrnDate(
    purchaseOrderId: string,
    newOrderDate: Date,
  ): Promise<void> {
    try {
      // Find GRN associated with this PO
      const grn = await this.grnRepository.findOne({
        where: { purchaseOrderId },
      });

      if (!grn) {
        this.logger.debug(`No GRN found for PO ${purchaseOrderId}`);
        return;
      }

      // Update GRN receivedDate to match PO orderDate
      grn.receivedDate = newOrderDate;
      await this.grnRepository.save(grn);

      this.logger.log(
        `GRN ${grn.grnNumber} date synced to ${newOrderDate.toISOString()}`,
      );
    } catch (error) {
      this.logger.error(
        `Error syncing GRN date: ${error.message}`,
        error.stack,
      );
      // Don't throw - GRN date sync failure shouldn't block PO update
    }
  }

  /**
   * Create a draft GRN for a new purchase order
   */
  private async createDraftGrn(
    purchaseOrder: PurchaseOrder,
    userId?: string,
    username?: string,
  ): Promise<void> {
    try {
      const grnNumber =
        await this.settingsService.generateDocumentNumber("Goods Received");

      // Fetch full PO with relations for GRN creation
      const fullPO = await this.purchaseOrderRepository.findOne({
        where: { id: purchaseOrder.id },
        relations: { supplier: true, items: { product: true } },
      });

      if (!fullPO) {
        throw new NotFoundException("Purchase order not found");
      }

      // Create GRN with draft status
      const grn = this.grnRepository.create({
        grnNumber,
        purchaseOrderId: fullPO.id,
        supplierId: fullPO.supplier.id,
        receivedDate: new Date(),
        status: GrnStatus.DRAFT,
        totalQuantityReceived: 0,
      });

      const savedGrn = await this.grnRepository.save(grn);

      // Log audit trail for GRN creation immediately after successful save
      // Do this BEFORE creating items to ensure logging happens even if item creation fails
      await this.auditLogService.log(
        "CREATE",
        "GoodsReceivedNote",
        `Created GRN: ${savedGrn.grnNumber}`,
        {
          entityId: savedGrn.id,
          userId: userId || "system",
          username,
          newValues: {
            grnNumber: savedGrn.grnNumber,
            purchaseOrderId: savedGrn.purchaseOrderId,
            status: savedGrn.status,
          },
        },
      );

      // Create GRN items using relational table
      const grnItems: any[] = [];
      let lineNumber = 1;

      for (const poItem of fullPO.items || []) {
        const grnItem = {
          grnId: savedGrn.id,
          lineNumber: lineNumber++,
          productId: poItem.product.id,
          orderedQuantity: Number(poItem.quantity),
          receivedQuantity: 0, // Set to 0 for draft status
          purchaseOrderItemId: poItem.id,
        };

        grnItems.push(grnItem);
      }

      // Save GRN items only if we have items to save
      if (grnItems.length > 0) {
        await this.grnService.updateGrnItems(savedGrn.id, grnItems);
      }

      // Update GRN totals based on relational items
      savedGrn.items = grnItems as any;
      savedGrn.calculateTotals();
      await this.grnRepository.save(savedGrn);

      this.logger.log(
        `Draft GRN ${grnNumber} created for PO ${fullPO.orderNumber} with ${grnItems.length} items`,
      );
    } catch (error) {
      this.logger.error(
        `Error creating draft GRN: ${error.message}`,
        error.stack,
      );
      // Log detailed error but don't throw - GRN creation failure shouldn't block PO creation
      // However, we should clean up the partial GRN if it was created
      this.logger.warn(
        `Draft GRN creation failed for PO ${purchaseOrder.orderNumber}. User will need to manually create or receive GRN.`,
      );
    }
  }

  /**
   * Receive goods - change GRN status to received and update product quantities
   */
  async receiveGoods(
    id: string,
    userId?: string,
    username?: string,
  ): Promise<PurchaseOrderResponseDto> {
    this.logger.log(`Receiving goods for purchase order: ${id}`);

    const purchaseOrder = await this.purchaseOrderRepository.findOne({
      where: { id },
      relations: { items: { product: true }, supplier: true },
    });

    if (!purchaseOrder) {
      throw new NotFoundException("Purchase order not found");
    }

    // Find the GRN linked to this PO with relational items
    const grn = await this.grnRepository.findOne({
      where: { purchaseOrderId: id },
      relations: { items: true },
    });

    if (!grn) {
      throw new NotFoundException(
        "Goods Received Note not found for this purchase order",
      );
    }

    if (grn.status !== GrnStatus.DRAFT) {
      throw new BadRequestException(
        "GRN must be in draft status to receive goods",
      );
    }

    try {
      // Update GRN items to set received quantities
      if (grn.items && grn.items.length > 0) {
        await this.grnService.updateGrnItems(
          grn.id,
          grn.items.map((item) => ({
            id: item.id,
            grnId: item.grnId,
            lineNumber: item.lineNumber,
            productId: item.productId,
            orderedQuantity: Number(item.orderedQuantity),
            receivedQuantity: Number(item.orderedQuantity), // Set received = ordered
            purchaseOrderItemId: item.purchaseOrderItemId,
          })),
        );
      }

      // Reload GRN with fresh items from database
      const updatedGrn = await this.grnRepository.findOne({
        where: { id: grn.id },
        relations: { items: true },
      });

      if (!updatedGrn) {
        throw new NotFoundException("GRN not found after updating items");
      }

      // Update GRN status and recalculate totals with fresh data
      updatedGrn.status = GrnStatus.RECEIVED;
      updatedGrn.calculateTotals();
      await this.grnRepository.save(updatedGrn);

      // Update product quantities and create stock movements
      for (const item of purchaseOrder.items) {
        const product = await this.productRepository.findOne({
          where: { id: item.productId },
        });

        if (product) {
          // Create stock movement for purchase receipt
          const createMovementDto: CreateStockMovementDto = {
            productId: item.productId,
            movementType: StockMovementType.PURCHASE_RECEIPT,
            quantity: Number(item.quantity),
            reason: `Purchase order received: ${purchaseOrder.orderNumber}`,
            referenceType: "purchase_order",
            referenceId: purchaseOrder.id,
            unitValue: Number(item.unitCost),
          };

          await this.stockMovementService.create(createMovementDto);
          this.logger.log(
            `Stock movement created for product ${item.productId}: +${item.quantity} units from PO ${purchaseOrder.orderNumber}`,
          );
        }

        // Update PO item received quantity
        item.receivedQuantity = item.quantity;
        await this.purchaseOrderItemRepository.save(item);
      }

      // Update base costs for all received products
      await this.updateBaseCostsForGrn(updatedGrn, purchaseOrder);

      // Auto-post to accounting (don't fail goods receipt on error)
      try {
        const fullGrn = await this.grnRepository.findOne({
          where: { id: updatedGrn.id },
          relations: {
            supplier: true,
            purchaseOrder: true,
            items: { product: true, purchaseOrderItem: true },
          },
        });

        if (fullGrn) {
          await this.accountingService.postGoodsReceivedEntry(
            fullGrn,
            userId || "system",
            username,
          );
          this.logger.log(
            `Posted accounting entry for GRN ${fullGrn.grnNumber}`,
          );
        }
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";
        const errorStack = error instanceof Error ? error.stack : undefined;
        this.logger.error(
          `Failed to post accounting entry for PO ${purchaseOrder.orderNumber} receipt: ${errorMessage}`,
          errorStack,
        );
      }

      // Touch the purchase order to update its updatedAt timestamp
      // Force TypeORM to update by using the update query
      await this.purchaseOrderRepository.update(id, {});

      // Log audit trail for receiving goods
      await this.auditLogService.log(
        "UPDATE",
        "PurchaseOrder",
        `Received goods for PO: ${purchaseOrder.orderNumber}`,
        {
          entityId: id,
          userId: userId || "system",
          username,
          newValues: {
            orderNumber: purchaseOrder.orderNumber,
            status: "received",
            grnStatus: GrnStatus.RECEIVED,
          },
        },
      );

      this.logger.log(
        `Goods received successfully for PO ${purchaseOrder.orderNumber}`,
      );
      return await this.findOne(id);
    } catch (error) {
      this.logger.error(`Error receiving goods: ${error.message}`, error.stack);
      if (error instanceof HttpException) throw error;
      const message =
        error instanceof Error ? error.message : "Failed to receive goods";
      throw new BadRequestException(message);
    }
  }

  /**
   * Return goods - change GRN status to return and revert product quantities
   */
  async returnGoods(
    id: string,
    userId?: string,
    username?: string,
  ): Promise<PurchaseOrderResponseDto> {
    this.logger.log(`Returning goods for purchase order: ${id}`);

    const purchaseOrder = await this.purchaseOrderRepository.findOne({
      where: { id },
      relations: { items: { product: true }, supplier: true },
    });

    if (!purchaseOrder) {
      throw new NotFoundException("Purchase order not found");
    }

    // Find the GRN linked to this PO with relational items
    const grn = await this.grnRepository.findOne({
      where: { purchaseOrderId: id },
      relations: { items: true },
    });

    if (!grn) {
      throw new NotFoundException(
        "Goods Received Note not found for this purchase order",
      );
    }

    if (grn.status !== GrnStatus.RECEIVED) {
      throw new BadRequestException(
        "GRN must be in received status to return goods",
      );
    }

    try {
      // Reverse base cost calculations BEFORE resetting quantities
      // This must happen first while GRN still has receivedQuantity data
      await this.reverseBaseCostsForGrn(grn);

      // Reset GRN items received quantities to 0
      if (grn.items && grn.items.length > 0) {
        await this.grnService.updateGrnItems(
          grn.id,
          grn.items.map((item) => ({
            id: item.id,
            grnId: item.grnId,
            lineNumber: item.lineNumber,
            productId: item.productId,
            orderedQuantity: Number(item.orderedQuantity),
            receivedQuantity: 0, // Reset to 0 (return)
            purchaseOrderItemId: item.purchaseOrderItemId,
          })),
        );
      }

      // Reload GRN with fresh items from database
      const updatedGrn = await this.grnRepository.findOne({
        where: { id: grn.id },
        relations: { items: true },
      });

      if (!updatedGrn) {
        throw new NotFoundException("GRN not found after updating items");
      }

      // Update GRN status back to draft and recalculate totals with fresh data
      updatedGrn.status = GrnStatus.DRAFT;
      updatedGrn.calculateTotals();
      await this.grnRepository.save(updatedGrn);

      // Delete stock movement records created during goods receipt
      try {
        const stockMovementResult =
          await this.stockMovementService.deleteByReference(
            "purchase_order",
            purchaseOrder.id,
          );
        this.logger.log(
          `Deleted ${stockMovementResult.deletedCount} stock movements for purchase order ${purchaseOrder.orderNumber} return`,
        );
      } catch (error) {
        this.logger.error(
          `Failed to delete stock movements for purchase order ${purchaseOrder.orderNumber}: ${error.message}`,
        );
        // Don't throw error - return should still succeed
      }

      // Reverse GRN journal entry (DR Inventory Asset / CR Accounts Payable)
      try {
        await this.accountingService.reverseSourceEntries(
          "goods_received_note",
          grn.id,
          "system",
        );
        this.logger.log(
          `Reversed GRN accounting entry for PO ${purchaseOrder.orderNumber}`,
        );
      } catch (error) {
        this.logger.error(
          `Failed to reverse GRN accounting entry for PO ${purchaseOrder.orderNumber}: ${error.message}`,
        );
        // Non-fatal - return still succeeds
      }

      // Reset PO item received quantities
      for (const item of purchaseOrder.items) {
        item.receivedQuantity = 0;
        await this.purchaseOrderItemRepository.save(item);
      }

      // Touch the purchase order to update its updatedAt timestamp
      // Force TypeORM to update by using the update query
      await this.purchaseOrderRepository.update(id, {});

      // Log audit trail for returning goods
      await this.auditLogService.log(
        "UPDATE",
        "PurchaseOrder",
        `Returned goods for PO: ${purchaseOrder.orderNumber}`,
        {
          entityId: id,
          userId: userId || "system",
          username,
          newValues: {
            orderNumber: purchaseOrder.orderNumber,
            status: "draft",
            grnStatus: GrnStatus.DRAFT,
          },
        },
      );

      this.logger.log(
        `Goods returned successfully for PO ${purchaseOrder.orderNumber}`,
      );
      return await this.findOne(id);
    } catch (error) {
      this.logger.error(`Error returning goods: ${error.message}`, error.stack);
      if (error instanceof HttpException) throw error;
      const message =
        error instanceof Error ? error.message : "Failed to return goods";
      throw new BadRequestException(message);
    }
  }

  /**
   * Record payment for purchase order with specified amount
   */
  async recordPayment(
    id: string,
    amount: number,
  ): Promise<PurchaseOrderResponseDto> {
    this.logger.log(`Recording payment of ${amount} for purchase order: ${id}`);

    const purchaseOrder = await this.purchaseOrderRepository.findOne({
      where: { id },
      relations: { supplier: true }, // Removed 'vendorPayments' to prevent TypeORM from trying to manage the relation
    });

    if (!purchaseOrder) {
      throw new NotFoundException("Purchase order not found");
    }

    // Calculate the amount to add as a new vendor payment
    const currentPaidAmount = purchaseOrder.paidAmount || 0;
    const paymentAmount = amount - currentPaidAmount;

    if (paymentAmount <= 0) {
      throw new BadRequestException(
        "Payment amount must be greater than current paid amount",
      );
    }

    // Create vendor payment using the vendor payment service to ensure audit logging
    const vendorPayment = await this.vendorPaymentService.create({
      supplierId: purchaseOrder.supplierId,
      purchaseOrderId: id,
      amount: paymentAmount,
      paymentDate: new Date().toISOString().split("T")[0], // Format as YYYY-MM-DD
      paymentMethodId: undefined,
      status: "completed",
      notes: "Payment recorded via system",
    });

    this.logger.log(
      `Vendor payment ${vendorPayment.paymentNumber} created for purchase order ${purchaseOrder.orderNumber}`,
    );

    // Update the paidAmount field
    purchaseOrder.paidAmount = amount;
    await this.purchaseOrderRepository.save(purchaseOrder);

    this.logger.log(
      `Purchase order ${purchaseOrder.orderNumber} paid amount updated to ${amount}, vendor payment ${vendorPayment.paymentNumber} created for ${paymentAmount}`,
    );

    // Return updated order
    return this.findOne(id);
  }

  /**
   * Record multiple payment lines for a purchase order
   * Each line creates a separate VendorPayment with journal posting
   */
  async recordOrderPayments(
    id: string,
    payments: { paymentMethodId: string; amount: number; reference?: string }[],
  ): Promise<PurchaseOrderResponseDto> {
    this.logger.log(
      `Recording ${payments.length} payment lines for purchase order: ${id}`,
    );

    const purchaseOrder = await this.purchaseOrderRepository.findOne({
      where: { id },
      relations: { supplier: true },
    });

    if (!purchaseOrder) {
      throw new NotFoundException("Purchase order not found");
    }

    if (!payments || payments.length === 0) {
      throw new BadRequestException("At least one payment line is required");
    }

    const totalNewPayment = payments.reduce((sum, p) => sum + p.amount, 0);

    // Check for a previously soft-deleted payment for this PO (from a prior unpay)
    const previousPayment = await this.vendorPaymentRepository.findOne({
      where: { purchaseOrderId: id },
      withDeleted: true,
      order: { deletedAt: "DESC" } as any,
    });

    if (previousPayment?.deletedAt) {
      // Restore previous vendor payment and update it with first payment line details.
      const firstLine = payments[0];
      await this.vendorPaymentRepository.restore(previousPayment.id);
      // Reload from DB after restore so deletedAt is null on the in-memory object.
      // Without this, save() would overwrite the restored deletedAt=null back to the old date.
      // Use update() (direct SQL) instead of save() to guarantee the new paymentMethodId
      // is written — save() can skip dirty fields due to the identity map after restore().
      await this.vendorPaymentRepository.update(previousPayment.id, {
        isActive: true,
        paymentMethodId: firstLine.paymentMethodId,
        amount: firstLine.amount,
        notes: firstLine.reference || previousPayment.notes,
        paymentDate: new Date() as any,
      });
      const restoredPayment = await this.vendorPaymentRepository.findOne({
        where: { id: previousPayment.id },
      });

      // Re-post accounting entry for restored payment.
      const fullPayment = await this.vendorPaymentService.findOne(
        restoredPayment.id,
      );
      await this.accountingService.postVendorPaymentEntry(
        fullPayment,
        "system",
      );

      // Create additional vendor payments for remaining lines.
      for (const line of payments.slice(1)) {
        await this.vendorPaymentService.create({
          supplierId: purchaseOrder.supplierId,
          purchaseOrderId: id,
          amount: line.amount,
          paymentDate: new Date().toISOString().split("T")[0],
          paymentMethodId: line.paymentMethodId,
          status: "completed",
          notes: line.reference || undefined,
        });
      }

      purchaseOrder.paidAmount = totalNewPayment;
      await this.purchaseOrderRepository.save(purchaseOrder);
      this.logger.log(
        `Restored vendor payment ${restoredPayment.paymentNumber} for PO ${purchaseOrder.orderNumber}`,
      );
      return this.findOne(id);
    }

    // No previous payment - create a vendor payment for each line.
    for (const line of payments) {
      await this.vendorPaymentService.create({
        supplierId: purchaseOrder.supplierId,
        purchaseOrderId: id,
        amount: line.amount,
        paymentDate: new Date().toISOString().split("T")[0],
        paymentMethodId: line.paymentMethodId,
        status: "completed",
        notes: line.reference || undefined,
      });
    }

    // Update paidAmount on the order (use Number() to avoid string concatenation with decimal columns)
    const newPaidAmount =
      Number(purchaseOrder.paidAmount || 0) + totalNewPayment;
    purchaseOrder.paidAmount = newPaidAmount;
    await this.purchaseOrderRepository.save(purchaseOrder);

    this.logger.log(
      `Purchase order ${purchaseOrder.orderNumber} paid amount updated to ${newPaidAmount}`,
    );

    return this.findOne(id);
  }

  /**
   * Mark purchase order as paid by creating a vendor payment
   */
  async markAsPaid(
    id: string,
  ): Promise<{ order: PurchaseOrderResponseDto; payment: VendorPayment }> {
    this.logger.log(`Marking purchase order as paid: ${id}`);

    const purchaseOrder = await this.purchaseOrderRepository.findOne({
      where: { id },
      relations: { supplier: true },
    });

    if (!purchaseOrder) {
      throw new NotFoundException("Purchase order not found");
    }

    // Check if payment already exists
    const existingPayment =
      await this.vendorPaymentService.findByPurchaseOrder(id);
    if (existingPayment) {
      throw new BadRequestException("Purchase order is already paid");
    }

    // Create vendor payment
    const payment = await this.vendorPaymentService.createForPurchaseOrder(id);

    // Get updated order with payment status
    const updatedOrder = await this.findOne(id);

    this.logger.log(
      `Purchase order ${purchaseOrder.orderNumber} marked as paid with payment ${payment.paymentNumber}`,
    );
    return { order: updatedOrder, payment };
  }

  /**
   * Mark purchase order as unpaid by soft-deleting the vendor payment
   */
  async markAsUnpaid(id: string): Promise<PurchaseOrderResponseDto> {
    this.logger.log(`Marking purchase order as unpaid: ${id}`);

    const purchaseOrder = await this.purchaseOrderRepository.findOne({
      where: { id },
    });

    if (!purchaseOrder) {
      throw new NotFoundException("Purchase order not found");
    }

    // Check if PO has received goods - must return before unpaying
    const grn = await this.grnRepository.findOne({
      where: { purchaseOrderId: id },
    });

    if (grn && grn.status === GrnStatus.RECEIVED) {
      throw new BadRequestException(
        "Cannot unpay purchase order with received goods. Please return goods first.",
      );
    }

    // Find all existing payments
    const existingPayments =
      await this.vendorPaymentService.findAllByPurchaseOrder(id);
    if (!existingPayments || existingPayments.length === 0) {
      throw new NotFoundException("No payment found for this purchase order");
    }

    // Reverse accounting entries and soft-delete each vendor payment
    for (const payment of existingPayments) {
      try {
        await this.accountingService.reverseSourceEntries(
          "vendor_payment",
          payment.id,
          "system",
        );
      } catch (error) {
        this.logger.error(
          `Failed to reverse accounting for vendor payment ${payment.id}: ${error.message}`,
        );
      }
      await this.vendorPaymentService.softDeleteForUnpay(payment.id);
    }

    // Reset paidAmount to 0
    purchaseOrder.paidAmount = 0;
    await this.purchaseOrderRepository.save(purchaseOrder);

    // Get updated order
    const updatedOrder = await this.findOne(id);

    this.logger.log(
      `Purchase order ${purchaseOrder.orderNumber} marked as unpaid - payment deleted`,
    );
    return updatedOrder;
  }

  /**
   * Get payment status of a purchase order
   */
  async getPaymentStatus(
    id: string,
  ): Promise<{ isPaid: boolean; payment?: any }> {
    this.logger.log(`Checking payment status for purchase order: ${id}`);

    const purchaseOrder = await this.purchaseOrderRepository.findOne({
      where: { id },
    });

    if (!purchaseOrder) {
      throw new NotFoundException("Purchase order not found");
    }

    const payment = await this.vendorPaymentService.findByPurchaseOrder(id);

    return {
      isPaid: !!payment,
      payment: payment
        ? {
            id: payment.id,
            paymentNumber: payment.paymentNumber,
            amount: Number(payment.amount),
            paymentDate: payment.paymentDate,
            paymentMethodId: payment.paymentMethodId,
            status: payment.status,
          }
        : undefined,
    };
  }

  /**
   * Map purchase order entity to response DTO
   */
  private mapToResponseDto(
    purchaseOrder: PurchaseOrder,
  ): PurchaseOrderResponseDto {
    return {
      id: purchaseOrder.id,
      orderNumber: purchaseOrder.orderNumber,
      supplier: purchaseOrder.supplier
        ? {
            id: purchaseOrder.supplier.id,
            supplierCode: purchaseOrder.supplier.id.slice(0, 8).toUpperCase(),
            companyName: purchaseOrder.supplier.companyName,
            contactPerson: purchaseOrder.supplier.contactPerson,
            phone: purchaseOrder.supplier.phone,
            address: purchaseOrder.supplier.billingStreetAddress,
            city: purchaseOrder.supplier.billingCity,
            state: purchaseOrder.supplier.billingState,
            postalCode: purchaseOrder.supplier.billingPostalCode,
            country: purchaseOrder.supplier.billingCountry,
          }
        : undefined,
      orderDate: purchaseOrder.orderDate,
      subtotal: Number(purchaseOrder.subtotal),
      discountPercent: Number(purchaseOrder.discountPercent),
      discountAmount: Number(purchaseOrder.discountAmount),
      shippingAmount: Number(purchaseOrder.shippingAmount),
      totalAmount: Number(purchaseOrder.totalAmount),
      paidAmount: Number(purchaseOrder.paidAmount || 0),
      notes: purchaseOrder.notes,
      isFullyReceived: purchaseOrder.isFullyReceived(),
      totalReceivedQuantity: purchaseOrder.getTotalReceivedQuantity(),
      totalOrderedQuantity: purchaseOrder.getTotalOrderedQuantity(),
      items:
        purchaseOrder.items?.map((item) => ({
          id: item.id,
          product: item.product
            ? {
                id: item.product.id,
                sku:
                  item.product.barcode ||
                  item.product.id.substring(0, 8).toUpperCase(),
                name: item.product.name,
              }
            : undefined,
          description: item.product?.name || "Unknown Product",
          quantity: Number(item.quantity),
          unitPrice: Number(item.unitCost),
          discountPercent: Number(item.discountPercent),
          discountAmount: Number(item.discountAmount),
          taxPercent: 0,
          taxAmount: 0,
          totalAmount: Number(item.totalAmount),
          receivedQuantity: Number(item.receivedQuantity),
          rejectedQuantity: 0,
          isFullyReceived: item.isFullyReceived,
          status: item.status,
        })) || [],
      goodsReceivedNotes:
        purchaseOrder.goodsReceivedNotes?.map((grn) => ({
          id: grn.id,
          grnNumber: grn.grnNumber,
          status: grn.status,
          receiptDate: grn.receivedDate,
        })) || [],
      vendorPayments:
        purchaseOrder.vendorPayments?.map((payment) => ({
          id: payment.id,
          paymentNumber: payment.paymentNumber,
          amount: Number(payment.amount),
          paymentDate: payment.paymentDate,
          paymentMethodId: payment.paymentMethodId,
          status: payment.status,
        })) || [],
      createdAt: purchaseOrder.createdAt,
      updatedAt: purchaseOrder.updatedAt,
      deletedAt: purchaseOrder.deletedAt,
    };
  }

  /**
   * Update base costs for all products in a GRN
   * Calculates shipping allocation BY VALUE and records cost history
   */
  private async updateBaseCostsForGrn(
    grn: GoodsReceivedNote,
    purchaseOrder: PurchaseOrder,
  ): Promise<void> {
    this.logger.log(`Updating base costs for GRN ${grn.grnNumber}`);

    const po = purchaseOrder;
    const poSubtotal = Number(po.subtotal || 0);
    const poShipping = Number(po.shippingAmount || 0);

    this.logger.log(
      `PO ${po.orderNumber}: Subtotal RM ${poSubtotal.toFixed(2)}, Shipping RM ${poShipping.toFixed(2)}`,
    );

    // Process each GRN item
    for (const grnItem of grn.items) {
      // Find corresponding PO item to get unit cost
      const poItem = po.items?.find(
        (item) => item.id === grnItem.purchaseOrderItemId,
      );

      if (!poItem) {
        this.logger.warn(
          `PO item not found for GRN item ${grnItem.id}, skipping base cost update`,
        );
        continue;
      }

      const unitCost = Number(poItem.unitCost);
      const receivedQty = Number(grnItem.receivedQuantity);

      // Calculate shipping per unit using BY VALUE method
      const shippingPerUnit = this.baseCostCalculator.calculateShippingByValue(
        unitCost,
        receivedQty,
        poSubtotal,
        poShipping,
      );

      this.logger.log(
        `Product ${grnItem.productId}: ${receivedQty} units @ RM ${unitCost.toFixed(4)} + RM ${shippingPerUnit.toFixed(4)} shipping`,
      );

      // Add stock to cost history and recalculate base cost
      await this.baseCostCalculator.addStock(
        grnItem.productId,
        grn.id,
        receivedQty,
        unitCost,
        shippingPerUnit,
        grn.receivedDate,
      );
    }

    this.logger.log(`Base costs updated successfully for GRN ${grn.grnNumber}`);
  }

  /**
   * Reverse base costs when returning goods
   * Removes the stock batches added during GRN receipt
   */
  private async reverseBaseCostsForGrn(grn: GoodsReceivedNote): Promise<void> {
    this.logger.log(`Reversing base costs for GRN ${grn.grnNumber}`);

    // Process each GRN item
    for (const grnItem of grn.items) {
      const receivedQty = Number(grnItem.receivedQuantity);

      if (receivedQty === 0) {
        this.logger.debug(
          `GRN item ${grnItem.id} has no received quantity, skipping`,
        );
        continue;
      }

      this.logger.log(
        `Removing ${receivedQty} units from cost history for product ${grnItem.productId}`,
      );

      // Remove stock from cost history and recalculate base cost
      await this.baseCostCalculator.removeStock(grnItem.productId, grn.id);
    }

    this.logger.log(
      `Base costs reversed successfully for GRN ${grn.grnNumber}`,
    );
  }
}
