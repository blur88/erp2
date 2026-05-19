import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Settlement, SettlementStatus } from '../../../database/entities/settlement.entity';
import { PaymentMethodEntity } from '../../../database/entities/payment-method.entity';
import { Payment, SettlementStatusEnum } from '../../../database/entities/payment.entity';
import {
  CreateSettlementDto,
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
      page = 1,
      limit = 20,
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

    qb.orderBy(`s.${safeSortBy}`, safeSortOrder)
      .skip((page - 1) * limit)
      .take(limit);

    const [rows, total] = await qb.getManyAndCount();

    const data = await Promise.all(rows.map((row) => this.toResponseDto(row)));

    return {
      data,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
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
      status: SettlementStatus.COMPLETED,
    });

    const savedSettlement = await this.settlementRepository.save(settlement);

    await this.paymentRepository.update(
      { id: In(dto.paymentIds) },
      {
        settlementId: savedSettlement.id,
        settlementStatus: SettlementStatusEnum.SETTLED,
      },
    );

    try {
      await this.accountingService.postSettlementEntry(
        savedSettlement,
        paymentMethod,
        totalAmount,
        userId || 'system',
        username,
      );
    } catch (error) {
      this.logger.error(
        `Failed to post settlement accounting entry for ${savedSettlement.settlementNumber}: ${error.message}`,
      );
    }

    await this.auditLogService.log(
      'CREATE',
      'Settlement',
      `Created settlement: ${savedSettlement.settlementNumber}`,
      { entityId: savedSettlement.id, userId: userId ?? 'system', username },
    );

    return this.findOne(savedSettlement.id);
  }

  async cancel(id: string, userId?: string, username?: string): Promise<SettlementResponseDto> {
    const settlement = await this.settlementRepository.findOne({
      where: { id },
      relations: { paymentMethod: true },
    });

    if (!settlement || settlement.deletedAt) {
      throw new NotFoundException(`Settlement ${id} not found`);
    }

    if (settlement.status === SettlementStatus.CANCELLED) {
      return this.toResponseDto(settlement);
    }

    await this.paymentRepository.update(
      { settlementId: settlement.id },
      {
        settlementId: null,
        settlementStatus: SettlementStatusEnum.PENDING,
      },
    );

    const previousStatus = settlement.status;
    settlement.status = SettlementStatus.CANCELLED;
    const saved = await this.settlementRepository.save(settlement);

    await this.auditLogService.log(
      'UPDATE',
      'Settlement',
      `Cancelled settlement: ${saved.settlementNumber}`,
      {
        entityId: id,
        userId: userId ?? 'system',
        username,
        oldValues: { status: previousStatus },
        newValues: { status: saved.status },
      },
    );

    return this.toResponseDto(saved);
  }

  async getPendingPayments(paymentMethodId: string): Promise<Payment[]> {
    return this.paymentRepository.find({
      where: {
        paymentMethodId,
        settlementStatus: SettlementStatusEnum.PENDING,
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
    };
  }
}
