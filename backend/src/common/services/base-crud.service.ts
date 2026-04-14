import { Injectable, NotFoundException } from '@nestjs/common';
import { FindOptionsWhere, Repository, SelectQueryBuilder } from 'typeorm';

import { BaseEntity } from '../../database/entities/base.entity';
import { AuditLogService } from '../../modules/audit-logs/services';

export interface BulkOperationError {
  id: string;
  error: string;
}

export interface BaseBulkResult {
  successCount: number;
  failedItems: BulkOperationError[];
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
    sortOrder?: 'ASC' | 'DESC';
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

  protected async afterCreate(_entity: T, _userId: string, _username?: string): Promise<void> {}

  protected async afterUpdate(
    _before: T,
    _after: T,
    _userId: string,
    _username?: string,
  ): Promise<void> {}

  protected async afterDelete(_entity: T, _userId: string, _username?: string): Promise<void> {}

  async findAll(query: QueryDto): Promise<any> {
    const { search, sortBy = 'createdAt', sortOrder = 'ASC' } = query;
    const where = this.buildWhereClause(query);
    const alias = this.getEntityType().toLowerCase();

    let queryBuilder = this.repository.createQueryBuilder(alias);

    Object.entries(where).forEach(([key, value]) => {
      queryBuilder = queryBuilder.andWhere(`${alias}.${key} = :${key}`, { [key]: value });
    });

    if (search) {
      queryBuilder = queryBuilder.andWhere(`${alias}.name ILIKE :search`, {
        search: `%${search}%`,
      });
    }

    queryBuilder = this.applyQueryBuilder(queryBuilder, query);
    queryBuilder = queryBuilder.orderBy(`${alias}.${sortBy}`, sortOrder);

    const entities = await queryBuilder.getMany();

    return {
      data: entities,
      total: entities.length,
    };
  }

  async findDeleted(query: QueryDto): Promise<any> {
    const alias = this.getEntityType().toLowerCase();
    let queryBuilder = this.repository
      .createQueryBuilder(alias)
      .withDeleted()
      .where(`${alias}.deletedAt IS NOT NULL`);

    if (query.search) {
      queryBuilder = queryBuilder.andWhere(`${alias}.name ILIKE :search`, {
        search: `%${query.search}%`,
      });
    }

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
      throw new NotFoundException(`${this.getEntityType()} with id ${id} not found`);
    }

    return entity;
  }

  async create(dto: CreateDto, userId: string, username?: string): Promise<any> {
    const entity = this.repository.create(dto as never) as unknown as T;
    const savedEntity = (await this.repository.save(entity)) as T;

    await this.auditLogService.log(
      'CREATE',
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

  async update(id: string, dto: UpdateDto, userId: string, username?: string): Promise<any> {
    const before = await this.findOne(id);
    const oldValues = { ...before };

    Object.assign(before, dto);
    const savedEntity = (await this.repository.save(before)) as T;

    await this.auditLogService.log(
      'UPDATE',
      this.getEntityType(),
      `Updated ${this.getEntityType()} ${id}`,
      {
        entityId: id,
        userId,
        username,
        oldValues,
        newValues: dto,
      },
    );

    await this.afterUpdate(before, savedEntity, userId, username);

    return savedEntity;
  }

  async softDelete(id: string, userId: string, username?: string): Promise<void> {
    const entity = await this.findOne(id);

    await this.afterDelete(entity, userId, username);
    await this.repository.softDelete(id);

    await this.auditLogService.log(
      'DELETE',
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
      throw new NotFoundException(`${this.getEntityType()} with id ${id} not found`);
    }

    await this.repository.restore(id);
    const restoredEntity = await this.repository.findOne({
      where: { id } as FindOptionsWhere<T>,
    });

    if (!restoredEntity) {
      throw new NotFoundException(`${this.getEntityType()} with id ${id} not found`);
    }

    await this.auditLogService.log(
      'RESTORE',
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

  async bulkRestore(ids: string[], userId: string, username?: string): Promise<any> {
    let successCount = 0;
    const failedItems: BulkOperationError[] = [];

    for (const id of ids) {
      try {
        await this.restore(id, userId, username);
        successCount += 1;
      } catch (error) {
        failedItems.push({
          id,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    return {
      successCount,
      failedItems,
    };
  }

  async permanentDelete(id: string, userId: string, username?: string): Promise<void> {
    const entity = await this.repository.findOne({
      where: { id } as FindOptionsWhere<T>,
      withDeleted: true,
    });

    if (!entity) {
      throw new NotFoundException(`${this.getEntityType()} with id ${id} not found`);
    }

    await this.repository.delete(id);

    await this.auditLogService.log(
      'PERMANENT_DELETE',
      this.getEntityType(),
      `Permanently deleted ${this.getEntityType()} ${id}`,
      {
        entityId: id,
        userId,
        username,
      },
    );
  }

  async bulkPermanentDelete(ids: string[], userId: string, username?: string): Promise<any> {
    let successCount = 0;
    const failedItems: BulkOperationError[] = [];

    for (const id of ids) {
      try {
        await this.permanentDelete(id, userId, username);
        successCount += 1;
      } catch (error) {
        failedItems.push({
          id,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    return {
      successCount,
      failedItems,
    };
  }
}
