import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
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
    private readonly dataSource: DataSource,
  ) {}

  private getAccountingTransferPoster(): (
    transfer: FundTransfer,
    currentUserId: string,
    currentUsername?: string,
  ) => Promise<{ id: string }> {
    const candidate = (
      this.accountingService as Partial<{
        postFundTransferEntry: (
          transfer: FundTransfer,
          currentUserId: string,
          currentUsername?: string,
        ) => Promise<{ id: string }>;
      }>
    ).postFundTransferEntry;

    if (typeof candidate !== 'function') {
      throw new BadRequestException(
        'Fund transfer journal entry posting is not available',
      );
    }

    return candidate.bind(this.accountingService);
  }

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

    let savedTransfer!: FundTransfer;
    const postFundTransferEntry = this.getAccountingTransferPoster();
    await this.dataSource.transaction(async (manager) => {
      const transfer = manager.create(FundTransfer, {
        referenceNumber,
        transferDate: new Date(dto.transferDate),
        sourceAccountId: dto.sourceAccountId,
        destinationAccountId: dto.destinationAccountId,
        amount: dto.amount,
        description: dto.description,
        status: FundTransferStatus.ACTIVE,
        fiscalPeriodId: periodValidation.period.id,
        journalEntryId: null,
      });

      savedTransfer = await manager.save(FundTransfer, transfer);
      let postedJournalEntryId: string | null = null;

      try {
        const postedJournalEntry = await postFundTransferEntry(
          savedTransfer,
          userId,
          username,
        );
        postedJournalEntryId = postedJournalEntry.id;
        savedTransfer.journalEntryId = postedJournalEntryId;
        await manager.save(FundTransfer, savedTransfer);
      } catch (error) {
        if (savedTransfer.id && postedJournalEntryId) {
          try {
            await this.accountingService.reverseSourceEntries(
              'fund_transfer',
              savedTransfer.id,
              userId,
            );
          } catch (cleanupError) {
            this.logger.error(
              `Failed to reverse orphaned journal entry for fund transfer ${savedTransfer.id}`,
              cleanupError instanceof Error
                ? cleanupError.stack
                : String(cleanupError),
            );
          }
        }

        throw error;
      }
    });

    await this.auditLogService.log(
      'CREATE',
      'FundTransfer',
      `Created fund transfer: ${referenceNumber}`,
      { entityId: savedTransfer.id, userId, username },
    );

    this.logger.log(`Fund transfer created: ${referenceNumber}`);
    return this.findOne(savedTransfer.id);
  }

  async cancel(
    id: string,
    userId: string,
    username?: string,
  ): Promise<FundTransferResponseDto> {
    const transfer = await this.transferRepository.findOne({ where: { id } });
    if (!transfer || transfer.deletedAt) {
      throw new NotFoundException(`Fund transfer '${id}' not found`);
    }

    if (transfer.status === FundTransferStatus.CANCELLED) {
      throw new BadRequestException(
        `Fund transfer '${transfer.referenceNumber}' is already cancelled`,
      );
    }

    if (!transfer.journalEntryId) {
      throw new BadRequestException(
        'Cannot cancel transfer — journal entry was not posted. This should not happen if transaction wrapping is in place.',
      );
    }

    await this.accountingService.reverseSourceEntries('fund_transfer', id, userId);

    transfer.status = FundTransferStatus.CANCELLED;
    await this.transferRepository.save(transfer);

    await this.auditLogService.log(
      'CANCEL',
      'FundTransfer',
      `Cancelled fund transfer: ${transfer.referenceNumber}`,
      { entityId: id, userId, username },
    );

    this.logger.log(`Fund transfer cancelled: ${transfer.referenceNumber}`);
    return this.findOne(id);
  }

  async findAll(query: QueryFundTransfersDto): Promise<FundTransferListResponseDto> {
    const {
      page = 1,
      limit = 20,
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
      qb.andWhere('transfer.sourceAccountId = :sourceAccountId', {
        sourceAccountId,
      });
    }
    if (destinationAccountId) {
      qb.andWhere('transfer.destinationAccountId = :destinationAccountId', {
        destinationAccountId,
      });
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

    const validSortFields = [
      'transferDate',
      'referenceNumber',
      'amount',
      'createdAt',
    ];
    const safeSortField = validSortFields.includes(sortBy)
      ? sortBy
      : 'transferDate';
    const safeSortOrder = sortOrder?.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    qb.orderBy(`transfer.${safeSortField}`, safeSortOrder)
      .skip((page - 1) * limit)
      .take(limit);

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

  async findOne(id: string): Promise<FundTransferResponseDto> {
    const transfer = await this.transferRepository.findOne({
      where: { id },
      relations: ['sourceAccount', 'destinationAccount', 'journalEntry'],
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
      return {
        id: account.id,
        code: account.code,
        name: account.name,
        type: account.type,
      };
    }

    this.logger.warn(
      `Fund transfer '${transfer.id}' is missing ${relationName} relation data during response mapping`,
    );

    const fallbackId =
      relationName === 'sourceAccount'
        ? transfer.sourceAccountId
        : transfer.destinationAccountId;

    return {
      id: fallbackId ?? '',
      code: '',
      name: '',
      type: '',
    };
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
      sourceAccount: this.buildAccountSummary(
        transfer.sourceAccount,
        'sourceAccount',
        transfer,
      ),
      destinationAccount: this.buildAccountSummary(
        transfer.destinationAccount,
        'destinationAccount',
        transfer,
      ),
      journalEntry: transfer.journalEntry
        ? {
            id: transfer.journalEntry.id,
            referenceNumber: transfer.journalEntry.referenceNumber,
            status: transfer.journalEntry.status,
          }
        : undefined,
      createdAt: transfer.createdAt,
      updatedAt: transfer.updatedAt,
    };
  }
}
