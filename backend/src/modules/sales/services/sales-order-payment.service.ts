import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';

import { Invoice } from '../../../database/entities/invoice.entity';
import { Payment, PaymentStatus, SettlementStatusEnum } from '../../../database/entities/payment.entity';
import { PaymentMethodEntity } from '../../../database/entities/payment-method.entity';
import { SalesOrder } from '../../../database/entities/sales-order.entity';
import { AuditLogService } from '../../audit-logs/services';
import { AccountingService } from '../../accounting/services/accounting.service';
import { SettingsService } from '../../settings/settings.service';
import { SalesOrderResponseDto } from '../dto/sales-order.dto';

@Injectable()
export class SalesOrderPaymentService {
  private readonly logger = new Logger(SalesOrderPaymentService.name);

  constructor(
    @InjectRepository(SalesOrder)
    private readonly salesOrderRepository: Repository<SalesOrder>,
    private readonly settingsService: SettingsService,
    private readonly auditLogService: AuditLogService,
    private readonly accountingService: AccountingService,
    private readonly dataSource: DataSource,
  ) {}

  async recordPayment(
    id: string,
    amount: number,
    paymentMethodId: string | undefined,
    findOrderById: (id: string) => Promise<SalesOrderResponseDto>,
  ): Promise<SalesOrderResponseDto> {
    if (amount < 0) {
      throw new BadRequestException('Payment amount must be positive');
    }

    const order = await this.salesOrderRepository.findOne({
      where: { id },
      relations: { customer: true, items: { product: true } },
    });

    if (!order) {
      throw new NotFoundException('Sales order not found');
    }

    if (order.isFulfilled) {
      throw new ConflictException('Cannot modify payment for fulfilled order');
    }

    order.paidAmount = Number(amount);
    const savedOrder = await this.salesOrderRepository.save(order);

    try {
      const paymentRepository = this.salesOrderRepository.manager.getRepository(Payment);
      const invoiceRepository = this.salesOrderRepository.manager.getRepository(Invoice);
      const paymentMethodRepository = this.salesOrderRepository.manager.getRepository(PaymentMethodEntity);

      let selectedMethod = null;
      if (paymentMethodId) {
        selectedMethod = await paymentMethodRepository.findOne({
          where: { id: paymentMethodId, isActive: true },
        });
      }
      if (!selectedMethod) {
        selectedMethod = await paymentMethodRepository.findOne({
          where: { code: 'CASH', isActive: true },
        });
      }
      if (!selectedMethod) {
        this.logger.warn(
          `No payment method found for order ${order.orderNumber} (requested: ${paymentMethodId || 'none'})`,
        );
      }

      const methodSettlementStatus = selectedMethod?.requiresSettlement
        ? SettlementStatusEnum.PENDING
        : SettlementStatusEnum.NOT_APPLICABLE;

      const invoice = await invoiceRepository.findOne({
        where: { salesOrderId: savedOrder.id },
      });

      if (invoice) {
        invoice.paidAmount = Number(amount);
        invoice.calculateTotals();
        invoice.updateStatus();
        await invoiceRepository.save(invoice);
      }

      let existingPayment = null;
      if (invoice) {
        existingPayment = await paymentRepository.findOne({
          where: { invoiceId: invoice.id },
          withDeleted: true,
        });
      }

      if (existingPayment) {
        if (existingPayment.deletedAt) {
          await paymentRepository.restore(existingPayment.id);
          const restoredPayment = await paymentRepository.findOne({
            where: { id: existingPayment.id },
          });

          if (restoredPayment) {
            restoredPayment.isActive = true;
            await paymentRepository.save(restoredPayment);

            await this.auditLogService.log('RESTORE', 'Payment', `Restored payment: ${restoredPayment.paymentNumber} for sales order ${order.orderNumber}`, {
              entityId: restoredPayment.id,
              userId: 'system',
              newValues: {
                paymentNumber: restoredPayment.paymentNumber,
                amount: Number(amount),
              },
            });

            Object.assign(existingPayment, restoredPayment);
          }
        }

        existingPayment.amount = Number(amount);
        existingPayment.paymentDate = new Date();
        existingPayment.notes = `Payment recorded for sales order ${order.orderNumber}${invoice ? ` (Invoice: ${invoice.invoiceNumber})` : ''}`;
        existingPayment.invoiceId = invoice ? invoice.id : null;
        existingPayment.paymentMethodId = selectedMethod?.id || existingPayment.paymentMethodId;
        existingPayment.settlementStatus = selectedMethod
          ? methodSettlementStatus
          : existingPayment.settlementStatus;
        await paymentRepository.save(existingPayment);

        await this.auditLogService.log('UPDATE', 'Payment', `Updated payment: ${existingPayment.paymentNumber} for sales order ${order.orderNumber}`, {
          entityId: existingPayment.id,
          userId: 'system',
          newValues: {
            paymentNumber: existingPayment.paymentNumber,
            amount: existingPayment.amount,
            status: existingPayment.status,
          },
        });
      } else {
        const paymentNumber = await this.generatePaymentNumber(paymentRepository);
        const payment = paymentRepository.create({
          paymentNumber,
          status: PaymentStatus.COMPLETED,
          paymentMethodId: selectedMethod?.id,
          settlementStatus: methodSettlementStatus,
          paymentDate: new Date(),
          amount: Number(amount),
          customerId: order.customerId,
          invoiceId: invoice ? invoice.id : null,
          notes: `Payment recorded for sales order ${order.orderNumber}${invoice ? ` (Invoice: ${invoice.invoiceNumber})` : ''}`,
        });

        await paymentRepository.save(payment);

        await this.auditLogService.log('CREATE', 'Payment', `Created payment: ${payment.paymentNumber} for sales order ${order.orderNumber}`, {
          entityId: payment.id,
          userId: 'system',
          newValues: {
            paymentNumber: payment.paymentNumber,
            amount: payment.amount,
            status: payment.status,
            paymentMethodId: payment.paymentMethodId,
          },
        });
      }
    } catch (error) {
      this.logger.error(`Failed to auto-generate payment for order ${order.orderNumber}: ${error.message}`, error.stack);
    }

    return findOrderById(savedOrder.id);
  }

