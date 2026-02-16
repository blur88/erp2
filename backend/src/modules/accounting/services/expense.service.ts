import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Expense, ExpenseStatus } from '../../../database/entities/expense.entity';
import { PaymentMethodEntity } from '../../../database/entities/payment-method.entity';
import {
  ChartOfAccount,
  AccountType,
} from '../../../database/entities/chart-of-account.entity';
import { AccountingService } from './accounting.service';
import {
  CreateExpenseDto,
  UpdateExpenseDto,
  QueryExpenseDto,
  BulkExpenseDto,
  ExpenseResponseDto,
  ExpenseListResponseDto,
} from '../dto/expense.dto';

@Injectable()
export class ExpenseService {
  private readonly logger = new Logger(ExpenseService.name);

  constructor(
    @InjectRepository(Expense)
    private readonly expenseRepository: Repository<Expense>,
    @InjectRepository(PaymentMethodEntity)
    private readonly paymentMethodRepository: Repository<PaymentMethodEntity>,
    @InjectRepository(ChartOfAccount)
    private readonly chartOfAccountRepository: Repository<ChartOfAccount>,
    private readonly accountingService: AccountingService,
  ) {}

  async findAll(query: QueryExpenseDto): Promise<ExpenseListResponseDto> {
    const {
      page = 1,
      limit = 20,
      expenseAccountId,
      paymentMethodId,
      status,
      startDate,
      endDate,
      search,
      sortBy = 'expenseDate',
      sortOrder = 'DESC',
    } = query;

    const qb = this.expenseRepository
      .createQueryBuilder('e')
      .leftJoinAndSelect('e.paymentMethod', 'paymentMethod')
      .leftJoinAndSelect('e.expenseAccount', 'expenseAccount')
      .where('e.deletedAt IS NULL');

    if (expenseAccountId) {
      qb.andWhere('e.expenseAccountId = :expenseAccountId', { expenseAccountId });
    }

    if (paymentMethodId) {
      qb.andWhere('e.paymentMethodId = :paymentMethodId', { paymentMethodId });
    }

    if (status) {
      qb.andWhere('e.status = :status', { status });
    }

    if (startDate) {
      qb.andWhere('e.expenseDate >= :startDate', { startDate });
    }

    if (endDate) {
      qb.andWhere('e.expenseDate <= :endDate', { endDate });
    }

    if (search) {
      qb.andWhere(
        '(e.description ILIKE :search OR e.vendor ILIKE :search OR e.referenceNumber ILIKE :search)',
        { search: `%${search}%` },
      );
    }

    const allowedSortFields = ['expenseDate', 'createdAt', 'amount', 'vendor'];
    const safeSortBy = allowedSortFields.includes(sortBy) ? sortBy : 'expenseDate';
    const safeSortOrder = sortOrder === 'ASC' ? 'ASC' : 'DESC';

    qb.orderBy(`e.${safeSortBy}`, safeSortOrder).skip((page - 1) * limit).take(limit);

    const [rows, total] = await qb.getManyAndCount();

    return {
      data: rows.map((row) => this.toResponseDto(row)),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: string): Promise<ExpenseResponseDto> {
    const expense = await this.expenseRepository.findOne({
      where: { id },
      relations: ['paymentMethod', 'expenseAccount'],
    });

    if (!expense || expense.deletedAt) {
      throw new NotFoundException(`Expense ${id} not found`);
    }

    return this.toResponseDto(expense);
  }

  async create(dto: CreateExpenseDto, userId = 'system'): Promise<ExpenseResponseDto> {
    void userId;
    const paymentMethod = await this.paymentMethodRepository.findOne({
      where: { id: dto.paymentMethodId, isActive: true },
    });

    if (!paymentMethod || paymentMethod.deletedAt) {
      throw new NotFoundException(`Payment method ${dto.paymentMethodId} not found`);
    }

    const account = await this.chartOfAccountRepository.findOne({
      where: { id: dto.expenseAccountId, isActive: true },
    });

    if (!account || account.deletedAt) {
      throw new NotFoundException(`Account ${dto.expenseAccountId} not found`);
    }

    if (account.type !== AccountType.EXPENSE) {
      throw new BadRequestException(
        `Account ${account.code} (${account.name}) is not an expense account`,
      );
    }

    const expense = this.expenseRepository.create({
      expenseDate: new Date(dto.expenseDate),
      expenseAccountId: dto.expenseAccountId,
      amount: dto.amount,
      paymentMethodId: dto.paymentMethodId,
      description: dto.description,
      vendor: dto.vendor,
      status: ExpenseStatus.DRAFT,
    });

    const saved = await this.expenseRepository.save(expense);
    return this.findOne(saved.id);
  }

  async update(
    id: string,
    dto: UpdateExpenseDto,
    userId = 'system',
  ): Promise<ExpenseResponseDto> {
    void userId;
    const expense = await this.expenseRepository.findOne({
      where: { id },
    });

    if (!expense || expense.deletedAt) {
      throw new NotFoundException(`Expense ${id} not found`);
    }

    if (expense.status === ExpenseStatus.POSTED) {
      throw new BadRequestException('Cannot update a posted expense');
    }

    if (dto.paymentMethodId) {
      const paymentMethod = await this.paymentMethodRepository.findOne({
        where: { id: dto.paymentMethodId, isActive: true },
      });
      if (!paymentMethod || paymentMethod.deletedAt) {
        throw new NotFoundException(`Payment method ${dto.paymentMethodId} not found`);
      }
    }

    if (dto.expenseAccountId) {
      const account = await this.chartOfAccountRepository.findOne({
        where: { id: dto.expenseAccountId, isActive: true },
      });
      if (!account || account.deletedAt) {
        throw new NotFoundException(`Account ${dto.expenseAccountId} not found`);
      }
      if (account.type !== AccountType.EXPENSE) {
        throw new BadRequestException(
          `Account ${account.code} (${account.name}) is not an expense account`,
        );
      }
    }

    if (dto.expenseDate) expense.expenseDate = new Date(dto.expenseDate);
    if (dto.expenseAccountId) expense.expenseAccountId = dto.expenseAccountId;
    if (dto.amount !== undefined) expense.amount = dto.amount;
    if (dto.paymentMethodId) expense.paymentMethodId = dto.paymentMethodId;
    if (dto.description !== undefined) expense.description = dto.description;
    if (dto.vendor !== undefined) expense.vendor = dto.vendor;

    await this.expenseRepository.save(expense);
    return this.findOne(id);
  }

  async remove(id: string): Promise<void> {
    const expense = await this.expenseRepository.findOne({
      where: { id },
    });

    if (!expense || expense.deletedAt) {
      throw new NotFoundException(`Expense ${id} not found`);
    }

    if (expense.status === ExpenseStatus.POSTED) {
      throw new BadRequestException('Cannot delete a posted expense');
    }

    await this.expenseRepository.softDelete(id);
  }

  async post(id: string, userId = 'system'): Promise<ExpenseResponseDto> {
    const expense = await this.expenseRepository.findOne({
      where: { id },
      relations: ['paymentMethod', 'expenseAccount'],
    });

    if (!expense || expense.deletedAt) {
      throw new NotFoundException(`Expense ${id} not found`);
    }

    if (expense.status === ExpenseStatus.POSTED) {
      throw new BadRequestException('Expense is already posted');
    }

    try {
      const journalEntry = await this.accountingService.postExpenseEntry(expense, userId);
      expense.status = ExpenseStatus.POSTED;
      expense.journalEntryId = journalEntry.id;
      await this.expenseRepository.save(expense);
    } catch (error) {
      this.logger.error(
        `Failed to post expense entry for ${expense.referenceNumber}: ${error.message}`,
      );
      throw error;
    }

    return this.findOne(id);
  }

  async bulkPost(
    dto: BulkExpenseDto,
    userId = 'system',
  ): Promise<{ posted: number; failed: number }> {
    let posted = 0;
    let failed = 0;

    for (const id of dto.ids) {
      try {
        await this.post(id, userId);
        posted++;
      } catch (error) {
        this.logger.error(`Failed to post expense ${id}: ${error.message}`);
        failed++;
      }
    }

    return { posted, failed };
  }

  async bulkDelete(dto: BulkExpenseDto): Promise<{ deleted: number; failed: number }> {
    let deleted = 0;
    let failed = 0;

    for (const id of dto.ids) {
      try {
        await this.remove(id);
        deleted++;
      } catch (error) {
        this.logger.error(`Failed to delete expense ${id}: ${error.message}`);
        failed++;
      }
    }

    return { deleted, failed };
  }

  private toResponseDto(expense: Expense): ExpenseResponseDto {
    return {
      id: expense.id,
      referenceNumber: expense.referenceNumber,
      expenseDate: expense.expenseDate,
      expenseAccountId: expense.expenseAccountId,
      expenseAccount: expense.expenseAccount
        ? {
            id: expense.expenseAccount.id,
            code: expense.expenseAccount.code,
            name: expense.expenseAccount.name,
          }
        : undefined,
      amount: Number(expense.amount),
      paymentMethodId: expense.paymentMethodId,
      paymentMethod: expense.paymentMethod
        ? {
            id: expense.paymentMethod.id,
            code: expense.paymentMethod.code,
            name: expense.paymentMethod.name,
          }
        : undefined,
      description: expense.description,
      vendor: expense.vendor,
      status: expense.status,
      journalEntryId: expense.journalEntryId,
      createdAt: expense.createdAt,
      updatedAt: expense.updatedAt,
    };
  }
}
