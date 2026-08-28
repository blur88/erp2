import { jest } from '@jest/globals';
import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { FindOptionsWhere, Repository } from 'typeorm';

import { BaseEntity } from '../../database/entities/base.entity';
import { AuditLogService } from '../../modules/audit-logs/services';
import { BaseCrudService } from './base-crud.service';

class TestEntity extends BaseEntity {
  name: string;
}

class TestQueryDto {
  search?: string;
  isActive?: boolean;
  sortBy?: string;
  sortOrder?: 'ASC' | 'DESC';
}

class TestCreateDto {
  name: string;
}

class TestUpdateDto {
  name?: string;
}

class TestCrudService extends BaseCrudService<
  TestEntity,
  TestCreateDto,
  TestUpdateDto,
  TestQueryDto
> {
  constructor(repo: Repository<TestEntity>, auditLogService: AuditLogService) {
    super(repo, auditLogService);
  }

  getEntityType(): string {
    return 'TestEntity';
  }

  buildWhereClause(query: TestQueryDto): FindOptionsWhere<TestEntity> {
    const where: FindOptionsWhere<TestEntity> = {};

    if (query.isActive !== undefined) {
      where.isActive = query.isActive;
    }

    return where;
  }
}

describe('BaseCrudService', () => {
  let service: TestCrudService;
  let repo: any;
  let auditLogService: any;

  const mockEntity: TestEntity = {
    id: 'uuid-1',
    name: 'Test',
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as TestEntity;

  const makeQb = (rows: TestEntity[] = [], total = 0) => {
    const qb: any = {
      andWhere: (jest.fn as unknown as any)().mockReturnThis(),
      where: (jest.fn as unknown as any)().mockReturnThis(),
      withDeleted: (jest.fn as unknown as any)().mockReturnThis(),
      orderBy: (jest.fn as unknown as any)().mockReturnThis(),
      skip: (jest.fn as unknown as any)().mockReturnThis(),
      take: (jest.fn as unknown as any)().mockReturnThis(),
      getManyAndCount: (jest.fn as unknown as any)().mockResolvedValue([rows, total]),
      getMany: (jest.fn as unknown as any)().mockResolvedValue(rows),
    };
    return qb;
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        {
          provide: getRepositoryToken(TestEntity),
          useValue: {
            createQueryBuilder: (jest.fn as unknown as any)(),
            findOne: (jest.fn as unknown as any)(),
            create: (jest.fn as unknown as any)(),
            save: (jest.fn as unknown as any)(),
            softDelete: (jest.fn as unknown as any)(),
            restore: (jest.fn as unknown as any)(),
            delete: (jest.fn as unknown as any)(),
          },
        },
        {
          provide: AuditLogService,
          useValue: {
            log: (jest.fn as unknown as any)().mockResolvedValue(undefined),
          },
        },
        {
          provide: TestCrudService,
          useFactory: (repository: Repository<TestEntity>, auditLog: AuditLogService) =>
            new TestCrudService(repository, auditLog),
          inject: [getRepositoryToken(TestEntity), AuditLogService],
        },
      ],
    }).compile();

    service = module.get(TestCrudService);
    repo = module.get(getRepositoryToken(TestEntity));
    auditLogService = module.get(AuditLogService);
  });

  it('findOne throws NotFoundException when entity missing', async () => {
    (repo.findOne as any).mockResolvedValue(null);

    await expect(service.findOne('missing-id')).rejects.toThrow(NotFoundException);
  });

  it('findOne returns entity when found', async () => {
    (repo.findOne as any).mockResolvedValue(mockEntity);

    const result = await service.findOne('uuid-1');

    expect(result).toBe(mockEntity);
  });

  it('softDelete calls repo.softDelete and logs audit', async () => {
    (repo.findOne as any).mockResolvedValue(mockEntity);
    (repo.softDelete as any).mockResolvedValue(undefined);

    await service.softDelete('uuid-1', 'user-1', 'admin');

    expect(repo.softDelete).toHaveBeenCalledWith('uuid-1');
    expect(auditLogService.log).toHaveBeenCalledWith(
      'DELETE',
      'TestEntity',
      expect.any(String),
      expect.objectContaining({
        entityId: 'uuid-1',
        userId: 'user-1',
        username: 'admin',
      }),
    );
  });

  it('restore calls repo.restore and logs audit', async () => {
    (repo.findOne as any).mockResolvedValueOnce(mockEntity);
    (repo.restore as any).mockResolvedValue(undefined);
    (repo.findOne as any).mockResolvedValueOnce({ ...mockEntity, isActive: true });

    await service.restore('uuid-1', 'user-1', 'admin');

    expect(repo.restore).toHaveBeenCalledWith('uuid-1');
    expect(auditLogService.log).toHaveBeenCalledWith(
      'RESTORE',
      'TestEntity',
      expect.any(String),
      expect.objectContaining({ entityId: 'uuid-1' }),
    );
  });

  it('bulkRestore returns successCount and failedItems', async () => {
    (repo.findOne as any)
      .mockResolvedValueOnce(mockEntity)
      .mockResolvedValueOnce({ ...mockEntity, isActive: true })
      .mockResolvedValueOnce(null);
    (repo.restore as any).mockResolvedValue(undefined);

    const result = await service.bulkRestore(['uuid-1', 'uuid-missing'], 'user-1', 'admin');

    expect(result.successCount).toBe(1);
    expect(result.failedItems).toHaveLength(1);
    expect(result.failedItems[0].id).toBe('uuid-missing');
  });

  it('findDeleted calls applyQueryBuilder so joins are applied to deleted queries', async () => {
    class JoinedCrudService extends BaseCrudService<
      TestEntity,
      TestCreateDto,
      TestUpdateDto,
      TestQueryDto
    > {
      getEntityType() {
        return 'TestEntity';
      }

      buildWhereClause() {
        return {};
      }

      protected applyQueryBuilder(qb: any, _query: TestQueryDto) {
        return qb.leftJoinAndSelect('testentity.related', 'related');
      }
    }

    const joinedService = new JoinedCrudService(repo as any, auditLogService);
    const qb = {
      ...makeQb([mockEntity]),
      leftJoinAndSelect: (jest.fn as unknown as any)().mockReturnThis(),
    };
    (repo.createQueryBuilder as any).mockReturnValue(qb);

    await joinedService.findDeleted({});

    expect(qb.leftJoinAndSelect).toHaveBeenCalledWith('testentity.related', 'related');
  });

  it('permanentDelete calls repo.delete and logs audit', async () => {
    (repo.findOne as any).mockResolvedValue(mockEntity);
    (repo.delete as any).mockResolvedValue(undefined);

    await service.permanentDelete('uuid-1', 'user-1', 'admin');

    expect(repo.delete).toHaveBeenCalledWith('uuid-1');
    expect(auditLogService.log).toHaveBeenCalledWith(
      'PERMANENT_DELETE',
      'TestEntity',
      expect.any(String),
      expect.objectContaining({ entityId: 'uuid-1' }),
    );
  });

  it('create saves entity and logs CREATE audit', async () => {
    const dto: TestCreateDto = { name: 'New Entity' };
    const saved = { ...mockEntity, name: 'New Entity' };
    (repo.create as any).mockReturnValue(saved);
    (repo.save as any).mockResolvedValue(saved);

    const result = await service.create(dto, 'user-1', 'admin');

    expect(repo.create).toHaveBeenCalledWith(dto);
    expect(repo.save).toHaveBeenCalledWith(saved);
    expect(auditLogService.log).toHaveBeenCalledWith(
      'CREATE',
      'TestEntity',
      expect.any(String),
      expect.objectContaining({
        entityId: saved.id,
        userId: 'user-1',
        username: 'admin',
        newValues: dto,
      }),
    );
    expect(result).toBe(saved);
  });

  it('update captures immutable before-snapshot for afterUpdate', async () => {
    const dto: TestUpdateDto = { name: 'Updated Name' };
    const original = { ...mockEntity, name: 'Original Name' };
    const saved = { ...mockEntity, name: 'Updated Name' };

    (repo.findOne as any).mockResolvedValue(original);
    (repo.save as any).mockResolvedValue(saved);

    const afterUpdateSpy = jest.spyOn(service as any, 'afterUpdate');

    await service.update('uuid-1', dto, 'user-1', 'admin');

    // The before argument passed to afterUpdate must still show 'Original Name',
    // not 'Updated Name' — verifying the snapshot is immutable.
    const [before, after] = afterUpdateSpy.mock.calls[0];
    expect((before as TestEntity).name).toBe('Original Name');
    expect((after as TestEntity).name).toBe('Updated Name');
  });

  it('findAll returns data and total via getManyAndCount', async () => {
    const qb = makeQb([mockEntity], 1);
    (repo.createQueryBuilder as any).mockReturnValue(qb);

    const result = await service.findAll({});

    expect(qb.getManyAndCount).toHaveBeenCalled();
    expect(result.data).toEqual([mockEntity]);
    expect(result.total).toBe(1);
  });

  it('findAll applies pagination when page and limit provided', async () => {
    const qb = makeQb([mockEntity], 1);
    (repo.createQueryBuilder as any).mockReturnValue(qb);

    await service.findAll({ page: 2, limit: 10 } as any);

    expect(qb.skip).toHaveBeenCalledWith(10); // (page-1) * limit
    expect(qb.take).toHaveBeenCalledWith(10);
  });

  it('findAll does not call applySearch when no search term', async () => {
    const qb = makeQb([mockEntity], 1);
    (repo.createQueryBuilder as any).mockReturnValue(qb);
    const applySearchSpy = jest.spyOn(service as any, 'applySearch');

    await service.findAll({});

    expect(applySearchSpy).not.toHaveBeenCalled();
  });

  it('findAll calls applySearch when search term provided', async () => {
    const qb = makeQb([mockEntity], 1);
    (repo.createQueryBuilder as any).mockReturnValue(qb);
    const applySearchSpy = jest.spyOn(service as any, 'applySearch').mockReturnValue(qb);

    await service.findAll({ search: 'test' });

    expect(applySearchSpy).toHaveBeenCalledWith(qb, 'test', 'testentity');
  });

  it('findAll falls back to createdAt when sortBy is not in allowedSortFields', async () => {
    const qb = makeQb([mockEntity], 1);
    (repo.createQueryBuilder as any).mockReturnValue(qb);

    await service.findAll({ sortBy: 'injected; DROP TABLE--', sortOrder: 'ASC' });

    expect(qb.orderBy).toHaveBeenCalledWith('testentity.createdAt', 'ASC');
  });

  it('update logs UPDATE audit with oldValues and newValues', async () => {
    const dto: TestUpdateDto = { name: 'Updated Name' };
    const original = { ...mockEntity, name: 'Original Name' };
    const saved = { ...mockEntity, name: 'Updated Name' };

    (repo.findOne as any).mockResolvedValue(original);
    (repo.save as any).mockResolvedValue(saved);

    await service.update('uuid-1', dto, 'user-1', 'admin');

    expect(auditLogService.log).toHaveBeenCalledWith(
      'UPDATE',
      'TestEntity',
      expect.any(String),
      expect.objectContaining({
        entityId: 'uuid-1',
        userId: 'user-1',
        username: 'admin',
        newValues: dto,
      }),
    );
  });
});
