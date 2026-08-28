import { jest } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { BadRequestException } from '@nestjs/common';
import { PriceListsService } from './price-lists.service';
import { PriceList, PriceListItem } from '@/database/entities';
import { SettingsService } from '../../settings/settings.service';
import { PriceListDefaultService } from './price-list-default.service';

describe('PriceListsService', () => {
  let service: PriceListsService;
  let priceListRepository: any;
  let module: TestingModule;

  beforeEach(async () => {
    module = await Test.createTestingModule({
      providers: [
        PriceListsService,
        {
          provide: getRepositoryToken(PriceList),
          useValue: {
            createQueryBuilder: (jest.fn as unknown as any)(),
            findOne: (jest.fn as unknown as any)(),
            create: (jest.fn as unknown as any)(),
            save: (jest.fn as unknown as any)(),
            update: (jest.fn as unknown as any)(),
            softDelete: (jest.fn as unknown as any)(),
          },
        },
        {
          provide: getRepositoryToken(PriceListItem),
          useValue: {
            findOne: (jest.fn as unknown as any)(),
            find: (jest.fn as unknown as any)(),
            create: (jest.fn as unknown as any)(),
            save: (jest.fn as unknown as any)(),
          },
        },
        {
          provide: SettingsService,
          useValue: { getRegionalSettings: (jest.fn as unknown as any)().mockResolvedValue({ timezone: 'Asia/Kuala_Lumpur' }) },
        },
        {
          provide: PriceListDefaultService,
          useValue: {
            acquireLock: (jest.fn as unknown as any)().mockResolvedValue(undefined),
            assignDefault: (jest.fn as unknown as any)().mockImplementation(async (_m, id) => ({ id, isDefault: true })),
          },
        },
        {
          provide: DataSource,
          useValue: {
            transaction: (jest.fn as unknown as any)(async (cb: any) =>
              cb({
                query: (jest.fn as unknown as any)(),
                findOne: (jest.fn as unknown as any)(),
                save: (jest.fn as unknown as any)(async (_e: any, row: any) => row),
                update: (jest.fn as unknown as any)(),
                softDelete: (jest.fn as unknown as any)(),
              }),
            ),
          },
        },
      ],
    }).compile();

    service = module.get<PriceListsService>(PriceListsService);
    priceListRepository = module.get(getRepositoryToken(PriceList));
  });

  describe('findAll pagination', () => {
    const createQb = () => ({
      andWhere: (jest.fn as unknown as any)().mockReturnThis(),
      orderBy: (jest.fn as unknown as any)().mockReturnThis(),
      addOrderBy: (jest.fn as unknown as any)().mockReturnThis(),
      skip: (jest.fn as unknown as any)().mockReturnThis(),
      take: (jest.fn as unknown as any)().mockReturnThis(),
      getManyAndCount: (jest.fn as unknown as any)().mockResolvedValue([[], 0]),
    });

    it('returns full set when page/limit absent', async () => {
      const qb = createQb();
      priceListRepository.createQueryBuilder.mockReturnValue(qb as any);
      await service.findAll({} as any);
      expect(qb.skip).not.toHaveBeenCalled();
    });

    it('paginates when page/limit present', async () => {
      const qb = createQb();
      priceListRepository.createQueryBuilder.mockReturnValue(qb as any);
      await service.findAll({ page: 2, limit: 20 } as any);
      expect(qb.skip).toHaveBeenCalledWith(20);
      expect(qb.take).toHaveBeenCalledWith(20);
    });
  });

  describe('update guards on the default price list', () => {
    const runUpdate = (existing: any, dto: any) => {
      const manager = {
        query: (jest.fn as unknown as any)(),
        findOne: (jest.fn as unknown as any)().mockResolvedValue(existing),
        save: (jest.fn as unknown as any)(async (_e: any, row: any) => row),
        update: (jest.fn as unknown as any)(),
      };
      const dataSource = module.get(DataSource) as any;
      dataSource.transaction.mockImplementation(async (cb: any) => cb(manager));
      return { promise: service.update('a', dto), manager };
    };

    it('rejects unsetting the current default', async () => {
      const { promise } = runUpdate(
        { id: 'a', isDefault: true, isActive: true },
        { isDefault: false },
      );
      await expect(promise).rejects.toThrow(BadRequestException);
    });

    it('rejects deactivating the current default', async () => {
      const { promise } = runUpdate(
        { id: 'a', isDefault: true, isActive: true },
        { isActive: false },
      );
      await expect(promise).rejects.toThrow(BadRequestException);
    });

    it('rejects promoting a non-default via generic update', async () => {
      const { promise } = runUpdate(
        { id: 'a', isDefault: false, isActive: true },
        { isDefault: true },
      );
      await expect(promise).rejects.toThrow(BadRequestException);
    });

    it('allows an idempotent isDefault:true on the list that is already default', async () => {
      const { promise } = runUpdate(
        { id: 'a', isDefault: true, isActive: true },
        { isDefault: true, name: 'Renamed' },
      );
      await expect(promise).resolves.toMatchObject({ name: 'Renamed' });
    });

    it('allows editing name and description on the default', async () => {
      const { promise } = runUpdate(
        { id: 'a', isDefault: true, isActive: true },
        { name: 'New', description: 'Desc' },
      );
      await expect(promise).resolves.toMatchObject({ name: 'New' });
    });

    it('acquires the lock before reloading the entity', async () => {
      const calls: string[] = [];
      const manager = {
        query: (jest.fn as unknown as any)(),
        findOne: (jest.fn as unknown as any)(async () => {
          calls.push('findOne');
          return { id: 'a', isDefault: false, isActive: true };
        }),
        save: (jest.fn as unknown as any)(async (_e: any, row: any) => row),
        update: (jest.fn as unknown as any)(),
      };
      const dataSource = module.get(DataSource) as any;
      dataSource.transaction.mockImplementation(async (cb: any) => cb(manager));

      const defaults = module.get(PriceListDefaultService) as any;
      defaults.acquireLock.mockImplementation(async () => {
        calls.push('acquireLock');
      });

      await service.update('a', { name: 'New' } as any);

      expect(calls).toEqual(['acquireLock', 'findOne']);
    });
  });

  describe('create', () => {
    it('delegates to assignDefault inside the same transaction when isDefault is true', async () => {
      const manager = {
        query: (jest.fn as unknown as any)(),
        findOne: (jest.fn as unknown as any)().mockResolvedValue(null),
        create: (jest.fn as unknown as any)((_e: any, row: any) => row),
        save: (jest.fn as unknown as any)(async (_e: any, row: any) => ({ ...row, id: 'new-id' })),
        update: (jest.fn as unknown as any)(),
      };
      const dataSource = module.get(DataSource) as any;
      dataSource.transaction.mockImplementation(async (cb: any) => cb(manager));

      await service.create({ code: 'X', name: 'X', isDefault: true } as any);

      const defaults = module.get(PriceListDefaultService) as any;
      expect(defaults.assignDefault).toHaveBeenCalledWith(manager, 'new-id');
    });

    it('does not call assignDefault when isDefault is absent', async () => {
      const manager = {
        query: (jest.fn as unknown as any)(),
        findOne: (jest.fn as unknown as any)().mockResolvedValue(null),
        create: (jest.fn as unknown as any)((_e: any, row: any) => row),
        save: (jest.fn as unknown as any)(async (_e: any, row: any) => ({ ...row, id: 'new-id' })),
        update: (jest.fn as unknown as any)(),
      };
      const dataSource = module.get(DataSource) as any;
      dataSource.transaction.mockImplementation(async (cb: any) => cb(manager));

      await service.create({ code: 'X', name: 'X' } as any);

      const defaults = module.get(PriceListDefaultService) as any;
      expect(defaults.assignDefault).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('rejects deleting the default after reloading under the lock', async () => {
      const manager = {
        query: (jest.fn as unknown as any)(),
        findOne: (jest.fn as unknown as any)().mockResolvedValue({ id: 'a', isDefault: true }),
        softDelete: (jest.fn as unknown as any)(),
      };
      const dataSource = module.get(DataSource) as any;
      dataSource.transaction.mockImplementation(async (cb: any) => cb(manager));

      await expect(service.remove('a')).rejects.toThrow(BadRequestException);
      expect(manager.softDelete).not.toHaveBeenCalled();
    });
  });

  describe('getDefaultPriceList', () => {
    it('only returns an ACTIVE default', async () => {
      priceListRepository.findOne.mockResolvedValue({ id: 'a' } as any);
      await service.getDefaultPriceList();

      const [args] = priceListRepository.findOne.mock.calls[0];
      expect((args as any).where.isActive).toBe(true);
    });
  });
});
