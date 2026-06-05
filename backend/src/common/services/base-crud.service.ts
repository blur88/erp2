import { Injectable, NotFoundException } from "@nestjs/common";
import { FindOptionsWhere, Repository, SelectQueryBuilder } from "typeorm";

import { BaseEntity } from "../../database/entities/base.entity";
import { AuditLogService } from "../../modules/audit-logs/services";

export interface BulkOperationError {
  id: string;
  error: string;
}

@Injectable()
export abstract class BaseCrudService<
  T extends BaseEntity,
  CreateDto,
  UpdateDto,
  QueryDto extends {
    search?: string;
    isActive?: boolean;
    sortBy?: string;
    sortOrder?: "ASC" | "DESC";
  },
> {
  constructor(
    protected readonly repository: Repository<T>,
    protected readonly auditLogService: AuditLogService,
  ) {}

  abstract getEntityType(): string;

  abstract buildWhereClause(query: QueryDto): FindOptionsWhere<T>;

  protected applyQueryBuilder(
    queryBuilder: SelectQueryBuilder<T>,
    _query: QueryDto,
  ): SelectQueryBuilder<T> {
    return queryBuilder;
  }

  protected async afterCreate(
    _entity: T,
    _userId: string,
    _username?: string,
  ): Promise<void> {}

  protected async afterUpdate(
    _before: T,
    _after: T,
    _userId: string,
    _username?: string,
  ): Promise<void> {}

  protected async afterDelete(
    _entity: T,
    _userId: string,
    _username?: string,
  ): Promise<void> {}

  /**
   * Allowlist of sort field names accepted by findAll.
   * Subclasses MUST override this to permit sorting — the base default is ['createdAt'] only.
   * This prevents SQL column-name injection via the sortBy query parameter.
   */
  protected get allowedSortFields(): string[] {
    return ["createdAt", "updatedAt"];
  }

  /**
   * Apply search filtering to a query builder.
   * Default: no-op (search is ignored). Subclasses override to add ILIKE conditions
   * on the entity's actual searchable columns.
   *
   * Example override:
   *   protected applySearch(qb, search, alias) {
   *     return qb.andWhere(`${alias}.name ILIKE :search OR ${alias}.phone ILIKE :search`, { search: `%${search}%` });
   *   }
   */
  protected applySearch(
    queryBuilder: SelectQueryBuilder<T>,
    _search: string,
    _alias: string,
  ): SelectQueryBuilder<T> {
    return queryBuilder;
  }

  async findAll(query: QueryDto): Promise<any> {
    const {
      search,
      sortOrder = "ASC",
      page,
      limit,
    } = query as QueryDto & { page?: number; limit?: number };
    const sortBy = this.allowedSortFields.includes(query.sortBy ?? "")
      ? query.sortBy!
      : "createdAt";
    const where = this.buildWhereClause(query);
    const alias = this.getEntityType().toLowerCase();

    let queryBuilder = this.repository.createQueryBuilder(alias);

    Object.entries(where).forEach(([key, value]) => {
      queryBuilder = queryBuilder.andWhere(`${alias}.${key} = :${key}`, {
        [key]: value,
      });
    });

    if (search) {
      queryBuilder = this.applySearch(queryBuilder, search, alias);
    }

    queryBuilder = this.applyQueryBuilder(queryBuilder, query);
    queryBuilder = queryBuilder.orderBy(`${alias}.${sortBy}`, sortOrder);

    if (page && limit) {
      queryBuilder = queryBuilder.skip((page - 1) * limit).take(limit);
    }

    const [entities, total] = await queryBuilder.getManyAndCount();

    return {
      data: entities,
      total,
      ...(page && limit
        ? { meta: { page, limit, totalPages: Math.ceil(total / limit) } }
        : {}),
    };
  }

  async findDeleted(query: QueryDto): Promise<any> {
    const alias = this.getEntityType().toLowerCase();
    let queryBuilder = this.repository
      .createQueryBuilder(alias)
      .withDeleted()
      .where(`${alias}.deletedAt IS NOT NULL`);

    if (query.search) {
      queryBuilder = this.applySearch(queryBuilder, query.search, alias);
    }

    queryBuilder = this.applyQueryBuilder(queryBuilder, query);

    const entities = await queryBuilder.getMany();

    return {
      data: entities,
      total: entities.length,
    };
  }

  async findOne(id: string): Promise<any> {
    const entity = await this.repository.findOne({
      where: { id } as FindOptionsWhere<T>,
    });

    if (!entity) {
      throw new NotFoundException(
        `${this.getEntityType()} with id ${id} not found`,
      );
    }

    return entity;
  }

  async create(
    dto: CreateDto,
    userId: string,
    username?: string,
  ): Promise<any> {
    const entity = this.repository.create(dto as never) as unknown as T;
    const savedEntity = (await this.repository.save(entity)) as T;

    await this.auditLogService.log(
      "CREATE",
      this.getEntityType(),
      `Created ${this.getEntityType()} ${savedEntity.id}`,
      {
        entityId: savedEntity.id,
        userId,
        username,
        newValues: dto,
      },
    );

    await this.afterCreate(savedEntity, userId, username);

    return savedEntity;
  }

  async update(
    id: string,
    dto: UpdateDto,
    userId: string,
    username?: string,
  ): Promise<any> {
    const fetched = await this.findOne(id);
    const before = { ...fetched } as T; // immutable snapshot for afterUpdate and audit

    Object.assign(fetched, dto);
    const savedEntity = (await this.repository.save(fetched)) as T;

    await this.auditLogService.log(
      "UPDATE",
      this.getEntityType(),
      `Updated ${this.getEntityType()} ${id}`,
      {
        entityId: id,
        userId,
        username,
        oldValues: before,
        newValues: dto,
      },
    );

    await this.afterUpdate(before, savedEntity, userId, username);

    return savedEntity;
  }

  async softDelete(
    id: string,
    userId: string,
    username?: string,
  ): Promise<void> {
    const entity = await this.findOne(id);

    await this.afterDelete(entity, userId, username);
    await this.repository.softDelete(id);

    await this.auditLogService.log(
      "DELETE",
      this.getEntityType(),
      `Deleted ${this.getEntityType()} ${id}`,
      {
        entityId: id,
        userId,
        username,
        oldValues: { id: entity.id },
      },
    );
  }

  async restore(id: string, userId: string, username?: string): Promise<any> {
    const entity = await this.repository.findOne({
      where: { id } as FindOptionsWhere<T>,
      withDeleted: true,
    });

    if (!entity) {
      throw new NotFoundException(
        `${this.getEntityType()} with id ${id} not found`,
      );
    }

    await this.repository.restore(id);
    const restoredEntity = await this.repository.findOne({
      where: { id } as FindOptionsWhere<T>,
    });

    if (!restoredEntity) {
      throw new NotFoundException(
        `${this.getEntityType()} with id ${id} not found`,
      );
    }

    await this.auditLogService.log(
      "RESTORE",
      this.getEntityType(),
      `Restored ${this.getEntityType()} ${id}`,
      {
        entityId: id,
        userId,
        username,
      },
    );

    return restoredEntity;
  }

  async bulkRestore(
    ids: string[],
    userId: string,
    username?: string,
  ): Promise<any> {
    let successCount = 0;
    const failedItems: BulkOperationError[] = [];

    for (const id of ids) {
      try {
        await this.restore(id, userId, username);
        successCount += 1;
      } catch (error) {
        failedItems.push({
          id,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    return {
      successCount,
      failedItems,
    };
  }

  async permanentDelete(
    id: string,
    userId: string,
    username?: string,
  ): Promise<void> {
    const entity = await this.repository.findOne({
      where: { id } as FindOptionsWhere<T>,
      withDeleted: true,
    });

    if (!entity) {
      throw new NotFoundException(
        `${this.getEntityType()} with id ${id} not found`,
      );
    }

    await this.repository.delete(id);

    await this.auditLogService.log(
      "PERMANENT_DELETE",
      this.getEntityType(),
      `Permanently deleted ${this.getEntityType()} ${id}`,
      {
        entityId: id,
        userId,
        username,
      },
    );
  }

  async bulkPermanentDelete(
    ids: string[],
    userId: string,
    username?: string,
  ): Promise<any> {
    let successCount = 0;
    const failedItems: BulkOperationError[] = [];

    for (const id of ids) {
      try {
        await this.permanentDelete(id, userId, username);
        successCount += 1;
      } catch (error) {
        failedItems.push({
          id,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    return {
      successCount,
      failedItems,
    };
  }
}
