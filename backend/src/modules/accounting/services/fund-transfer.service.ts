import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Not, Repository } from 'typeorm';
import { applyPagination } from '../../../common/pagination/apply-pagination';
import {
  FundTransfer,
  FundTransferStatus,
} from '../../../database/entities/fund-transfer.entity';
import { ChartOfAccount } from '../../../database/entities/chart-of-account.entity';
import { AccountingService } from './accounting.service';
import { FiscalPeriodService } from './fiscal-period.service';
import { SettingsService } from '../../settings/settings.service';
import { AuditLogService } from '../../audit-logs/services';
import {
  CreateFundTransferDto,
  UpdateFundTransferDto,
  FundTransferListResponseDto,
  FundTransferResponseDto,
  QueryFundTransfersDto,
} from '../dto/fund-transfer.dto';

@Injectable()
export class FundTransferService {
  private readonly logger = new Logger(FundTransferService.name);

  constructor(
    @InjectRepository(FundTransfer)
    private readonly transferRepository: Repository<FundTransfer>,
    @InjectRepository(ChartOfAccount)
    private readonly coaRepository: Repository<ChartOfAccount>,
    private readonly accountingService: AccountingService,
    private readonly fiscalPeriodService: FiscalPeriodService,
    private readonly settingsService: SettingsService,
    private readonly auditLogService: AuditLogService,
  ) {}

  async create(
    dto: CreateFundTransferDto,
    userId: string,
    username?: string,
  ): Promise<FundTransferResponseDto> {
    if (dto.sourceAccountId === dto.destinationAccountId) {
      throw new BadRequestException(
        'Source and destination accounts must be different',
      );
    }

    const sourceAccount = await this.coaRepository.findOne({
      where: { id: dto.sourceAccountId },
    });
    if (!sourceAccount || !sourceAccount.isActive || sourceAccount.deletedAt) {
      throw new NotFoundException(
        `Source account '${dto.sourceAccountId}' not found or inactive`,
      );
    }
    if (!sourceAccount.isCashEquivalent) {
      throw new BadRequestException(
        `Source account '${sourceAccount.name}' is not marked as a cash/bank account eligible for transfers`,
      );
    }

    const destinationAccount = await this.coaRepository.findOne({
      where: { id: dto.destinationAccountId },
    });
    if (
      !destinationAccount ||
      !destinationAccount.isActive ||
      destinationAccount.deletedAt
    ) {
      throw new NotFoundException(
        `Destination account '${dto.destinationAccountId}' not found or inactive`,
      );
    }
    if (!destinationAccount.isCashEquivalent) {
      throw new BadRequestException(
        `Destination account '${destinationAccount.name}' is not marked as a cash/bank account eligible for transfers`,
      );
    }

    if (dto.amount <= 0) {
      throw new BadRequestException('Transfer amount must be greater than zero');
    }

    const periodValidation = await this.fiscalPeriodService.validatePeriod({
      date: new Date(dto.transferDate),
    });
    if (!periodValidation.isValid || !periodValidation.period) {
      throw new BadRequestException(
        `No open fiscal period found for date ${dto.transferDate}. Please open a fiscal period first.`,
      );
    }

    const referenceNumber = await this.settingsService.generateDocumentNumber(
      'Fund Transfers',
    );

    const transfer = this.transferRepository.create({
      referenceNumber,
      transferDate: new Date(dto.transferDate),
      sourceAccountId: dto.sourceAccountId,
      destinationAccountId: dto.destinationAccountId,
      amount: dto.amount,
      description: dto.description,
      status: FundTransferStatus.DRAFT,
      fiscalPeriodId: periodValidation.period.id,
      journalEntryId: undefined,
    });

    const saved = await this.transferRepository.save(transfer);

    await this.auditLogService.log(
      'CREATE',
      'FundTransfer',
      `Created fund transfer: ${referenceNumber}`,
      { entityId: saved.id, userId, username },
    );

    this.logger.log(`Fund transfer created (draft): ${referenceNumber}`);
    return this.findOne(saved.id);
  }

