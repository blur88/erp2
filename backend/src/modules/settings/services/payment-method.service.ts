import {
  Injectable,
  NotFoundException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Not, Repository } from 'typeorm';
import { PaymentMethodEntity } from '../../../database/entities/payment-method.entity';
import { Payment } from '../../../database/entities/payment.entity';
import { applyPagination } from '@/common/pagination/apply-pagination';
import {
  CreatePaymentMethodDto,
  UpdatePaymentMethodDto,
  QueryPaymentMethodsDto,
  PaymentMethodResponseDto,
  PaymentMethodListResponseDto,
} from '../dto/payment-method.dto';

@Injectable()
export class PaymentMethodService {
  private readonly logger = new Logger(PaymentMethodService.name);

  constructor(
    @InjectRepository(PaymentMethodEntity)
    private readonly paymentMethodRepository: Repository<PaymentMethodEntity>,
    @InjectRepository(Payment)
    private readonly paymentRepository: Repository<Payment>,
  ) {}

  async findAll(query: QueryPaymentMethodsDto): Promise<PaymentMethodListResponseDto> {
    const { page, limit, isActive } = query;

    const qb = this.paymentMethodRepository
      .createQueryBuilder('pm')
      .where('pm.deletedAt IS NULL');

    if (isActive !== undefined) {
      qb.andWhere('pm.isActive = :isActive', { isActive });
    }

    qb.orderBy('pm.sortOrder', 'ASC').addOrderBy('pm.name', 'ASC');
    const shouldPaginate = page !== undefined && limit !== undefined;
    applyPagination(qb, page, limit);

    const [data, total] = await qb.getManyAndCount();

    return {
      data: data.map((pm) => this.toResponseDto(pm)),
      meta: {
        page,
        limit,
        total,
        totalPages: shouldPaginate ? Math.ceil(total / limit) : 1,
      },
    };
  }

  async findOne(id: string): Promise<PaymentMethodResponseDto> {
    const pm = await this.paymentMethodRepository.findOne({
      where: { id },
    });
    if (!pm || pm.deletedAt) {
      throw new NotFoundException(`Payment method ${id} not found`);
    }
    return this.toResponseDto(pm);
  }

  async findByCode(code: string): Promise<PaymentMethodEntity | null> {
    const pm = await this.paymentMethodRepository.findOne({
      where: { code },
    });
    if (!pm || pm.deletedAt) {
      return null;
    }
    return pm;
  }

  async create(dto: CreatePaymentMethodDto): Promise<PaymentMethodResponseDto> {
    const code = dto.code.toUpperCase().trim();

    const existing = await this.findByCode(code);
    if (existing) {
      throw new ConflictException(`Payment method with code "${code}" already exists`);
    }

    const pm = this.paymentMethodRepository.create({
      ...dto,
      code,
      sortOrder: dto.sortOrder ?? 0,
    });
    const saved = await this.paymentMethodRepository.save(pm);

    this.logger.log(`Created payment method: ${saved.code} - ${saved.name}`);
    return this.toResponseDto(saved);
  }

  async update(id: string, dto: UpdatePaymentMethodDto): Promise<PaymentMethodResponseDto> {
    const pm = await this.paymentMethodRepository.findOne({ where: { id } });
    if (!pm || pm.deletedAt) {
      throw new NotFoundException(`Payment method ${id} not found`);
    }
    const oldPm = { ...pm } as PaymentMethodEntity;

    if (dto.code) {
      dto.code = dto.code.toUpperCase().trim();
      if (dto.code !== pm.code) {
        const existing = await this.findByCode(dto.code);
        if (existing && existing.id !== id) {
          throw new ConflictException(`Payment method with code "${dto.code}" already exists`);
        }
      }
    }

    Object.assign(pm, dto);
    const saved = await this.paymentMethodRepository.save(pm);

    return this.toResponseDto(saved);
  }

  async remove(id: string): Promise<void> {
    const pm = await this.paymentMethodRepository.findOne({ where: { id } });
    if (!pm || pm.deletedAt) {
      throw new NotFoundException(`Payment method ${id} not found`);
    }
    await this.paymentMethodRepository.softDelete(id);
  }

  async getDeletedList(): Promise<PaymentMethodResponseDto[]> {
    const methods = await this.paymentMethodRepository.find({
      withDeleted: true,
      where: {
        deletedAt: Not(IsNull()),
      },
      order: { sortOrder: 'ASC', name: 'ASC' },
    });

    return methods.map((pm) => this.toResponseDto(pm));
  }

  async restore(id: string): Promise<void> {
    const pm = await this.paymentMethodRepository.findOne({
      where: { id },
      withDeleted: true,
    });

    if (!pm || !pm.deletedAt) {
      throw new NotFoundException(`Deleted payment method ${id} not found`);
    }

    await this.paymentMethodRepository.restore(id);
  }

  async permanentDelete(id: string): Promise<void> {
    const pm = await this.paymentMethodRepository.findOne({
      where: { id },
      withDeleted: true,
    });

    if (!pm || !pm.deletedAt) {
      throw new NotFoundException(
        `Deleted payment method ${id} not found for permanent deletion`,
      );
    }

    const [paymentCount] = await Promise.all([
      this.paymentRepository.count({
        where: { paymentMethodId: id, deletedAt: IsNull() as any },
        withDeleted: true,
      }),
    ]);

    if (paymentCount > 0) {
      throw new ConflictException(
        `Cannot permanently delete payment method "${pm.code}" because it is referenced by ${paymentCount} payment(s).`,
      );
    }

    // Hard-delete any soft-deleted payments referencing this method so FK doesn't block
    await this.paymentRepository
      .createQueryBuilder()
      .delete()
      .where('"paymentMethodId" = :id AND "deletedAt" IS NOT NULL', { id })
      .execute();

    await this.paymentMethodRepository.delete(id);
  }

  async getActiveList(forPurchases?: boolean): Promise<PaymentMethodResponseDto[]> {
    const where: any = { isActive: true };
    if (forPurchases === true) {
      where.useForPurchases = true;
    }

    const methods = await this.paymentMethodRepository.find({
      where,
      order: { sortOrder: 'ASC', name: 'ASC' },
    });

    return methods
      .filter((pm) => !pm.deletedAt)
      .map((pm) => this.toResponseDto(pm));
  }

  private toResponseDto(pm: PaymentMethodEntity): PaymentMethodResponseDto {
    return {
      id: pm.id,
      code: pm.code,
      name: pm.name,
      useForPurchases: pm.useForPurchases,
      sortOrder: pm.sortOrder,
      isActive: pm.isActive,
      createdAt: pm.createdAt,
      updatedAt: pm.updatedAt,
    };
  }
}
