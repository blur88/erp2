import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  OwnerEquityTransaction,
  OwnerEquityTransactionStatus,
  OwnerEquityTransactionType,
} from '../../../database/entities/owner-equity-transaction.entity';
import { PaymentMethodEntity } from '../../../database/entities/payment-method.entity';
import { AccountingService } from './accounting.service';
import { SettingsService } from '../../settings/settings.service';
import {
  CreateOwnerEquityDto,
  UpdateOwnerEquityDto,
  QueryOwnerEquityDto,
  OwnerEquityResponseDto,
  OwnerEquityListResponseDto,
} from '../dto/owner-equity.dto';
import { AuditLogService } from '../../audit-logs/services';

@Injectable()
export class OwnerEquityService {
  private readonly logger = new Logger(OwnerEquityService.name);

  constructor(
    @InjectRepository(OwnerEquityTransaction)
    private readonly ownerEquityRepository: Repository<OwnerEquityTransaction>,
    @InjectRepository(PaymentMethodEntity)
    private readonly paymentMethodRepository: Repository<PaymentMethodEntity>,
    private readonly accountingService: AccountingService,
    private readonly settingsService: SettingsService,
    private readonly auditLogService: AuditLogService,
  ) {}

  async findAll(query: QueryOwnerEquityDto): Promise<OwnerEquityListResponseDto> {
    const {
      page: rawPage = 1,
      limit: rawLimit = 20,
      type,
      status,
      startDate,
      endDate,
      sortBy = 'referenceNumber',
      sortOrder = 'DESC',
    } = query;
    const parsedPage = Number(rawPage);
    const parsedLimit = Number(rawLimit);
    const page = Number.isFinite(parsedPage) && parsedPage > 0 ? Math.floor(parsedPage) : 1;
    const limit =
      Number.isFinite(parsedLimit) && parsedLimit > 0 ? Math.min(Math.floor(parsedLimit), 500) : 20;
    const validTypes = Object.values(OwnerEquityTransactionType);
    const validStatuses = Object.values(OwnerEquityTransactionStatus);

    const qb = this.ownerEquityRepository
      .createQueryBuilder('oet')
      .withDeleted()
      .leftJoinAndSelect('oet.paymentMethod', 'paymentMethod')
      .where('oet.deletedAt IS NULL');

    if (type && validTypes.includes(type)) {
      qb.andWhere('oet.type = :type', { type });
    }

    if (status && validStatuses.includes(status as OwnerEquityTransactionStatus)) {
      qb.andWhere('oet.status = :status', { status });
    }

    if (startDate) {
      qb.andWhere('oet.transactionDate >= :startDate', { startDate });
    }

    if (endDate) {
      qb.andWhere('oet.transactionDate <= :endDate', { endDate });
    }

    const allowedSortFields = [
      'transactionDate',
      'createdAt',
      'amount',
      'type',
      'referenceNumber',
    ];
    const safeSortBy = allowedSortFields.includes(sortBy) ? sortBy : 'referenceNumber';
    const safeSortOrder = sortOrder === 'ASC' ? 'ASC' : 'DESC';

    qb.orderBy(`oet.${safeSortBy}`, safeSortOrder).skip((page - 1) * limit).take(limit);

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

  async findOne(id: string): Promise<OwnerEquityResponseDto> {
    const transaction = await this.ownerEquityRepository.findOne({
      where: { id },
      relations: { paymentMethod: true },
      withDeleted: true,
    });

    if (!transaction || transaction.deletedAt) {
      throw new NotFoundException(`Owner equity transaction ${id} not found`);
    }

    return this.toResponseDto(transaction);
  }

  async create(
    dto: CreateOwnerEquityDto,
    userId?: string,
    username?: string,
  ): Promise<OwnerEquityResponseDto> {
    const paymentMethod = await this.paymentMethodRepository.findOne({
      where: { id: dto.paymentMethodId, isActive: true },
    });

    if (!paymentMethod || paymentMethod.deletedAt) {
      throw new NotFoundException(`Payment method ${dto.paymentMethodId} not found`);
    }

    const referenceNumber = await this.settingsService.generateDocumentNumber('Owner Equity');

    const transaction = this.ownerEquityRepository.create({
      referenceNumber,
      transactionDate: new Date(dto.transactionDate),
      type: dto.type,
      amount: dto.amount,
      paymentMethodId: dto.paymentMethodId,
      description: dto.description,
      status: OwnerEquityTransactionStatus.DRAFT,
    });

    const saved = await this.ownerEquityRepository.save(transaction);
    await this.auditLogService.log(
      'CREATE',
      'OwnerEquity',
      `Created owner equity transaction: ${saved.referenceNumber}`,
      { entityId: saved.id, userId: userId ?? 'system', username },
    );
    return this.findOne(saved.id);
  }

  async update(
    id: string,
    dto: UpdateOwnerEquityDto,
    userId?: string,
    username?: string,
  ): Promise<OwnerEquityResponseDto> {
    const transaction = await this.ownerEquityRepository.findOne({
      where: { id },
    });

    if (!transaction || transaction.deletedAt) {
      throw new NotFoundException(`Owner equity transaction ${id} not found`);
    }

    if (transaction.status !== OwnerEquityTransactionStatus.DRAFT) {
      throw new BadRequestException('Cannot update a non-draft transaction');
    }

    if (dto.paymentMethodId) {
      const paymentMethod = await this.paymentMethodRepository.findOne({
        where: { id: dto.paymentMethodId, isActive: true },
      });
      if (!paymentMethod || paymentMethod.deletedAt) {
        throw new NotFoundException(`Payment method ${dto.paymentMethodId} not found`);
      }
    }

    if (dto.transactionDate) transaction.transactionDate = new Date(dto.transactionDate);
    if (dto.type) transaction.type = dto.type;
    if (dto.amount !== undefined) transaction.amount = dto.amount;
    if (dto.paymentMethodId) transaction.paymentMethodId = dto.paymentMethodId;
    if (dto.description !== undefined) transaction.description = dto.description;

    await this.ownerEquityRepository.save(transaction);
    await this.auditLogService.log(
      'UPDATE',
      'OwnerEquity',
      `Updated owner equity transaction: ${transaction.referenceNumber}`,
      { entityId: id, userId: userId ?? 'system', username },
    );
    return this.findOne(id);
  }

  async remove(id: string, userId?: string, username?: string): Promise<void> {
    const transaction = await this.ownerEquityRepository.findOne({
      where: { id },
    });

    if (!transaction || transaction.deletedAt) {
      throw new NotFoundException(`Owner equity transaction ${id} not found`);
    }

    if (transaction.status !== OwnerEquityTransactionStatus.DRAFT) {
      throw new BadRequestException('Cannot delete a non-draft transaction');
    }

    await this.ownerEquityRepository.softDelete(id);
    await this.auditLogService.log(
      'DELETE',
      'OwnerEquity',
      `Deleted owner equity transaction: ${transaction.referenceNumber}`,
      { entityId: id, userId: userId ?? 'system', username },
    );
  }

  async post(
    id: string,
    userId?: string,
    username?: string,
  ): Promise<OwnerEquityResponseDto> {
    const transaction = await this.ownerEquityRepository.findOne({
      where: { id },
      relations: { paymentMethod: true },
      withDeleted: true,
    });

    if (!transaction || transaction.deletedAt) {
      throw new NotFoundException(`Owner equity transaction ${id} not found`);
    }

    if (transaction.status !== OwnerEquityTransactionStatus.DRAFT) {
      throw new BadRequestException('Only draft transactions can be posted');
    }

    try {
      const journalEntry = await this.accountingService.postOwnerEquityEntry(
        transaction,
        userId ?? 'system',
        username,
      );
      transaction.status = OwnerEquityTransactionStatus.POSTED;
      transaction.journalEntryId = journalEntry.id;
      await this.ownerEquityRepository.save(transaction);
      await this.auditLogService.log(
        'POST',
        'OwnerEquity',
        `Posted owner equity transaction: ${transaction.referenceNumber}`,
        { entityId: id, userId: userId ?? 'system', username },
      );
    } catch (error) {
      this.logger.error(
        `Failed to post owner equity entry for ${transaction.referenceNumber}: ${error.message}`,
      );
      throw error;
    }

    return this.findOne(id);
  }

  async reverse(
    id: string,
    userId?: string,
    username?: string,
  ): Promise<OwnerEquityResponseDto> {
    const transaction = await this.ownerEquityRepository.findOne({
      where: { id },
      relations: { paymentMethod: true },
      withDeleted: true,
    });

    if (!transaction || transaction.deletedAt) {
      throw new NotFoundException(`Owner equity transaction ${id} not found`);
    }

    if (transaction.status !== OwnerEquityTransactionStatus.POSTED) {
      throw new BadRequestException('Transaction is not posted');
    }

    await this.accountingService.reverseSourceEntries(
      'owner_equity_transaction',
      id,
      userId ?? 'system',
    );

    transaction.status = OwnerEquityTransactionStatus.REVERSED;
    await this.ownerEquityRepository.save(transaction);

    await this.auditLogService.log(
      'REVERSE',
      'OwnerEquity',
      `Reversed owner equity transaction: ${transaction.referenceNumber}`,
      { entityId: id, userId: userId ?? 'system', username },
    );

    return this.findOne(id);
  }

  private toResponseDto(transaction: OwnerEquityTransaction): OwnerEquityResponseDto {
    return {
      id: transaction.id,
      referenceNumber: transaction.referenceNumber,
      transactionDate: transaction.transactionDate,
      type: transaction.type,
      amount: Number(transaction.amount),
      paymentMethodId: transaction.paymentMethodId,
      paymentMethod: transaction.paymentMethod
        ? {
            id: transaction.paymentMethod.id,
            code: transaction.paymentMethod.code,
            name: transaction.paymentMethod.name,
          }
        : undefined,
      description: transaction.description,
      status: transaction.status,
      journalEntryId: transaction.journalEntryId,
      createdAt: transaction.createdAt,
      updatedAt: transaction.updatedAt,
    };
  }
}