  async post(
    id: string,
    userId: string,
    username?: string,
  ): Promise<FundTransferResponseDto> {
    const transfer = await this.transferRepository.findOne({
      where: { id },
      relations: { sourceAccount: true, destinationAccount: true },
    });
    if (!transfer || transfer.deletedAt) {
      throw new NotFoundException(`Fund transfer '${id}' not found`);
    }
    if (transfer.status !== FundTransferStatus.DRAFT && transfer.status !== FundTransferStatus.REVERSED) {
      throw new BadRequestException(
        `Fund transfer '${transfer.referenceNumber}' must be in DRAFT or REVERSED status to post`,
      );
    }

    const journalEntry = await this.accountingService.postFundTransferEntry(
      transfer,
      userId,
      username,
    );

    transfer.status = FundTransferStatus.POSTED;
    transfer.journalEntryId = journalEntry.id;
    await this.transferRepository.save(transfer);

    await this.auditLogService.log(
      'POST',
      'FundTransfer',
      `Posted fund transfer: ${transfer.referenceNumber}`,
      { entityId: id, userId, username },
    );

    this.logger.log(`Fund transfer posted: ${transfer.referenceNumber}`);
    return this.findOne(id);
  }

  async unpost(
    id: string,
    userId: string,
    username?: string,
  ): Promise<FundTransferResponseDto> {
    const transfer = await this.transferRepository.findOne({ where: { id } });
    if (!transfer || transfer.deletedAt) {
      throw new NotFoundException(`Fund transfer '${id}' not found`);
    }
    if (transfer.status !== FundTransferStatus.POSTED) {
      throw new BadRequestException(
        `Fund transfer '${transfer.referenceNumber}' must be in POSTED status to unpost`,
      );
    }

    await this.accountingService.reverseSourceEntries('fund_transfer', id, userId);

    transfer.status = FundTransferStatus.REVERSED;
    await this.transferRepository.save(transfer);

    await this.auditLogService.log(
      'UNPOST',
      'FundTransfer',
      `Unposted fund transfer: ${transfer.referenceNumber}`,
      { entityId: id, userId, username },
    );

    this.logger.log(`Fund transfer unposted: ${transfer.referenceNumber}`);
    return this.findOne(id);
  }

  async update(
    id: string,
    dto: UpdateFundTransferDto,
    userId: string,
    username?: string,
  ): Promise<FundTransferResponseDto> {
    const transfer = await this.transferRepository.findOne({ where: { id } });
    if (!transfer || transfer.deletedAt) {
      throw new NotFoundException(`Fund transfer '${id}' not found`);
    }
    if (transfer.status === FundTransferStatus.POSTED) {
      throw new BadRequestException('Cannot update a posted fund transfer');
    }

    if (dto.sourceAccountId) {
      const src = await this.coaRepository.findOne({
        where: { id: dto.sourceAccountId },
      });
      if (!src || !src.isActive || src.deletedAt) {
        throw new NotFoundException(
          `Source account '${dto.sourceAccountId}' not found or inactive`,
        );
      }
      if (!src.isCashEquivalent) {
        throw new BadRequestException(
          `Source account '${src.name}' is not a cash/bank account`,
        );
      }
      transfer.sourceAccountId = dto.sourceAccountId;
    }

    if (dto.destinationAccountId) {
      const dest = await this.coaRepository.findOne({
        where: { id: dto.destinationAccountId },
      });
      if (!dest || !dest.isActive || dest.deletedAt) {
        throw new NotFoundException(
          `Destination account '${dto.destinationAccountId}' not found or inactive`,
        );
      }
      if (!dest.isCashEquivalent) {
        throw new BadRequestException(
          `Destination account '${dest.name}' is not a cash/bank account`,
        );
      }
      transfer.destinationAccountId = dto.destinationAccountId;
    }

    if (
      (dto.sourceAccountId ?? transfer.sourceAccountId) ===
      (dto.destinationAccountId ?? transfer.destinationAccountId)
    ) {
      throw new BadRequestException(
        'Source and destination accounts must be different',
      );
    }

    if (dto.amount !== undefined) {
      if (dto.amount <= 0) {
        throw new BadRequestException('Transfer amount must be greater than zero');
      }
      transfer.amount = dto.amount;
    }

    if (dto.transferDate) {
      const periodValidation = await this.fiscalPeriodService.validatePeriod({
        date: new Date(dto.transferDate),
      });
      if (!periodValidation.isValid || !periodValidation.period) {
        throw new BadRequestException(
          `No open fiscal period found for date ${dto.transferDate}.`,
        );
      }
      transfer.transferDate = new Date(dto.transferDate);
      transfer.fiscalPeriodId = periodValidation.period.id;
    }

    if (dto.description !== undefined) {
      transfer.description = dto.description;
    }

    await this.transferRepository.save(transfer);

    await this.auditLogService.log(
      'UPDATE',
      'FundTransfer',
      `Updated fund transfer: ${transfer.referenceNumber}`,
      { entityId: id, userId, username },
    );

    return this.findOne(id);
  }

