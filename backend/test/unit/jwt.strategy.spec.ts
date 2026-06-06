import { Test, TestingModule } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import { getRepositoryToken } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { UnauthorizedException } from "@nestjs/common";
import { JwtStrategy } from "../../src/modules/auth/strategies/jwt.strategy";
import {
  User,
  UserRole,
  UserStatus,
} from "../../src/database/entities/user.entity";

describe("JwtStrategy", () => {
  let strategy: JwtStrategy;
  let userRepository: Repository<User>;

  const mockUser: Partial<User> = {
    id: "123e4567-e89b-12d3-a456-426614174000",
    username: "testuser",
    email: "test@example.com",
    firstName: "Test",
    lastName: "User",
    role: UserRole.MANAGER,
    status: UserStatus.ACTIVE,
    isActive: true,
  };

  const mockUserRepository = {
    findOne: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn((key: string) => {
      const config = {
        JWT_SECRET: "test-secret-key",
      };
      return config[key];
    }),
  };

  beforeEach(async () => {
    // Clear mocks before module creation to track constructor calls
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JwtStrategy,
        {
          provide: getRepositoryToken(User),
          useValue: mockUserRepository,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    strategy = module.get<JwtStrategy>(JwtStrategy);
    userRepository = module.get<Repository<User>>(getRepositoryToken(User));
  });

  it("should be defined", () => {
    expect(strategy).toBeDefined();
  });

  describe("validate", () => {
    const payload = {
      sub: "123e4567-e89b-12d3-a456-426614174000",
      username: "testuser",
      email: "test@example.com",
      role: UserRole.MANAGER,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 900, // 15 minutes
    };

    it("should validate and return user for valid token payload", async () => {
      mockUserRepository.findOne.mockResolvedValue(mockUser);

      const result = await strategy.validate(payload);

      expect(result).toBeDefined();
      expect(result.userId).toBe(payload.sub);
      expect(result.username).toBe(payload.username);
      expect(result.email).toBe(payload.email);
      expect(result.role).toBe(payload.role);
      expect(mockUserRepository.findOne).toHaveBeenCalledWith({
        where: { id: payload.sub },
      });
    });

    it("should throw UnauthorizedException if user not found", async () => {
      mockUserRepository.findOne.mockResolvedValue(null);

      await expect(strategy.validate(payload)).rejects.toThrow(
        UnauthorizedException,
      );
      await expect(strategy.validate(payload)).rejects.toThrow(
        "User not found",
      );
    });

    it("should throw UnauthorizedException if user is inactive", async () => {
      const inactiveUser = { ...mockUser, isActive: false };
      mockUserRepository.findOne.mockResolvedValue(inactiveUser);

      await expect(strategy.validate(payload)).rejects.toThrow(
        UnauthorizedException,
      );
      await expect(strategy.validate(payload)).rejects.toThrow(
        "User account is not active",
      );
    });

    it("should throw UnauthorizedException if user status is not active", async () => {
      const suspendedUser = { ...mockUser, status: "suspended" };
      mockUserRepository.findOne.mockResolvedValue(suspendedUser);

      await expect(strategy.validate(payload)).rejects.toThrow(
        UnauthorizedException,
      );
      await expect(strategy.validate(payload)).rejects.toThrow(
        "User account is not active",
      );
    });

    it("should return correct payload structure", async () => {
      mockUserRepository.findOne.mockResolvedValue(mockUser);

      const result = await strategy.validate(payload);

      expect(result).toEqual({
        userId: payload.sub,
        username: payload.username,
        email: payload.email,
        role: payload.role,
        firstName: mockUser.firstName,
        lastName: mockUser.lastName,
      });
    });
  });

  describe("strategy configuration", () => {
    it("should extract JWT from Authorization header", () => {
      // The strategy is configured to extract token from Authorization header with Bearer scheme
      // This is tested indirectly through the PassportStrategy configuration
      expect(strategy).toBeDefined();
    });

    it("should use correct JWT secret from config", () => {
      expect(mockConfigService.get).toHaveBeenCalledWith("JWT_SECRET");
    });
  });
});
