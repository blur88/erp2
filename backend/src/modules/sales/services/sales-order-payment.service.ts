import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { SalesOrder, SalesOrderPaymentStatus, SalesOrderStatus } from '../../../database/entities/sales-order.entity';
import { SalesOrderPayment } from '../../../database/entities/sales-order-payment.entity';
import { PaymentMethodEntity } from '../../../database/entities/payment-method.entity';
import { AuditLogService } from '../../audit-logs/services';
import { RecordPaymentDto } from '../dto/sales-order.dto';
import { lockRowForUpdate } from '../../../common/db/tx-helpers';
import { ACCOUNTING_POSTING_PORT } from '../../../common/accounting-posting/accounting-posting.port';
import type { AccountingPostingPort } from '../../../common/accounting-posting/accounting-posting.port';
import { formatScale4 } from '../../accounting/utils/money';

const AMOUNT_TOLERANCE = 0.001;

@Injectable()
export class SalesOrderPaymentService {
  constructor(
    @InjectRepository(SalesOrder)
    private readonly salesOrderRepository: Repository<SalesOrder>,
    @InjectRepository(SalesOrderPayment)
    private readonly salesOrderPaymentRepository: Repository<SalesOrderPayment>,
    @InjectRepository(PaymentMethodEntity)
    private readonly paymentMethodRepository: Repository<PaymentMethodEntity>,
    private readonly auditLogService: AuditLogService,
    @Inject(ACCOUNTING_POSTING_PORT)
    private readonly accounting: AccountingPostingPort,
    private readonly dataSource: DataSource,
  ) {}

  computePaymentStatus(
    records: SalesOrderPayment[],
    totalAmount: number,
  ): SalesOrderPaymentStatus {
    const netPaid = records.reduce((sum, r) => sum + Number(r.amount), 0);
    const total = Number(totalAmount);
    if (netPaid <= 0) return SalesOrderPaymentStatus.UNPAID;
    if (Math.abs(netPaid - total) < AMOUNT_TOLERANCE) return SalesOrderPaymentStatus.PAID;
    if (netPaid < total) return SalesOrderPaymentStatus.PARTIAL;
    return SalesOrderPaymentStatus.OVERPAID;
  }

  /**
   * Re-derive paymentStatus / paidAmount / balanceDue and the DRAFT<->READY band
   * for an order whose totalAmount may have changed. Reuses the same recompute as
   * payment recording (single source of truth). When `manager` is supplied the work
   * joins the caller's transaction; otherwise it runs in its own. Returns the locked
   * order with the reconciled fields applied, so callers can snapshot it without an
   * extra read inside the same transaction.
   */
  async reconcileOrderState(orderId: string, manager?: EntityManager): Promise<SalesOrder> {
    const run = async (m: EntityManager): Promise<SalesOrder> => {
      const order = await lockRowForUpdate(m, SalesOrder, orderId, {
        notFoundMessage: 'Sales order not found',
      });
      await this.updatePaymentStatusInTx(order, m);
      return order;
    };

    return manager ? run(manager) : this.dataSource.transaction(run);
  }

  async recordPayment(orderId: string, dto: RecordPaymentDto, userId?: string, username?: string): Promise<SalesOrderPayment> {
    if (dto.amount <= 0) {
      throw new BadRequestException('Payment amount must be positive');
    }

    const method = await this.paymentMethodRepository.findOne({
      where: { id: dto.paymentMethodId, isActive: true },
    });
    if (!method) throw new BadRequestException(`Payment method ${dto.paymentMethodId} not found or inactive`);

    const { saved, orderNumber } = await this.dataSource.transaction(async (manager: EntityManager) => {
      const order = await lockRowForUpdate(manager, SalesOrder, orderId, {
        notFoundMessage: 'Sales order not found',
      });
      if (order.status !== SalesOrderStatus.DRAFT) {
        throw new ConflictException('Payments can only be recorded on DRAFT orders');
      }

      const record = manager.getRepository(SalesOrderPayment).create({
        salesOrderId: orderId,
        paymentMethodId: dto.paymentMethodId,
        amount: dto.amount,
        paymentDate: dto.paymentDate,
        referenceNumber: dto.referenceNumber,
        notes: dto.notes,
      });
      const savedRecord = await manager.getRepository(SalesOrderPayment).save(record);
      await this.accounting.postSalesPayment({
        salesOrderId: orderId,
        sourceRef: order.orderNumber,
        paymentRowId: savedRecord.id,
        channel: method.accountingChannel,
        amount: formatScale4(String(dto.amount)),
        entryDate: dto.paymentDate,
        createdBy: username,
      }, manager);
      await this.updatePaymentStatusInTx(order, manager);
      return { saved: savedRecord, orderNumber: order.orderNumber };
    });

    await this.auditLogService.log('CREATE', 'SalesOrderPayment', `Recorded payment for ${orderNumber}`, {
      entityId: saved.id,
      userId: userId || 'system',
      username,
      newValues: { amount: dto.amount, paymentMethodId: dto.paymentMethodId },
    });

    return saved;
  }

