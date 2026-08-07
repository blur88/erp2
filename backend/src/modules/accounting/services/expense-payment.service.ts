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

      const groups = new Map<string, typeof dto.refunds>();
      for (const r of dto.refunds) {
        if (!groups.has(r.sourcePaymentId)) {
          groups.set(r.sourcePaymentId, []);
        }
        groups.get(r.sourcePaymentId)!.push(r);
      }

      for (const [sourceId] of groups) {
        const source = await payRepo.findOne({ where: { id: sourceId } as any });
        if (
          !source ||
          source.expenseId !== expenseId ||
          source.sourcePaymentId !== null ||
          toMinorUnits(source.amount) <= 0n
        ) {
          throw new BadRequestException('Refund source must be a payment on this expense');
        }
      }

      for (const [sourceId, rows] of groups) {
        const source = await payRepo.findOne({ where: { id: sourceId } as any });

        const existingRefunds = await payRepo.find({ where: { sourcePaymentId: sourceId } as any });
        const priorRefunded = sumMinor(existingRefunds.map((r: any) => r.amount));
        const refundedSoFar = priorRefunded < 0n ? -priorRefunded : priorRefunded;

        const batchSum = sumMinor(rows.map((r) => r.amount));
        const sourceMinor = toMinorUnits(source.amount);

        if (refundedSoFar + batchSum > sourceMinor) {
          throw new BadRequestException(
            `Refund total exceeds the refundable amount for source payment ${sourceId}`,
          );
        }

        const method = await manager.getRepository(PaymentMethodEntity).findOne({
          where: { id: source.paymentMethodId } as any,
          withDeleted: true,
        } as any);
        if (!method) {
          throw new BadRequestException(`Payment method ${source.paymentMethodId} not found`);
        }

        for (const r of rows) {
          const refundRow = (await payRepo.save(
            payRepo.create({
              expenseId,
              paymentMethodId: source.paymentMethodId,
              paymentDate: r.refundDate,
              amount: '-' + formatScale4(r.amount),
              reference: r.reference ?? null,
              sourcePaymentId: sourceId,
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
