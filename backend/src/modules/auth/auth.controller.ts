import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  UseGuards,
  Req,
  Get,
  Delete,
  Query,
  Logger,
  ValidationPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBadRequestResponse,
  ApiUnauthorizedResponse,
  ApiTooManyRequestsResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { Request } from 'express';
import { Throttle } from '@nestjs/throttler';

import { AuthService } from './auth.service';
import { LocalAuthGuard } from './guards/local-auth.guard';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { Public, Authenticated } from '../../common/decorators/auth.decorator';
import { CurrentUser } from '../../common/decorators/user.decorator';
import { AuthenticatedUser } from './interfaces/jwt-payload.interface';

import {
  LoginDto,
  LoginResponseDto,
  RefreshTokenDto,
  RefreshTokenResponseDto,
  LogoutResponseDto,
  ChangePasswordDto,
  ResetPasswordDto,
  ConfirmPasswordResetDto,
  RegisterDto,
  RegisterResponseDto,
  VerifyEmailDto,
  VerifyEmailResponseDto,
  ResendVerificationDto,
  ResendVerificationResponseDto,
  GetSessionsDto,
  GetSessionsResponseDto,
  TerminateSessionDto,
  TerminateSessionResponseDto,
  TerminateAllSessionsResponseDto,
} from './dto';

/**
 * Authentication Controller
 * Handles all authentication-related endpoints
 */
