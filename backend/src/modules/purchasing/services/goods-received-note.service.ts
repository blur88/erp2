import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, Like } from "typeorm";
import { BaseCrudService } from "../../../common/services/base-crud.service";
import {
  GoodsReceivedNote,
  GoodsReceivedNoteItem,
  PurchaseOrder,
  Supplier,
  Product,
} from "../../../database/entities";
import {
  CreateGoodsReceivedNoteDto,
  UpdateGoodsReceivedNoteDto,
  GoodsReceivedNoteQueryDto,
  GoodsReceivedNoteResponseDto,
  GoodsReceivedNoteListResponseDto,
} from "../dto/goods-received-note.dto";
import { BaseCostCalculatorService } from "../../inventory/services/base-cost-calculator.service";
import { StockMovementService } from "../../inventory/services/stock-movement.service";
import { CreateStockMovementDto } from "../../inventory/dto/stock.dto";
import { StockMovementType } from "../../../database/entities/stock-movement.entity";
import { SettingsService } from "../../settings/settings.service";
import { AuditLogService } from "../../audit-logs/services";
import { AccountingService } from "@modules/accounting/services/accounting.service";

@Injectable()
export class GoodsReceivedNoteService extends BaseCrudService<
  GoodsReceivedNote,
  CreateGoodsReceivedNoteDto,
  UpdateGoodsReceivedNoteDto,
  GoodsReceivedNoteQueryDto
