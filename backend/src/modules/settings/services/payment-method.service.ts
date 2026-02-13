import {
  Injectable,
  NotFoundException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PaymentMethodEntity } from '../../../database/entities/payment-method.entity';
import { AccountMapping } from '../../../database/entities/account-mapping.entity';
import { ChartOfAccount } from '../../../database/entities/chart-of-account.entity';
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
    @InjectRepository(AccountMapping)
    private readonly accountMappingRepository: Repository<AccountMapping>,
    @InjectRepository(ChartOfAccount)
    private readonly accountRepository: Repository<ChartOfAccount>,
  ) {}

  async findAll(query: QueryPaymentMethodsDto): Promise<PaymentMethodListResponseDto> {
    const { page = 1, limit = 50, isActive, requiresSettlement } = query;

    const qb = this.paymentMethodRepository
      .createQueryBuilder('pm')
      .where('pm.deletedAt IS NULL');

    if (isActive !== undefined) {
      qb.andWhere('pm.isActive = :isActive', { isActive });
    }
    if (requiresSettlement !== undefined) {
      qb.andWhere('pm.requiresSettlement = :requiresSettlement', { requiresSettlement });
    }

    qb.orderBy('pm.sortOrder', 'ASC').addOrderBy('pm.name', 'ASC');
    qb.skip((page - 1) * limit).take(limit);

    const [data, total] = await qb.getManyAndCount();

    return {
      data: data.map((pm) => this.toResponseDto(pm)),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
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

    await this.createAccountMappings(saved);

    this.logger.log(`Created payment method: ${saved.code} - ${saved.name}`);
    return this.toResponseDto(saved);
  }

  async update(id: string, dto: UpdatePaymentMethodDto): Promise<PaymentMethodResponseDto> {
    const pm = await this.paymentMethodRepository.findOne({ where: { id } });
    if (!pm || pm.deletedAt) {
      throw new NotFoundException(`Payment method ${id} not found`);
    }

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

  private async createAccountMappings(pm: PaymentMethodEntity): Promise<void> {
    const mappingKey = `payment_${pm.code.toLowerCase()}`;

    const existingMapping = await this.accountMappingRepository.findOne({
      where: { mappingType: mappingKey },
    });

    if (!existingMapping) {
      const account = await this.findMatchingAccount(pm);
      if (account) {
        const mapping = this.accountMappingRepository.create({
          mappingType: mappingKey,
          accountId: account.id,
          description: `${pm.name} payment received account`,
          isActive: true,
        });
        await this.accountMappingRepository.save(mapping);
      } else {
        this.logger.warn(
          `Skipped creating ${mappingKey} mapping for ${pm.code}: no matching account found`,
        );
      }
    }

    if (pm.requiresSettlement) {
      const settlementKey = `payment_${pm.code.toLowerCase()}_settlement`;
      const existingSettlement = await this.accountMappingRepository.findOne({
        where: { mappingType: settlementKey },
      });

      if (!existingSettlement) {
        const bankAccount = await this.accountRepository.findOne({
          where: { code: '1100', isActive: true },
        });

        if (bankAccount) {
          const mapping = this.accountMappingRepository.create({
            mappingType: settlementKey,
            accountId: bankAccount.id,
            description: `${pm.name} settlement to bank account`,
            isActive: true,
          });
          await this.accountMappingRepository.save(mapping);
        } else {
          this.logger.warn(
            `Skipped creating ${settlementKey} mapping for ${pm.code}: bank account 1100 not found`,
          );
        }
      }
    }
  }

  private async findMatchingAccount(pm: PaymentMethodEntity): Promise<ChartOfAccount | null> {
    const accountCodeMap: Record<string, string> = {
      CASH: '1000',
      BANK: '1100',
      TNG: '1120',
      CC: '1130',
      ATOME: '1140',
      SHOPEE: '1150',
      TIKTOK: '1160',
    };

    const accountCode = accountCodeMap[pm.code];
    if (!accountCode) {
      return null;
    }

    return this.accountRepository.findOne({
      where: { code: accountCode, isActive: true },
    });
  }

  async getActiveList(): Promise<PaymentMethodResponseDto[]> {
    const methods = await this.paymentMethodRepository.find({
      where: { isActive: true },
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
      requiresSettlement: pm.requiresSettlement,
      sortOrder: pm.sortOrder,
      isActive: pm.isActive,
      createdAt: pm.createdAt,
      updatedAt: pm.updatedAt,
    };
  }
}
