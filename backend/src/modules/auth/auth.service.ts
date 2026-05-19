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
import { Repository, LessThan } from 'typeorm';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { User, UserStatus } from '@/database/entities/user.entity';
import { RefreshToken } from '@/database/entities/refresh-token.entity';
import {
  LoginDto,
  RegisterDto,
  AuthResponseDto,
  RefreshTokenDto,
  ChangePasswordDto,
} from './dto';

const BCRYPT_ROUNDS = 12;
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

    // Reset failed login attempts on successful login
    if (user.failedLoginAttempts > 0) {
      user.failedLoginAttempts = 0;
      user.lockedUntil = null;
    }

    // Update last login info
    user.lastLoginAt = new Date();
    user.lastLoginIp = ipAddress || null;
    await this.userRepository.save(user);

    // Generate tokens
    const { accessToken, refreshToken } = await this.generateTokens(
      user,
      rememberMe,
      ipAddress,
      userAgent,
    );

    this.logger.log(`User ${user.username} logged in successfully from ${ipAddress}`);

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
    const hashedPassword = await bcrypt.hash(password, BCRYPT_ROUNDS);

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
    const { accessToken, refreshToken } = await this.generateTokens(user);

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

    // Check if token is expired
    if (refreshTokenRecord.isExpired) {
      await this.refreshTokenRepository.remove(refreshTokenRecord);
      throw new UnauthorizedException('Refresh token expired');
    }

    const user = refreshTokenRecord.user;

    // Check if user is still active
    if (!user.isActive || user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException('User account is not active');
    }

    // Invalidate old refresh token (token rotation)
    await this.refreshTokenRepository.remove(refreshTokenRecord);

    // Generate new tokens
    const { accessToken, refreshToken: newRefreshToken } = await this.generateTokens(
      user,
      false,
      ipAddress,
      userAgent,
    );

    this.logger.log(`Access token refreshed for user ${user.username}`);

    return {
      accessToken,
      refreshToken: newRefreshToken,
      expiresIn: this.getAccessTokenExpiry(),
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
    const hashedPassword = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);

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
   * Generate JWT access token and refresh token
   */
  private async generateTokens(
    user: User,
    rememberMe = false,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    // JWT payload
    const payload = {
      sub: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
    };

    // Generate access token (short-lived)
    const accessToken = this.jwtService.sign(payload, {
      expiresIn: this.configService.get('JWT_ACCESS_TOKEN_EXPIRY', '15m'),
    });

    // Generate refresh token (long-lived)
    // If "Remember me" is checked: 7 days, otherwise: 2 days (covers 12h idle + buffer)
    const refreshTokenExpiry = rememberMe ? '7d' : '2d';
    const refreshToken = this.jwtService.sign(payload, {
      expiresIn: this.configService.get('JWT_REFRESH_TOKEN_EXPIRY', refreshTokenExpiry),
    });

    // Store refresh token in database (hashed)
    const tokenHash = this.hashToken(refreshToken);
    const expiresAt = new Date(
      Date.now() + this.parseExpiry(refreshTokenExpiry) * 1000,
    );

    const refreshTokenRecord = this.refreshTokenRepository.create({
      tokenHash,
      userId: user.id,
      expiresAt,
      deviceInfo: userAgent,
      ipAddress,
      isActive: true,
    });

    await this.refreshTokenRepository.save(refreshTokenRecord);

    return { accessToken, refreshToken };
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
    const expiry = this.configService.get<string>('JWT_ACCESS_TOKEN_EXPIRY', '15m');
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
