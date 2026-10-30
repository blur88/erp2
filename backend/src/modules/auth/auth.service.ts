import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan, EntityManager } from 'typeorm';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { User, UserStatus } from '@/database/entities/user.entity';
import { RefreshToken } from '@/database/entities/refresh-token.entity';
import { bcryptRounds } from '@/common/security/bcrypt-rounds';
import {
  LoginDto,
  RegisterDto,
  AuthResponseDto,
  RefreshTokenDto,
  ChangePasswordDto,
} from './dto';

import { AuthUserLockHook, AuthUserLockOperation } from './auth-user-lock.hook';

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MINUTES = 30;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(RefreshToken)
    private refreshTokenRepository: Repository<RefreshToken>,
    private jwtService: JwtService,
    private configService: ConfigService,
    private authUserLockHook: AuthUserLockHook,
  ) {}

  /**
   * User login with credentials validation
   */
  async login(
    loginDto: LoginDto,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<AuthResponseDto> {
    const { password, rememberMe } = loginDto;
    const usernameOrEmail = loginDto.usernameOrEmail ?? loginDto.username;

    // Empty-check done here (not via @IsNotEmpty on the DTO) to return 401 rather than 400
    if (!usernameOrEmail) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Find user by username or email
    const user = await this.userRepository.findOne({
      where: [{ username: usernameOrEmail }, { email: usernameOrEmail }],
    });

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Self-heal: if the lock has expired by the app clock, clear it before the
    // lock check. Guards against a stale lockedUntil lingering when a user can
    // never reach the success path that normally resets it. See issue #710.
    if (user.lockedUntil && user.lockedUntil <= new Date()) {
      user.failedLoginAttempts = 0;
      user.lockedUntil = null;
      try {
        await this.userRepository.update(user.id, {
          failedLoginAttempts: user.failedLoginAttempts,
          lockedUntil: user.lockedUntil,
        });
      } catch (err) {
        // A failed cleanup must not block login; the in-memory isLocked check
        // below still governs the decision. Retry happens on the next attempt.
        this.logger.warn(
          `Failed to persist lock self-heal for ${user.username}: ${err}`,
        );
      }
    }

    // Check if account is locked
    if (user.isLocked) {
      throw new ForbiddenException(
        `Account is locked until ${user.lockedUntil?.toISOString()}. Please try again later.`,
      );
    }

    // Check if user is active
    if (!user.isActive || user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException('Account is not active');
    }

    // Validate password
    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      await this.handleFailedLogin(user);
      throw new UnauthorizedException('Invalid credentials');
    }

    const verifiedPasswordHash = user.password;
    const bookkeeping: Partial<User> = {
      lastLoginAt: new Date(),
      lastLoginIp: ipAddress || null,
    };
    await this.userRepository.update(user.id, bookkeeping);

    const { accessToken, refreshToken } =
      await this.userRepository.manager.transaction(async (manager) => {
        const lockedUser = await this.lockUser(manager, user.id, 'login');
        this.assertEligible(lockedUser);
        if (lockedUser.password !== verifiedPasswordHash) {
          throw new UnauthorizedException('Invalid credentials');
        }
        return this.generateTokens(
          lockedUser,
          rememberMe,
          ipAddress,
          userAgent,
          manager,
        );
      });

    if (user.failedLoginAttempts > 0) {
      await this.userRepository.update(
        { id: user.id, password: verifiedPasswordHash },
        {
          failedLoginAttempts: 0,
          lockedUntil: null,
        },
      );
    }

    this.logger.log(
      `User ${user.username} logged in successfully from ${ipAddress}`,
    );

    return {
      accessToken,
      refreshToken,
      expiresIn: this.getAccessTokenExpiry(),
      user: this.sanitizeUser(user),
      requiresPasswordChange: user.requiresPasswordChange || false,
    };
  }

  /**
   * User registration
   */
  async register(registerDto: RegisterDto): Promise<AuthResponseDto> {
    const {
      username,
      email,
      password,
      passwordConfirmation,
      firstName,
      lastName,
      role,
    } = registerDto;

    // Validate password confirmation
    if (password !== passwordConfirmation) {
      throw new BadRequestException('Password and confirmation do not match');
    }

    // Check if username already exists
    const existingUsername = await this.userRepository.findOne({
      where: { username },
    });

    if (existingUsername) {
      throw new BadRequestException('Username already exists');
    }

    // Check if email already exists
    const existingEmail = await this.userRepository.findOne({
      where: { email },
    });

    if (existingEmail) {
      throw new BadRequestException('Email already exists');
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, bcryptRounds());

    // Create user
    const user = this.userRepository.create({
      username,
      email,
      password: hashedPassword,
      firstName,
      lastName,
      role,
      status: UserStatus.ACTIVE,
      isActive: true,
      failedLoginAttempts: 0,
    });

    await this.userRepository.save(user);

    this.logger.log(`New user registered: ${username} (${email})`);

    // Auto-login after registration
    const { accessToken, refreshToken } =
      await this.userRepository.manager.transaction(async (manager) => {
        const lockedUser = await this.lockUser(manager, user.id, 'login');
        this.assertEligible(lockedUser);
        return this.generateTokens(
          lockedUser,
          false,
          undefined,
          undefined,
          manager,
        );
      });

    return {
      accessToken,
      refreshToken,
      expiresIn: this.getAccessTokenExpiry(),
      user: this.sanitizeUser(user),
      requiresPasswordChange: user.requiresPasswordChange || false,
    };
  }

  /**
   * Refresh access token using refresh token
   */
  async refreshAccessToken(
    refreshTokenDto: RefreshTokenDto,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<AuthResponseDto> {
    const { refreshToken: token } = refreshTokenDto;

    // Hash the incoming token to compare with stored hash
    const tokenHash = this.hashToken(token);

    // Find refresh token in database
    const refreshTokenRecord = await this.refreshTokenRepository.findOne({
      where: { tokenHash, isActive: true },
      relations: { user: true },
    });

    if (!refreshTokenRecord) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    return this.userRepository.manager.transaction(async (manager) => {
      const user = await this.lockUser(
        manager,
        refreshTokenRecord.userId,
        'refresh',
      );
      const tokens = manager.getRepository(RefreshToken);
      const current = await tokens.findOne({
        where: { tokenHash, userId: user.id, isActive: true },
      });
      if (!current) throw new UnauthorizedException('Invalid refresh token');
      if (current.isExpired)
        throw new UnauthorizedException('Refresh token expired');
      this.assertEligible(user);
      await tokens.remove(current);
      const issued = await this.generateTokens(
        user,
        false,
        ipAddress,
        userAgent,
        manager,
      );
      return {
        ...issued,
        expiresIn: this.getAccessTokenExpiry(),
        user: this.sanitizeUser(user),
        requiresPasswordChange: user.requiresPasswordChange || false,
      };
    });
  }

  /**
   * Logout - invalidate all refresh tokens for user
   */
  async logout(userId: string): Promise<void> {
    await this.userRepository.manager.transaction(async (manager) => {
      await this.lockUser(manager, userId, 'signOut');
      await this.revokeSessions(manager, userId);
    });
    this.logger.log(`User ${userId} logged out - all tokens invalidated`);
  }

  /**
   * Change user password
   */
  async changePassword(
    userId: string,
    changePasswordDto: ChangePasswordDto,
  ): Promise<void> {
    const { currentPassword, newPassword, newPasswordConfirmation } =
      changePasswordDto;

    // Validate new password confirmation
    if (newPassword !== newPasswordConfirmation) {
      throw new BadRequestException(
        'New password and confirmation do not match',
      );
    }

    // Find user
    const user = await this.userRepository.findOne({ where: { id: userId } });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    // Verify current password
    const isCurrentPasswordValid = await bcrypt.compare(
      currentPassword,
      user.password,
    );

    if (!isCurrentPasswordValid) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    // Check that new password is different from current
    const isSamePassword = await bcrypt.compare(newPassword, user.password);

    if (isSamePassword) {
      throw new BadRequestException(
        'New password must be different from current password',
      );
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, bcryptRounds());

    await this.userRepository.manager.transaction(async (manager) => {
      const lockedUser = await this.lockUser(manager, userId, 'changePassword');
      if (lockedUser.password !== user.password) {
        throw new UnauthorizedException('Current password is incorrect');
      }
      await manager.update(User, userId, {
        password: hashedPassword,
        requiresPasswordChange: false,
      });
      await this.revokeSessions(manager, userId);
    });

    this.logger.log(
      `Password changed for user ${user.username} - all sessions invalidated`,
    );
  }

  /**
   * Get current user by ID
   */
  async getCurrentUser(userId: string): Promise<Partial<User>> {
    const user = await this.userRepository.findOne({ where: { id: userId } });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    return this.sanitizeUser(user);
  }

  /**
   * Check if default credentials should be shown on login page
   * Returns true if admin user exists and still requires password change
   */
  async shouldShowDefaultCredentials(): Promise<boolean> {
    const adminUser = await this.userRepository.findOne({
      where: { username: 'admin', email: 'admin@erp.com' },
    });

    // Show default credentials if admin exists and requires password change
    return adminUser ? adminUser.requiresPasswordChange : false;
  }

  /**
   * Handle failed login attempts and account lockout
   */
  private async handleFailedLogin(user: User): Promise<void> {
    user.failedLoginAttempts += 1;

    if (user.failedLoginAttempts >= MAX_FAILED_ATTEMPTS) {
      user.lockedUntil = new Date(
        Date.now() + LOCKOUT_DURATION_MINUTES * 60 * 1000,
      );
      this.logger.warn(
        `Account ${user.username} locked due to ${MAX_FAILED_ATTEMPTS} failed login attempts`,
      );
    }

    await this.userRepository.update(user.id, {
      failedLoginAttempts: user.failedLoginAttempts,
      lockedUntil: user.lockedUntil,
    });
  }

  /**
   * Generate JWT access token and refresh token
   */
  private async generateTokens(
    user: User,
    rememberMe = false,
    ipAddress?: string,
    userAgent?: string,
    manager: EntityManager = this.userRepository.manager,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    // JWT payload
    const payload = {
      sub: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
    };

    // Generate access token (short-lived)
    const accessToken = this.jwtService.sign(
      { ...payload, tokenVersion: user.tokenVersion },
      {
        expiresIn: this.configService.get('JWT_ACCESS_TOKEN_EXPIRY', '15m'),
      },
    );

    // Generate refresh token (long-lived)
    // If "Remember me" is checked: 7 days, otherwise: 2 days (covers 12h idle + buffer)
    //
    // The `jti` nonce is load-bearing, not decoration (issue #1201): every other
    // claim is second-granularity, so without it two refresh tokens minted for
    // one user inside the same wall-clock second are byte-identical. Their
    // SHA-256 hashes then collide on the unique index over
    // refresh_tokens.tokenHash, and the second login fails with a 400/DB_001.
    // Rotation has the same collision without the error, because it deletes the
    // old row first — it would silently reissue the token it just revoked.
    // Two logins are two sessions with their own device/IP audit trail and
    // independent revocation, so they must be distinct rows.
    // The access token is not persisted and deliberately keeps the bare payload.
    const refreshTokenExpiry = rememberMe ? '7d' : '2d';
    const refreshToken = this.jwtService.sign(
      { ...payload, jti: crypto.randomUUID() },
      {
        expiresIn: this.configService.get(
          'JWT_REFRESH_TOKEN_EXPIRY',
          refreshTokenExpiry,
        ),
      },
    );

    // Store refresh token in database (hashed)
    const tokenHash = this.hashToken(refreshToken);
    const expiresAt = new Date(
      Date.now() + this.parseExpiry(refreshTokenExpiry) * 1000,
    );

    const refreshTokenRecord = manager.getRepository(RefreshToken).create({
      tokenHash,
      userId: user.id,
      expiresAt,
      deviceInfo: userAgent,
      ipAddress,
      isActive: true,
    });

    await manager.getRepository(RefreshToken).save(refreshTokenRecord);

    return { accessToken, refreshToken };
  }

  private async lockUser(
    manager: EntityManager,
    userId: string,
    operation: AuthUserLockOperation,
  ): Promise<User> {
    const user = await manager.getRepository(User).findOne({
      where: { id: userId },
      lock: { mode: 'for_no_key_update' },
    });
    await this.authUserLockHook.afterUserLock(operation, userId);
    if (!user) throw new UnauthorizedException('User not found');
    return user;
  }

  private assertEligible(user: User): void {
    if (!user.isActive || user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException('User account is not active');
    }
    if (user.isLocked)
      throw new UnauthorizedException('User account is locked');
  }

  private async revokeSessions(
    manager: EntityManager,
    userId: string,
  ): Promise<void> {
    await manager.query(
      'UPDATE users SET "tokenVersion" = "tokenVersion" + 1 WHERE id = $1',
      [userId],
    );
    await manager.delete(RefreshToken, { userId });
  }

  /**
   * Hash token using SHA-256 for secure storage
   */
  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  /**
   * Get access token expiry in seconds
   */
  private getAccessTokenExpiry(): number {
    const expiry = this.configService.get<string>(
      'JWT_ACCESS_TOKEN_EXPIRY',
      '15m',
    );
    return this.parseExpiry(expiry);
  }

  /**
   * Parse expiry string (e.g., "15m", "7d") to seconds
   */
  private parseExpiry(expiry: string): number {
    const unit = expiry.slice(-1);
    const value = parseInt(expiry.slice(0, -1), 10);

    switch (unit) {
      case 's':
        return value;
      case 'm':
        return value * 60;
      case 'h':
        return value * 60 * 60;
      case 'd':
        return value * 60 * 60 * 24;
      default:
        return 900; // Default 15 minutes
    }
  }

  /**
   * Remove sensitive data from user object
   */
  private sanitizeUser(user: User): Partial<User> {
    const { password, failedLoginAttempts, lockedUntil, ...sanitized } = user;
    return sanitized;
  }

  /**
   * Cleanup expired refresh tokens (scheduled task)
   */
  async cleanupExpiredTokens(): Promise<number> {
    const result = await this.refreshTokenRepository.delete({
      expiresAt: LessThan(new Date()),
    });

    const count = result.affected || 0;
    this.logger.log(`Cleaned up ${count} expired refresh tokens`);
    return count;
  }
}