  async recordRefund(orderId: string, dto: RecordPaymentDto, userId?: string, username?: string): Promise<SalesOrderPayment> {
    if (dto.amount <= 0) {
      throw new BadRequestException('Refund amount must be positive');
    }

    const method = await this.paymentMethodRepository.findOne({
      where: { id: dto.paymentMethodId, isActive: true },
    });
    if (!method) throw new BadRequestException(`Payment method ${dto.paymentMethodId} not found or inactive`);

    const { saved, resultingStatus, orderNumber } = await this.dataSource.transaction(async (manager: EntityManager) => {
      const order = await lockRowForUpdate(manager, SalesOrder, orderId, {
        notFoundMessage: 'Sales order not found',
      });
      if (order.status === SalesOrderStatus.CANCELLED) {
        throw new ConflictException('Cannot record a refund on a cancelled order');
      }

      const existing = await manager.getRepository(SalesOrderPayment).find({ where: { salesOrderId: orderId } });
      const netPaid = existing.reduce((sum, r) => sum + Number(r.amount), 0);
      if (dto.amount > netPaid + AMOUNT_TOLERANCE) {
        throw new BadRequestException(`Refund amount (${dto.amount}) exceeds net paid (${netPaid.toFixed(4)})`);
      }

      const record = manager.getRepository(SalesOrderPayment).create({
        salesOrderId: orderId,
        paymentMethodId: dto.paymentMethodId,
        amount: -dto.amount,
        paymentDate: dto.paymentDate,
        referenceNumber: dto.referenceNumber,
        notes: dto.notes,
      });
      const savedRecord = await manager.getRepository(SalesOrderPayment).save(record);
      await this.accounting.postSalesRefund({
        salesOrderId: orderId,
        sourceRef: order.orderNumber,
        refundRowId: savedRecord.id,
        channel: method.accountingChannel,
        amount: formatScale4(String(dto.amount)),
        entryDate: dto.paymentDate,
        createdBy: username,
      }, manager);
      const resultingStatus = await this.updatePaymentStatusInTx(order, manager);
      return { saved: savedRecord, resultingStatus, orderNumber: order.orderNumber };
    });

    await this.auditLogService.log('CREATE', 'SalesOrderPayment', `Recorded refund for ${orderNumber} (status: ${resultingStatus})`, {
      entityId: saved.id,
      userId: userId || 'system',
      username,
      newValues: { amount: -dto.amount, paymentMethodId: dto.paymentMethodId, resultingPaymentStatus: resultingStatus },
    });

    return saved;
  }

  async recordPayments(orderId: string, dtos: RecordPaymentDto[], userId?: string, username?: string): Promise<SalesOrderPayment[]> {
    if (dtos.length === 0) return [];

    for (const dto of dtos) {
      if (dto.amount <= 0) throw new BadRequestException('Payment amount must be positive');
    }
    const methodMap = new Map<string, PaymentMethodEntity>();
    for (const dto of dtos) {
      if (methodMap.has(dto.paymentMethodId)) continue;
      const method = await this.paymentMethodRepository.findOne({
        where: { id: dto.paymentMethodId, isActive: true },
      });
      if (!method) throw new BadRequestException(`Payment method ${dto.paymentMethodId} not found or inactive`);
      methodMap.set(dto.paymentMethodId, method);
    }

    const { results, orderNumber } = await this.dataSource.transaction(async (manager: EntityManager) => {
      const order = await lockRowForUpdate(manager, SalesOrder, orderId, {
        notFoundMessage: 'Sales order not found',
      });
      if (order.status !== SalesOrderStatus.DRAFT) {
        throw new ConflictException('Payments can only be recorded on DRAFT orders');
      }

      const saved: SalesOrderPayment[] = [];
      for (const dto of dtos) {
        const record = manager.getRepository(SalesOrderPayment).create({
          salesOrderId: orderId,
          paymentMethodId: dto.paymentMethodId,
          amount: dto.amount,
          paymentDate: dto.paymentDate,
          referenceNumber: dto.referenceNumber,
          notes: dto.notes,
        });
        const savedRecord = await manager.getRepository(SalesOrderPayment).save(record);
        const method = methodMap.get(dto.paymentMethodId)!;
        await this.accounting.postSalesPayment({
          salesOrderId: orderId,
          sourceRef: order.orderNumber,
          paymentRowId: savedRecord.id,
          channel: method.accountingChannel,
          amount: formatScale4(String(dto.amount)),
          entryDate: dto.paymentDate,
          createdBy: username,
        }, manager);
        saved.push(savedRecord);
      }
      await this.updatePaymentStatusInTx(order, manager);
      return { results: saved, orderNumber: order.orderNumber };
    });

    for (const saved of results) {
      await this.auditLogService.log('CREATE', 'SalesOrderPayment', `Recorded payment for ${orderNumber}`, {
        entityId: saved.id,
        userId: userId || 'system',
        username,
        newValues: { amount: saved.amount, paymentMethodId: saved.paymentMethodId },
      });
    }

    return results;
  }

