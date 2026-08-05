import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, EntityManager, In } from 'typeorm';
import { PaymentMethodEntity } from '../../../database/entities/payment-method.entity';
import { Expense, ExpenseDocumentStatus, ExpensePaymentStatus } from '../entities/expense.entity';
import { ExpensePayment } from '../entities/expense-payment.entity';
import { ChartOfAccount } from '../entities/chart-of-account.entity';
import { AccountingSettings } from '../entities/accounting-settings.entity';
import { AccountType } from '../entities/account-type.enum';
import { AuditLogService } from '../../audit-logs/services';
import { SettingsService } from '../../settings/settings.service';
import { CreateExpenseDto, ListExpensesParams, UpdateExpenseDto } from '../dto/create-expense.dto';
import { lockRowForUpdate } from '../../../common/db/tx-helpers';
import { toMinorUnits, formatScale4, sumMinor } from '@/common/utils/money';

@Injectable()
export class ExpenseService {
  constructor(
    @InjectRepository(Expense) private readonly expenseRepo: Repository<Expense>,
    @InjectRepository(ExpensePayment) private readonly expensePaymentRepo: Repository<ExpensePayment>,
    @InjectRepository(ChartOfAccount) private readonly coaRepo: Repository<ChartOfAccount>,
    private readonly settings: SettingsService,
    private readonly auditLogService: AuditLogService,
    private readonly dataSource: DataSource,
  ) {}

  async create(dto: CreateExpenseDto, userId?: string, username?: string): Promise<Expense> {
    if (toMinorUnits(dto.totalAmount) <= 0n) {
      throw new BadRequestException('Amount must be greater than zero');
    }

    const saved = await this.dataSource.transaction(async (manager: EntityManager) => {
      await this.assertValidExpenseAccount(dto.expenseAccountId, manager);
      const expenseNumber = await this.settings.generateDocumentNumber('Expenses', manager);
      const repo = manager.getRepository(Expense);
      return repo.save(repo.create({
        expenseNumber,
        expenseDate: dto.expenseDate,
        payee: dto.payee ?? null,
        description: dto.description,
        expenseAccountId: dto.expenseAccountId,
        totalAmount: formatScale4(dto.totalAmount),
        paidAmount: '0.0000',
        balance: formatScale4(dto.totalAmount),
        notes: dto.notes ?? null,
        documentStatus: ExpenseDocumentStatus.DRAFT,
        paymentStatus: ExpensePaymentStatus.UNPAID,
      } as any)) as unknown as Expense;
    });

    await this.auditLogService.log('CREATE', 'Expense', `Created expense: ${saved.expenseNumber}`, {
      entityId: saved.id,
      userId: userId || 'system',
      username,
      newValues: { totalAmount: dto.totalAmount, expenseAccountId: dto.expenseAccountId },
    });

    return saved;
  }

  static computeAggregates(totalAmount: string, payments: { amount: string }[]) {
    const total = toMinorUnits(totalAmount);
    const paid = payments.reduce((a, p) => a + toMinorUnits(p.amount), 0n);
    const paymentStatus =
      paid <= 0n ? ExpensePaymentStatus.UNPAID
      : paid < total ? ExpensePaymentStatus.PARTIAL
      : paid === total ? ExpensePaymentStatus.PAID
      : ExpensePaymentStatus.OVERPAID;
    return { paidAmount: formatScale4(paid), balance: formatScale4(total - paid), paymentStatus };
  }

