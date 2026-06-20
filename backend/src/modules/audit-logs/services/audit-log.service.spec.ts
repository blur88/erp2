import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLog } from '@/database/entities/audit-log.entity';
import { AuditLogService } from './audit-log.service';

describe('AuditLogService', () => {
  let service: AuditLogService;
  let repo: jest.Mocked<Repository<AuditLog>>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuditLogService,
        {
          provide: getRepositoryToken(AuditLog),
          useValue: {
            findAndCount: jest.fn(),
            create: jest.fn(),
            save: jest.fn(),
            find: jest.fn(),
            createQueryBuilder: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<AuditLogService>(AuditLogService);
    repo = module.get(getRepositoryToken(AuditLog)) as jest.Mocked<Repository<AuditLog>>;
  });

  it('returns full set when page/limit absent', async () => {
    const spy = jest.spyOn(repo, 'findAndCount').mockResolvedValue([[], 0]);
    await service.findAll({} as any);
    const opts = spy.mock.calls[0][0];
    expect(opts.skip).toBeUndefined();
    expect(opts.take).toBeUndefined();
  });

  it('paginates when page/limit present', async () => {
    const spy = jest.spyOn(repo, 'findAndCount').mockResolvedValue([[], 0]);
    await service.findAll({ page: 2, limit: 20 } as any);
    const opts = spy.mock.calls[0][0];
    expect(opts.skip).toBe(20);
    expect(opts.take).toBe(20);
  });
});
