import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, EntityManager } from 'typeorm';
import { Expense, ExpenseDocumentStatus, ExpensePaymentStatus } from '../entities/expense.entity';
import { ExpensePayment } from '../entities/expense-payment.entity';
import { ChartOfAccount } from '../entities/chart-of-account.entity';
import { AccountType } from '../entities/account-type.enum';
import { AuditLogService } from '../../audit-logs/services';
import { SettingsService } from '../../settings/settings.service';
import { CreateExpenseDto, ListExpensesParams } from '../dto/create-expense.dto';
import { toMinorUnits, formatScale4, sumMinor } from '../utils/money';

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
  }

  async findOne(id: string): Promise<Expense> {
    const expense = await this.expenseRepo.createQueryBuilder('e')
      .leftJoinAndSelect('e.payments', 'payments')
      .leftJoinAndSelect('payments.paymentMethod', 'paymentMethod', undefined, { withDeleted: true })
      .leftJoinAndSelect('e.expenseAccount', 'expenseAccount')
      .where('e.id = :id', { id })
      .orderBy('payments.paymentDate', 'ASC')
      .addOrderBy('payments.createdAt', 'ASC')
      .getOne();

    if (!expense) throw new NotFoundException('Expense not found');

    const payments = expense.payments ?? [];
    const refunds = payments.filter(p => p.sourcePaymentId);
    for (const p of payments) {
      if (!p.sourcePaymentId) {
        const refunded = sumMinor(refunds.filter(r => r.sourcePaymentId === p.id).map(r => r.amount));
        (p as any).remainingRefundable = formatScale4(toMinorUnits(p.amount) - refunded);
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