@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(private authService: AuthService) {}

  /**
   * User registration endpoint
   */
  @Public()
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: { limit: 3, ttl: 300000 } }) // 3 attempts per 5 minutes
  @ApiOperation({
    summary: 'User registration',
    description: 'Register a new user account with email verification',
  })
  @ApiResponse({
    status: 201,
    description: 'User registered successfully',
    type: RegisterResponseDto,
  })
  @ApiBadRequestResponse({
    description: 'Invalid input data, username/email already exists, or password requirements not met',
  })
  @ApiTooManyRequestsResponse({
    description: 'Too many registration attempts. Please try again later.',
  })
  async register(
    @Body(ValidationPipe) registerDto: RegisterDto,
    @Req() req: Request,
  ): Promise<RegisterResponseDto> {
    try {
      const ipAddress = req.ip || req.socket.remoteAddress;
      const userAgent = req.get('User-Agent');
      
      this.logger.log(`Registration attempt from IP: ${ipAddress}, Username: ${registerDto.username}`);
      
      const result = await this.authService.register(registerDto, ipAddress);
      
      this.logger.log(`User registered successfully: ${registerDto.username}`);
      return result;
    } catch (error) {
      this.logger.error(`Registration failed: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Verify email address
   */
  @Public()
  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 900000 } }) // 5 attempts per 15 minutes
  @ApiOperation({
    summary: 'Verify email address',
    description: 'Verify user email address with verification token',
  })
  @ApiResponse({
    status: 200,
    description: 'Email verified successfully',
    type: VerifyEmailResponseDto,
  })
  @ApiBadRequestResponse({
    description: 'Invalid or expired verification token',
  })
  @ApiTooManyRequestsResponse({
    description: 'Too many verification attempts. Please try again later.',
  })
  async verifyEmail(
    @Body(ValidationPipe) verifyEmailDto: VerifyEmailDto,
  ): Promise<VerifyEmailResponseDto> {
    try {
      const result = await this.authService.verifyEmail(verifyEmailDto);
      
      this.logger.log(`Email verified successfully for token: ${verifyEmailDto.token}`);
      return result;
    } catch (error) {
      this.logger.error(`Email verification failed: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Resend email verification
   */
  @Public()
  @Post('resend-verification')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 3, ttl: 900000 } }) // 3 attempts per 15 minutes
  @ApiOperation({
    summary: 'Resend email verification',
    description: 'Resend email verification link to user email',
  })
  @ApiResponse({
    status: 200,
    description: 'Verification email resent (if email exists and is not verified)',
    type: ResendVerificationResponseDto,
  })
  @ApiBadRequestResponse({
    description: 'Invalid email format',
  })
  @ApiTooManyRequestsResponse({
    description: 'Too many resend attempts. Please try again later.',
  })
  async resendEmailVerification(
    @Body(ValidationPipe) resendDto: ResendVerificationDto,
  ): Promise<ResendVerificationResponseDto> {
    try {
      const result = await this.authService.resendEmailVerification(resendDto);
      
      this.logger.log(`Verification email resend requested for: ${resendDto.email}`);
      return result;
    } catch (error) {
      this.logger.error(`Resend verification failed: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * User login endpoint
   */
  @Public()
  @UseGuards(LocalAuthGuard)
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 300000 } }) // 5 attempts per 5 minutes
  @ApiOperation({
    summary: 'User login',
    description: 'Authenticate user with username/email and password',
  })
  @ApiResponse({
    status: 200,
    description: 'Login successful',
    type: LoginResponseDto,
  })
  @ApiUnauthorizedResponse({
    description: 'Invalid credentials or account locked',
  })
  @ApiBadRequestResponse({
    description: 'Invalid input data',
  })
  @ApiTooManyRequestsResponse({
    description: 'Too many login attempts. Please try again later.',
  })
  async login(
    @Body(ValidationPipe) loginDto: LoginDto,
    @Req() req: Request,
  ): Promise<LoginResponseDto> {
    try {
      const ipAddress = req.ip || req.socket.remoteAddress;
      const userAgent = req.get('User-Agent');
      
      this.logger.log(`Login attempt from IP: ${ipAddress}, User-Agent: ${userAgent}`);
      
      const result = await this.authService.login(loginDto, ipAddress);
      
      this.logger.log(`Successful login for user: ${result.user.username}`);
      return result;
    } catch (error) {
      this.logger.error(`Login failed: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Refresh JWT tokens
   */
  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60000 } }) // 10 attempts per minute
  @ApiOperation({
    summary: 'Refresh JWT tokens',
    description: 'Get new access token using valid refresh token',
  })
  @ApiResponse({
    status: 200,
    description: 'Tokens refreshed successfully',
    type: RefreshTokenResponseDto,
  })
  @ApiUnauthorizedResponse({
    description: 'Invalid or expired refresh token',
  })
  @ApiBadRequestResponse({
    description: 'Invalid input data',
  })
  async refreshTokens(
    @Body(ValidationPipe) refreshTokenDto: RefreshTokenDto,
  ): Promise<RefreshTokenResponseDto> {
    try {
      const result = await this.authService.refreshTokens(refreshTokenDto);
      this.logger.log(`Tokens refreshed for session: ${refreshTokenDto.sessionId}`);
      return result;
    } catch (error) {
      this.logger.error(`Token refresh failed: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * User logout
   */
  @Authenticated()
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'User logout',
    description: 'Logout user and invalidate session',
  })
  @ApiResponse({
    status: 200,
    description: 'Logout successful',
    type: LogoutResponseDto,
  })
  @ApiUnauthorizedResponse({
    description: 'Invalid or missing JWT token',
  })
  async logout(@CurrentUser() user: AuthenticatedUser): Promise<LogoutResponseDto> {
    try {
      await this.authService.logout(user);
      
      this.logger.log(`User logged out: ${user.username}`);
      
      return {
        message: 'Logout successful',
        logoutAt: new Date(),
      };
    } catch (error) {
      this.logger.error(`Logout failed: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Get current user profile
   */
  @Authenticated()
  @Get('profile')
  @ApiOperation({
    summary: 'Get current user profile',
    description: 'Retrieve authenticated user profile information',
  })
  @ApiResponse({
    status: 200,
    description: 'User profile retrieved successfully',
  })
  @ApiUnauthorizedResponse({
    description: 'Invalid or missing JWT token',
  })
  async getProfile(@CurrentUser() user: AuthenticatedUser) {
    try {
      this.logger.log(`Profile requested by user: ${user.username}`);
      return {
        user: {
          id: user.userId,
          username: user.username,
          email: user.email,
          role: user.role,
          sessionId: user.sessionId,
        },
        authenticatedAt: new Date(),
      };
    } catch (error) {
      this.logger.error(`Profile retrieval failed: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Change user password
   */
  @Authenticated()
  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 3, ttl: 900000 } }) // 3 attempts per 15 minutes
  @ApiOperation({
    summary: 'Change password',
    description: 'Change user password with current password verification',
  })
  @ApiResponse({
    status: 200,
    description: 'Password changed successfully',
    schema: {
      type: 'object',
      properties: {
        message: { type: 'string', example: 'Password changed successfully' },
        changedAt: { type: 'string', format: 'date-time' },
      },
    },
  })
  @ApiUnauthorizedResponse({
    description: 'Invalid or missing JWT token',
  })
  @ApiBadRequestResponse({
    description: 'Invalid current password or password requirements not met',
  })
  async changePassword(
    @CurrentUser() user: AuthenticatedUser,
    @Body(ValidationPipe) changePasswordDto: ChangePasswordDto,
  ) {
    try {
      await this.authService.changePassword(user, changePasswordDto);
      
      this.logger.log(`Password changed for user: ${user.username}`);
      
      return {
        message: 'Password changed successfully',
        changedAt: new Date(),
      };
    } catch (error) {
      this.logger.error(`Password change failed: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Initiate password reset
   */
  @Public()
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 3, ttl: 900000 } }) // 3 attempts per 15 minutes
  @ApiOperation({
    summary: 'Initiate password reset',
    description: 'Send password reset email to user',
  })
  @ApiResponse({
    status: 200,
    description: 'Password reset email sent (if email exists)',
    schema: {
      type: 'object',
      properties: {
        message: { type: 'string', example: 'Password reset email sent if account exists' },
        requestedAt: { type: 'string', format: 'date-time' },
      },
    },
  })
  @ApiBadRequestResponse({
    description: 'Invalid email format',
  })
  @ApiTooManyRequestsResponse({
    description: 'Too many reset attempts. Please try again later.',
  })
  async resetPassword(
    @Body(ValidationPipe) resetPasswordDto: ResetPasswordDto,
  ) {
    try {
      await this.authService.resetPassword(resetPasswordDto);
      
      this.logger.log(`Password reset requested for email: ${resetPasswordDto.email}`);
      
      return {
        message: 'Password reset email sent if account exists',
        requestedAt: new Date(),
      };
    } catch (error) {
      this.logger.error(`Password reset request failed: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Confirm password reset with token
   */
  @Public()
  @Post('confirm-reset-password')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 3600000 } }) // 5 attempts per hour
  @ApiOperation({
    summary: 'Confirm password reset',
    description: 'Complete password reset process with reset token',
  })
  @ApiResponse({
    status: 200,
    description: 'Password reset completed successfully',
    schema: {
      type: 'object',
      properties: {
        message: { type: 'string', example: 'Password reset completed successfully' },
        completedAt: { type: 'string', format: 'date-time' },
      },
    },
  })
  @ApiBadRequestResponse({
    description: 'Invalid or expired reset token, or password requirements not met',
  })
  @ApiTooManyRequestsResponse({
    description: 'Too many reset attempts. Please try again later.',
  })
  async confirmPasswordReset(
    @Body(ValidationPipe) confirmResetDto: ConfirmPasswordResetDto,
  ) {
    try {
      await this.authService.confirmPasswordReset(confirmResetDto);
      
      this.logger.log(`Password reset completed using token: ${confirmResetDto.token}`);
      
      return {
        message: 'Password reset completed successfully',
        completedAt: new Date(),
      };
    } catch (error) {
      this.logger.error(`Password reset confirmation failed: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Get user active sessions
   */
  @Authenticated()
  @Get('sessions')
  @ApiOperation({
    summary: 'Get active sessions',
    description: 'Retrieve all active sessions for the authenticated user',
  })
  @ApiResponse({
    status: 200,
    description: 'Sessions retrieved successfully',
    type: GetSessionsResponseDto,
  })
  @ApiUnauthorizedResponse({
    description: 'Invalid or missing JWT token',
  })
  async getSessions(
    @CurrentUser() user: AuthenticatedUser,
    @Query() getSessionsDto: GetSessionsDto,
  ): Promise<GetSessionsResponseDto> {
    try {
      const result = await this.authService.getUserSessions(user, getSessionsDto);
      
      this.logger.log(`Sessions retrieved for user: ${user.username}`);
      return result;
    } catch (error) {
      this.logger.error(`Get sessions failed: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Terminate a specific session
   */
  @Authenticated()
  @Delete('sessions')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 300000 } }) // 10 attempts per 5 minutes
  @ApiOperation({
    summary: 'Terminate session',
    description: 'Terminate a specific session by session ID',
  })
  @ApiResponse({
    status: 200,
    description: 'Session terminated successfully',
    type: TerminateSessionResponseDto,
  })
  @ApiUnauthorizedResponse({
    description: 'Invalid or missing JWT token',
  })
  @ApiBadRequestResponse({
    description: 'Cannot terminate current session or session not found',
  })
  @ApiTooManyRequestsResponse({
    description: 'Too many termination attempts. Please try again later.',
  })
  async terminateSession(
    @CurrentUser() user: AuthenticatedUser,
    @Body(ValidationPipe) terminateDto: TerminateSessionDto,
  ): Promise<TerminateSessionResponseDto> {
    try {
      const result = await this.authService.terminateSession(user, terminateDto);
      
      this.logger.log(`Session terminated: ${terminateDto.sessionId} by user: ${user.username}`);
      return result;
    } catch (error) {
      this.logger.error(`Terminate session failed: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Terminate all other sessions
   */
  @Authenticated()
  @Delete('sessions/all')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 900000 } }) // 5 attempts per 15 minutes
  @ApiOperation({
    summary: 'Terminate all other sessions',
    description: 'Terminate all sessions except the current one',
  })
  @ApiResponse({
    status: 200,
    description: 'All other sessions terminated successfully',
    type: TerminateAllSessionsResponseDto,
  })
  @ApiUnauthorizedResponse({
    description: 'Invalid or missing JWT token',
  })
  @ApiTooManyRequestsResponse({
    description: 'Too many termination attempts. Please try again later.',
  })
  async terminateAllOtherSessions(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<TerminateAllSessionsResponseDto> {
    try {
      const result = await this.authService.terminateAllOtherSessions(user);
      
      this.logger.log(`All other sessions terminated by user: ${user.username}`);
      return result;
    } catch (error) {
      this.logger.error(`Terminate all sessions failed: ${error.message}`, error.stack);
      throw error;
    }
  }
}