  async update(id: string, dto: UpdateExpenseDto, userId?: string, username?: string): Promise<Expense> {
    return this.dataSource.transaction(async (manager) => {
      const expense = await lockRowForUpdate(manager, Expense, id, {
        notFoundMessage: 'Expense not found',
      });

      if (expense.documentStatus === ExpenseDocumentStatus.CANCELLED) {
        throw new BadRequestException('Cancelled expenses cannot be edited');
      }
      if (expense.paymentStatus === ExpensePaymentStatus.PAID) {
        throw new BadRequestException('Fully paid expenses cannot be edited');
      }

      if (dto.totalAmount !== undefined) {
        if (toMinorUnits(dto.totalAmount) <= 0n) {
          throw new BadRequestException('Amount must be greater than zero');
        }
        if (toMinorUnits(dto.totalAmount) < toMinorUnits(expense.paidAmount)) {
          throw new BadRequestException(
            `Amount cannot be less than the amount already paid (RM ${expense.paidAmount})`,
          );
        }
      }

      if (dto.expenseAccountId !== undefined && dto.expenseAccountId !== expense.expenseAccountId) {
        const paymentCount = await manager.getRepository(ExpensePayment).count({
          where: { expenseId: id } as any,
        });
        if (paymentCount > 0) {
          throw new BadRequestException('Expense account is locked after the first payment');
        }
        await this.assertValidExpenseAccount(dto.expenseAccountId, manager);
      }

      if (dto.expenseDate !== undefined) expense.expenseDate = dto.expenseDate;
      if (dto.payee !== undefined) expense.payee = dto.payee;
      if (dto.description !== undefined) expense.description = dto.description;
      if (dto.expenseAccountId !== undefined) expense.expenseAccountId = dto.expenseAccountId;
      if (dto.notes !== undefined) expense.notes = dto.notes;

      if (dto.totalAmount !== undefined) {
        const payments = await manager.getRepository(ExpensePayment).find({
          where: { expenseId: id } as any,
        });
        const aggregates = ExpenseService.computeAggregates(dto.totalAmount, payments);
        expense.totalAmount = formatScale4(dto.totalAmount);
        expense.paidAmount = aggregates.paidAmount;
        expense.balance = aggregates.balance;
        expense.paymentStatus = aggregates.paymentStatus;
      }

      const repo = manager.getRepository(Expense);
      const saved = await repo.save(expense);

      await this.auditLogService.log('UPDATE', 'Expense', `Updated expense: ${expense.expenseNumber}`, {
        entityId: id,
        userId: userId || 'system',
        username,
        newValues: dto as any,
      });

      return saved;
    });
  }

  async cancel(id: string, userId?: string, username?: string): Promise<Expense> {
    return this.dataSource.transaction(async (manager) => {
      const expense = await lockRowForUpdate(manager, Expense, id, {
        notFoundMessage: 'Expense not found',
      });

      if (expense.documentStatus !== ExpenseDocumentStatus.DRAFT) {
        throw new BadRequestException('Only draft expenses can be cancelled');
      }

      if (toMinorUnits(expense.paidAmount) !== 0n) {
        throw new BadRequestException('Refund all payments before cancelling this expense');
      }

      expense.documentStatus = ExpenseDocumentStatus.CANCELLED;

      const repo = manager.getRepository(Expense);
      const saved = await repo.save(expense);

      await this.auditLogService.log('CANCEL', 'Expense', `Cancelled expense: ${expense.expenseNumber}`, {
        entityId: id,
        userId: userId || 'system',
        username,
        newValues: { documentStatus: ExpenseDocumentStatus.CANCELLED },
      });

      return saved;
    });
  }

  private async assertValidExpenseAccount(accountId: string, manager: EntityManager): Promise<void> {
    const acc = await manager.getRepository(ChartOfAccount).findOne({ where: { id: accountId } as any });
    if (!acc) {
      throw new BadRequestException('Expense account not found');
    }
    if (!acc.isActive) {
      throw new BadRequestException('Expense account is not active');
    }
    if (!acc.isPostable) {
      throw new BadRequestException('Expense account is not postable');
    }
    if (acc.type !== AccountType.EXPENSE) {
      throw new BadRequestException('Expense account must be an Expense-type account');
    }
    const settings = await manager.getRepository(AccountingSettings)
      .findOne({ where: { id: true } as any });
    if (settings?.cogsAccountId && settings.cogsAccountId === accountId) {
      throw new BadRequestException(
        'Cost of Goods Sold is reserved for automatic Sales Order postings and cannot be used for a manual expense',
      );
    }
  }

