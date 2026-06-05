import {
  Injectable,
  NotFoundException,
  ConflictException,
  Logger,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import {
  AccountMapping,
  MappingType,
} from "../../../database/entities/account-mapping.entity";
import { ChartOfAccount } from "../../../database/entities/chart-of-account.entity";
import { PaymentMethodEntity } from "../../../database/entities/payment-method.entity";
import {
  CreateAccountMappingDto,
  UpdateAccountMappingDto,
  QueryAccountMappingsDto,
  AccountMappingResponseDto,
  AccountMappingListResponseDto,
  MappingValidationResponseDto,
} from "../dto/account-mapping.dto";
import { AuditLogService } from "../../audit-logs/services";

@Injectable()
export class AccountMappingService {
  private readonly logger = new Logger(AccountMappingService.name);

  constructor(
    @InjectRepository(AccountMapping)
    private readonly mappingRepository: Repository<AccountMapping>,
    @InjectRepository(ChartOfAccount)
    private readonly accountRepository: Repository<ChartOfAccount>,
    @InjectRepository(PaymentMethodEntity)
    private readonly paymentMethodRepository: Repository<PaymentMethodEntity>,
    private readonly auditLogService: AuditLogService,
  ) {}

  /**
   * Get all active mappings as an object for easy access during auto-posting
   * Returns: { SALES_REVENUE: 'uuid', SALES_AR: 'uuid', ... }
   */
  async getMappings(): Promise<Record<string, string>> {
    this.logger.log("Fetching active account mappings");

    const mappings = await this.mappingRepository.find({
      where: { isActive: true },
    });

    const result: Record<string, string> = {};
    mappings.forEach((mapping) => {
      result[mapping.mappingType] = mapping.accountId;
    });

    return result;
  }

  /**
   * Validate that all required mappings are configured
   */
  async validateMappings(): Promise<MappingValidationResponseDto> {
    this.logger.log("Validating account mappings");

    const allRequiredTypes: string[] = Object.values(MappingType);
    const paymentMethods = await this.paymentMethodRepository.find({
      where: { isActive: true },
    });

    for (const pm of paymentMethods) {
      const code = pm.code.toLowerCase();
      allRequiredTypes.push(`payment_${code}`);
      if (pm.useForPurchases) {
        allRequiredTypes.push(`vendor_payment_${code}`);
      }
      if (pm.requiresSettlement) {
        allRequiredTypes.push(`payment_${code}_settlement`);
      }
    }

    const configuredMappings = await this.mappingRepository.find({
      where: { isActive: true },
    });

    const configuredTypes = configuredMappings
      .filter((m) => m.accountId !== null)
      .map((m) => m.mappingType);
    const missingTypes = allRequiredTypes.filter(
      (type) => !configuredTypes.includes(type),
    );

    const isValid = missingTypes.length === 0;

    return {
      isValid,
      missingMappings: missingTypes,
      configuredMappings: configuredTypes,
      totalRequired: allRequiredTypes.length,
      totalConfigured: configuredTypes.length,
    };
  }

  /**
   * Find all mappings with filtering, sorting, and pagination
   */
  async findAll(
    query: QueryAccountMappingsDto,
  ): Promise<AccountMappingListResponseDto> {
    const {
      page = 1,
      limit = 20,
      mappingType,
      isActive,
      sortBy = "mappingType",
      sortOrder = "ASC",
    } = query;

    const queryBuilder = this.mappingRepository
      .createQueryBuilder("mapping")
      .leftJoinAndSelect("mapping.account", "account")
      .where("mapping.deletedAt IS NULL");

    // Apply filters
    if (mappingType) {
      queryBuilder.andWhere("mapping.mappingType = :mappingType", {
        mappingType,
      });
    }

    if (isActive !== undefined) {
      queryBuilder.andWhere("mapping.isActive = :isActive", { isActive });
    }

    // Apply sorting
    const validSortFields = ["mappingType", "createdAt"];
    const sortField = validSortFields.includes(sortBy) ? sortBy : "mappingType";
    const safeSortOrder = sortOrder?.toUpperCase() === "DESC" ? "DESC" : "ASC";

    queryBuilder.orderBy(`mapping.${sortField}`, safeSortOrder);

    // Apply pagination
    const offset = (page - 1) * limit;
    queryBuilder.skip(offset).take(limit);

    const [mappings, total] = await queryBuilder.getManyAndCount();

    const data = mappings.map((mapping) => this.toResponseDto(mapping));

    return {
      data,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNextPage: page < Math.ceil(total / limit),
        hasPreviousPage: page > 1,
      },
    };
  }

  /**
   * Find one mapping by ID
   */
  async findOne(id: string): Promise<AccountMappingResponseDto> {
    const mapping = await this.mappingRepository.findOne({
      where: { id },
      relations: { account: true },
    });

    if (!mapping) {
      throw new NotFoundException(`Account mapping with ID '${id}' not found`);
    }

    return this.toResponseDto(mapping);
  }

  /**
   * Create a new account mapping
   */
  async create(
    createDto: CreateAccountMappingDto,
    userId?: string,
    username?: string,
  ): Promise<AccountMappingResponseDto> {
    this.logger.log(
      `Creating account mapping for type: ${createDto.mappingType}`,
    );

    // Validate account exists and is active
    const account = await this.accountRepository.findOne({
      where: { id: createDto.accountId, isActive: true },
    });

    if (!account) {
      throw new NotFoundException(
        `Account with ID '${createDto.accountId}' not found or inactive`,
      );
    }

    // Check if mapping type already exists
    const existingMapping = await this.mappingRepository.findOne({
      where: { mappingType: createDto.mappingType },
      withDeleted: true,
    });

    if (existingMapping) {
      if (existingMapping.deletedAt) {
        // Revive previously cleared mapping to keep mapping keys reusable.
        const restoredMapping = Object.assign(existingMapping, {
          accountId: createDto.accountId,
          description: createDto.description,
          isActive: true,
          deletedAt: null,
        });

        await this.mappingRepository.recover(restoredMapping);
        const savedRestoredMapping =
          await this.mappingRepository.save(restoredMapping);
        const mappingWithRelations = await this.mappingRepository.findOne({
          where: { id: savedRestoredMapping.id },
          relations: { account: true },
        });

        this.logger.log(
          `Account mapping restored successfully with ID: ${savedRestoredMapping.id}`,
        );
        await this.auditLogService.log(
          "CREATE",
          "AccountMapping",
          `Created account mapping: ${savedRestoredMapping.mappingType}`,
          {
            entityId: savedRestoredMapping.id,
            userId: userId ?? "system",
            username,
          },
        );
        return this.toResponseDto(mappingWithRelations!);
      }

      if (!existingMapping.isActive) {
        // Reactivate inactive mapping key and update assignment instead of rejecting as duplicate.
        const reactivatedMapping = Object.assign(existingMapping, {
          accountId: createDto.accountId,
          description: createDto.description,
          isActive: true,
          deletedAt: null,
        });

        const savedReactivatedMapping =
          await this.mappingRepository.save(reactivatedMapping);
        const mappingWithRelations = await this.mappingRepository.findOne({
          where: { id: savedReactivatedMapping.id },
          relations: { account: true },
        });

        this.logger.log(
          `Account mapping reactivated successfully with ID: ${savedReactivatedMapping.id}`,
        );
        await this.auditLogService.log(
          "CREATE",
          "AccountMapping",
          `Created account mapping: ${savedReactivatedMapping.mappingType}`,
          {
            entityId: savedReactivatedMapping.id,
            userId: userId ?? "system",
            username,
          },
        );
        return this.toResponseDto(mappingWithRelations!);
      }

      throw new ConflictException(
        `Mapping type '${createDto.mappingType}' already exists`,
      );
    }

    // Create the mapping
    const mapping = this.mappingRepository.create({
      ...createDto,
      isActive: true,
    });

    const savedMapping = await this.mappingRepository.save(mapping);

    // Reload with relations
    const mappingWithRelations = await this.mappingRepository.findOne({
      where: { id: savedMapping.id },
      relations: { account: true },
    });

    this.logger.log(
      `Account mapping created successfully with ID: ${savedMapping.id}`,
    );
    await this.auditLogService.log(
      "CREATE",
      "AccountMapping",
      `Created account mapping: ${savedMapping.mappingType}`,
      { entityId: savedMapping.id, userId: userId ?? "system", username },
    );
    return this.toResponseDto(mappingWithRelations!);
  }

  /**
   * Update an account mapping
   */
  async update(
    id: string,
    updateDto: UpdateAccountMappingDto,
    userId?: string,
    username?: string,
  ): Promise<AccountMappingResponseDto> {
    this.logger.log(`Updating account mapping with ID: ${id}`);

    const mapping = await this.mappingRepository.findOne({
      where: { id },
      relations: { account: true },
    });

    if (!mapping) {
      throw new NotFoundException(`Account mapping with ID '${id}' not found`);
    }

    // Validate account if being changed
    if (updateDto.accountId && updateDto.accountId !== mapping.accountId) {
      const account = await this.accountRepository.findOne({
        where: { id: updateDto.accountId, isActive: true },
      });

      if (!account) {
        throw new NotFoundException(
          `Account with ID '${updateDto.accountId}' not found or inactive`,
        );
      }
    }

    // Update the mapping using direct query to avoid TypeORM relation override
    await this.mappingRepository.update(id, updateDto);

    // Reload with relations
    const mappingWithRelations = await this.mappingRepository.findOne({
      where: { id },
      relations: { account: true },
    });

    await this.auditLogService.log(
      "UPDATE",
      "AccountMapping",
      `Updated account mapping: ${mapping.mappingType}`,
      { entityId: id, userId: userId ?? "system", username },
    );

    this.logger.log(`Account mapping updated successfully: ${id}`);
    return this.toResponseDto(mappingWithRelations!);
  }

  /**
   * Soft delete an account mapping
   */
  async remove(id: string, userId?: string, username?: string): Promise<void> {
    this.logger.log(`Deleting account mapping with ID: ${id}`);

    const mapping = await this.mappingRepository.findOne({
      where: { id },
    });

    if (!mapping) {
      throw new NotFoundException(`Account mapping with ID '${id}' not found`);
    }

    // Soft delete the mapping
    await this.mappingRepository.softDelete(id);

    await this.auditLogService.log(
      "DELETE",
      "AccountMapping",
      `Deleted account mapping: ${mapping.mappingType}`,
      { entityId: id, userId: userId ?? "system", username },
    );

    this.logger.log(`Account mapping soft-deleted successfully: ${id}`);
  }

  /**
   * Convert mapping entity to response DTO
   */
  private toResponseDto(mapping: AccountMapping): AccountMappingResponseDto {
    return {
      id: mapping.id,
      mappingType: mapping.mappingType,
      accountId: mapping.accountId,
      description: mapping.description,
      isActive: mapping.isActive,
      account: mapping.account
        ? {
            id: mapping.account.id,
            code: mapping.account.code,
            name: mapping.account.name,
            type: mapping.account.type,
          }
        : undefined,
      createdAt: mapping.createdAt,
      updatedAt: mapping.updatedAt,
    };
  }
}
