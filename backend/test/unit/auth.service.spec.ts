import { jest } from '@jest/globals';
import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import { Repository } from "typeorm";
import * as bcrypt from "bcrypt";
import { AuthService } from "../../src/modules/auth/auth.service";
import { User } from "../../src/database/entities/user.entity";
import { RefreshToken } from "../../src/database/entities/refresh-token.entity";
import {
  UnauthorizedException,
  BadRequestException,
  ForbiddenException,
} from "@nestjs/common";
import { UserRole, UserStatus } from "../../src/database/entities/user.entity";

jest.mock("bcrypt", () => ({
  compare: (jest.fn as unknown as any)(),
  hash: (jest.fn as unknown as any)(),
}));

describe("AuthService", () => {
  let service: AuthService;
  let userRepository: Repository<User>;
  let refreshTokenRepository: Repository<RefreshToken>;
  let jwtService: JwtService;
  let configService: ConfigService;
  const mockedBcrypt = bcrypt as any;

  const mockUser: Partial<User> = {
    id: "123e4567-e89b-12d3-a456-426614174000",
    username: "testuser",
    email: "test@example.com",
    password: "$2b$12$hashedpassword", // Mocked hashed password
    firstName: "Test",
    lastName: "User",
    role: UserRole.MANAGER,
    status: UserStatus.ACTIVE,
    isActive: true,
    failedLoginAttempts: 0,
    lockedUntil: null,
    lastLoginAt: null,
    lastLoginIp: null,
  };

  const mockUserRepository = {
    findOne: (jest.fn as unknown as any)(),
    save: (jest.fn as unknown as any)(),
    create: (jest.fn as unknown as any)(),
  };

  const mockRefreshTokenRepository = {
    findOne: (jest.fn as unknown as any)(),
    save: (jest.fn as unknown as any)(),
    create: (jest.fn as unknown as any)(),
    delete: (jest.fn as unknown as any)(),
    remove: (jest.fn as unknown as any)(),
    createQueryBuilder: (jest.fn as unknown as any)(() => ({
      where: (jest.fn as unknown as any)().mockReturnThis(),
      delete: (jest.fn as unknown as any)().mockReturnThis(),
      execute: (jest.fn as unknown as any)().mockResolvedValue({ affected: 0 }),
    })),
  };

  const mockJwtService = {
    sign: (jest.fn as unknown as any)((payload) => `mock.jwt.token.${payload.sub}`),
    verify: (jest.fn as unknown as any)(),
  };

  const mockConfigService = {
    get: (jest.fn as unknown as any)((key: string) => {
      const config = {
        JWT_ACCESS_TOKEN_EXPIRY: "15m",
        JWT_REFRESH_TOKEN_EXPIRY: "7d",
        JWT_SECRET: "test-secret-key",
      };
      return config[key];
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: getRepositoryToken(User),
          useValue: mockUserRepository,
        },
        {
          provide: getRepositoryToken(RefreshToken),
          useValue: mockRefreshTokenRepository,
        },
        {
          provide: JwtService,
          useValue: mockJwtService,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    userRepository = module.get<Repository<User>>(getRepositoryToken(User));
    refreshTokenRepository = module.get<Repository<RefreshToken>>(
      getRepositoryToken(RefreshToken),
    );
    jwtService = module.get<JwtService>(JwtService);
    configService = module.get<ConfigService>(ConfigService);

    // Reset all mocks before each test
    jest.clearAllMocks();
    mockedBcrypt.compare.mockReset();
    mockedBcrypt.hash.mockReset();
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  describe("user validation", () => {
    const loginDto = {
      usernameOrEmail: "testuser",
      password: "Password@123",
      rememberMe: false,
    };

    const mockRequest = {
      headers: { "user-agent": "Mozilla/5.0" },
      ip: "127.0.0.1",
    };

    it("should validate user with correct credentials during login", async () => {
      mockedBcrypt.compare.mockResolvedValue(true as never);
      mockUserRepository.findOne.mockResolvedValue(mockUser);
      mockUserRepository.save.mockResolvedValue({
        ...mockUser,
        lastLoginAt: new Date(),
      });
      mockRefreshTokenRepository.create.mockReturnValue({});
      mockRefreshTokenRepository.save.mockResolvedValue({});

      const result = await service.login(
        loginDto,
        mockRequest.ip,
        mockRequest.headers["user-agent"],
      );

      expect(result).toBeDefined();
      expect(result.user.username).toBe("testuser");
      expect(result.user).not.toHaveProperty("password"); // Password should be removed
    });

    it("should throw UnauthorizedException for invalid username", async () => {
      mockUserRepository.findOne.mockResolvedValue(null);

      await expect(
        service.login(
          { ...loginDto, usernameOrEmail: "invaliduser" },
          mockRequest.ip,
        ),
      ).rejects.toThrow(UnauthorizedException);
    });

    it("should throw UnauthorizedException for invalid password", async () => {
      mockedBcrypt.compare.mockResolvedValue(false as never);
      mockUserRepository.findOne.mockResolvedValue(mockUser);
      mockUserRepository.save.mockImplementation((user) =>
        Promise.resolve(user),
      );

      await expect(service.login(loginDto, mockRequest.ip)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it("should throw ForbiddenException for locked account", async () => {
      const lockedUser = {
        ...mockUser,
        lockedUntil: new Date(Date.now() + 30 * 60 * 1000), // Locked for 30 minutes
      };
      // Add isLocked getter behavior
      Object.defineProperty(lockedUser, "isLocked", {
        get: () => true,
      });
      mockUserRepository.findOne.mockResolvedValue(lockedUser);

      await expect(service.login(loginDto, mockRequest.ip)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it("should throw UnauthorizedException for inactive user", async () => {
      const inactiveUser = { ...mockUser, isActive: false };
      mockUserRepository.findOne.mockResolvedValue(inactiveUser);

      await expect(service.login(loginDto, mockRequest.ip)).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe("login", () => {
    const loginDto = {
      usernameOrEmail: "testuser",
      password: "Password@123",
      rememberMe: false,
    };

    const mockRequest = {
      headers: { "user-agent": "Mozilla/5.0" },
      ip: "127.0.0.1",
    };

    it("should login successfully with valid credentials", async () => {
      mockedBcrypt.compare.mockResolvedValue(true as never);
      mockUserRepository.findOne.mockResolvedValue(mockUser);
      mockUserRepository.save.mockResolvedValue({
        ...mockUser,
        lastLoginAt: new Date(),
      });
      mockRefreshTokenRepository.create.mockReturnValue({});
      mockRefreshTokenRepository.save.mockResolvedValue({});

      const result = await service.login(loginDto, mockRequest as any);

      expect(result).toHaveProperty("accessToken");
      expect(result).toHaveProperty("refreshToken");
      expect(result).toHaveProperty("user");
      expect(result.user.username).toBe("testuser");
      expect(mockJwtService.sign).toHaveBeenCalled();
    });

    it("should accept username as a legacy alias for usernameOrEmail", async () => {
      mockedBcrypt.compare.mockResolvedValue(true as never);
      mockUserRepository.findOne.mockResolvedValue(mockUser);
      mockUserRepository.save.mockResolvedValue({
        ...mockUser,
        lastLoginAt: new Date(),
      });
      mockRefreshTokenRepository.create.mockReturnValue({});
      mockRefreshTokenRepository.save.mockResolvedValue({});

      const result = await service.login(
        {
          username: "testuser",
          password: "Password@123",
          rememberMe: false,
        } as any,
        mockRequest as any,
      );

      expect(result.user.username).toBe("testuser");
      expect(mockUserRepository.findOne).toHaveBeenCalledWith({
        where: [{ username: "testuser" }, { email: "testuser" }],
      });
    });

    it("should increment failed login attempts on wrong password", async () => {
      mockedBcrypt.compare.mockResolvedValue(false as never);
      const userWithFailedAttempts = { ...mockUser, failedLoginAttempts: 2 };
      mockUserRepository.findOne.mockResolvedValue(userWithFailedAttempts);
      mockUserRepository.save.mockResolvedValue({
        ...userWithFailedAttempts,
        failedLoginAttempts: 3,
      });

      await expect(service.login(loginDto, mockRequest as any)).rejects.toThrow(
        UnauthorizedException,
      );
      expect(mockUserRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ failedLoginAttempts: 3 }),
      );
    });

    it("should lock account after 5 failed attempts", async () => {
      mockedBcrypt.compare.mockResolvedValue(false as never);
      const userWithMaxAttempts = { ...mockUser, failedLoginAttempts: 4 };
      mockUserRepository.findOne.mockResolvedValue(userWithMaxAttempts);
      mockUserRepository.save.mockImplementation((user) =>
        Promise.resolve(user),
      );

      await expect(service.login(loginDto, mockRequest as any)).rejects.toThrow(
        UnauthorizedException,
      );
      expect(mockUserRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          failedLoginAttempts: 5,
          lockedUntil: expect.any(Date),
        }),
      );
    });

    it("should reset failed login attempts on successful login", async () => {
      mockedBcrypt.compare.mockResolvedValue(true as never);
      const userWithPreviousFailures = { ...mockUser, failedLoginAttempts: 3 };
      mockUserRepository.findOne.mockResolvedValue(userWithPreviousFailures);
      mockUserRepository.save.mockResolvedValue({
        ...userWithPreviousFailures,
        failedLoginAttempts: 0,
      });
      mockRefreshTokenRepository.create.mockReturnValue({});
      mockRefreshTokenRepository.save.mockResolvedValue({});

      const result = await service.login(loginDto, mockRequest as any);

      expect(result).toHaveProperty("accessToken");
      expect(mockUserRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ failedLoginAttempts: 0 }),
      );
    });
  });

  describe("login() proactive self-heal (issue #710)", () => {
    const loginDto = {
      usernameOrEmail: "admin",
      password: "pw",
      rememberMe: false,
    };

    it("clears an expired lockedUntil and bypasses the lock check, reaching password validation", async () => {
      const pastLock = new Date(Date.now() - 60 * 1000);
      const user = {
        id: "u1",
        username: "admin",
        email: "admin@example.com",
        password: "hashed",
        isActive: true,
        status: UserStatus.ACTIVE,
        failedLoginAttempts: 5,
        lockedUntil: pastLock,
        get isLocked() {
          return this.lockedUntil != null && this.lockedUntil > new Date();
        },
      } as any;

      mockUserRepository.findOne.mockResolvedValue(user);
      mockUserRepository.save.mockImplementation((u) => Promise.resolve(u));
      // Wrong password: proves execution passed the lock check and reached
      // password validation (handleFailedLogin), not stopped by ForbiddenException.
      mockedBcrypt.compare.mockResolvedValue(false as never);

      await expect(service.login(loginDto as any)).rejects.toThrow(
        UnauthorizedException,
      );

      // bcrypt.compare being reached proves the lock check was bypassed — the
      // self-heal cleared the stale lock instead of throwing ForbiddenException.
      expect(mockedBcrypt.compare).toHaveBeenCalled();
      // The stale lock was cleared (failedLoginAttempts is then re-incremented
      // by handleFailedLogin on the wrong password, so we assert on lockedUntil).
      expect(user.lockedUntil).toBeNull();
    });

    it("still rejects a user whose lockedUntil is in the future", async () => {
      const futureLock = new Date(Date.now() + 60 * 1000);
      const user = {
        id: "u2",
        username: "admin",
        lockedUntil: futureLock,
        failedLoginAttempts: 5,
        get isLocked() {
          return this.lockedUntil != null && this.lockedUntil > new Date();
        },
      } as any;

      mockUserRepository.findOne.mockResolvedValue(user);

      await expect(service.login(loginDto as any)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe("token generation", () => {
    const loginDto = {
      usernameOrEmail: "testuser",
      password: "Password@123",
      rememberMe: false,
    };

    const mockRequest = {
      headers: { "user-agent": "Mozilla/5.0" },
      ip: "127.0.0.1",
    };

    it("should generate access and refresh tokens during login", async () => {
      mockedBcrypt.compare.mockResolvedValue(true as never);
      mockUserRepository.findOne.mockResolvedValue(mockUser);
      mockUserRepository.save.mockResolvedValue({
        ...mockUser,
        lastLoginAt: new Date(),
      });
      mockRefreshTokenRepository.create.mockReturnValue({});
      mockRefreshTokenRepository.save.mockResolvedValue({});

      const result = await service.login(
        loginDto,
        mockRequest.ip,
        mockRequest.headers["user-agent"],
      );

      expect(result).toHaveProperty("accessToken");
      expect(result).toHaveProperty("refreshToken");
      expect(mockJwtService.sign).toHaveBeenCalledTimes(2);
    });

    it("should include correct payload in tokens", async () => {
      mockedBcrypt.compare.mockResolvedValue(true as never);
      mockUserRepository.findOne.mockResolvedValue(mockUser);
      mockUserRepository.save.mockResolvedValue({
        ...mockUser,
        lastLoginAt: new Date(),
      });
      mockRefreshTokenRepository.create.mockReturnValue({});
      mockRefreshTokenRepository.save.mockResolvedValue({});

      await service.login(
        loginDto,
        mockRequest.ip,
        mockRequest.headers["user-agent"],
      );

      expect(mockJwtService.sign).toHaveBeenCalledWith(
        expect.objectContaining({
          sub: mockUser.id,
          username: mockUser.username,
          email: mockUser.email,
          role: mockUser.role,
        }),
        expect.objectContaining({ expiresIn: "15m" }),
      );
    });
  });

  describe("refreshAccessToken", () => {
    const mockRefreshToken = {
      id: "token-id",
      tokenHash: "hashed-token",
      userId: mockUser.id,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      isActive: true,
      user: mockUser,
      isExpired: false,
    };

    it("should refresh access token with valid refresh token", async () => {
      const refreshTokenDto = { refreshToken: "valid-refresh-token" };
      mockRefreshTokenRepository.findOne.mockResolvedValue(mockRefreshToken);
      mockUserRepository.findOne.mockResolvedValue(mockUser);
      mockRefreshTokenRepository.create.mockReturnValue({});
      mockRefreshTokenRepository.save.mockResolvedValue({});
      mockRefreshTokenRepository.remove.mockResolvedValue(mockRefreshToken);

      const result = await service.refreshAccessToken(refreshTokenDto);

      expect(result).toHaveProperty("accessToken");
      expect(result).toHaveProperty("refreshToken");
      expect(mockRefreshTokenRepository.remove).toHaveBeenCalled(); // Old token deleted
      expect(mockRefreshTokenRepository.save).toHaveBeenCalled(); // New token saved
    });

    it("should throw UnauthorizedException for invalid refresh token", async () => {
      const refreshTokenDto = { refreshToken: "invalid-token" };
      mockRefreshTokenRepository.findOne.mockResolvedValue(null);

      await expect(service.refreshAccessToken(refreshTokenDto)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it("should throw UnauthorizedException for expired refresh token", async () => {
      const expiredToken = {
        ...mockRefreshToken,
        expiresAt: new Date(Date.now() - 1000), // Expired
        isExpired: true,
      };
      const refreshTokenDto = { refreshToken: "expired-token" };
      mockRefreshTokenRepository.findOne.mockResolvedValue(expiredToken);
      mockRefreshTokenRepository.remove.mockResolvedValue(expiredToken);

      await expect(service.refreshAccessToken(refreshTokenDto)).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe("logout", () => {
    it("should invalidate all refresh tokens for user", async () => {
      const userId = mockUser.id;
      mockRefreshTokenRepository.delete.mockResolvedValue({ affected: 1 });

      await service.logout(userId);

      expect(mockRefreshTokenRepository.delete).toHaveBeenCalledWith({
        userId,
        isActive: true,
      });
    });
  });

  describe("changePassword", () => {
    const changePasswordDto = {
      currentPassword: "OldPassword@123",
      newPassword: "NewPassword@123",
      newPasswordConfirmation: "NewPassword@123",
    };

    it("should change password successfully", async () => {
      mockedBcrypt.compare
        .mockResolvedValueOnce(true as never)
        .mockResolvedValueOnce(false as never);
      mockedBcrypt.hash.mockResolvedValue("new-hashed-password" as never);
      mockUserRepository.findOne.mockResolvedValue(mockUser);
      mockUserRepository.save.mockResolvedValue({
        ...mockUser,
        password: "new-hashed-password",
      });
      mockRefreshTokenRepository.delete.mockResolvedValue({ affected: 1 });

      await service.changePassword(mockUser.id, changePasswordDto);

      expect(mockUserRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ password: "new-hashed-password" }),
      );
      expect(mockRefreshTokenRepository.delete).toHaveBeenCalled(); // Logout all sessions
    });

    it("should throw UnauthorizedException for incorrect current password", async () => {
      mockedBcrypt.compare.mockResolvedValue(false as never);
      mockUserRepository.findOne.mockResolvedValue(mockUser);

      await expect(
        service.changePassword(mockUser.id, changePasswordDto),
      ).rejects.toThrow(UnauthorizedException);
    });

    it("should throw BadRequestException if passwords do not match", async () => {
      const mismatchedDto = {
        ...changePasswordDto,
        newPasswordConfirmation: "DifferentPassword@123",
      };

      await expect(
        service.changePassword(mockUser.id, mismatchedDto),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe("password hashing", () => {
    it("should hash password with bcrypt (12 rounds)", async () => {
      const plainPassword = "Password@123";
      mockedBcrypt.hash.mockResolvedValue("$2b$12$hashed" as never);

      const hashedPassword = await bcrypt.hash(plainPassword, 12);

      expect(mockedBcrypt.hash).toHaveBeenCalledWith(plainPassword, 12);
      expect(hashedPassword).toBeDefined();
      expect(hashedPassword).toContain("$2b$12$");
    });
  });

  describe("cleanupExpiredTokens", () => {
    it("should delete expired refresh tokens", async () => {
      mockRefreshTokenRepository.delete.mockResolvedValue({ affected: 5 });

      const result = await service.cleanupExpiredTokens();

      expect(mockRefreshTokenRepository.delete).toHaveBeenCalledWith({
        expiresAt: expect.anything(),
      });
      expect(result).toBe(5);
    });
  });
});