  async findOne(id: string): Promise<Expense> {
    const expense = await this.expenseRepo.createQueryBuilder('e')
      .leftJoinAndSelect('e.payments', 'payments')
      .leftJoinAndSelect('e.expenseAccount', 'expenseAccount')
      .where('e.id = :id', { id })
      .orderBy('payments.paymentDate', 'ASC')
      .addOrderBy('payments.createdAt', 'ASC')
      .getOne();

    if (!expense) throw new NotFoundException('Expense not found');

    const payments = expense.payments ?? [];
    // Load methods separately with withDeleted so soft-deleted methods still
    // render on historical rows (join options can't express this).
    const methodIds = [...new Set(payments.map((p) => p.paymentMethodId))];
    if (methodIds.length) {
      const methods = await this.dataSource
        .getRepository(PaymentMethodEntity)
        .find({ where: { id: In(methodIds) } as any, withDeleted: true });
      const byId = new Map(methods.map((m) => [m.id, m]));
      for (const p of payments) {
        (p as any).paymentMethod = byId.get(p.paymentMethodId) ?? null;
      }
    }
    const refunds = payments.filter(p => p.sourcePaymentId);
    for (const p of payments) {
      if (!p.sourcePaymentId) {
        const refunded = sumMinor(refunds.filter(r => r.sourcePaymentId === p.id).map(r => r.amount));
        const remaining = toMinorUnits(p.amount) + refunded;
        (p as any).remainingRefundable = formatScale4(remaining < 0n ? 0n : remaining);
      }
    }

    return expense;
  }

  async list(params: ListExpensesParams): Promise<{ data: Expense[]; meta: { total: number; page: number; limit: number } } | Expense[]> {
    const qb = this.expenseRepo.createQueryBuilder('e')
      .leftJoinAndSelect('e.expenseAccount', 'acc');

    if (params.search) {
      qb.andWhere(
        '(e."expenseNumber" ILIKE :search OR e.description ILIKE :search OR e.payee ILIKE :search)',
        { search: `%${params.search}%` },
      );
    }
    if (params.fromDate) qb.andWhere('e."expenseDate" >= :fromDate', { fromDate: params.fromDate });
    if (params.toDate) qb.andWhere('e."expenseDate" <= :toDate', { toDate: params.toDate });
    if (params.expenseAccountId) qb.andWhere('e."expenseAccountId" = :expenseAccountId', { expenseAccountId: params.expenseAccountId });
    if (params.documentStatus) qb.andWhere('e."documentStatus" = :documentStatus', { documentStatus: params.documentStatus });
    if (params.paymentStatus) qb.andWhere('e."paymentStatus" = :paymentStatus', { paymentStatus: params.paymentStatus });

    const sortColumns: Record<string, string> = {
      expenseNumber: 'e.expenseNumber',
      expenseDate: 'e.expenseDate',
      totalAmount: 'e.totalAmount',
    };
    const sortBy = params.sortBy ?? 'expenseDate';
    const sortOrder = params.sortOrder ?? 'DESC';
    const column = sortColumns[sortBy] ?? 'e.expenseDate';
    qb.orderBy(column, sortOrder as 'ASC' | 'DESC');
    if (sortBy === 'expenseDate' && !params.sortBy) {
      qb.addOrderBy('e.createdAt', 'DESC');
    }

    if (params.page !== undefined && params.limit !== undefined) {
      const page = params.page;
      const limit = params.limit;
      qb.skip((page - 1) * limit).take(limit);
      const [data, total] = await qb.getManyAndCount();
      return { data, meta: { total, page, limit } };
    }

    return qb.getMany();
  }
}