  async remove(
    id: string,
    userId: string,
    username?: string,
  ): Promise<void> {
    const transfer = await this.transferRepository.findOne({ where: { id } });
    if (!transfer || transfer.deletedAt) {
      throw new NotFoundException(`Fund transfer '${id}' not found`);
    }
    if (transfer.status === FundTransferStatus.POSTED) {
      throw new BadRequestException('Cannot delete a posted fund transfer');
    }

    await this.transferRepository.softDelete(id);

    await this.auditLogService.log(
      'DELETE',
      'FundTransfer',
      `Deleted fund transfer: ${transfer.referenceNumber}`,
      { entityId: id, userId, username },
    );
  }

  async getDeleted(): Promise<FundTransferResponseDto[]> {
    const records = await this.transferRepository.find({
      withDeleted: true,
      where: { deletedAt: Not(IsNull()) },
      relations: { sourceAccount: true, destinationAccount: true, journalEntry: true },
      order: { deletedAt: 'DESC' },
    });
    return records.map((r) => this.toResponseDto(r));
  }

  async restore(
    id: string,
    userId: string,
    username?: string,
  ): Promise<FundTransferResponseDto> {
    const transfer = await this.transferRepository.findOne({
      where: { id },
      withDeleted: true,
    });
    if (!transfer) {
      throw new NotFoundException(`Fund transfer '${id}' not found`);
    }
    if (!transfer.deletedAt) {
      throw new BadRequestException('Fund transfer is not deleted');
    }

    await this.transferRepository.restore(id);

    await this.auditLogService.log(
      'RESTORE',
      'FundTransfer',
      `Restored fund transfer: ${transfer.referenceNumber}`,
      { entityId: id, userId, username },
    );

    return this.findOne(id);
  }

  async permanentDelete(
    id: string,
    userId: string,
    username?: string,
  ): Promise<void> {
    const transfer = await this.transferRepository.findOne({
      where: { id },
      withDeleted: true,
    });
    if (!transfer) {
      throw new NotFoundException(`Fund transfer '${id}' not found`);
    }
    if (!transfer.deletedAt) {
      throw new BadRequestException(
        'Fund transfer must be soft-deleted before permanent deletion',
      );
    }

    await this.transferRepository.delete(id);

    await this.auditLogService.log(
      'DELETE',
      'FundTransfer',
      `Permanently deleted fund transfer: ${transfer.referenceNumber}`,
      { entityId: id, userId, username },
    );
  }

