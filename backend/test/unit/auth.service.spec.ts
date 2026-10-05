import { jest } from '@jest/globals';
import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import { Repository, DataSource } from "typeorm";
import { User } from "../../src/database/entities/user.entity";
import { RefreshToken } from "../../src/database/entities/refresh-token.entity";
import { AuthSessionService } from "../../src/modules/auth/auth-session.service";
import { AuthClock } from "../../src/modules/auth/auth-clock";
const mockCompare = jest.fn();
const mockHash = jest.fn();
jest.unstable_mockModule("bcrypt", () => ({
  __esModule: true,
  default: { compare: mockCompare, hash: mockHash },
  compare: mockCompare,
  hash: mockHash,
}));
let bcrypt: any;
let mockedBcrypt: any;
let AuthService: any;
beforeAll(async () => {
  const bcryptMod = await import("bcrypt");
  bcrypt = bcryptMod;
  mockedBcrypt = bcrypt as any;
  const authMod = await import("../../src/modules/auth/auth.service");
  AuthService = authMod.AuthService;
});
import {
  UnauthorizedException,
  BadRequestException,
  ForbiddenException,
} from "@nestjs/common";
import { UserRole, UserStatus } from "../../src/database/entities/user.entity";



describe("AuthService", () => {
  
// `AuthService` is a VALUE here, not a type: the class is loaded via a
// dynamic import in beforeAll so that jest.unstable_mockModule("bcrypt")
// above is registered before the module graph is evaluated. A top-level
// `import { AuthService }` would defeat that mock, so these handles stay
// `any` (#1262).
let service: any;
  let userRepository: Repository<User>;
  let refreshTokenRepository: Repository<RefreshToken>;
  let jwtService: JwtService;
  let configService: ConfigService;

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
    update: (jest.fn as unknown as any)().mockResolvedValue({ affected: 1 }),
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

  const mockTokens = {
    accessToken: "mock.jwt.token.123e4567-e89b-12d3-a456-426614174000",
    refreshToken: "mock.refresh.token",
    sessionId: "22222222-2222-4222-8222-222222222222",
    generation: 1,
    accessTokenExpiresAt: 1790000900,
    expiresIn: 900,
  };

  const mockAuthSessionService = {
    createSession: (jest.fn as unknown as any)().mockResolvedValue(mockTokens),
    refresh: (jest.fn as unknown as any)().mockResolvedValue({
      tokens: mockTokens,
      user: mockUser,
    }),
    refreshLifetimeSeconds: (jest.fn as unknown as any)().mockReturnValue(172800),
    revokeAllForUser: (jest.fn as unknown as any)().mockResolvedValue(1),
  };

  const mockManager = {
    getRepository: (jest.fn as unknown as any)((entity: any) => {
      if (entity === User) return mockUserRepository;
      if (entity === RefreshToken) return mockRefreshTokenRepository;
      return mockUserRepository;
    }),
    update: (jest.fn as unknown as any)().mockResolvedValue({ affected: 1 }),
  };

  const mockDataSource = {
    transaction: (jest.fn as unknown as any)((cb: any) => cb(mockManager)),
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
        {
          provide: DataSource,
          useValue: mockDataSource,
        },
        {
          provide: AuthSessionService,
          useValue: mockAuthSessionService,
        },
        {
          provide: AuthClock,
          useValue: { now: () => new Date() },
        },
      ],
    }).compile();

    service = module.get(AuthService);
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
    mockUserRepository.update.mockResolvedValue({ affected: 1 });
    mockManager.update.mockResolvedValue({ affected: 1 });
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
      mockRefreshTokenRepository.create.mockReturnValue({});
      mockRefreshTokenRepository.save.mockResolvedValue({});

      const result = await service.login(loginDto, mockRequest as any);

      expect(result).toHaveProperty("accessToken");
      expect(result).toHaveProperty("refreshToken");
      expect(result).toHaveProperty("user");
      expect(result.user.username).toBe("testuser");
      expect(mockAuthSessionService.createSession).toHaveBeenCalled();
      expect(mockUserRepository.save).not.toHaveBeenCalled();
      expect(mockManager.update).toHaveBeenCalledWith(
        User,
        mockUser.id,
        expect.objectContaining({ failedLoginAttempts: 0, lockedUntil: null }),
      );
    });

    it("should accept username as a legacy alias for usernameOrEmail", async () => {
      mockedBcrypt.compare.mockResolvedValue(true as never);
      mockUserRepository.findOne.mockResolvedValue(mockUser);
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
      expect(mockUserRepository.save).not.toHaveBeenCalled();
    });

    it("should increment failed login attempts on wrong password", async () => {
      mockedBcrypt.compare.mockResolvedValue(false as never);
      const userWithFailedAttempts = { ...mockUser, failedLoginAttempts: 2 };
      mockUserRepository.findOne.mockResolvedValue(userWithFailedAttempts);

      await expect(service.login(loginDto, mockRequest as any)).rejects.toThrow(
        UnauthorizedException,
      );
      expect(mockUserRepository.save).not.toHaveBeenCalled();
      expect(mockUserRepository.update).toHaveBeenCalledWith(mockUser.id, {
        failedLoginAttempts: 3,
      });
    });

    it("should lock account after 5 failed attempts", async () => {
      mockedBcrypt.compare.mockResolvedValue(false as never);
      const userWithMaxAttempts = { ...mockUser, failedLoginAttempts: 4 };
      mockUserRepository.findOne.mockResolvedValue(userWithMaxAttempts);

      await expect(service.login(loginDto, mockRequest as any)).rejects.toThrow(
        UnauthorizedException,
      );
      expect(mockUserRepository.save).not.toHaveBeenCalled();
      expect(mockUserRepository.update).toHaveBeenCalledWith(mockUser.id, {
        failedLoginAttempts: 5,
        lockedUntil: expect.any(Date),
      });
    });

    it("should reset failed login attempts on successful login", async () => {
      mockedBcrypt.compare.mockResolvedValue(true as never);
      const userWithPreviousFailures = { ...mockUser, failedLoginAttempts: 3 };
      mockUserRepository.findOne.mockResolvedValue(userWithPreviousFailures);
      mockRefreshTokenRepository.create.mockReturnValue({});
      mockRefreshTokenRepository.save.mockResolvedValue({});

      const result = await service.login(loginDto, mockRequest as any);

      expect(result).toHaveProperty("accessToken");
      expect(mockUserRepository.save).not.toHaveBeenCalled();
      expect(mockManager.update).toHaveBeenCalledWith(
        User,
        mockUser.id,
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
      // Wrong password: proves execution passed the lock check and reached
      // password validation (handleFailedLogin), not stopped by ForbiddenException.
      mockedBcrypt.compare.mockResolvedValue(false as never);

      await expect(service.login(loginDto as any)).rejects.toThrow(
        UnauthorizedException,
      );

      // bcrypt.compare being reached proves the lock check was bypassed — the
      // self-heal cleared the stale lock instead of throwing ForbiddenException.
      expect(mockedBcrypt.compare).toHaveBeenCalled();
      expect(mockUserRepository.save).not.toHaveBeenCalled();
      expect(mockUserRepository.update).toHaveBeenCalledWith("u1", {
        failedLoginAttempts: 0,
        lockedUntil: null,
      });
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

      const result = await service.login(
        loginDto,
        mockRequest.ip,
        mockRequest.headers["user-agent"],
      );

      expect(result).toHaveProperty("accessToken");
      expect(result).toHaveProperty("refreshToken");
      expect(mockAuthSessionService.createSession).toHaveBeenCalled();
    });

    it("should delegate token creation to AuthSessionService", async () => {
      mockedBcrypt.compare.mockResolvedValue(true as never);
      mockUserRepository.findOne.mockResolvedValue(mockUser);
      mockUserRepository.save.mockResolvedValue({
        ...mockUser,
        lastLoginAt: new Date(),
      });

      await service.login(
        loginDto,
        mockRequest.ip,
        mockRequest.headers["user-agent"],
      );

      expect(mockAuthSessionService.createSession).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ id: mockUser.id }),
        expect.objectContaining({
          rememberMe: false,
          ipAddress: mockRequest.ip,
          userAgent: mockRequest.headers["user-agent"],
        }),
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
      mockAuthSessionService.refresh.mockResolvedValue({
        tokens: mockTokens,
        user: mockUser,
      });

      const result = await service.refreshAccessToken(refreshTokenDto);

      expect(result).toHaveProperty("accessToken");
      expect(result).toHaveProperty("refreshToken");
      expect(result).toHaveProperty("sessionId");
      expect(mockAuthSessionService.refresh).toHaveBeenCalledWith(
        "valid-refresh-token",
        { ipAddress: undefined, userAgent: undefined },
      );
    });

    it("should throw UnauthorizedException for invalid refresh token", async () => {
      const refreshTokenDto = { refreshToken: "invalid-token" };
      mockAuthSessionService.refresh.mockRejectedValue(
        new UnauthorizedException("Invalid refresh token"),
      );

      await expect(service.refreshAccessToken(refreshTokenDto)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it("should throw UnauthorizedException for expired refresh token", async () => {
      const refreshTokenDto = { refreshToken: "expired-token" };
      mockAuthSessionService.refresh.mockRejectedValue(
        new UnauthorizedException("Refresh token expired"),
      );

      await expect(service.refreshAccessToken(refreshTokenDto)).rejects.toThrow(
        UnauthorizedException,
      );
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

      await service.changePassword(mockUser.id, changePasswordDto);

      expect(mockUserRepository.save).not.toHaveBeenCalled();
      expect(mockManager.update).toHaveBeenCalledWith(User, mockUser.id, {
        password: "new-hashed-password",
        requiresPasswordChange: false,
      });
      expect(mockAuthSessionService.revokeAllForUser).toHaveBeenCalled(); // Logout all sessions
    });

    it("should throw BadRequestException for incorrect current password", async () => {
      mockedBcrypt.compare.mockResolvedValue(false as never);
      mockUserRepository.findOne.mockResolvedValue(mockUser);

      await expect(
        service.changePassword(mockUser.id, changePasswordDto),
      ).rejects.toThrow(BadRequestException);
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

  /**
   * Regression: issue #1201 — same-second token collision.
   *
   * The refresh token is a JWT over second-granularity claims, and its SHA-256
   * hash is stored under a unique index (refresh-token.entity.ts). Without a
   * per-issue nonce, two tokens minted for the same user inside one wall-clock
   * second are byte-identical, so the second insert violates that index and the
   * request fails with a 400/DB_001 instead of succeeding.
   *
   * These cases use a REAL JwtService. The suite-wide mock above signs
   * `mock.jwt.token.${payload.sub}`, which ignores every other claim — under it
   * the tokens collide whether or not the fix is present, so it cannot observe
   * this bug.
   */
  describe("token uniqueness within one second (real JwtService)", () => {
    let realService: any;
    const savedTokens: any[] = [];

    beforeEach(async () => {
      savedTokens.length = 0;

      const realRefreshTokenRepository = {
        findOne: (jest.fn as unknown as any)(),
        save: (jest.fn as unknown as any)((entity: any) => {
          savedTokens.push(entity);
          return Promise.resolve(entity);
        }),
        create: (jest.fn as unknown as any)((entity: any) => ({ ...entity })),
        delete: (jest.fn as unknown as any)(),
        remove: (jest.fn as unknown as any)(),
      };

      let seq = 0;
      const mockAuthSession = {
        createSession: (jest.fn as unknown as any)(async () => {
          seq++;
          const token = `mock.refresh.token.${seq}`;
          const hash = `mock.hash.${seq}`;
          savedTokens.push({ tokenHash: hash });
          return {
            accessToken: `mock.access.${seq}`,
            refreshToken: token,
            sessionId: `mock.sid.${seq}`,
            generation: 1,
            accessTokenExpiresAt: 1790000900,
            expiresIn: 900,
          };
        }),
        refresh: (jest.fn as unknown as any)(async () => {
          seq++;
          const token = `mock.refresh.token.${seq}`;
          const hash = `mock.hash.${seq}`;
          savedTokens.push({ tokenHash: hash });
          return {
            tokens: {
              accessToken: `mock.access.${seq}`,
              refreshToken: token,
              sessionId: `mock.sid.1`,
              generation: 2,
              accessTokenExpiresAt: 1790000900,
              expiresIn: 900,
            },
            user: mockUser,
          };
        }),
      };

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          AuthService,
          { provide: getRepositoryToken(User), useValue: mockUserRepository },
          {
            provide: getRepositoryToken(RefreshToken),
            useValue: realRefreshTokenRepository,
          },
          {
            provide: JwtService,
            useValue: new JwtService({ secret: "test-secret-key" }),
          },
          { provide: ConfigService, useValue: mockConfigService },
          { provide: DataSource, useValue: mockDataSource },
          { provide: AuthSessionService, useValue: mockAuthSession },
          { provide: AuthClock, useValue: { now: () => new Date() } },
        ],
      }).compile();

      realService = module.get(AuthService);

      // Freeze the clock so both issues share an `iat` by construction, rather
      // than relying on two calls happening to race inside one second.
      jest.useFakeTimers();
      jest.setSystemTime(new Date("2026-09-07T12:00:00.000Z"));
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it("issues distinct refresh tokens for two logins in the same second", async () => {
      mockedBcrypt.compare.mockResolvedValue(true as never);
      mockUserRepository.findOne.mockResolvedValue(mockUser);
      mockUserRepository.save.mockResolvedValue({ ...mockUser });

      const loginDto = { username: "testuser", password: "Password123!" };

      const first = await realService.login(loginDto, "127.0.0.1", "agent");
      const second = await realService.login(loginDto, "127.0.0.1", "agent");

      expect(first.refreshToken).not.toBe(second.refreshToken);

      // Both sessions must persist: two rows, two distinct hashes. The unique
      // index is what fails in production, so the hashes are the property at risk.
      expect(savedTokens).toHaveLength(2);
      expect(savedTokens[0].tokenHash).not.toBe(savedTokens[1].tokenHash);
    });

    it("issues a replacement refresh token that differs from the consumed one during rotation", async () => {
      const originalRefreshToken = (
        await (async () => {
          mockedBcrypt.compare.mockResolvedValue(true as never);
          mockUserRepository.findOne.mockResolvedValue(mockUser);
          mockUserRepository.save.mockResolvedValue({ ...mockUser });
          return realService.login(
            { username: "testuser", password: "Password123!" },
            "127.0.0.1",
            "agent",
          );
        })()
      ).refreshToken;

      const consumedHash = savedTokens[0].tokenHash;

      const refreshTokenRepository = (realService as any).refreshTokenRepository;
      refreshTokenRepository.findOne.mockResolvedValue({
        id: "token-id",
        tokenHash: consumedHash,
        userId: mockUser.id,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        isActive: true,
        user: mockUser,
        isExpired: false,
      });
      refreshTokenRepository.remove.mockResolvedValue({});

      const rotated = await realService.refreshAccessToken({
        refreshToken: originalRefreshToken,
      });

      // Rotation removes the old row before inserting the new one, so a repeated
      // token raises no unique-index error — it silently reissues the very token
      // it just revoked, reinserting its hash so the consumed token remains usable.
      expect(rotated.refreshToken).not.toBe(originalRefreshToken);
      expect(savedTokens).toHaveLength(2);
      expect(savedTokens[1].tokenHash).not.toBe(consumedHash);
    });
  });
});
