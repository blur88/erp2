import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
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
import { AuthSessionService } from './auth-session.service';
import { AuthClock } from './auth-clock';

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
    private dataSource: DataSource,
    private authSessionService: AuthSessionService,
    private clock: AuthClock,
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
    if (user.lockedUntil && user.lockedUntil <= this.clock.now()) {
      await this.healExpiredLock(user);
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

    const { tokens, user: updatedUser } = await this.dataSource.transaction(
      async (manager) => {
        const lockedUser = await manager.getRepository(User).findOne({
          where: { id: user.id },
          lock: { mode: 'for_no_key_update' },
        });

        if (!lockedUser || lockedUser.password !== user.password) {
          throw new UnauthorizedException('Invalid credentials');
        }

        const now = this.clock.now();
        await manager.update(User, user.id, {
          failedLoginAttempts: 0,
          lockedUntil: null,
          lastLoginAt: now,
          lastLoginIp: ipAddress || null,
        });

        lockedUser.failedLoginAttempts = 0;
        lockedUser.lockedUntil = null;
        lockedUser.lastLoginAt = now;
        lockedUser.lastLoginIp = ipAddress || null;

        const tokens = await this.authSessionService.createSession(
          manager,
          lockedUser,
          {
            rememberMe: rememberMe ?? false,
            ipAddress,
            userAgent,
          },
        );

        return { tokens, user: lockedUser };
      },
    );

    this.logger.log(`User ${user.username} logged in successfully from ${ipAddress}`);

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      sessionId: tokens.sessionId,
      generation: tokens.generation,
      accessTokenExpiresAt: tokens.accessTokenExpiresAt,
      expiresIn: tokens.expiresIn,
      user: this.sanitizeUser(updatedUser),
      requiresPasswordChange: updatedUser.requiresPasswordChange || false,
    };
  }

  /**
   * User registration
   */
  async register(registerDto: RegisterDto): Promise<AuthResponseDto> {
    const { username, email, password, passwordConfirmation, firstName, lastName, role } =
      registerDto;

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

    const { user, tokens } = await this.dataSource.transaction(async (manager) => {
      // Create user
      const newUser = manager.getRepository(User).create({
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

      const savedUser = await manager.getRepository(User).save(newUser);

      const tokens = await this.authSessionService.createSession(manager, savedUser, {
        rememberMe: false,
      });

      return { user: savedUser, tokens };
    });

    this.logger.log(`New user registered: ${username} (${email})`);

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      sessionId: tokens.sessionId,
      generation: tokens.generation,
      accessTokenExpiresAt: tokens.accessTokenExpiresAt,
      expiresIn: tokens.expiresIn,
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
    const { tokens, user } = await this.authSessionService.refresh(
      refreshTokenDto.refreshToken,
      {
        ipAddress,
        userAgent,
      },
    );

    this.logger.log(`Access token refreshed for user ${user.username}`);

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      sessionId: tokens.sessionId,
      generation: tokens.generation,
      accessTokenExpiresAt: tokens.accessTokenExpiresAt,
      expiresIn: tokens.expiresIn,
      user: this.sanitizeUser(user),
      requiresPasswordChange: user.requiresPasswordChange || false,
    };
  }


  /**
   * Change user password
   */
  async changePassword(userId: string, changePasswordDto: ChangePasswordDto): Promise<void> {
    const { currentPassword, newPassword, newPasswordConfirmation } = changePasswordDto;

    // Validate new password confirmation
    if (newPassword !== newPasswordConfirmation) {
      throw new BadRequestException('New password and confirmation do not match');
    }

    // Find user
    const user = await this.userRepository.findOne({ where: { id: userId } });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    // Verify current password
    const isCurrentPasswordValid = await bcrypt.compare(currentPassword, user.password);

    if (!isCurrentPasswordValid) {
      throw new BadRequestException({
        message: 'Current password is incorrect',
        code: 'CURRENT_PASSWORD_INCORRECT',
      });
    }

    const verifiedHash = user.password;

    // Check that new password is different from current
    const isSamePassword = await bcrypt.compare(newPassword, user.password);

    if (isSamePassword) {
      throw new BadRequestException('New password must be different from current password');
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, bcryptRounds());

    await this.dataSource.transaction(async (manager) => {
      const lockedUser = await manager.getRepository(User).findOne({
        where: { id: userId },
        lock: { mode: 'for_no_key_update' },
      });

      if (!lockedUser) {
        throw new UnauthorizedException('User not found');
      }

      if (lockedUser.password !== verifiedHash) {
        throw new ConflictException({
          message: 'Password changed concurrently',
          code: 'PASSWORD_CHANGED_CONCURRENTLY',
        });
      }

      await manager.update(User, userId, {
        password: hashedPassword,
        requiresPasswordChange: false,
      });

      await this.authSessionService.revokeAllForUser(
        manager,
        userId,
        'password_change',
        this.clock.now(),
      );
    });

    this.logger.log(`Password changed for user ${user.username} - all sessions invalidated`);
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
   * Self-heal expired lockout
   */
  private async healExpiredLock(user: User): Promise<void> {
    try {
      await this.userRepository.update(user.id, {
        failedLoginAttempts: 0,
        lockedUntil: null,
      });
      user.failedLoginAttempts = 0;
      user.lockedUntil = null;
    } catch (err) {
      // A failed cleanup must not block login; the in-memory isLocked check
      // below still governs the decision. Retry happens on the next attempt.
      this.logger.warn(
        `Failed to persist lock self-heal for ${user.username}: ${err}`,
      );
    }
  }

  /**
   * Handle failed login attempts and account lockout
   */
  private async handleFailedLogin(user: User): Promise<void> {
    const nextAttempts = user.failedLoginAttempts + 1;
    let lockedUntil: Date | null = null;

    if (nextAttempts >= MAX_FAILED_ATTEMPTS) {
      lockedUntil = new Date(this.clock.now().getTime() + LOCKOUT_DURATION_MINUTES * 60 * 1000);
      this.logger.warn(
        `Account ${user.username} locked due to ${MAX_FAILED_ATTEMPTS} failed login attempts`,
      );
    }

    await this.userRepository.update(user.id, {
      failedLoginAttempts: nextAttempts,
      ...(lockedUntil !== null ? { lockedUntil } : {}),
    });
    user.failedLoginAttempts = nextAttempts;
    if (lockedUntil !== null) {
      user.lockedUntil = lockedUntil;
    }
  }

  /**
   * Remove sensitive data from user object
   */
  private sanitizeUser(user: User): Partial<User> {
    const { password, failedLoginAttempts, lockedUntil, ...sanitized } = user;
    return sanitized;
  }
}