  async findAll(query: QueryFundTransfersDto): Promise<FundTransferListResponseDto> {
    const {
      page,
      limit,
      startDate,
      endDate,
      sourceAccountId,
      destinationAccountId,
      status,
      search,
      sortBy = 'transferDate',
      sortOrder = 'DESC',
    } = query;

    const qb = this.transferRepository
      .createQueryBuilder('transfer')
      .leftJoinAndSelect('transfer.sourceAccount', 'sourceAccount')
      .leftJoinAndSelect('transfer.destinationAccount', 'destinationAccount')
      .leftJoinAndSelect('transfer.journalEntry', 'journalEntry')
      .where('transfer.deletedAt IS NULL');

    if (startDate) {
      qb.andWhere('transfer.transferDate >= :startDate', { startDate });
    }
    if (endDate) {
      qb.andWhere('transfer.transferDate <= :endDate', { endDate });
    }
    if (sourceAccountId) {
      qb.andWhere('transfer.sourceAccountId = :sourceAccountId', { sourceAccountId });
    }
    if (destinationAccountId) {
      qb.andWhere('transfer.destinationAccountId = :destinationAccountId', { destinationAccountId });
    }
    if (status) {
      qb.andWhere('transfer.status = :status', { status });
    }
    if (search) {
      qb.andWhere(
        '(transfer.referenceNumber ILIKE :search OR transfer.description ILIKE :search)',
        { search: `%${search}%` },
      );
    }

    const validSortFields = ['transferDate', 'referenceNumber', 'amount', 'createdAt'];
    const safeSortField = validSortFields.includes(sortBy) ? sortBy : 'transferDate';
    const safeSortOrder = sortOrder?.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    const shouldPaginate = page !== undefined && limit !== undefined;
    qb.orderBy(`transfer.${safeSortField}`, safeSortOrder);
    applyPagination(qb, page, limit);

    const [rows, total] = await qb.getManyAndCount();

    return {
      data: rows.map((row) => this.toResponseDto(row)),
      meta: { page, limit, total, totalPages: shouldPaginate ? Math.ceil(total / limit) : 1 },
    };
  }

  async findOne(id: string): Promise<FundTransferResponseDto> {
    const transfer = await this.transferRepository.findOne({
      where: { id },
      relations: { sourceAccount: true, destinationAccount: true, journalEntry: { lines: { account: true } } },
    });

    if (!transfer || transfer.deletedAt) {
      throw new NotFoundException(`Fund transfer '${id}' not found`);
    }

    return this.toResponseDto(transfer);
  }

  private buildAccountSummary(
    account: ChartOfAccount | undefined,
    relationName: 'sourceAccount' | 'destinationAccount',
    transfer: FundTransfer,
  ): FundTransferResponseDto['sourceAccount'] {
    if (account) {
      return { id: account.id, code: account.code, name: account.name, type: account.type };
    }

    this.logger.warn(
      `Fund transfer '${transfer.id}' is missing ${relationName} relation data during response mapping`,
    );

    const fallbackId =
      relationName === 'sourceAccount'
        ? transfer.sourceAccountId
        : transfer.destinationAccountId;

    return { id: fallbackId ?? '', code: '', name: '', type: '' };
  }

  private toResponseDto(transfer: FundTransfer): FundTransferResponseDto {
    return {
      id: transfer.id,
      referenceNumber: transfer.referenceNumber,
      transferDate: transfer.transferDate,
      amount: Number(transfer.amount),
      description: transfer.description,
      status: transfer.status,
      fiscalPeriodId: transfer.fiscalPeriodId,
      journalEntryId: transfer.journalEntryId ?? null,
      sourceAccount: this.buildAccountSummary(transfer.sourceAccount, 'sourceAccount', transfer),
      destinationAccount: this.buildAccountSummary(transfer.destinationAccount, 'destinationAccount', transfer),
      journalEntry: transfer.journalEntry
        ? {
            id: transfer.journalEntry.id,
            referenceNumber: transfer.journalEntry.referenceNumber,
            status: transfer.journalEntry.status,
            lines: transfer.journalEntry.lines?.map((line) => ({
              accountCode: line.account?.code ?? '',
              accountName: line.account?.name ?? '',
              debitAmount: Number(line.debitAmount),
              creditAmount: Number(line.creditAmount),
              memo: line.memo,
            })),
          }
        : undefined,
      createdAt: transfer.createdAt,
      updatedAt: transfer.updatedAt,
      deletedAt: transfer.deletedAt ?? null,
    };
  }
}
