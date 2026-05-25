import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SalesOrder, SalesOrderPaymentStatus, SalesOrderStatus } from '../../../database/entities/sales-order.entity';
import { SalesOrderPayment } from '../../../database/entities/sales-order-payment.entity';
import { PaymentMethodEntity } from '../../../database/entities/payment-method.entity';
import { AuditLogService } from '../../audit-logs/services';

export interface RecordPaymentDto {
  paymentMethodId: string;
  amount: number;
  paymentDate: string;
  referenceNumber?: string;
  notes?: string;
}

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
  ) {}

  computePaymentStatus(
    records: SalesOrderPayment[],
    totalAmount: number,
  ): SalesOrderPaymentStatus {
    const netPaid = records.reduce((sum, r) => sum + Number(r.amount), 0);
    const total = Number(totalAmount);
    if (netPaid <= 0) return SalesOrderPaymentStatus.UNPAID;
    if (netPaid < total) return SalesOrderPaymentStatus.PARTIAL;
    if (netPaid === total) return SalesOrderPaymentStatus.PAID;
    return SalesOrderPaymentStatus.OVERPAID;
  }

  async recordPayment(orderId: string, dto: RecordPaymentDto): Promise<SalesOrderPayment> {
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

    const record = this.salesOrderPaymentRepository.create({
      salesOrderId: orderId,
      paymentMethodId: dto.paymentMethodId,
      amount: dto.amount,
      paymentDate: dto.paymentDate,
      referenceNumber: dto.referenceNumber,
      notes: dto.notes,
    });
    const saved = await this.salesOrderPaymentRepository.save(record);

    await this.updatePaymentStatus(order, saved);

    await this.auditLogService.log('CREATE', 'SalesOrderPayment', `Recorded payment for ${order.orderNumber}`, {
      entityId: saved.id,
      userId: 'system',
      newValues: { amount: dto.amount, paymentMethodId: dto.paymentMethodId },
    });

    return saved;
  }

  async recordRefund(orderId: string, dto: RecordPaymentDto): Promise<SalesOrderPayment> {
    if (dto.amount <= 0) {
      throw new BadRequestException('Refund amount must be positive');
    }

    const order = await this.salesOrderRepository.findOne({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Sales order not found');

    const method = await this.paymentMethodRepository.findOne({
      where: { id: dto.paymentMethodId, isActive: true },
    });
    if (!method) throw new BadRequestException(`Payment method ${dto.paymentMethodId} not found or inactive`);

    const existing = await this.salesOrderPaymentRepository.find({ where: { salesOrderId: orderId } });
    const netPaid = existing.reduce((sum, r) => sum + Number(r.amount), 0);
    if (dto.amount > netPaid) {
      throw new BadRequestException(`Refund amount (${dto.amount}) exceeds net paid (${netPaid})`);
    }

    const record = this.salesOrderPaymentRepository.create({
      salesOrderId: orderId,
      paymentMethodId: dto.paymentMethodId,
      amount: -dto.amount,
      paymentDate: dto.paymentDate,
      referenceNumber: dto.referenceNumber,
      notes: dto.notes,
    });
    const saved = await this.salesOrderPaymentRepository.save(record);

    await this.updatePaymentStatus(order, saved);

    await this.auditLogService.log('CREATE', 'SalesOrderPayment', `Recorded refund for ${order.orderNumber}`, {
      entityId: saved.id,
      userId: 'system',
      newValues: { amount: -dto.amount, paymentMethodId: dto.paymentMethodId },
    });

    return saved;
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

  private async updatePaymentStatus(order: SalesOrder, savedRecord: SalesOrderPayment): Promise<void> {
    const all = await this.salesOrderPaymentRepository.find({ where: { salesOrderId: order.id } });
    const records = all.some((record) => record.id === savedRecord.id)
      ? all
      : [...all, savedRecord];
    order.paymentStatus = this.computePaymentStatus(records, order.totalAmount);
    await this.salesOrderRepository.save(order);
  }
}
