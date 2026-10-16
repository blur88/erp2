import { jest } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { AuditLog } from '@/database/entities/audit-log.entity';
import { AuditLogService } from './audit-log.service';

describe('AuditLogService', () => {
  let service: AuditLogService;
  let repo: any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuditLogService,
        {
          provide: getRepositoryToken(AuditLog),
          useValue: {
            findAndCount: (jest.fn as unknown as any)(),
            create: (jest.fn as unknown as any)(),
            save: (jest.fn as unknown as any)(),
            find: (jest.fn as unknown as any)(),
            createQueryBuilder: (jest.fn as unknown as any)(),
          },
        },
      ],
    }).compile();

    service = module.get<AuditLogService>(AuditLogService);
    repo = module.get(getRepositoryToken(AuditLog)) as any;
  });

  it('returns full set when page/limit absent', async () => {
    const spy = jest.spyOn(repo, 'findAndCount').mockResolvedValue([[], 0] as any) as any;
    await service.findAll({} as any);
    const opts = (spy.mock.calls[0][0] as any);
    expect(opts.skip).toBeUndefined();
    expect(opts.take).toBeUndefined();
  });

  it('paginates when page/limit present', async () => {
    const spy = jest.spyOn(repo, 'findAndCount').mockResolvedValue([[], 0] as any) as any;
    await service.findAll({ page: 2, limit: 20 } as any);
    const opts = (spy.mock.calls[0][0] as any);
    expect(opts.skip).toBe(20);
    expect(opts.take).toBe(20);
  });

  describe('logInTransaction', () => {
    const createManager = (save: any): EntityManager =>
      ({
        create: (entity: new () => AuditLog, data: Partial<AuditLog>) =>
          Object.assign(new entity(), data),
        save,
      }) as unknown as EntityManager;

    it('logInTransaction saves through the given manager', async () => {
      const save = (jest.fn as unknown as any)(async (entity: AuditLog) => entity);
      const manager = createManager(save);

      await service.logInTransaction(manager, 'VOID_VENDOR_PAYMENT', 'VendorPayment', 'Payment voided', {
        entityId: 'payment-1',
        userId: 'user-1',
        metadata: { reason: 'duplicate' },
      });

      expect(save).toHaveBeenCalledTimes(1);
      const saved = save.mock.calls[0][0] as AuditLog;
      expect(saved).toBeInstanceOf(AuditLog);
      expect(saved.action).toBe('VOID_VENDOR_PAYMENT');
      expect(saved.entityType).toBe('VendorPayment');
      expect(saved.entityId).toBe('payment-1');
      expect(saved.userId).toBe('user-1');
      expect(saved.metadata).toEqual({ reason: 'duplicate' });
      expect(repo.create).not.toHaveBeenCalled();
      expect(repo.save).not.toHaveBeenCalled();
    });

    it('logInTransaction propagates a save failure', async () => {
      const manager = createManager(
        (jest.fn as unknown as any)(async () => {
          throw new Error('database unavailable');
        }),
      );

      await expect(
        service.logInTransaction(manager, 'VOID_VENDOR_PAYMENT', 'VendorPayment', 'Payment voided'),
      ).rejects.toThrow('database unavailable');
    });
  });
});
