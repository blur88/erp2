import { Injectable, NotFoundException, Logger, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, EntityManager, Not } from 'typeorm';
import {
  VendorPayment,
  PurchaseOrder,
  PaymentMethodEntity,
} from '../../../database/entities';
import {
  CreateVendorPaymentDto,
} from '../dto';
import { AuditLogService } from '../../audit-logs/services';
import { repoFor } from '../../../common/db/tx-helpers';
import { formatScale4 } from '@/common/utils/money';
import { VENDOR_PAYMENT_VOIDED } from '../vendor-payment-status';

@Injectable()
export class VendorPaymentService {
  private readonly logger = new Logger(VendorPaymentService.name);

  constructor(
    @InjectRepository(VendorPayment)
    private vendorPaymentRepository: Repository<VendorPayment>,
    @InjectRepository(PurchaseOrder)
    private purchaseOrderRepository: Repository<PurchaseOrder>,
    @InjectRepository(PaymentMethodEntity)
    private paymentMethodRepository: Repository<PaymentMethodEntity>,
    private readonly auditLogService: AuditLogService,
  ) {}

  /**
   * Create a new vendor payment
   */
  async create(
    createDto: CreateVendorPaymentDto,
    userId?: string,
    username?: string,
    manager?: EntityManager,
  ): Promise<VendorPayment> {
    const paymentRepo = repoFor(manager, VendorPayment, this.vendorPaymentRepository);
    const poRepo = repoFor(manager, PurchaseOrder, this.purchaseOrderRepository);

    let paymentMethodId = createDto.paymentMethodId;

    if (!paymentMethodId) {
      const methodRepo = repoFor(manager, PaymentMethodEntity, this.paymentMethodRepository);
      const defaultPaymentMethod = await methodRepo.findOne({
        where: { code: 'BANK', isActive: true },
      });
      paymentMethodId = defaultPaymentMethod?.id || null;
    }

    const vendorPayment = paymentRepo.create({
      ...createDto,
      paymentMethodId,
      amount: formatScale4(createDto.amount),
    });

    const savedPayment = await paymentRepo.save(vendorPayment);

    if (createDto.purchaseOrderId) {
      await poRepo.update(createDto.purchaseOrderId, {});
    }

    await this.auditLogService.log(
      'CREATE',
      'VendorPayment',
      `Created vendor payment ${savedPayment.id}`,
      {
        entityId: savedPayment.id,
        userId: userId || 'system',
        username,
        newValues: {
          amount: savedPayment.amount,
          status: savedPayment.status,
          referenceNumber: savedPayment.referenceNumber ?? null,
        },
      }
    );

    return savedPayment;
  }

  /**
   * Find one vendor payment by ID
   */
  async findOne(id: string): Promise<VendorPayment> {
    const vendorPayment = await this.vendorPaymentRepository.findOne({
      where: { id },
      relations: {
        supplier: true,
        purchaseOrder: { items: { product: true } },
        paymentMethodEntity: true,
      },
    });

    if (!vendorPayment) {
      throw new NotFoundException(`Vendor payment with ID ${id} not found`);
    }

    return vendorPayment;
  }

  /**
   * Void a vendor payment during unpay (#1401) without additional audit
   * logging — the caller owns the audit trail.
   *
   * A column-scoped UPDATE guarded on the live status, never a save of a
   * loaded entity: two concurrent unpays must not both succeed, and a whole-
   * row write cannot express "only if still live". The guard makes the second
   * writer's `affected` zero, which becomes a ConflictException so its
   * transaction rolls back instead of flatly overwriting the first vacuous
   * void (which would also orphan the first void's reversal link).
   */
  async voidForUnpay(
    payment: VendorPayment,
    ctx: { voidedByUserId: string; voidedAt: Date; reversalEntryId: string | null },
    manager?: EntityManager,
  ): Promise<void> {
    const result = await repoFor(manager, VendorPayment, this.vendorPaymentRepository).update(
      { id: payment.id, status: Not(VENDOR_PAYMENT_VOIDED) },
      {
        status: VENDOR_PAYMENT_VOIDED,
        isActive: false,
        voidedAt: ctx.voidedAt,
        voidedByUserId: ctx.voidedByUserId,
        voidReversalEntryId: ctx.reversalEntryId,
      },
    );

    if (result.affected !== 1) {
      throw new ConflictException(
        `Vendor payment ${payment.id} is no longer live and cannot be voided again`,
      );
    }
  }

  /**
   * Find all live vendor payments for a purchase order. Voided rows are
   * history, not outstanding payments, so they are excluded (#1401).
   */
  async findAllByPurchaseOrder(poId: string, manager?: EntityManager): Promise<VendorPayment[]> {
    return repoFor(manager, VendorPayment, this.vendorPaymentRepository).find({
      where: {
        purchaseOrderId: poId,
        status: Not(VENDOR_PAYMENT_VOIDED),
      },
    });
  }

}