> {
  private readonly logger = new Logger(GoodsReceivedNoteService.name);

  constructor(
    @InjectRepository(GoodsReceivedNote)
    private readonly grnRepository: Repository<GoodsReceivedNote>,
    @InjectRepository(GoodsReceivedNoteItem)
    private readonly grnItemRepository: Repository<GoodsReceivedNoteItem>,
    @InjectRepository(PurchaseOrder)
    private readonly purchaseOrderRepository: Repository<PurchaseOrder>,
    @InjectRepository(Supplier)
    private readonly supplierRepository: Repository<Supplier>,
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,
    private readonly baseCostCalculator: BaseCostCalculatorService,
    private readonly stockMovementService: StockMovementService,
    private readonly settingsService: SettingsService,
    auditLogService: AuditLogService,
    private readonly accountingService: AccountingService,
  ) {
    super(grnRepository, auditLogService);
  }

  getEntityType(): string {
    return "GoodsReceivedNote";
  }

  buildWhereClause(query: GoodsReceivedNoteQueryDto) {
    const where: Record<string, unknown> = {};
    if (query.status) where.status = query.status;
    if (query.supplierId) where.supplierId = query.supplierId;
    if (query.purchaseOrderId) where.purchaseOrderId = query.purchaseOrderId;
    return where as any;
  }

  /**
   * Create a new goods received note
   */
  async create(
    createDto: CreateGoodsReceivedNoteDto,
    userId?: string,
    username?: string,
  ): Promise<GoodsReceivedNoteResponseDto> {
    this.logger.log(`Creating GRN for PO: ${createDto.purchaseOrderId}`);

    // Validate purchase order exists
    const purchaseOrder = await this.purchaseOrderRepository.findOne({
      where: { id: createDto.purchaseOrderId },
      relations: { supplier: true, items: { product: true } },
    });

    if (!purchaseOrder) {
      throw new NotFoundException(
        `Purchase Order with ID ${createDto.purchaseOrderId} not found`,
      );
    }

    // Check if a GRN already exists for this purchase order
    const existingGrn = await this.grnRepository.findOne({
      where: { purchaseOrderId: createDto.purchaseOrderId },
    });

    if (existingGrn) {
      throw new BadRequestException(
        `A Goods Received Note already exists for this purchase order (GRN: ${existingGrn.grnNumber})`,
      );
    }

    try {
      const grnNumber =
        await this.settingsService.generateDocumentNumber("Goods Received");

      // Create GRN entity first (without items)
      const grn = this.grnRepository.create({
        grnNumber,
        purchaseOrderId: purchaseOrder.id,
        supplierId: purchaseOrder.supplier.id,
        receivedDate: new Date(createDto.receivedDate),
      });

      const savedGrn = await this.grnRepository.save(grn);

      // Create GRN items from PO items
      const grnItems: GoodsReceivedNoteItem[] = [];
      let lineNumber = 1;

      for (const poItem of purchaseOrder.items || []) {
        const grnItem = this.grnItemRepository.create({
          grnId: savedGrn.id,
          lineNumber: lineNumber++,
          productId: poItem.product.id,
          orderedQuantity: Number(poItem.quantity),
          receivedQuantity: Number(poItem.quantity), // Default to ordered quantity
          purchaseOrderItemId: poItem.id,
        });

        grnItems.push(grnItem);
      }

      // Save all GRN items
      if (grnItems.length > 0) {
        await this.grnItemRepository.save(grnItems);
      }

      // Create stock movements and update product quantities for each GRN item
      for (const grnItem of grnItems) {
        const poItem = purchaseOrder.items?.find(
          (item) => item.id === grnItem.purchaseOrderItemId,
        );
        if (!poItem) {
          this.logger.warn(
            `PO item not found for GRN item ${grnItem.id}, skipping stock movement`,
          );
          continue;
        }

        // Create stock movement for purchase receipt
        const createMovementDto: CreateStockMovementDto = {
          productId: grnItem.productId,
          movementType: StockMovementType.PURCHASE_RECEIPT,
          quantity: Number(grnItem.receivedQuantity),
          reason: `Purchase order received: ${purchaseOrder.orderNumber}`,
          referenceType: "purchase_order",
          referenceId: purchaseOrder.id,
          unitValue: Number(poItem.unitCost),
        };

        await this.stockMovementService.create(createMovementDto);
        this.logger.log(
          `Stock movement created for product ${grnItem.productId}: +${grnItem.receivedQuantity} units from PO ${purchaseOrder.orderNumber}`,
        );
      }

      // Update GRN totals
      savedGrn.items = grnItems;
      savedGrn.calculateTotals();
      await this.grnRepository.save(savedGrn);

      // Update base cost for each received item
      await this.updateBaseCostsForGrn(savedGrn, purchaseOrder);

      this.logger.log(
        `GRN created successfully with ${grnItems.length} items: ${savedGrn.id}`,
      );

      // Log audit trail for create
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

      // Auto-post to accounting (don't fail GRN on error)
      try {
        const fullGrn = await this.grnRepository.findOne({
          where: { id: savedGrn.id },
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
          `Failed to post accounting entry for GRN ${savedGrn.id}: ${errorMessage}`,
          errorStack,
        );
        // Continue - don't fail the GRN creation
      }

      return this.findOne(savedGrn.id);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      const errorStack = error instanceof Error ? error.stack : undefined;
      this.logger.error(`Error creating GRN: ${errorMessage}`, errorStack);
      throw new BadRequestException("Failed to create goods received note");
    }
  }

  /**
   * Get all GRNs with filtering (no pagination)
   */
  async findAll(
    query: GoodsReceivedNoteQueryDto,
  ): Promise<GoodsReceivedNoteListResponseDto> {
    this.logger.log(`Finding GRNs with query: ${JSON.stringify(query)}`);

    const {
      search,
      status,
      supplierId,
      purchaseOrderId,
      receivedDateFrom,
      receivedDateTo,
      sortBy = "grnNumber",
      sortOrder = "ASC",
    } = query;

    const queryBuilder = this.grnRepository
      .createQueryBuilder("grn")
      .leftJoinAndSelect("grn.supplier", "supplier")
      .leftJoinAndSelect("grn.purchaseOrder", "purchaseOrder")
      .leftJoinAndSelect("purchaseOrder.vendorPayments", "vendorPayments")
      .leftJoinAndSelect("grn.items", "items")
      .leftJoinAndSelect("items.product", "product")
      .where("grn.deletedAt IS NULL");

    // Apply search filter
    if (search) {
      queryBuilder.andWhere(
        "(grn.grnNumber ILIKE :search OR supplier.companyName ILIKE :search OR purchaseOrder.orderNumber ILIKE :search)",
        { search: `%${search}%` },
      );
    }

    // Apply filters
    if (status) {
      queryBuilder.andWhere("grn.status = :status", { status });
    }

    if (supplierId) {
      queryBuilder.andWhere("grn.supplierId = :supplierId", { supplierId });
    }

    if (purchaseOrderId) {
      queryBuilder.andWhere("grn.purchaseOrderId = :purchaseOrderId", {
        purchaseOrderId,
      });
    }

    if (receivedDateFrom) {
      queryBuilder.andWhere("grn.receivedDate >= :receivedDateFrom", {
        receivedDateFrom,
      });
    }

    if (receivedDateTo) {
      queryBuilder.andWhere("grn.receivedDate <= :receivedDateTo", {
        receivedDateTo,
      });
    }

    // Apply sorting
    const validSortFields = [
      "grnNumber",
      "receivedDate",
      "status",
      "totalQuantityReceived",
    ];
    if (validSortFields.includes(sortBy)) {
      queryBuilder.orderBy(`grn.${sortBy}`, sortOrder);
    } else {
      queryBuilder.orderBy("grn.grnNumber", "ASC");
    }

    const grns = await queryBuilder.getMany();
    const total = grns.length;

    const grnDtos = grns.map((grn) => this.mapToResponseDto(grn));

    return {
      grns: grnDtos,
      total,
      page: 1,
      limit: total,
      totalPages: 1,
      hasNext: false,
      hasPrev: false,
    };
  }

  /**
   * Get GRN by ID
   */
  async findOne(id: string): Promise<GoodsReceivedNoteResponseDto> {
    this.logger.log(`Finding GRN by ID: ${id}`);

    const grn = await this.grnRepository.findOne({
      where: { id },
      relations: {
        supplier: true,
        purchaseOrder: { vendorPayments: true },
        items: { product: true },
      },
    });

    if (!grn) {
      throw new NotFoundException(
        `Goods Received Note with ID ${id} not found`,
      );
    }

    return this.mapToResponseDto(grn);
  }

  /**
   * Update GRN
   */
  async update(
    id: string,
    updateDto: UpdateGoodsReceivedNoteDto,
    userId?: string,
    username?: string,
  ): Promise<GoodsReceivedNoteResponseDto> {
    this.logger.log(`Updating GRN: ${id}`);

    const grn = await this.grnRepository.findOne({ where: { id } });

    if (!grn) {
      throw new NotFoundException(
        `Goods Received Note with ID ${id} not found`,
      );
    }

    try {
      Object.assign(grn, {
        ...(updateDto.receivedDate && {
          receivedDate: new Date(updateDto.receivedDate),
        }),
        ...(updateDto.status && { status: updateDto.status }),
      });

      const updatedGrn = await this.grnRepository.save(grn);

      // Log audit trail for update
      await this.auditLogService.log(
        "UPDATE",
        "GoodsReceivedNote",
        `Updated GRN: ${updatedGrn.grnNumber}`,
        {
          entityId: id,
          userId: userId || "system",
          username,
          newValues: {
            grnNumber: updatedGrn.grnNumber,
            status: updatedGrn.status,
          },
        },
      );

      this.logger.log(`GRN updated successfully: ${updatedGrn.id}`);
      return this.findOne(updatedGrn.id);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      const errorStack = error instanceof Error ? error.stack : undefined;
      this.logger.error(`Error updating GRN: ${errorMessage}`, errorStack);
      throw new BadRequestException("Failed to update goods received note");
    }
  }

  /**
   * Soft delete GRN and sync deletedAt with associated PO using same timestamp
   */
  async softDelete(
    id: string,
    userId?: string,
    username?: string,
  ): Promise<void> {
    this.logger.log(`Soft deleting GRN: ${id}`);

    const grn = await this.grnRepository.findOne({
      where: { id },
      relations: { purchaseOrder: true },
    });

    if (!grn) {
      throw new NotFoundException(
        `Goods Received Note with ID ${id} not found`,
      );
    }

    try {
      // Use the same deletedAt timestamp for both GRN and PO
      const deletedAt = new Date();

      // Soft delete the GRN with timestamp
      await this.grnRepository
        .createQueryBuilder()
        .update()
        .set({ deletedAt })
        .where("id = :id", { id })
        .execute();

      // Sync deletedAt with associated PO if it exists (same timestamp)
      if (grn.purchaseOrderId) {
        await this.purchaseOrderRepository
          .createQueryBuilder()
          .update()
          .set({ deletedAt })
          .where("id = :id", { id: grn.purchaseOrderId })
          .execute();
        this.logger.log(
          `Associated PO ${grn.purchaseOrder?.orderNumber || grn.purchaseOrderId} soft deleted with timestamp ${deletedAt.toISOString()}`,
        );
      }

      // Log audit trail for soft delete
      await this.auditLogService.log(
        "DELETE",
        "GoodsReceivedNote",
        `Deleted GRN: ${grn.grnNumber}`,
        {
          entityId: id,
          userId: userId || "system",
          username,
          oldValues: {
            grnNumber: grn.grnNumber,
            purchaseOrderId: grn.purchaseOrderId,
            status: grn.status,
          },
        },
      );

      this.logger.log(
        `GRN soft deleted successfully with timestamp ${deletedAt.toISOString()}`,
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      const errorStack = error instanceof Error ? error.stack : undefined;
      this.logger.error(`Error soft deleting GRN: ${errorMessage}`, errorStack);
      throw new BadRequestException(
        "Failed to soft delete goods received note",
      );
    }
  }

  /**
   * Get all soft-deleted GRNs (no pagination)
   */
  async findDeleted(
    query: GoodsReceivedNoteQueryDto,
  ): Promise<GoodsReceivedNoteListResponseDto> {
    this.logger.log("Finding deleted GRNs");

    const { search, sortBy = "receivedDate", sortOrder = "DESC" } = query;

    const queryBuilder = this.grnRepository
      .createQueryBuilder("grn")
      .leftJoinAndSelect("grn.supplier", "supplier")
      .leftJoinAndSelect("grn.purchaseOrder", "purchaseOrder")
      .withDeleted()
      .where("grn.deletedAt IS NOT NULL");

    // Apply filters
    if (search) {
      queryBuilder.andWhere(
        "(grn.grnNumber ILIKE :search OR supplier.companyName ILIKE :search)",
        { search: `%${search}%` },
      );
    }

    // Apply sorting
    const validSortFields = ["grnNumber", "receivedDate", "deletedAt"];
    const sortField = validSortFields.includes(sortBy)
      ? sortBy
      : "receivedDate";
    queryBuilder.orderBy(`grn.${sortField}`, sortOrder as "ASC" | "DESC");

    const grns = await queryBuilder.getMany();
    const total = grns.length;

    return {
      grns: grns.map((grn) => this.mapToResponseDto(grn)),
      total,
      page: 1,
      limit: total,
      totalPages: 1,
      hasNext: false,
      hasPrev: false,
    };
  }

  /**
   * Restore a soft-deleted GRN and sync deletedAt with associated PO (sets to null)
   */
  async restore(
    id: string,
    userId?: string,
    username?: string,
  ): Promise<GoodsReceivedNoteResponseDto> {
    this.logger.log(`Restoring GRN: ${id}`);

    const grn = await this.grnRepository.findOne({
      where: { id },
      withDeleted: true,
      relations: { purchaseOrder: true },
    });

    if (!grn) {
      throw new NotFoundException(
        `Goods Received Note with ID ${id} not found`,
      );
    }

    if (!grn.deletedAt) {
      throw new BadRequestException("Goods Received Note is not deleted");
    }

    try {
      // Restore the GRN (set deletedAt to null)
      await this.grnRepository
        .createQueryBuilder()
        .update()
        .set({ deletedAt: null })
        .where("id = :id", { id })
        .execute();

      // Sync restore with associated PO if it exists (set deletedAt to null)
      if (grn.purchaseOrderId) {
        await this.purchaseOrderRepository
          .createQueryBuilder()
          .update()
          .set({ deletedAt: null })
          .where("id = :id", { id: grn.purchaseOrderId })
          .execute();
        this.logger.log(
          `Associated PO ${grn.purchaseOrder?.orderNumber || grn.purchaseOrderId} restored (deletedAt set to null)`,
        );
      }

      const restoredGrn = await this.grnRepository.findOne({
        where: { id },
        relations: { supplier: true, purchaseOrder: true },
      });

      if (!restoredGrn) {
        throw new NotFoundException(
          `Goods Received Note with ID ${id} not found after restore`,
        );
      }

      // Log audit trail for restore
      await this.auditLogService.log(
        "RESTORE",
        "GoodsReceivedNote",
        `Restored GRN: ${restoredGrn.grnNumber}`,
        {
          entityId: id,
          userId: userId || "system",
          username,
          newValues: {
            grnNumber: restoredGrn.grnNumber,
            purchaseOrderId: restoredGrn.purchaseOrderId,
            status: restoredGrn.status,
          },
        },
      );

      this.logger.log(`GRN restored successfully (deletedAt set to null)`);
      return this.mapToResponseDto(restoredGrn);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      const errorStack = error instanceof Error ? error.stack : undefined;
      this.logger.error(`Error restoring GRN: ${errorMessage}`, errorStack);
      throw new BadRequestException("Failed to restore goods received note");
    }
  }

  /**
   * Bulk restore GRNs
   */
  async bulkRestore(
    grnIds: string[],
    userId?: string,
    username?: string,
  ): Promise<{ restoredCount: number; failedIds: string[] }> {
    this.logger.log(`Bulk restoring ${grnIds.length} GRNs`);

    const failedIds: string[] = [];
    let restoredCount = 0;

    for (const id of grnIds) {
      try {
        await this.restore(id, userId, username);
        restoredCount++;
      } catch (error) {
        this.logger.error(`Failed to restore GRN ${id}:`, error);
        failedIds.push(id);
      }
    }

    this.logger.log(
      `Bulk restore completed: ${restoredCount} restored, ${failedIds.length} failed`,
    );
    return { restoredCount, failedIds };
  }

  /**
   * Permanently delete a GRN
   */
  async permanentDelete(
    id: string,
    userId?: string,
    username?: string,
  ): Promise<void> {
    this.logger.log(`Permanently deleting GRN: ${id}`);

    const grn = await this.grnRepository.findOne({
      where: { id },
      withDeleted: true,
    });

    if (!grn) {
      throw new NotFoundException(
        `Goods Received Note with ID ${id} not found`,
      );
    }

    if (!grn.deletedAt) {
      throw new BadRequestException(
        "GRN must be soft-deleted before permanent deletion",
      );
    }

    // Log audit trail for permanent delete
    await this.auditLogService.log(
      "PERMANENT_DELETE",
      "GoodsReceivedNote",
      `Permanently deleted GRN: ${grn.grnNumber}`,
      {
        entityId: id,
        userId: userId || "system",
        username,
        oldValues: {
          grnNumber: grn.grnNumber,
          purchaseOrderId: grn.purchaseOrderId,
          status: grn.status,
        },
      },
    );

    try {
      await this.grnRepository.remove(grn);
      this.logger.log(`GRN permanently deleted: ${id}`);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      const errorStack = error instanceof Error ? error.stack : undefined;
      this.logger.error(
        `Error permanently deleting GRN: ${errorMessage}`,
        errorStack,
      );
      throw new BadRequestException(
        "Failed to permanently delete goods received note",
      );
    }
  }

  /**
   * Bulk permanent delete GRNs
   */
  async bulkPermanentDelete(
    grnIds: string[],
    userId?: string,
    username?: string,
  ): Promise<{ deletedCount: number; failedIds: string[] }> {
    this.logger.log(`Bulk permanently deleting ${grnIds.length} GRNs`);

    const failedIds: string[] = [];
    let deletedCount = 0;

    for (const id of grnIds) {
      try {
        await this.permanentDelete(id, userId, username);
        deletedCount++;
      } catch (error) {
        this.logger.error(`Failed to permanently delete GRN ${id}:`, error);
        failedIds.push(id);
      }
    }

    this.logger.log(
      `Bulk permanent delete completed: ${deletedCount} deleted, ${failedIds.length} failed`,
    );
    return { deletedCount, failedIds };
  }

  /**
   * Remove all GRN items for a given GRN (helper for sync operations)
   */
  async removeGrnItems(grnId: string): Promise<void> {
    this.logger.log(`Removing GRN items for GRN: ${grnId}`);
    await this.grnItemRepository.delete({ grnId });
  }

  /**
   * Update GRN items (helper for sync operations)
   */
  async updateGrnItems(grnId: string, items: any[]): Promise<void> {
    this.logger.log(`Updating ${items.length} GRN items for GRN: ${grnId}`);

    const grnItems: GoodsReceivedNoteItem[] = [];

    for (const itemData of items) {
      const grnItem = this.grnItemRepository.create(
        itemData,
      ) as unknown as GoodsReceivedNoteItem;
      grnItems.push(grnItem);
    }

    await this.grnItemRepository.save(grnItems);
  }

  /**
   * Map GRN entity to response DTO
   */
  private mapToResponseDto(
    grn: GoodsReceivedNote,
  ): GoodsReceivedNoteResponseDto {
    return {
      id: grn.id,
      grnNumber: grn.grnNumber,
      status: grn.status,
      purchaseOrder: grn.purchaseOrder
        ? {
            id: grn.purchaseOrder.id,
            orderNumber: grn.purchaseOrder.orderNumber,
            totalAmount: Number(grn.purchaseOrder.totalAmount),
            vendorPayments:
              grn.purchaseOrder.vendorPayments?.map((payment) => ({
                id: payment.id,
                paymentNumber: payment.paymentNumber,
                amount: Number(payment.amount),
                paymentDate: payment.paymentDate,
                paymentMethodId: payment.paymentMethodId,
                status: payment.status,
              })) || [],
          }
        : undefined,
      supplier: {
        id: grn.supplier.id,
        supplierCode: grn.supplier.id.substring(0, 8).toUpperCase(),
        companyName: grn.supplier.companyName,
        contactPerson: grn.supplier.contactPerson,
        phone: grn.supplier.phone,
        address: grn.supplier.billingStreetAddress,
        city: grn.supplier.billingCity,
        state: grn.supplier.billingState,
        postalCode: grn.supplier.billingPostalCode,
        country: grn.supplier.billingCountry,
      },
      receivedDate: grn.receivedDate,
      totalQuantityReceived: Number(grn.totalQuantityReceived),
      receivedPercentage: grn.receivedPercentage,
      isFullyReceived: grn.isFullyReceived,
      isPartiallyReceived: grn.isPartiallyReceived,
      items: (grn.items || []).map((item) => ({
        id: item.id,
        purchaseOrderItem: {
          id: item.purchaseOrderItemId || "",
          description: item.product?.description || "",
          quantity: Number(item.orderedQuantity),
          product: {
            id: item.productId,
            sku: item.product?.barcode || item.productId,
            name: item.product?.name || "Unknown Product",
          },
        },
        orderedQuantity: Number(item.orderedQuantity),
        receivedQuantity: Number(item.receivedQuantity),
        isFullyReceived:
          Number(item.receivedQuantity) >= Number(item.orderedQuantity),
      })),
      createdAt: grn.createdAt,
      updatedAt: grn.updatedAt,
      deletedAt: grn.deletedAt,
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
}