  async recordPayments(
    id: string,
    payments: { paymentMethodId: string; amount: number; reference?: string }[],
    findOrderById: (id: string) => Promise<SalesOrderResponseDto>,
  ): Promise<SalesOrderResponseDto> {
    for (const line of payments) {
      if (line.amount <= 0) {
        throw new BadRequestException('All payment amounts must be positive');
      }
    }

    const order = await this.salesOrderRepository.findOne({
      where: { id },
      relations: { customer: true, items: { product: true } },
    });

    if (!order) {
      throw new NotFoundException('Sales order not found');
    }

    if (order.isFulfilled) {
      throw new ConflictException('Cannot modify payment for fulfilled order');
    }

    const totalPayment = payments.reduce((sum, payment) => sum + payment.amount, 0);
    const newPaidAmount = Number(order.paidAmount || 0) + totalPayment;

    await this.dataSource.transaction(async (manager) => {
      const paymentRepo = manager.getRepository(Payment);
      const invoiceRepo = manager.getRepository(Invoice);
      const paymentMethodRepo = manager.getRepository(PaymentMethodEntity);
      const orderRepo = manager.getRepository(SalesOrder);

      const invoice = await invoiceRepo.findOne({ where: { salesOrderId: order.id } });
      const softDeletedPayments = invoice
        ? (await paymentRepo.find({
            where: { invoiceId: invoice.id },
            withDeleted: true,
            order: { paymentDate: 'DESC' },
          })).filter((record) => record.deletedAt !== null)
        : [];

      for (let index = 0; index < payments.length; index++) {
        const line = payments[index];
        const method = await paymentMethodRepo.findOne({
          where: { id: line.paymentMethodId, isActive: true },
        });

        if (!method) {
          throw new BadRequestException(`Payment method ${line.paymentMethodId} not found or inactive`);
        }

        const settlementStatus = method.requiresSettlement
          ? SettlementStatusEnum.PENDING
          : SettlementStatusEnum.NOT_APPLICABLE;

        const notes = line.reference
          ? `${line.reference} - Payment for ${order.orderNumber}${invoice ? ` (${invoice.invoiceNumber})` : ''}`
          : `Payment for ${order.orderNumber}${invoice ? ` (${invoice.invoiceNumber})` : ''}`;

        const existingDeleted = softDeletedPayments[index];
        let savedPayment: Payment;

        if (existingDeleted) {
          await paymentRepo.restore(existingDeleted.id);
          const restoredPayment = await paymentRepo.findOne({ where: { id: existingDeleted.id } });
          if (!restoredPayment) {
            throw new NotFoundException(`Payment ${existingDeleted.id} not found after restore`);
          }

          restoredPayment.isActive = true;
          restoredPayment.amount = Number(line.amount);
          restoredPayment.paymentMethodId = method.id;
          restoredPayment.paymentMethodEntity = method;
          restoredPayment.settlementStatus = settlementStatus;
          restoredPayment.paymentDate = new Date();
          restoredPayment.notes = notes;
          savedPayment = await paymentRepo.save(restoredPayment);

          await this.auditLogService.log('UPDATE', 'Payment', `Restored and updated payment: ${savedPayment.paymentNumber} for ${order.orderNumber}`, {
            entityId: savedPayment.id,
            userId: 'system',
            newValues: {
              paymentNumber: savedPayment.paymentNumber,
              amount: savedPayment.amount,
              paymentMethodId: method.id,
            },
          });
        } else {
          const paymentNumber = await this.generatePaymentNumber(paymentRepo);
          const payment = paymentRepo.create({
            paymentNumber,
            status: PaymentStatus.COMPLETED,
            paymentMethodId: method.id,
            settlementStatus,
            paymentDate: new Date(),
            amount: Number(line.amount),
            customerId: order.customerId,
            invoiceId: invoice ? invoice.id : null,
            notes,
          });

          savedPayment = await paymentRepo.save(payment);

          await this.auditLogService.log('CREATE', 'Payment', `Created payment: ${paymentNumber} for ${order.orderNumber}`, {
            entityId: savedPayment.id,
            userId: 'system',
            newValues: {
              paymentNumber,
              amount: line.amount,
              paymentMethodId: method.id,
            },
          });
        }

        try {
          const fullPayment = await paymentRepo.findOne({
            where: { id: savedPayment.id },
            relations: { customer: true, paymentMethodEntity: true },
          });
          if (fullPayment) {
            await this.accountingService.postCustomerPaymentEntry(fullPayment, 'system');
          }
        } catch (error) {
          this.logger.error(`Failed to post accounting entry for payment ${savedPayment.paymentNumber}: ${error.message}`);
        }
      }

      await orderRepo.update(order.id, { paidAmount: newPaidAmount });

      if (invoice) {
        invoice.paidAmount = newPaidAmount;
        invoice.calculateTotals();
        invoice.updateStatus();
        await invoiceRepo.save(invoice);
      }
    });

    return findOrderById(id);
  }

