import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Not, Repository } from 'typeorm';
import { applyPagination } from '../../../common/pagination/apply-pagination';
import { Settlement, SettlementStatus } from '../../../database/entities/settlement.entity';
import { PaymentMethodEntity } from '../../../database/entities/payment-method.entity';
import { Payment, SettlementStatusEnum } from '../../../database/entities/payment.entity';
import {
  CreateSettlementDto,
  UpdateSettlementDto,
  QuerySettlementsDto,
  SettlementListResponseDto,
  SettlementResponseDto,
  PendingPaymentsSummaryDto,
} from '../dto/settlement.dto';
import { AccountingService } from './accounting.service';
import { SettingsService } from '../../settings/settings.service';
import { AuditLogService } from '../../audit-logs/services';

@Injectable()
export class SettlementService {
  private readonly logger = new Logger(SettlementService.name);

  constructor(
    @InjectRepository(Settlement)
    private readonly settlementRepository: Repository<Settlement>,
    @InjectRepository(PaymentMethodEntity)
    private readonly paymentMethodRepository: Repository<PaymentMethodEntity>,
    @InjectRepository(Payment)
    private readonly paymentRepository: Repository<Payment>,
    private readonly accountingService: AccountingService,
    private readonly settingsService: SettingsService,
    private readonly auditLogService: AuditLogService,
  ) {}

  async findAll(query: QuerySettlementsDto): Promise<SettlementListResponseDto> {
    const {
      page,
      limit,
      paymentMethodId,
      status,
      sortBy = 'settlementDate',
      sortOrder = 'DESC',
    } = query;

    const qb = this.settlementRepository
      .createQueryBuilder('s')
      .leftJoinAndSelect('s.paymentMethod', 'paymentMethod')
      .where('s.deletedAt IS NULL');

    if (paymentMethodId) {
      qb.andWhere('s.paymentMethodId = :paymentMethodId', { paymentMethodId });
    }

    if (status) {
      qb.andWhere('s.status = :status', { status });
    }

    const allowedSortFields = ['settlementDate', 'createdAt', 'totalAmount'];
    const safeSortBy = allowedSortFields.includes(sortBy) ? sortBy : 'settlementDate';
    const safeSortOrder = sortOrder === 'ASC' ? 'ASC' : 'DESC';

    const shouldPaginate = page !== undefined && limit !== undefined;
    qb.orderBy(`s.${safeSortBy}`, safeSortOrder);
    applyPagination(qb, page, limit);

    const [rows, total] = await qb.getManyAndCount();
    const data = await Promise.all(rows.map((row) => this.toResponseDto(row)));

    return {
      data,
      meta: {
        page,
        limit,
        total,
        totalPages: shouldPaginate ? Math.ceil(total / limit) : 1,
      },
    };
  }

  async findOne(id: string): Promise<SettlementResponseDto> {
    const settlement = await this.settlementRepository.findOne({
      where: { id },
      relations: { paymentMethod: true },
    });

    if (!settlement || settlement.deletedAt) {
      throw new NotFoundException(`Settlement ${id} not found`);
    }

    return this.toResponseDto(settlement);
  }

  async create(
    dto: CreateSettlementDto,
    userId?: string,
    username?: string,
  ): Promise<SettlementResponseDto> {
    const paymentMethod = await this.paymentMethodRepository.findOne({
      where: { id: dto.paymentMethodId, isActive: true },
    });

    if (!paymentMethod || paymentMethod.deletedAt) {
      throw new NotFoundException(`Payment method ${dto.paymentMethodId} not found`);
    }

    if (!paymentMethod.requiresSettlement) {
      throw new BadRequestException('Selected payment method does not require settlement');
    }

    if (!dto.paymentIds.length) {
      throw new BadRequestException('At least one payment must be selected');
    }

    const payments = await this.paymentRepository.find({
      where: { id: In(dto.paymentIds) },
      relations: { customer: true, paymentMethodEntity: true },
    });

    if (payments.length !== dto.paymentIds.length) {
      throw new BadRequestException('Some payments were not found');
    }

    for (const payment of payments) {
      if (payment.settlementStatus !== SettlementStatusEnum.PENDING) {
        throw new BadRequestException(
          `Payment ${payment.paymentNumber} is not pending settlement`,
        );
      }

      if (payment.settlementId) {
        throw new BadRequestException(
          `Payment ${payment.paymentNumber} is already linked to a settlement`,
        );
      }

      if (payment.paymentMethodId !== dto.paymentMethodId) {
        throw new BadRequestException(
          `Payment ${payment.paymentNumber} does not match selected payment method`,
        );
      }
    }

    const totalAmount = payments.reduce((sum, p) => sum + Number(p.amount), 0);
    const settlementNumber = await this.settingsService.generateDocumentNumber('Settlements');

    const settlement = this.settlementRepository.create({
      settlementNumber,
      paymentMethodId: dto.paymentMethodId,
      settlementDate: new Date(dto.settlementDate),
      totalAmount,
      reference: dto.reference,
      notes: dto.notes,
      status: SettlementStatus.DRAFT,
    });

    const savedSettlement = await this.settlementRepository.save(settlement);

    await this.paymentRepository.update(
      { id: In(dto.paymentIds) },
      { settlementId: savedSettlement.id },
    );

    await this.auditLogService.log(
      'CREATE',
      'Settlement',
      `Created settlement draft: ${savedSettlement.settlementNumber}`,
      { entityId: savedSettlement.id, userId: userId ?? 'system', username },
    );

    return this.findOne(savedSettlement.id);
  }