  async recordRefunds(orderId: string, dtos: RecordPaymentDto[], userId?: string, username?: string): Promise<SalesOrderPayment[]> {
    if (dtos.length === 0) return [];

    for (const dto of dtos) {
      if (dto.amount <= 0) throw new BadRequestException('Refund amount must be positive');
    }
    const methodMap = new Map<string, PaymentMethodEntity>();
    for (const dto of dtos) {
      if (methodMap.has(dto.paymentMethodId)) continue;
      const method = await this.paymentMethodRepository.findOne({
        where: { id: dto.paymentMethodId, isActive: true },
      });
      if (!method) throw new BadRequestException(`Payment method ${dto.paymentMethodId} not found or inactive`);
      methodMap.set(dto.paymentMethodId, method);
    }

    const { results, resultingStatus, orderNumber } = await this.dataSource.transaction(async (manager: EntityManager) => {
      const order = await lockRowForUpdate(manager, SalesOrder, orderId, {
        notFoundMessage: 'Sales order not found',
      });
      if (order.status === SalesOrderStatus.CANCELLED) {
        throw new ConflictException('Cannot record a refund on a cancelled order');
      }

      const existing = await manager.getRepository(SalesOrderPayment).find({ where: { salesOrderId: orderId } });
      const netPaid = existing.reduce((sum, r) => sum + Number(r.amount), 0);
      const totalRefundAmount = dtos.reduce((sum, dto) => sum + dto.amount, 0);
      if (totalRefundAmount > netPaid + AMOUNT_TOLERANCE) {
        throw new BadRequestException(`Total refund amount (${totalRefundAmount}) exceeds net paid (${netPaid.toFixed(4)})`);
      }

      const saved: SalesOrderPayment[] = [];
      for (const dto of dtos) {
        const record = manager.getRepository(SalesOrderPayment).create({
          salesOrderId: orderId,
          paymentMethodId: dto.paymentMethodId,
          amount: -dto.amount,
          paymentDate: dto.paymentDate,
          referenceNumber: dto.referenceNumber,
          notes: dto.notes,
        });
        const savedRecord = await manager.getRepository(SalesOrderPayment).save(record);
        const method = methodMap.get(dto.paymentMethodId)!;
        await this.accounting.postSalesRefund({
          salesOrderId: orderId,
          sourceRef: order.orderNumber,
          refundRowId: savedRecord.id,
          channel: method.accountingChannel,
          amount: formatScale4(String(dto.amount)),
          entryDate: dto.paymentDate,
          createdBy: username,
        }, manager);
        saved.push(savedRecord);
      }
      const resultingStatus = await this.updatePaymentStatusInTx(order, manager);
      return { results: saved, resultingStatus, orderNumber: order.orderNumber };
    });

    for (const saved of results) {
      await this.auditLogService.log('CREATE', 'SalesOrderPayment', `Recorded refund for ${orderNumber} (status: ${resultingStatus})`, {
        entityId: saved.id,
        userId: userId || 'system',
        username,
        newValues: { amount: saved.amount, paymentMethodId: saved.paymentMethodId, resultingPaymentStatus: resultingStatus },
      });
    }

    return results;
  }

  async listPayments(orderId: string): Promise<SalesOrderPayment[]> {
    const order = await this.salesOrderRepository.findOne({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Sales order not found');

    return this.salesOrderPaymentRepository.find({
      where: { salesOrderId: orderId },
      order: { paymentDate: 'ASC' },
      relations: { paymentMethod: true },
    });
  }

  private async updatePaymentStatusInTx(order: SalesOrder, manager: EntityManager): Promise<SalesOrderPaymentStatus> {
    const all = await manager.getRepository(SalesOrderPayment).find({ where: { salesOrderId: order.id } });
    const netPaid = all.reduce((sum, r) => sum + Number(r.amount), 0);
    const newStatus = this.computePaymentStatus(all, order.totalAmount);
    // OVERPAID is not fulfillable. Only exact payment (PAID) promotes to READY.
    const paidInFull = newStatus === SalesOrderPaymentStatus.PAID;

    const update: Partial<SalesOrder> = {
      paymentStatus: newStatus,
      paidAmount: netPaid,
      balanceDue: Number(order.totalAmount) - netPaid,
    };

    // Reconcile order status with payment, only within the DRAFT <-> READY band.
    // FULFILLED / CANCELLED orders are never touched here.
    if (paidInFull && order.status === SalesOrderStatus.DRAFT) {
      update.status = SalesOrderStatus.READY;
    } else if (!paidInFull && order.status === SalesOrderStatus.READY) {
      update.status = SalesOrderStatus.DRAFT;
    }

    await manager.getRepository(SalesOrder).update(order.id, update);
    // Reflect the persisted patch onto the in-memory entity so callers holding this
    // reference (e.g. reconcileOrderState) see the reconciled state without re-reading.
    Object.assign(order, update);
    return newStatus;
  }
}
