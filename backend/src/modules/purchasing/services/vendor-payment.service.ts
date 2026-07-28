import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, EntityManager } from 'typeorm';
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
      where: { id, isActive: true },
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
   * Soft delete a vendor payment during unpay without additional audit logging.
   */
  async softDeleteForUnpay(id: string, manager?: EntityManager): Promise<void> {
    const paymentRepo = repoFor(manager, VendorPayment, this.vendorPaymentRepository);
    const payment = await paymentRepo.findOne({ where: { id } });
    if (!payment) return;

    payment.isActive = false;
    await paymentRepo.save(payment);
    await paymentRepo.softDelete(id);
  }

  /**
   * Find all vendor payments for a purchase order
   */
  async findAllByPurchaseOrder(poId: string, manager?: EntityManager): Promise<VendorPayment[]> {
    return repoFor(manager, VendorPayment, this.vendorPaymentRepository).find({
      where: {
        purchaseOrderId: poId,
        isActive: true,
      },
    });
  }

}