  async post(id: string, userId?: string, username?: string): Promise<SettlementResponseDto> {
    const settlement = await this.settlementRepository.findOne({
      where: { id },
      relations: { paymentMethod: true },
    });

    if (!settlement || settlement.deletedAt) {
      throw new NotFoundException(`Settlement ${id} not found`);
    }

    if (settlement.status !== SettlementStatus.DRAFT && settlement.status !== SettlementStatus.REVERSED) {
      throw new BadRequestException('Settlement must be draft or reversed to post');
    }

    const payments = await this.paymentRepository.find({
      where: {
        settlementId: id,
        settlementStatus: SettlementStatusEnum.PENDING,
      },
    });

    if (payments.length === 0) {
      throw new BadRequestException('No reserved pending payments linked to this settlement');
    }

    await this.paymentRepository.update(
      { id: In(payments.map((payment) => payment.id)) },
      { settlementStatus: SettlementStatusEnum.SETTLED },
    );

    const previousStatus = settlement.status;
    settlement.status = SettlementStatus.POSTED;
    const saved = await this.settlementRepository.save(settlement);

    try {
      await this.accountingService.postSettlementEntry(
        saved,
        settlement.paymentMethod,
        Number(saved.totalAmount),
        userId || 'system',
        username,
      );
    } catch (error) {
      this.logger.error(
        `Failed to post settlement accounting entry for ${saved.settlementNumber}: ${error.message}`,
      );
      throw error;
    }

    await this.auditLogService.log(
      'UPDATE',
      'Settlement',
      `Posted settlement: ${saved.settlementNumber}`,
      {
        entityId: id,
        userId: userId ?? 'system',
        username,
        oldValues: { status: previousStatus },
        newValues: { status: saved.status },
      },
    );

    return this.findOne(id);
  }

  async reverse(id: string, userId?: string, username?: string): Promise<SettlementResponseDto> {
    const settlement = await this.settlementRepository.findOne({
      where: { id },
      relations: { paymentMethod: true },
    });

    if (!settlement || settlement.deletedAt) {
      throw new NotFoundException(`Settlement ${id} not found`);
    }

    if (settlement.status !== SettlementStatus.POSTED) {
      throw new BadRequestException('Only posted settlements can be reversed');
    }

    try {
      await this.accountingService.reverseSourceEntries('settlement', id, userId || 'system');
    } catch (error) {
      this.logger.error(
        `Failed to reverse settlement accounting entries for ${settlement.settlementNumber}: ${error.message}`,
      );
      throw error;
    }

    await this.paymentRepository.update(
      { settlementId: id },
      { settlementStatus: SettlementStatusEnum.PENDING },
    );

    settlement.status = SettlementStatus.REVERSED;
    const saved = await this.settlementRepository.save(settlement);

    await this.auditLogService.log(
      'UPDATE',
      'Settlement',
      `Reversed settlement: ${saved.settlementNumber}`,
      {
        entityId: id,
        userId: userId ?? 'system',
        username,
        oldValues: { status: SettlementStatus.POSTED },
        newValues: { status: SettlementStatus.REVERSED },
      },
    );

    return this.toResponseDto(saved);
  }

  async update(
    id: string,
    dto: UpdateSettlementDto,
    userId?: string,
    username?: string,
  ): Promise<SettlementResponseDto> {
    const settlement = await this.settlementRepository.findOne({ where: { id } });

    if (!settlement || settlement.deletedAt) {
      throw new NotFoundException(`Settlement ${id} not found`);
    }

    if (settlement.status !== SettlementStatus.DRAFT && settlement.status !== SettlementStatus.REVERSED) {
      throw new BadRequestException('Only draft or reversed settlements can be edited');
    }

    if (dto.settlementDate !== undefined) {
      settlement.settlementDate = new Date(dto.settlementDate);
    }
    if (dto.reference !== undefined) {
      settlement.reference = dto.reference;
    }
    if (dto.notes !== undefined) {
      settlement.notes = dto.notes;
    }

    await this.settlementRepository.save(settlement);

    await this.auditLogService.log(
      'UPDATE',
      'Settlement',
      `Updated settlement: ${settlement.settlementNumber}`,
      { entityId: id, userId: userId ?? 'system', username },
    );

    return this.findOne(id);
  }

