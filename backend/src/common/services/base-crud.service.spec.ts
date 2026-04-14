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
  let repo: jest.Mocked<Repository<TestEntity>>;
  let auditLogService: jest.Mocked<AuditLogService>;

  const mockEntity: TestEntity = {
    id: 'uuid-1',
    name: 'Test',
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as TestEntity;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        {
          provide: getRepositoryToken(TestEntity),
          useValue: {
            createQueryBuilder: jest.fn(),
            findOne: jest.fn(),
            create: jest.fn(),
            save: jest.fn(),
            softDelete: jest.fn(),
            restore: jest.fn(),
            delete: jest.fn(),
          },
        },
        {
          provide: AuditLogService,
          useValue: {
            log: jest.fn().mockResolvedValue(undefined),
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
    (repo.findOne as jest.Mock).mockResolvedValue(null);

    await expect(service.findOne('missing-id')).rejects.toThrow(NotFoundException);
  });

  it('findOne returns entity when found', async () => {
    (repo.findOne as jest.Mock).mockResolvedValue(mockEntity);

    const result = await service.findOne('uuid-1');

    expect(result).toBe(mockEntity);
  });

  it('softDelete calls repo.softDelete and logs audit', async () => {
    (repo.findOne as jest.Mock).mockResolvedValue(mockEntity);
    (repo.softDelete as jest.Mock).mockResolvedValue(undefined);

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
    (repo.findOne as jest.Mock).mockResolvedValueOnce(mockEntity);
    (repo.restore as jest.Mock).mockResolvedValue(undefined);
    (repo.findOne as jest.Mock).mockResolvedValueOnce({ ...mockEntity, isActive: true });

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
    (repo.findOne as jest.Mock)
      .mockResolvedValueOnce(mockEntity)
      .mockResolvedValueOnce({ ...mockEntity, isActive: true })
      .mockResolvedValueOnce(null);
    (repo.restore as jest.Mock).mockResolvedValue(undefined);

    const result = await service.bulkRestore(['uuid-1', 'uuid-missing'], 'user-1', 'admin');

    expect(result.successCount).toBe(1);
    expect(result.failedItems).toHaveLength(1);
    expect(result.failedItems[0].id).toBe('uuid-missing');
  });

  it('permanentDelete calls repo.delete and logs audit', async () => {
    (repo.findOne as jest.Mock).mockResolvedValue(mockEntity);
    (repo.delete as jest.Mock).mockResolvedValue(undefined);

    await service.permanentDelete('uuid-1', 'user-1', 'admin');

    expect(repo.delete).toHaveBeenCalledWith('uuid-1');
    expect(auditLogService.log).toHaveBeenCalledWith(
      'PERMANENT_DELETE',
      'TestEntity',
      expect.any(String),
      expect.objectContaining({ entityId: 'uuid-1' }),
    );
  });
});