  async unpayOrder(
    id: string,
    findOrderById: (id: string) => Promise<SalesOrderResponseDto>,
  ): Promise<SalesOrderResponseDto> {
    const order = await this.salesOrderRepository.findOne({
      where: { id },
      relations: { customer: true, items: { product: true } },
    });

    if (!order) {
      throw new NotFoundException('Sales order not found');
    }

    if (order.isFulfilled) {
      throw new ConflictException('Cannot unpay fulfilled order - order has already been fulfilled');
    }

    try {
      const paymentRepository = this.salesOrderRepository.manager.getRepository(Payment);
      const invoiceRepository = this.salesOrderRepository.manager.getRepository(Invoice);

      const invoice = await invoiceRepository.findOne({
        where: { salesOrderId: order.id },
      });

      if (invoice) {
        const associatedPayments = await paymentRepository.find({
          where: { invoiceId: invoice.id },
        });

        if (associatedPayments.length > 0) {
          for (const payment of associatedPayments) {
            try {
              await this.accountingService.reverseSourceEntries('payment', payment.id, 'system');
              this.logger.log(`Reversed accounting entries for payment ${payment.paymentNumber}`);
            } catch (error) {
              this.logger.error(`Failed to reverse JE for payment ${payment.id}: ${error.message}`);
            }

            await this.auditLogService.log('DELETE', 'Payment', `Soft deleted payment: ${payment.paymentNumber} (unpaid sales order ${order.orderNumber})`, {
              entityId: payment.id,
              userId: 'system',
              oldValues: {
                paymentNumber: payment.paymentNumber,
                amount: payment.amount,
                status: payment.status,
              },
            });
          }

          await paymentRepository.softDelete(associatedPayments.map((payment) => payment.id));
        }

        invoice.paidAmount = 0;
        invoice.calculateTotals();
        invoice.updateStatus();
        await invoiceRepository.save(invoice);
      }
    } catch (error) {
      this.logger.error(`Failed to unpay order ${order.orderNumber}: ${error.message}`);
    }

    order.paidAmount = 0;
    const savedOrder = await this.salesOrderRepository.save(order);

    return findOrderById(savedOrder.id);
  }

  private async generatePaymentNumber(paymentRepository: Repository<Payment>): Promise<string> {
    try {
      return await this.settingsService.generateDocumentNumber('Payments');
    } catch {
      const allPayments = await paymentRepository.find({
        select: { paymentNumber: true },
        withDeleted: true,
      });
      let maxNumber = 0;
      for (const payment of allPayments) {
        const match = payment.paymentNumber.match(/^PAY-(\d+)$/);
        if (match) {
          maxNumber = Math.max(maxNumber, parseInt(match[1], 10));
        }
      }
      return `PAY-${(maxNumber + 1).toString().padStart(6, '0')}`;
    }
  }
}
