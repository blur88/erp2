import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { User } from "../../database/entities/user.entity";
import { UsersService } from "./users.service";

describe("UsersService", () => {
  let service: UsersService;
  let userRepository: Repository<User>;

  const mockUserRepository = {
    update: jest.fn(),
    createQueryBuilder: jest.fn(),
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

  describe("findAll() lazy lock self-heal (issue #710)", () => {
    const createQueryBuilderMock = () => ({
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
    });

    it("clears expired locks via a single bulk update before returning", async () => {
      const qb = createQueryBuilderMock();
      jest.spyOn(service as any, "createQueryBuilder").mockReturnValue(qb);
      const updateSpy = jest
        .spyOn(userRepository, "update")
        .mockResolvedValue({ affected: 1 } as any);

      await service.findAll({
        page: 1,
        limit: 10,
        sortBy: "username",
        sortOrder: "ASC",
      } as any);

      expect(updateSpy).toHaveBeenCalledTimes(1);
      const [criteria, partial] = updateSpy.mock.calls[0];
      expect(criteria).toEqual(
        expect.objectContaining({ lockedUntil: expect.anything() }),
      );
      expect(partial).toEqual({ lockedUntil: null, failedLoginAttempts: 0 });
    });

    it("skips the cleanup update when explicitly filtering isLocked === true", async () => {
      const qb = createQueryBuilderMock();
      jest.spyOn(service as any, "createQueryBuilder").mockReturnValue(qb);
      const updateSpy = jest
        .spyOn(userRepository, "update")
        .mockResolvedValue({ affected: 0 } as any);

      await service.findAll({
        page: 1,
        limit: 10,
        sortBy: "username",
        sortOrder: "ASC",
        isLocked: true,
      } as any);

      expect(updateSpy).not.toHaveBeenCalled();
    });

    it("does not fail findAll when the cleanup update throws", async () => {
      const qb = createQueryBuilderMock();
      jest.spyOn(service as any, "createQueryBuilder").mockReturnValue(qb);
      jest
        .spyOn(userRepository, "update")
        .mockRejectedValue(new Error("db down"));

      await expect(
        service.findAll({
          page: 1,
          limit: 10,
          sortBy: "username",
          sortOrder: "ASC",
        } as any),
      ).resolves.toBeDefined();
    });
  });
});
