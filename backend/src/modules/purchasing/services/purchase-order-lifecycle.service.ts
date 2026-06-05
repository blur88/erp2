import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";

import {
  GoodsReceivedNote,
  PurchaseOrder,
  VendorPayment,
} from "../../../database/entities";
import { GrnStatus } from "../../../database/entities/goods-received-note.entity";
import { StockMovement } from "../../../database/entities/stock-movement.entity";
import { AuditLogService } from "../../audit-logs/services";

@Injectable()
export class PurchaseOrderLifecycleService {
  private readonly logger = new Logger(PurchaseOrderLifecycleService.name);

  constructor(
    @InjectRepository(PurchaseOrder)
    private readonly purchaseOrderRepository: Repository<PurchaseOrder>,
    @InjectRepository(GoodsReceivedNote)
    private readonly grnRepository: Repository<GoodsReceivedNote>,
    @InjectRepository(VendorPayment)
    private readonly vendorPaymentRepository: Repository<VendorPayment>,
    private readonly auditLogService: AuditLogService,
  ) {}

  async assertItemsNotLocked(purchaseOrderId: string): Promise<void> {
    const purchaseOrder = await this.purchaseOrderRepository.findOne({
      where: { id: purchaseOrderId },
    });

    if (!purchaseOrder) {
      throw new NotFoundException("Purchase order not found");
    }

    if (Number(purchaseOrder.paidAmount || 0) > 0) {
      throw new BadRequestException(
        "Cannot edit purchase order items that have been paid. Please unpay first.",
      );
    }

    const grn = await this.grnRepository.findOne({
      where: { purchaseOrderId },
    });

    if (grn?.status === GrnStatus.RECEIVED) {
      throw new BadRequestException(
        "Cannot edit purchase order items with received goods. Please return goods first.",
      );
    }
  }

  async softDelete(
    purchaseOrderId: string,
    userId?: string,
    username?: string,
  ): Promise<void> {
    const purchaseOrder = await this.purchaseOrderRepository.findOne({
      where: { id: purchaseOrderId },
    });

    if (!purchaseOrder) {
      throw new NotFoundException("Purchase order not found");
    }

    if (Number(purchaseOrder.paidAmount || 0) > 0) {
      throw new BadRequestException(
        "Cannot delete purchase order that has been paid. Please unpay first.",
      );
    }

    const grn = await this.grnRepository.findOne({
      where: { purchaseOrderId },
    });

    if (grn?.status === GrnStatus.RECEIVED) {
      throw new BadRequestException(
        "Cannot delete purchase order with received goods. Please return goods first.",
      );
    }

    const deletedAt = new Date();

    if (grn) {
      await this.grnRepository
        .createQueryBuilder()
        .update()
        .set({ deletedAt })
        .where("id = :id", { id: grn.id })
        .execute();

      await this.auditLogService.log(
        "DELETE",
        "GoodsReceivedNote",
        `Deleted GRN: ${grn.grnNumber} (auto-deleted with PO)`,
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
    }

    const vendorPayments = await this.vendorPaymentRepository.find({
      where: { purchaseOrderId },
    });

    for (const vendorPayment of vendorPayments) {
      await this.vendorPaymentRepository
        .createQueryBuilder()
        .update()
        .set({ deletedAt })
        .where("id = :id", { id: vendorPayment.id })
        .execute();

      await this.auditLogService.log(
        "DELETE",
        "VendorPayment",
        `Deleted vendor payment: ${vendorPayment.paymentNumber} (auto-deleted with PO)`,
        {
          entityId: vendorPayment.id,
          userId: userId || "system",
          username,
          oldValues: {
            paymentNumber: vendorPayment.paymentNumber,
            amount: vendorPayment.amount,
          },
        },
      );
    }

    await this.purchaseOrderRepository
      .createQueryBuilder()
      .update()
      .set({ deletedAt })
      .where("id = :id", { id: purchaseOrderId })
      .execute();

    await this.auditLogService.log(
      "DELETE",
      "PurchaseOrder",
      `Deleted purchase order: ${purchaseOrder.orderNumber}`,
      {
        entityId: purchaseOrderId,
        userId: userId || "system",
        username,
        oldValues: {
          orderNumber: purchaseOrder.orderNumber,
          totalAmount: purchaseOrder.totalAmount,
        },
      },
    );

    this.logger.log(
      `Purchase order ${purchaseOrder.orderNumber} soft deleted with timestamp ${deletedAt.toISOString()}`,
    );
  }

  async assertPermanentDeleteAllowed(purchaseOrderId: string): Promise<void> {
    const stockMovementRepository =
      this.purchaseOrderRepository.manager.getRepository(StockMovement);
    const stockMovementCount = await stockMovementRepository.count({
      where: { referenceType: "purchase_order", referenceId: purchaseOrderId },
    });

    if (stockMovementCount > 0) {
      throw new BadRequestException(
        "Cannot permanently delete purchase order with existing stock movements.",
      );
    }

    const purchaseOrder = await this.purchaseOrderRepository.findOne({
      where: { id: purchaseOrderId },
      withDeleted: true,
    });

    if (!purchaseOrder) {
      throw new NotFoundException("Purchase order not found");
    }

    if (Number(purchaseOrder.paidAmount || 0) > 0) {
      throw new BadRequestException(
        "Cannot permanently delete purchase order that has payments recorded. Please unpay first.",
      );
    }
  }
}
