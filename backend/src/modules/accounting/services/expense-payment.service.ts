import { DataSource, EntityManager, QueryDeepPartialEntity } from 'typeorm';
import { Injectable, BadRequestException } from '@nestjs/common';
import { Expense, ExpenseDocumentStatus, ExpensePaymentStatus } from '../entities/expense.entity';
import { ExpensePayment } from '../entities/expense-payment.entity';
import { PaymentMethodEntity } from '../../../database/entities/payment-method.entity';
import { lockRowForUpdate } from '../../../common/db/tx-helpers';
import { toMinorUnits, formatScale4, sumMinor } from '@/common/utils/money';
import { ExpenseService } from './expense.service';
import { AccountingPostingService } from './accounting-posting.service';
import { AuditLogService } from '../../audit-logs/services';
import { PayExpenseDto, RefundExpenseDto } from '../dto/create-expense.dto';

@Injectable()
export class ExpensePaymentService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly expenseService: ExpenseService,
    private readonly posting: AccountingPostingService,
    private readonly auditLogService: AuditLogService,
  ) {}

  async pay(expenseId: string, dto: PayExpenseDto, userId?: string, username?: string): Promise<Expense> {
    if (!dto.payments?.length) {
      throw new BadRequestException('At least one payment row is required');
    }
    for (const p of dto.payments) {
      if (toMinorUnits(p.amount) <= 0n) {
        throw new BadRequestException('Payment amount must be greater than zero');
      }
    }

    let expenseNumber: string;
    const updatedId = await this.dataSource.transaction(async (manager) => {
      const expense = await lockRowForUpdate(manager, Expense, expenseId, {
        notFoundMessage: 'Expense not found',
      });
      if (expense.documentStatus === ExpenseDocumentStatus.CANCELLED) {
        throw new BadRequestException('Cancelled expenses cannot receive payments');
      }
      if (expense.documentStatus === ExpenseDocumentStatus.COMPLETED) {
        throw new BadRequestException('Settled expenses cannot receive further payments');
      }
      expenseNumber = expense.expenseNumber;

      const methods = new Map<string, PaymentMethodEntity>();
      for (const p of dto.payments) {
        if (!methods.has(p.paymentMethodId)) {
          const m = await manager.getRepository(PaymentMethodEntity).findOne({
            where: { id: p.paymentMethodId, isActive: true, useForPurchases: true } as any,
          });
          if (!m) {
            throw new BadRequestException(
              `Payment method ${p.paymentMethodId} not found, inactive, or not enabled for purchases`,
            );
          }
          methods.set(p.paymentMethodId, m);
        }
      }

      const payRepo = manager.getRepository(ExpensePayment);
      for (const p of dto.payments) {
        const row = (await payRepo.save(
          payRepo.create({
            expenseId,
            paymentMethodId: p.paymentMethodId,
            paymentDate: p.paymentDate,
            amount: formatScale4(p.amount),
            reference: p.reference ?? null,
            sourcePaymentId: null,
          } as any),
        )) as unknown as ExpensePayment;

        await this.posting.postExpensePayment(
          {
            expenseId,
            paymentRowId: row.id,
            expenseAccountId: expense.expenseAccountId,
            channel: methods.get(p.paymentMethodId)!.accountingChannel,
            amount: formatScale4(p.amount),
            sourceRef: expense.expenseNumber,
            entryDate: p.paymentDate,
            createdBy: username,
          },
          manager,
        );
      }

      const allRows = await payRepo.find({ where: { expenseId } as any });
      const agg = ExpenseService.computeAggregates(expense.totalAmount, allRows);
      const documentStatus = ExpenseService.deriveDocumentStatus(
        expense.documentStatus,
        agg.paymentStatus,
      );
      const patch: QueryDeepPartialEntity<Expense> = { ...agg, documentStatus };
      await manager.getRepository(Expense).update(expenseId, patch);
      return expenseId;
    });

    await this.auditLogService.log('PAYMENT', 'Expense', `Payment recorded for expense: ${expenseNumber}`, {
      entityId: expenseId,
      userId: userId || 'system',
      username,
      newValues: { payments: dto.payments },
    });

    return this.expenseService.findOne(updatedId);
  }

  async refund(expenseId: string, dto: RefundExpenseDto, userId?: string, username?: string): Promise<Expense> {
    if (!dto.refunds?.length) {
      throw new BadRequestException('At least one refund row is required');
    }
    for (const r of dto.refunds) {
      if (toMinorUnits(r.amount) <= 0n) {
        throw new BadRequestException('Refund amount must be greater than zero');
      }
    }

    let expenseNumber: string;
    const updatedId = await this.dataSource.transaction(async (manager) => {
      const expense = await lockRowForUpdate(manager, Expense, expenseId, {
        notFoundMessage: 'Expense not found',
      });
      if (expense.documentStatus === ExpenseDocumentStatus.CANCELLED) {
        throw new BadRequestException('Cancelled expenses cannot be refunded');
      }
      expenseNumber = expense.expenseNumber;

      const payRepo = manager.getRepository(ExpensePayment);

      // Aggregate cap: refunds are stored as negative rows, so the signed sum is
      // net paid. This counts legacy linked refunds and new unlinked ones alike.
      const existingRows = await payRepo.find({ where: { expenseId } as any });
      const netPaidMinor = sumMinor(existingRows.map((r: any) => r.amount));
      const totalRefundMinor = sumMinor(dto.refunds.map((r) => r.amount));
      if (totalRefundMinor > netPaidMinor) {
        throw new BadRequestException(
          `Total refund amount (${formatScale4(totalRefundMinor)}) exceeds net paid (${formatScale4(netPaidMinor)})`,
        );
      }

      // Refunds may use ANY active method, independent of what paid (#1096).
      // No useForPurchases filter, and no withDeleted — the user picks from the
      // active list, so a soft-deleted method must not resolve.
      const methodCache = new Map<string, PaymentMethodEntity>();
      for (const r of dto.refunds) {
        if (methodCache.has(r.paymentMethodId)) continue;
        const method = await manager.getRepository(PaymentMethodEntity).findOne({
          where: { id: r.paymentMethodId, isActive: true } as any,
        } as any);
        if (!method) {
          throw new BadRequestException(
            `Payment method ${r.paymentMethodId} not found or inactive`,
          );
        }
        methodCache.set(r.paymentMethodId, method);
      }

      for (const r of dto.refunds) {
        const method = methodCache.get(r.paymentMethodId)!;
        const refundRow = (await payRepo.save(
          payRepo.create({
            expenseId,
            paymentMethodId: r.paymentMethodId,
            paymentDate: r.refundDate,
            amount: '-' + formatScale4(r.amount),
            reference: r.reference ?? null,
            // NULL by design: a refund is identified by amount < 0, not lineage.
            sourcePaymentId: null,
          } as any),
        )) as unknown as ExpensePayment;

        await this.posting.postExpenseRefund(
          {
            expenseId,
            refundRowId: refundRow.id,
            expenseAccountId: expense.expenseAccountId,
            channel: method.accountingChannel,
            amount: formatScale4(r.amount),
            sourceRef: expense.expenseNumber,
            entryDate: r.refundDate,
            createdBy: username,
          },
          manager,
        );
      }

      const allRows = await payRepo.find({ where: { expenseId } as any });
      const agg = ExpenseService.computeAggregates(expense.totalAmount, allRows);
      const documentStatus = ExpenseService.deriveDocumentStatus(
        expense.documentStatus,
        agg.paymentStatus,
      );
      const patch: QueryDeepPartialEntity<Expense> = { ...agg, documentStatus };
      await manager.getRepository(Expense).update(expenseId, patch);
      return expenseId;
    });

    await this.auditLogService.log('REFUND', 'Expense', `Refund recorded for expense: ${expenseNumber}`, {
      entityId: expenseId,
      userId: userId || 'system',
      username,
      newValues: { refunds: dto.refunds },
    });

    return this.expenseService.findOne(updatedId);
  }
}
