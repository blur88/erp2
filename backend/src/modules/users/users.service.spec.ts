import { jest } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../../database/entities/user.entity';
import { UsersService } from './users.service';

describe('UsersService', () => {
  let service: UsersService;
  let userRepository: Repository<User>;

  const mockUserRepository = {
    update: (jest.fn as unknown as any)(),
    createQueryBuilder: (jest.fn as unknown as any)(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        {
          provide: getRepositoryToken(User),
          useValue: mockUserRepository,
        },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
    userRepository = module.get<Repository<User>>(getRepositoryToken(User));

    jest.clearAllMocks();
  });

  describe('findAll pagination', () => {
    const createQb = () => ({
      andWhere: (jest.fn as unknown as any)().mockReturnThis(),
      orderBy: (jest.fn as unknown as any)().mockReturnThis(),
      skip: (jest.fn as unknown as any)().mockReturnThis(),
      take: (jest.fn as unknown as any)().mockReturnThis(),
      getManyAndCount: (jest.fn as unknown as any)().mockResolvedValue([[], 0]),
    });

    it('returns full set when page/limit absent', async () => {
      const qb = createQb();
      jest.spyOn(service as any, 'createQueryBuilder').mockReturnValue(qb);
      jest.spyOn(userRepository, 'update').mockResolvedValue({ affected: 0 } as any);
      await service.findAll({} as any);
      expect(qb.skip).not.toHaveBeenCalled();
    });

    it('paginates when page/limit present', async () => {
      const qb = createQb();
      jest.spyOn(service as any, 'createQueryBuilder').mockReturnValue(qb);
      jest.spyOn(userRepository, 'update').mockResolvedValue({ affected: 0 } as any);
      await service.findAll({ page: 2, limit: 20 } as any);
      expect(qb.skip).toHaveBeenCalledWith(20);
      expect(qb.take).toHaveBeenCalledWith(20);
    });
  });

  describe('findAll sort resolution (#961)', () => {
    const createSortQb = () => ({
      andWhere: (jest.fn as unknown as any)().mockReturnThis(),
      orderBy: (jest.fn as unknown as any)().mockReturnThis(),
      skip: (jest.fn as unknown as any)().mockReturnThis(),
      take: (jest.fn as unknown as any)().mockReturnThis(),
      getManyAndCount: (jest.fn as unknown as any)().mockResolvedValue([[], 0]),
    });

    const runFindAll = async (query: Record<string, unknown>) => {
      const qb = createSortQb();
      jest.spyOn(service as any, 'createQueryBuilder').mockReturnValue(qb);
      jest.spyOn(userRepository, 'update').mockResolvedValue({ affected: 0 } as any);
      await service.findAll(query as any);
      return qb;
    };

    it('never emits user.undefined when sortBy is absent', async () => {
      const qb = await runFindAll({});

      const orderByFields = qb.orderBy.mock.calls.map((call: unknown[]) => call[0]);
      expect(orderByFields).not.toContain('user.undefined');
      expect(orderByFields).toEqual(['user.createdAt']);
    });

    it('falls back to createdAt when sortBy is not in the allow-list', async () => {
      const qb = await runFindAll({ sortBy: 'bogus; DROP TABLE users', sortOrder: 'ASC' });

      expect(qb.orderBy).toHaveBeenCalledWith('user.createdAt', 'ASC');
    });

    it('passes an allow-listed sortBy through unchanged', async () => {
      const qb = await runFindAll({ sortBy: 'username', sortOrder: 'ASC' });

      expect(qb.orderBy).toHaveBeenCalledWith('user.username', 'ASC');
    });
  });

  describe('findAll() lazy lock self-heal (issue #710)', () => {
    const createQueryBuilderMock = () => ({
      andWhere: (jest.fn as unknown as any)().mockReturnThis(),
      orderBy: (jest.fn as unknown as any)().mockReturnThis(),
      skip: (jest.fn as unknown as any)().mockReturnThis(),
      take: (jest.fn as unknown as any)().mockReturnThis(),
      getManyAndCount: (jest.fn as unknown as any)().mockResolvedValue([[], 0]),
    });

    it('clears expired locks via a single bulk update before returning', async () => {
      const qb = createQueryBuilderMock();
      jest.spyOn(service as any, 'createQueryBuilder').mockReturnValue(qb);
      const updateSpy = jest
        .spyOn(userRepository, 'update')
        .mockResolvedValue({ affected: 1 } as any);

      await service.findAll({
        page: 1,
        limit: 10,
        sortBy: 'username',
        sortOrder: 'ASC',
      } as any);

      expect(updateSpy).toHaveBeenCalledTimes(1);
      const [criteria, partial] = updateSpy.mock.calls[0];
      expect(criteria).toEqual(
        expect.objectContaining({ lockedUntil: expect.anything() }),
      );
      expect(partial).toEqual({ lockedUntil: null, failedLoginAttempts: 0 });
    });

    it('skips the cleanup update when explicitly filtering isLocked === true', async () => {
      const qb = createQueryBuilderMock();
      jest.spyOn(service as any, 'createQueryBuilder').mockReturnValue(qb);
      const updateSpy = jest
        .spyOn(userRepository, 'update')
        .mockResolvedValue({ affected: 0 } as any);

      await service.findAll({
        page: 1,
        limit: 10,
        sortBy: 'username',
        sortOrder: 'ASC',
        isLocked: true,
      } as any);

      expect(updateSpy).not.toHaveBeenCalled();
    });

    it('does not fail findAll when the cleanup update throws', async () => {
      const qb = createQueryBuilderMock();
      jest.spyOn(service as any, 'createQueryBuilder').mockReturnValue(qb);
      jest.spyOn(userRepository, 'update').mockRejectedValue(new Error('db down'));

      await expect(
        service.findAll({
          page: 1,
          limit: 10,
          sortBy: 'username',
          sortOrder: 'ASC',
        } as any),
      ).resolves.toBeDefined();
    });
  });
});
