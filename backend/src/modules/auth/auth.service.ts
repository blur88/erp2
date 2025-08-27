import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  Logger,
  Inject,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cache } from 'cache-manager';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { v4 as uuidv4 } from 'uuid';
import * as bcrypt from 'bcrypt';

import { User, UserStatus } from '../../database/entities/user.entity';
import { JwtPayload, JwtRefreshPayload, AuthenticatedUser } from './interfaces/jwt-payload.interface';
import {
  LoginDto,
  LoginResponseDto,
  RefreshTokenDto,
  RefreshTokenResponseDto,
  ChangePasswordDto,
  ResetPasswordDto,
  ConfirmPasswordResetDto,
  UserProfileDto,
  TokenDto,
  RegisterDto,
  RegisterResponseDto,
  VerifyEmailDto,
  VerifyEmailResponseDto,
  ResendVerificationDto,
  ResendVerificationResponseDto,
  GetSessionsDto,
  GetSessionsResponseDto,
  SessionResponseDto,
  TerminateSessionDto,
  TerminateSessionResponseDto,
  TerminateAllSessionsResponseDto,
} from './dto';
import { EmailService } from './services/email.service';
import { PasswordValidationService } from './services/password-validation.service';
import { AuditService, AuditEventType, AuditSeverity, AuditContext } from './services/audit.service';

