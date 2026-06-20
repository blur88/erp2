import {
  Injectable,
  NotFoundException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Not, Repository } from 'typeorm';
import { PaymentMethodEntity } from '../../../database/entities/payment-method.entity';
import { AccountMapping } from '../../../database/entities/account-mapping.entity';
import { ChartOfAccount } from '../../../database/entities/chart-of-account.entity';
import { Payment } from '../../../database/entities/payment.entity';
import { Settlement } from '../../../database/entities/settlement.entity';
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
    @InjectRepository(AccountMapping)
    private readonly accountMappingRepository: Repository<AccountMapping>,
    @InjectRepository(ChartOfAccount)
    private readonly accountRepository: Repository<ChartOfAccount>,
    @InjectRepository(Payment)
    private readonly paymentRepository: Repository<Payment>,
    @InjectRepository(Settlement)
    private readonly settlementRepository: Repository<Settlement>,
  ) {}

  async findAll(query: QueryPaymentMethodsDto): Promise<PaymentMethodListResponseDto> {
    const { page, limit, isActive, requiresSettlement } = query;

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
    const shouldPaginate = page !== undefined && limit !== undefined;
    applyPagination(qb, page, limit);

    const [data, total] = await qb.getManyAndCount();

    return {
      data: data.map((pm) => this.toResponseDto(pm)),
      meta: {
        page,
        limit,
        total,
        ...(shouldPaginate && { totalPages: Math.ceil(total / limit) }),
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
    await this.syncAccountMappings(oldPm, saved);

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
    await this.createAccountMappings(pm);
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

    const [paymentCount, settlementCount] = await Promise.all([
      this.paymentRepository.count({
        where: { paymentMethodId: id, deletedAt: IsNull() as any },
        withDeleted: true,
      }),
      this.settlementRepository.count({
        where: { paymentMethodId: id, deletedAt: IsNull() as any },
        withDeleted: true,
      }),
    ]);

    if (paymentCount > 0 || settlementCount > 0) {
      throw new ConflictException(
        `Cannot permanently delete payment method "${pm.code}" because it is referenced by ${paymentCount} payment(s) and ${settlementCount} settlement(s).`,
      );
    }

    const mappingKeys = [
      `payment_${pm.code.toLowerCase()}`,
      `vendor_payment_${pm.code.toLowerCase()}`,
    ];
    if (pm.requiresSettlement) {
      mappingKeys.push(`payment_${pm.code.toLowerCase()}_settlement`);
    }

    // Hard-delete any soft-deleted payments/settlements referencing this method so FK doesn't block
    await this.paymentRepository
      .createQueryBuilder()
      .delete()
      .where('"paymentMethodId" = :id AND "deletedAt" IS NOT NULL', { id })
      .execute();

    await this.settlementRepository
      .createQueryBuilder()
      .delete()
      .where('"paymentMethodId" = :id AND "deletedAt" IS NOT NULL', { id })
      .execute();

    await this.accountMappingRepository.delete({ mappingType: In(mappingKeys) });
    await this.paymentMethodRepository.delete(id);
  }

  private async createAccountMappings(pm: PaymentMethodEntity): Promise<void> {
    const mappingKey = `payment_${pm.code.toLowerCase()}`;

    const existingMapping = await this.accountMappingRepository.findOne({
      where: { mappingType: mappingKey },
    });

    if (!existingMapping) {
      const account = await this.findMatchingAccount(pm);
      if (!account) {
        this.logger.warn(
          `No matching GL account found for ${pm.code} — mapping created with null accountId`,
        );
      }
      const mapping = this.accountMappingRepository.create({
        mappingType: mappingKey,
        accountId: account ? account.id : null,
        description: `${pm.name} payment received account`,
        isActive: true,
      });
      await this.accountMappingRepository.save(mapping);
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

        if (!bankAccount) {
          this.logger.warn(
            `Bank account 1100 not found for ${pm.code} — settlement mapping created with null accountId`,
          );
        }
        const mapping = this.accountMappingRepository.create({
          mappingType: settlementKey,
          accountId: bankAccount ? bankAccount.id : null,
          description: `${pm.name} settlement to bank account`,
          isActive: true,
        });
        await this.accountMappingRepository.save(mapping);
      }
    }

    if (pm.useForPurchases !== false) {
      const vendorKey = `vendor_payment_${pm.code.toLowerCase()}`;
      const existingVendorMapping = await this.accountMappingRepository.findOne({
        where: { mappingType: vendorKey },
      });

      if (!existingVendorMapping) {
        const account = await this.findMatchingAccount(pm);
        if (!account) {
          this.logger.warn(
            `No matching GL account found for vendor ${pm.code} — mapping created with null accountId`,
          );
        }
        const mapping = this.accountMappingRepository.create({
          mappingType: vendorKey,
          accountId: account ? account.id : null,
          description: `${pm.name} vendor payment account`,
          isActive: true,
        });
        await this.accountMappingRepository.save(mapping);
      }
    }
  }

  private async syncAccountMappings(
    oldPm: PaymentMethodEntity,
    newPm: PaymentMethodEntity,
  ): Promise<void> {
    const oldCode = oldPm.code.toLowerCase();
    const newCode = newPm.code.toLowerCase();

    if (oldCode !== newCode) {
      const renamePairs: Array<[string, string]> = [
        [`payment_${oldCode}`, `payment_${newCode}`],
        [`vendor_payment_${oldCode}`, `vendor_payment_${newCode}`],
        [`payment_${oldCode}_settlement`, `payment_${newCode}_settlement`],
      ];

      for (const [oldKey, newKey] of renamePairs) {
        const mapping = await this.accountMappingRepository.findOne({
          where: { mappingType: oldKey },
        });
        if (mapping) {
          mapping.mappingType = newKey;
          await this.accountMappingRepository.save(mapping);
        }
      }
    }

    if (oldPm.name !== newPm.name) {
      const code = newCode;
      const descriptionUpdates: Array<[string, string]> = [
        [`payment_${code}`, `${newPm.name} payment received account`],
        [`vendor_payment_${code}`, `${newPm.name} vendor payment account`],
        [`payment_${code}_settlement`, `${newPm.name} settlement to bank account`],
      ];

      for (const [key, description] of descriptionUpdates) {
        const mapping = await this.accountMappingRepository.findOne({
          where: { mappingType: key },
        });
        if (mapping) {
          mapping.description = description;
          await this.accountMappingRepository.save(mapping);
        }
      }
    }

    const code = newCode;
    if (newPm.requiresSettlement && !oldPm.requiresSettlement) {
      const settlementKey = `payment_${code}_settlement`;
      const existing = await this.accountMappingRepository.findOne({
        where: { mappingType: settlementKey },
      });
      if (!existing) {
        const bankAccount = await this.accountRepository.findOne({
          where: { code: '1100', isActive: true },
        });
        if (!bankAccount) {
          this.logger.warn(
            `Bank account 1100 not found for ${newPm.code} — settlement mapping created with null accountId`,
          );
        }
        const mapping = this.accountMappingRepository.create({
          mappingType: settlementKey,
          accountId: bankAccount ? bankAccount.id : null,
          description: `${newPm.name} settlement to bank account`,
          isActive: true,
        });
        await this.accountMappingRepository.save(mapping);
      }
    } else if (!newPm.requiresSettlement && oldPm.requiresSettlement) {
      const settlementKey = `payment_${code}_settlement`;
      await this.accountMappingRepository.delete({ mappingType: settlementKey });
    }

    if (newPm.useForPurchases && !oldPm.useForPurchases) {
      const vendorKey = `vendor_payment_${code}`;
      const existing = await this.accountMappingRepository.findOne({
        where: { mappingType: vendorKey },
      });

      if (existing) {
        existing.isActive = true;
        await this.accountMappingRepository.save(existing);
      } else {
        const account = await this.findMatchingAccount(newPm);
        const mapping = this.accountMappingRepository.create({
          mappingType: vendorKey,
          accountId: account ? account.id : null,
          description: `${newPm.name} vendor payment account`,
          isActive: true,
        });
        await this.accountMappingRepository.save(mapping);
      }
    } else if (!newPm.useForPurchases && oldPm.useForPurchases) {
      const vendorKey = `vendor_payment_${code}`;
      const existing = await this.accountMappingRepository.findOne({
        where: { mappingType: vendorKey },
      });

      if (existing) {
        existing.isActive = false;
        await this.accountMappingRepository.save(existing);
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
      requiresSettlement: pm.requiresSettlement,
      useForPurchases: pm.useForPurchases,
      sortOrder: pm.sortOrder,
      isActive: pm.isActive,
      createdAt: pm.createdAt,
      updatedAt: pm.updatedAt,
    };
  }
}
