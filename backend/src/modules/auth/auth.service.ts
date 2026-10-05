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
import { Repository, DataSource, LessThan } from 'typeorm';
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
        await this.userRepository.save(user);
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

    const { tokens, user: updatedUser } = await this.dataSource.transaction(
      async (manager) => {
        // Reset failed login attempts on successful login
        if (user.failedLoginAttempts > 0) {
          user.failedLoginAttempts = 0;
          user.lockedUntil = null;
        }

        // Update last login info
        user.lastLoginAt = new Date();
        user.lastLoginIp = ipAddress || null;
        await manager.getRepository(User).save(user);

        const tokens = await this.authSessionService.createSession(
          manager,
          user,
          {
            rememberMe: rememberMe ?? false,
            ipAddress,
            userAgent,
          },
        );

        return { tokens, user };
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
   * Logout - invalidate all refresh tokens for user
   */
  async logout(userId: string): Promise<void> {
    await this.refreshTokenRepository.delete({ userId, isActive: true });
    this.logger.log(`User ${userId} logged out - all tokens invalidated`);
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
      throw new UnauthorizedException('Current password is incorrect');
    }

    // Check that new password is different from current
    const isSamePassword = await bcrypt.compare(newPassword, user.password);

    if (isSamePassword) {
      throw new BadRequestException('New password must be different from current password');
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, bcryptRounds());

    // Update password and clear password change requirement
    user.password = hashedPassword;
    user.requiresPasswordChange = false;
    await this.userRepository.save(user);

    // Invalidate all refresh tokens (force re-login everywhere)
    await this.logout(userId);

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
   * Handle failed login attempts and account lockout
   */
  private async handleFailedLogin(user: User): Promise<void> {
    user.failedLoginAttempts += 1;

    if (user.failedLoginAttempts >= MAX_FAILED_ATTEMPTS) {
      user.lockedUntil = new Date(Date.now() + LOCKOUT_DURATION_MINUTES * 60 * 1000);
      this.logger.warn(
        `Account ${user.username} locked due to ${MAX_FAILED_ATTEMPTS} failed login attempts`,
      );
    }

    await this.userRepository.save(user);
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