/**
 * Authentication Service
 * Handles user authentication, JWT token management, and session tracking
 */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly jwtSecret: string;
  private readonly jwtExpiresIn: string;
  private readonly refreshTokenExpiresIn: string;
  private readonly maxLoginAttempts = 5;
  private readonly lockDuration = 30 * 60 * 1000; // 30 minutes

  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    private jwtService: JwtService,
    private configService: ConfigService,
    @Inject(CACHE_MANAGER)
    private cacheManager: Cache,
    private emailService: EmailService,
    private passwordValidationService: PasswordValidationService,
    private auditService: AuditService,
  ) {
    this.jwtSecret = this.configService.get<string>('JWT_SECRET', 'your-super-secret-jwt-key');
    this.jwtExpiresIn = this.configService.get<string>('JWT_EXPIRES_IN', '15m');
    this.refreshTokenExpiresIn = this.configService.get<string>('JWT_REFRESH_EXPIRES_IN', '7d');
  }

  /**
   * Validate user credentials for local strategy
   */
  async validateUser(username: string, password: string): Promise<User | null> {
    try {
      // Find user by username or email
      const user = await this.userRepository.findOne({
        where: [
          { username: username.toLowerCase() },
          { email: username.toLowerCase() },
        ],
      });

      if (!user) {
        this.logger.warn(`User not found: ${username}`);
        return null;
      }

      // Check account status
      if (!user.isActive || user.status !== UserStatus.ACTIVE) {
        this.logger.warn(`Inactive account login attempt: ${user.username}`);
        throw new UnauthorizedException('Account is inactive or suspended');
      }

      // Check if account is locked
      if (user.isLocked) {
        this.logger.warn(`Locked account login attempt: ${user.username}`);
        throw new UnauthorizedException(
          `Account is locked due to too many failed attempts. Try again later.`
        );
      }

      // Validate password
      const isPasswordValid = await user.validatePassword(password);
      
      if (!isPasswordValid) {
        // Increment failed attempts
        user.incrementFailedAttempts();
        await this.userRepository.save(user);
        
        this.logger.warn(
          `Invalid password for user: ${user.username}. Attempts: ${user.failedLoginAttempts}`
        );
        return null;
      }

      // Reset failed attempts on successful validation
      user.resetFailedAttempts();
      await this.userRepository.save(user);

      this.logger.log(`User validated successfully: ${user.username}`);
      return user;
    } catch (error) {
      this.logger.error(`User validation error: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Login user and generate JWT tokens
   */
  async login(loginDto: LoginDto, ipAddress?: string): Promise<LoginResponseDto> {
    try {
      const user = await this.validateUser(loginDto.username, loginDto.password);
      
      if (!user) {
        throw new UnauthorizedException('Invalid credentials');
      }

      // Generate session ID
      const sessionId = uuidv4();

      // Create JWT tokens
      const tokens = await this.generateTokens(user, sessionId);

      // Store session in cache
      await this.createSession(user, sessionId, loginDto.rememberMe, ipAddress);

      // Update user's last login info
      user.lastLoginAt = new Date();
      user.lastLoginIp = ipAddress;
      await this.userRepository.save(user);

      // Create response
      const response: LoginResponseDto = {
        tokens,
        user: this.mapToUserProfile(user),
        loginAt: new Date(),
        sessionId,
      };

      this.logger.log(`User logged in successfully: ${user.username}`);
      return response;
    } catch (error) {
      this.logger.error(`Login error: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Refresh JWT tokens
   */
  async refreshTokens(refreshTokenDto: RefreshTokenDto): Promise<RefreshTokenResponseDto> {
    try {
      // Verify refresh token
      const payload = this.jwtService.verify(refreshTokenDto.refreshToken, {
        secret: this.jwtSecret,
      }) as JwtRefreshPayload;

      // Validate session
      const sessionKey = `session:${refreshTokenDto.sessionId}`;
      const sessionData = await this.cacheManager.get(sessionKey);
      
      if (!sessionData || payload.sessionId !== refreshTokenDto.sessionId) {
        throw new UnauthorizedException('Invalid refresh token or session');
      }

      // Get user
      const user = await this.userRepository.findOne({
        where: { id: payload.sub },
      });

      if (!user || !user.isActive || user.status !== UserStatus.ACTIVE) {
        throw new UnauthorizedException('User not found or inactive');
      }

      // Generate new access token
      const accessTokenPayload: JwtPayload = {
        sub: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        sessionId: payload.sessionId,
        aud: this.configService.get<string>('JWT_AUDIENCE', 'erp-app'),
        iss: this.configService.get<string>('JWT_ISSUER', 'erp-backend'),
      };

      const accessToken = this.jwtService.sign(accessTokenPayload, {
        expiresIn: this.jwtExpiresIn,
      });

      const expiresIn = this.parseExpirationTime(this.jwtExpiresIn);

      this.logger.log(`Tokens refreshed for user: ${user.username}`);

      return {
        accessToken,
        expiresIn,
        tokenType: 'Bearer',
      };
    } catch (error) {
      this.logger.error(`Token refresh error: ${error.message}`, error.stack);
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  /**
   * Logout user and invalidate session
   */
  async logout(user: AuthenticatedUser): Promise<void> {
    try {
      // Add session to blacklist
      const blacklistKey = `blacklist:${user.sessionId}`;
      await this.cacheManager.set(blacklistKey, true, 86400000); // 24 hours

      // Remove session
      const sessionKey = `session:${user.sessionId}`;
      await this.cacheManager.del(sessionKey);

      // Remove user activity
      await this.cacheManager.del(`activity:${user.userId}`);

      this.logger.log(`User logged out successfully: ${user.username}`);
    } catch (error) {
      this.logger.error(`Logout error: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Change user password
   */
  async changePassword(
    user: AuthenticatedUser,
    changePasswordDto: ChangePasswordDto,
  ): Promise<void> {
    try {
      if (changePasswordDto.newPassword !== changePasswordDto.confirmPassword) {
        throw new BadRequestException('New password and confirmation do not match');
      }

      // Get user from database
      const dbUser = await this.userRepository.findOne({
        where: { id: user.userId },
      });

      if (!dbUser) {
        throw new UnauthorizedException('User not found');
      }

      // Validate current password
      const isCurrentPasswordValid = await dbUser.validatePassword(
        changePasswordDto.currentPassword,
      );

      if (!isCurrentPasswordValid) {
        throw new BadRequestException('Current password is incorrect');
      }

      // Update password
      dbUser.password = changePasswordDto.newPassword; // Will be hashed by entity hook
      await this.userRepository.save(dbUser);

      this.logger.log(`Password changed for user: ${user.username}`);
    } catch (error) {
      this.logger.error(`Password change error: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Initiate password reset
   */
  async resetPassword(resetPasswordDto: ResetPasswordDto): Promise<void> {
    try {
      const user = await this.userRepository.findOne({
        where: { email: resetPasswordDto.email.toLowerCase() },
      });

      if (!user) {
        // Don't reveal whether email exists or not for security
        this.logger.warn(`Password reset requested for non-existent email: ${resetPasswordDto.email}`);
        return;
      }

      // Generate reset token
      const resetToken = uuidv4();
      const resetExpiry = new Date(Date.now() + 3600000); // 1 hour

      // Store reset token in cache
      const resetKey = `password-reset:${resetToken}`;
      await this.cacheManager.set(resetKey, {
        userId: user.id,
        email: user.email,
        expiresAt: resetExpiry,
      }, 3600000); // 1 hour TTL

      // TODO: Send password reset email
      // await this.emailService.sendPasswordResetEmail(user.email, resetToken);

      this.logger.log(`Password reset initiated for user: ${user.email}`);
    } catch (error) {
      this.logger.error(`Password reset error: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Confirm password reset with token
   */
  async confirmPasswordReset(
    confirmResetDto: ConfirmPasswordResetDto,
  ): Promise<void> {
    try {
      if (confirmResetDto.newPassword !== confirmResetDto.confirmPassword) {
        throw new BadRequestException('Password and confirmation do not match');
      }

      // Validate reset token
      const resetKey = `password-reset:${confirmResetDto.token}`;
      const resetData = await this.cacheManager.get(resetKey);

      if (!resetData) {
        throw new BadRequestException('Invalid or expired reset token');
      }

      // Get user
      const user = await this.userRepository.findOne({
        where: { id: (resetData as any).userId },
      });

      if (!user) {
        throw new BadRequestException('User not found');
      }

      // Update password
      user.password = confirmResetDto.newPassword; // Will be hashed by entity hook
      user.failedLoginAttempts = 0; // Reset failed attempts
      user.lockedUntil = null; // Unlock account
      await this.userRepository.save(user);

      // Remove reset token
      await this.cacheManager.del(resetKey);

      this.logger.log(`Password reset completed for user: ${user.email}`);
    } catch (error) {
      this.logger.error(`Password reset confirmation error: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Generate JWT access and refresh tokens
   */
  private async generateTokens(user: User, sessionId: string): Promise<TokenDto> {
    const accessTokenPayload: JwtPayload = {
      sub: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      sessionId,
      aud: this.configService.get<string>('JWT_AUDIENCE', 'erp-app'),
      iss: this.configService.get<string>('JWT_ISSUER', 'erp-backend'),
    };

    const refreshTokenPayload: JwtRefreshPayload = {
      sub: user.id,
      sessionId,
      tokenVersion: 1, // For future token revocation features
    };

    const accessToken = this.jwtService.sign(accessTokenPayload, {
      expiresIn: this.jwtExpiresIn,
    });

    const refreshToken = this.jwtService.sign(refreshTokenPayload, {
      expiresIn: this.refreshTokenExpiresIn,
    });

    const expiresIn = this.parseExpirationTime(this.jwtExpiresIn);

    return {
      accessToken,
      refreshToken,
      expiresIn,
      tokenType: 'Bearer',
    };
  }

  /**
   * Create and store user session
   */
  private async createSession(
    user: User,
    sessionId: string,
    rememberMe = false,
    ipAddress?: string,
  ): Promise<void> {
    const sessionTTL = rememberMe ? 7 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000; // 7 days or 1 day

    const sessionData = {
      userId: user.id,
      username: user.username,
      role: user.role,
      ipAddress,
      createdAt: new Date().toISOString(),
      rememberMe,
    };

    const sessionKey = `session:${sessionId}`;
    await this.cacheManager.set(sessionKey, sessionData, sessionTTL);
  }

  /**
   * Map user entity to profile DTO
   */
  private mapToUserProfile(user: User): UserProfileDto {
    return {
      id: user.id,
      username: user.username,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      fullName: user.fullName,
      phoneNumber: user.phoneNumber,
      role: user.role,
      status: user.status,
      isActive: user.isActive,
      lastLoginAt: user.lastLoginAt,
    };
  }

  /**
   * Register new user account
   */
  async register(registerDto: RegisterDto, ipAddress?: string): Promise<RegisterResponseDto> {
    try {
      // Validate password strength
      const passwordValidation = this.passwordValidationService.validatePassword(registerDto.password);
      if (!passwordValidation.isValid) {
        throw new BadRequestException(`Password validation failed: ${passwordValidation.errors.join(', ')}`);
      }

      // Check if passwords match
      if (registerDto.password !== registerDto.confirmPassword) {
        throw new BadRequestException('Password and confirmation do not match');
      }

      // Check if username or email already exists
      const existingUser = await this.userRepository.findOne({
        where: [
          { username: registerDto.username.toLowerCase() },
          { email: registerDto.email.toLowerCase() },
        ],
      });

      if (existingUser) {
        const field = existingUser.username === registerDto.username.toLowerCase() ? 'Username' : 'Email';
        throw new BadRequestException(`${field} already exists`);
      }

      // Create user
      const user = this.userRepository.create({
        username: registerDto.username.toLowerCase(),
        email: registerDto.email.toLowerCase(),
        password: registerDto.password, // Will be hashed by entity hook
        firstName: registerDto.firstName,
        lastName: registerDto.lastName,
        phoneNumber: registerDto.phoneNumber,
        role: registerDto.role || 'SALES_STAFF',
        status: UserStatus.INACTIVE, // Requires email verification
        isActive: false,
      });

      const savedUser = await this.userRepository.save(user);

      // Generate email verification token
      const verificationToken = uuidv4();
      const verificationKey = `email-verification:${verificationToken}`;
      await this.cacheManager.set(
        verificationKey,
        {
          userId: savedUser.id,
          email: savedUser.email,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
        },
        86400000, // 24 hours TTL
      );

      // Send verification email
      await this.emailService.sendAccountVerificationEmail(savedUser.email, verificationToken);

      // Audit log
      await this.auditService.logAuthEvent(
        AuditEventType.ACCOUNT_CREATED,
        AuditSeverity.LOW,
        `New user account created: ${savedUser.username}`,
        {
          userId: savedUser.id,
          username: savedUser.username,
          email: savedUser.email,
          ipAddress,
        },
      );

      this.logger.log(`User registered successfully: ${savedUser.username}`);

      return {
        message: 'User registered successfully. Please check your email to verify your account.',
        userId: savedUser.id,
        requiresEmailVerification: true,
      };

    } catch (error) {
      this.logger.error(`Registration error: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Verify email address
   */
  async verifyEmail(verifyEmailDto: VerifyEmailDto): Promise<VerifyEmailResponseDto> {
    try {
      const verificationKey = `email-verification:${verifyEmailDto.token}`;
      const verificationData = await this.cacheManager.get(verificationKey);

      if (!verificationData) {
        throw new BadRequestException('Invalid or expired verification token');
      }

      const { userId, email } = verificationData as any;

      // Get user
      const user = await this.userRepository.findOne({
        where: { id: userId },
      });

      if (!user) {
        throw new BadRequestException('User not found');
      }

      if (user.email !== email) {
        throw new BadRequestException('Email mismatch');
      }

      // Activate user account
      user.status = UserStatus.ACTIVE;
      user.isActive = true;
      await this.userRepository.save(user);

      // Remove verification token
      await this.cacheManager.del(verificationKey);

      // Audit log
      await this.auditService.logAuthEvent(
        AuditEventType.ACCOUNT_ACTIVATED,
        AuditSeverity.LOW,
        `Email verified and account activated: ${user.username}`,
        {
          userId: user.id,
          username: user.username,
          email: user.email,
        },
      );

      this.logger.log(`Email verified for user: ${user.username}`);

      return {
        message: 'Email verified successfully. Your account is now active.',
        canLogin: true,
      };

    } catch (error) {
      this.logger.error(`Email verification error: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Resend email verification
   */
  async resendEmailVerification(resendDto: ResendVerificationDto): Promise<ResendVerificationResponseDto> {
    try {
      const user = await this.userRepository.findOne({
        where: { email: resendDto.email.toLowerCase() },
      });

      if (!user) {
        // Don't reveal if email exists
        return {
          message: 'If the email exists and is not verified, a verification email has been sent.',
        };
      }

      if (user.status === UserStatus.ACTIVE && user.isActive) {
        return {
          message: 'Account is already verified.',
        };
      }

      // Generate new verification token
      const verificationToken = uuidv4();
      const verificationKey = `email-verification:${verificationToken}`;
      await this.cacheManager.set(
        verificationKey,
        {
          userId: user.id,
          email: user.email,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
        },
        86400000, // 24 hours TTL
      );

      // Send verification email
      await this.emailService.sendAccountVerificationEmail(user.email, verificationToken);

      this.logger.log(`Verification email resent to: ${user.email}`);

      return {
        message: 'If the email exists and is not verified, a verification email has been sent.',
      };

    } catch (error) {
      this.logger.error(`Resend verification error: ${error.message}`, error.stack);
      // Don't throw to avoid revealing email existence
      return {
        message: 'If the email exists and is not verified, a verification email has been sent.',
      };
    }
  }

  /**
   * Get user active sessions
   */
  async getUserSessions(
    user: AuthenticatedUser,
    getSessionsDto: GetSessionsDto,
  ): Promise<GetSessionsResponseDto> {
    try {
      const { page = 1, limit = 10 } = getSessionsDto;
      
      // Get all sessions for the user
      const sessionKeys = await this.getAllSessionKeysForUser(user.userId);
      const sessions: SessionResponseDto[] = [];

      for (const sessionKey of sessionKeys) {
        const sessionData = await this.cacheManager.get(sessionKey);
        if (sessionData) {
          const sessionId = sessionKey.replace('session:', '');
          const session = await this.mapToSessionResponse(sessionData as any, sessionId, user.sessionId);
          sessions.push(session);
        }
      }

      // Sort by creation date (newest first)
      sessions.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

      // Paginate results
      const startIndex = (page - 1) * limit;
      const endIndex = startIndex + limit;
      const paginatedSessions = sessions.slice(startIndex, endIndex);

      const totalPages = Math.ceil(sessions.length / limit);

      return {
        sessions: paginatedSessions,
        total: sessions.length,
        page,
        limit,
        totalPages,
      };

    } catch (error) {
      this.logger.error(`Get user sessions error: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Terminate a specific session
   */
  async terminateSession(
    user: AuthenticatedUser,
    terminateDto: TerminateSessionDto,
  ): Promise<TerminateSessionResponseDto> {
    try {
      // Prevent terminating current session
      if (terminateDto.sessionId === user.sessionId) {
        throw new BadRequestException('Cannot terminate current session. Use logout instead.');
      }

      // Check if session belongs to the user
      const sessionKey = `session:${terminateDto.sessionId}`;
      const sessionData = await this.cacheManager.get(sessionKey);

      if (!sessionData || (sessionData as any).userId !== user.userId) {
        throw new BadRequestException('Session not found or does not belong to user');
      }

      // Add session to blacklist
      const blacklistKey = `blacklist:${terminateDto.sessionId}`;
      await this.cacheManager.set(blacklistKey, true, 86400000); // 24 hours

      // Remove session
      await this.cacheManager.del(sessionKey);

      // Audit log
      await this.auditService.logSessionEvent(
        AuditEventType.SESSION_TERMINATED,
        {
          userId: user.userId,
          username: user.username,
          sessionId: terminateDto.sessionId,
        },
      );

      this.logger.log(`Session terminated: ${terminateDto.sessionId} by user: ${user.username}`);

      return {
        message: 'Session terminated successfully',
        terminatedAt: new Date(),
      };

    } catch (error) {
      this.logger.error(`Terminate session error: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Terminate all other sessions (keep current session)
   */
  async terminateAllOtherSessions(user: AuthenticatedUser): Promise<TerminateAllSessionsResponseDto> {
    try {
      // Get all sessions for the user
      const sessionKeys = await this.getAllSessionKeysForUser(user.userId);
      let terminatedCount = 0;

      for (const sessionKey of sessionKeys) {
        const sessionId = sessionKey.replace('session:', '');
        
        // Skip current session
        if (sessionId === user.sessionId) {
          continue;
        }

        const sessionData = await this.cacheManager.get(sessionKey);
        if (sessionData && (sessionData as any).userId === user.userId) {
          // Add to blacklist
          const blacklistKey = `blacklist:${sessionId}`;
          await this.cacheManager.set(blacklistKey, true, 86400000); // 24 hours

          // Remove session
          await this.cacheManager.del(sessionKey);
          terminatedCount++;
        }
      }

      // Audit log
      await this.auditService.logAuthEvent(
        AuditEventType.SESSION_TERMINATED,
        AuditSeverity.LOW,
        `User terminated ${terminatedCount} other sessions`,
        {
          userId: user.userId,
          username: user.username,
          sessionId: user.sessionId,
        },
        {
          terminatedSessionsCount: terminatedCount,
        },
      );

      this.logger.log(`${terminatedCount} sessions terminated by user: ${user.username}`);

      return {
        message: 'All other sessions terminated successfully',
        sessionsTerminated: terminatedCount,
        terminatedAt: new Date(),
      };

    } catch (error) {
      this.logger.error(`Terminate all sessions error: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Clean up expired sessions
   */
  async cleanupExpiredSessions(): Promise<{ cleaned: number }> {
    try {
      // This would be called by a scheduled job
      // Get all session keys and check if they're expired
      // For now, we rely on Redis TTL to handle expiration
      
      this.logger.log('Session cleanup completed');
      return { cleaned: 0 }; // Placeholder

    } catch (error) {
      this.logger.error(`Session cleanup error: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Get all session keys for a user (helper method)
   */
  private async getAllSessionKeysForUser(userId: string): Promise<string[]> {
    // This is a simplified implementation
    // In production, you might maintain a set of session IDs per user
    // For now, we'll return empty array as we don't have a way to get all keys by pattern
    return [];
  }

  /**
   * Map session data to response DTO
   */
  private async mapToSessionResponse(
    sessionData: any,
    sessionId: string,
    currentSessionId: string,
  ): Promise<SessionResponseDto> {
    return {
      sessionId,
      ipAddress: sessionData.ipAddress || 'Unknown',
      userAgent: sessionData.userAgent,
      createdAt: new Date(sessionData.createdAt),
      lastActivity: new Date(sessionData.lastActivity || sessionData.createdAt),
      isCurrent: sessionId === currentSessionId,
      rememberMe: sessionData.rememberMe || false,
      location: await this.getLocationFromIP(sessionData.ipAddress),
      device: this.parseDeviceFromUserAgent(sessionData.userAgent),
    };
  }

  /**
   * Get location from IP address (simplified)
   */
  private async getLocationFromIP(ipAddress: string): Promise<string | undefined> {
    // In production, use a geolocation service
    return 'Unknown Location';
  }

  /**
   * Parse device information from user agent
   */
  private parseDeviceFromUserAgent(userAgent?: string): string | undefined {
    if (!userAgent) return undefined;

    // Simplified device detection
    if (userAgent.includes('Chrome')) return 'Chrome Browser';
    if (userAgent.includes('Firefox')) return 'Firefox Browser';
    if (userAgent.includes('Safari')) return 'Safari Browser';
    if (userAgent.includes('Edge')) return 'Edge Browser';
    if (userAgent.includes('Mobile')) return 'Mobile Device';
    
    return 'Unknown Device';
  }

  /**
   * Parse expiration time string to seconds
   */
  private parseExpirationTime(expiresIn: string): number {
    const unit = expiresIn.slice(-1);
    const value = parseInt(expiresIn.slice(0, -1));

    switch (unit) {
      case 's':
        return value;
      case 'm':
        return value * 60;
      case 'h':
        return value * 60 * 60;
      case 'd':
        return value * 24 * 60 * 60;
      default:
        return 900; // Default 15 minutes
    }
  }
}