  async remove(id: string, userId?: string, username?: string): Promise<void> {
    const settlement = await this.settlementRepository.findOne({ where: { id } });

    if (!settlement || settlement.deletedAt) {
      throw new NotFoundException(`Settlement ${id} not found`);
    }

    if (settlement.status === SettlementStatus.POSTED) {
      throw new BadRequestException('Cannot delete a posted settlement. Reverse it first.');
    }

    await this.paymentRepository.update(
      { settlementId: id },
      { settlementId: null },
    );
    await this.settlementRepository.softDelete(id);

    await this.auditLogService.log(
      'DELETE',
      'Settlement',
      `Deleted settlement: ${settlement.settlementNumber}`,
      { entityId: id, userId: userId ?? 'system', username },
    );
  }

  async getDeleted(): Promise<SettlementResponseDto[]> {
    const records = await this.settlementRepository.find({
      withDeleted: true,
      where: { deletedAt: Not(IsNull()) },
      relations: { paymentMethod: true },
      order: { deletedAt: 'DESC' },
    });
    return Promise.all(records.map((record) => this.toResponseDto(record)));
  }

  async restore(id: string, userId?: string, username?: string): Promise<SettlementResponseDto> {
    const settlement = await this.settlementRepository.findOne({
      where: { id },
      withDeleted: true,
    });

    if (!settlement) {
      throw new NotFoundException(`Settlement ${id} not found`);
    }

    if (!settlement.deletedAt) {
      throw new BadRequestException('Settlement is not deleted');
    }

    await this.settlementRepository.restore(id);

    await this.auditLogService.log(
      'RESTORE',
      'Settlement',
      `Restored settlement: ${settlement.settlementNumber}`,
      { entityId: id, userId: userId ?? 'system', username },
    );

    return this.findOne(id);
  }

  async permanentDelete(id: string, userId?: string, username?: string): Promise<void> {
    const settlement = await this.settlementRepository.findOne({
      where: { id },
      withDeleted: true,
    });

    if (!settlement) {
      throw new NotFoundException(`Settlement ${id} not found`);
    }

    if (!settlement.deletedAt) {
      throw new BadRequestException('Settlement must be soft-deleted before permanent deletion');
    }

    await this.paymentRepository.update(
      { settlementId: id },
      { settlementId: null, settlementStatus: SettlementStatusEnum.PENDING },
    );
    await this.settlementRepository.delete(id);

    await this.auditLogService.log(
      'DELETE',
      'Settlement',
      `Permanently deleted settlement: ${settlement.settlementNumber}`,
      { entityId: id, userId: userId ?? 'system', username },
    );
  }

  async getPendingPayments(paymentMethodId: string): Promise<Payment[]> {
    return this.paymentRepository.find({
      where: {
        paymentMethodId,
        settlementStatus: SettlementStatusEnum.PENDING,
        settlementId: IsNull(),
      },
      relations: { customer: true, paymentMethodEntity: true },
      order: { paymentDate: 'ASC' },
    });
  }

  async getPendingSettlementsSummary(): Promise<PendingPaymentsSummaryDto[]> {
    const rows = await this.paymentRepository
      .createQueryBuilder('p')
      .innerJoin('p.paymentMethodEntity', 'pm')
      .select('p.paymentMethodId', 'paymentMethodId')
      .addSelect('pm.code', 'paymentMethodCode')
      .addSelect('pm.name', 'paymentMethodName')
      .addSelect('COUNT(p.id)', 'pendingCount')
      .addSelect('COALESCE(SUM(p.amount), 0)', 'pendingAmount')
      .where('p.settlementStatus = :status', { status: SettlementStatusEnum.PENDING })
      .andWhere('p.settlementId IS NULL')
      .groupBy('p.paymentMethodId')
      .addGroupBy('pm.code')
      .addGroupBy('pm.name')
      .orderBy('pm.name', 'ASC')
      .getRawMany();

    return rows.map((row) => ({
      paymentMethodId: row.paymentMethodId,
      paymentMethodCode: row.paymentMethodCode,
      paymentMethodName: row.paymentMethodName,
      pendingCount: Number(row.pendingCount),
      pendingAmount: Number(row.pendingAmount),
    }));
  }

  private async toResponseDto(settlement: Settlement): Promise<SettlementResponseDto> {
    const paymentCount = await this.paymentRepository.count({
      where: { settlementId: settlement.id },
    });

    return {
      id: settlement.id,
      settlementNumber: settlement.settlementNumber,
      paymentMethodId: settlement.paymentMethodId,
      paymentMethod: settlement.paymentMethod
        ? {
            id: settlement.paymentMethod.id,
            code: settlement.paymentMethod.code,
            name: settlement.paymentMethod.name,
          }
        : undefined,
      settlementDate: settlement.settlementDate,
      totalAmount: Number(settlement.totalAmount),
      reference: settlement.reference,
      notes: settlement.notes,
      status: settlement.status,
      paymentCount,
      createdAt: settlement.createdAt,
      updatedAt: settlement.updatedAt,
      deletedAt: settlement.deletedAt ?? null,
    };
  }
}
