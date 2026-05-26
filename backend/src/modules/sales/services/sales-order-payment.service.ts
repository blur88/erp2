import {
  BadRequestException,
  ConflictException,
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

  async recordPayment(orderId: string, dto: RecordPaymentDto, userId?: string, username?: string): Promise<SalesOrderPayment> {
    if (dto.amount <= 0) {
      throw new BadRequestException('Payment amount must be positive');
    }

    const order = await this.salesOrderRepository.findOne({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Sales order not found');
    if (order.status !== SalesOrderStatus.DRAFT) {
      throw new ConflictException('Payments can only be recorded on DRAFT orders');
    }

    const method = await this.paymentMethodRepository.findOne({
      where: { id: dto.paymentMethodId, isActive: true },
    });
    if (!method) throw new BadRequestException(`Payment method ${dto.paymentMethodId} not found or inactive`);

    const saved = await this.dataSource.transaction(async (manager: EntityManager) => {
      const record = manager.getRepository(SalesOrderPayment).create({
        salesOrderId: orderId,
        paymentMethodId: dto.paymentMethodId,
        amount: dto.amount,
        paymentDate: dto.paymentDate,
        referenceNumber: dto.referenceNumber,
        notes: dto.notes,
      });
      const savedRecord = await manager.getRepository(SalesOrderPayment).save(record);
      await this.updatePaymentStatusInTx(order, manager);
      return savedRecord;
    });

    await this.auditLogService.log('CREATE', 'SalesOrderPayment', `Recorded payment for ${order.orderNumber}`, {
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

    const order = await this.salesOrderRepository.findOne({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Sales order not found');
    if (order.status === SalesOrderStatus.CANCELLED) {
      throw new ConflictException('Cannot record a refund on a cancelled order');
    }

    const method = await this.paymentMethodRepository.findOne({
      where: { id: dto.paymentMethodId, isActive: true },
    });
    if (!method) throw new BadRequestException(`Payment method ${dto.paymentMethodId} not found or inactive`);

    const existing = await this.salesOrderPaymentRepository.find({ where: { salesOrderId: orderId } });
    const netPaid = existing.reduce((sum, r) => sum + Number(r.amount), 0);
    if (dto.amount > netPaid + AMOUNT_TOLERANCE) {
      throw new BadRequestException(`Refund amount (${dto.amount}) exceeds net paid (${netPaid.toFixed(4)})`);
    }

    const saved = await this.dataSource.transaction(async (manager: EntityManager) => {
      const record = manager.getRepository(SalesOrderPayment).create({
        salesOrderId: orderId,
        paymentMethodId: dto.paymentMethodId,
        amount: -dto.amount,
        paymentDate: dto.paymentDate,
        referenceNumber: dto.referenceNumber,
        notes: dto.notes,
      });
      const savedRecord = await manager.getRepository(SalesOrderPayment).save(record);
      await this.updatePaymentStatusInTx(order, manager);
      return savedRecord;
    });

    await this.auditLogService.log('CREATE', 'SalesOrderPayment', `Recorded refund for ${order.orderNumber}`, {
      entityId: saved.id,
      userId: userId || 'system',
      username,
      newValues: { amount: -dto.amount, paymentMethodId: dto.paymentMethodId },
    });

    return saved;
  }

  async recordRefunds(orderId: string, dtos: RecordPaymentDto[], userId?: string, username?: string): Promise<SalesOrderPayment[]> {
    const results: SalesOrderPayment[] = []
    for (const dto of dtos) {
      const saved = await this.recordRefund(orderId, dto, userId, username)
      results.push(saved)
    }
    return results
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

  private async updatePaymentStatusInTx(order: SalesOrder, manager: EntityManager): Promise<void> {
    const all = await manager.getRepository(SalesOrderPayment).find({ where: { salesOrderId: order.id } });
    const newStatus = this.computePaymentStatus(all, order.totalAmount);
    await manager.getRepository(SalesOrder).update(order.id, { paymentStatus: newStatus });
  }
}
