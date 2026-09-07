import {
  Controller,
  Post,
  Get,
  Patch,
  Body,
  HttpCode,
  HttpStatus,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiBody,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { AuthService } from './auth.service';
import {
  LoginDto,
  RegisterDto,
  RefreshTokenDto,
  ChangePasswordDto,
  AuthResponseDto,
} from './dto';
import { Public } from './decorators/public.decorator';
import { CurrentUser } from './decorators/current-user.decorator';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // Rate limiting is enforced ONLY by nginx: the login_limit zone
  // (nginx/nginx.conf:47, 5r/m) applied to ^/api/(auth|login|register)
  // at :137, burst=3 nodelay. There is no app-layer throttler -- #1154
  // was closed not-planned, leaving nginx the single documented
  // enforcement point, and the @Throttle decorators were removed as
  // inert in the NestJS 12 migration.
  //
  // Rejection is 429, not 503: limit_req_status 429 sits in the http
  // block (nginx.conf:44) and is inherited by every limit_req in the
  // file. #1154's 503 observation predates that fix by twenty minutes
  // (#1156, commit b9379f5b6) and does not describe current behaviour.
  // Measured 2026-09-07 through the local stack's nginx -- 12 rapid
  // POSTs to /api/auth/login returned 401 x4 then 429 x8 (#1207).
  //
  // The limit is a property of the ingress-fronted deployment, not of
  // this application. Anything reaching this controller without
  // traversing that nginx is unthrottled and returns no rate-limit
  // status at all: e2e suites via supertest, start:dev, the
  // loopback-published backend port (docker-compose.prod.yml:155-156,
  // #1193), or any future second ingress.
  @Post('login')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'User login',
    description: 'Authenticate user with username/email and password. Returns JWT tokens.',
  })
  @ApiBody({ type: LoginDto })
  @ApiResponse({
    status: 200,
    description: 'Login successful',
    type: AuthResponseDto,
  })
  @ApiResponse({
    status: 401,
    description: 'Invalid credentials',
  })
  @ApiResponse({
    status: 403,
    description: 'Account locked due to failed login attempts',
  })
  @ApiResponse({
    status: 429,
    description:
      'Too many requests - rate limit exceeded. Enforced by the nginx ingress ' +
      '(5 requests/minute per IP, burst 3), not by the application, so it applies ' +
      'only to traffic traversing that ingress. The body is an nginx HTML error ' +
      'page, not the standard JSON response envelope.',
  })
  async login(@Body() loginDto: LoginDto, @Req() req: Request): Promise<AuthResponseDto> {
    const ipAddress = req.ip || req.socket.remoteAddress;
    const userAgent = req.headers['user-agent'];

    return this.authService.login(loginDto, ipAddress, userAgent);
  }

  // Rate limiting is enforced ONLY by nginx: the login_limit zone
  // (nginx/nginx.conf:47, 5r/m) applied to ^/api/(auth|login|register)
  // at :137, burst=3 nodelay. There is no app-layer throttler -- #1154
  // was closed not-planned, leaving nginx the single documented
  // enforcement point, and the @Throttle decorators were removed as
  // inert in the NestJS 12 migration.
  //
  // Rejection is 429, not 503: limit_req_status 429 sits in the http
  // block (nginx.conf:44) and is inherited by every limit_req in the
  // file. #1154's 503 observation predates that fix by twenty minutes
  // (#1156, commit b9379f5b6) and does not describe current behaviour.
  // Measured 2026-09-07 through the local stack's nginx -- 12 rapid
  // POSTs to /api/auth/login returned 401 x4 then 429 x8 (#1207).
  //
  // The limit is a property of the ingress-fronted deployment, not of
  // this application. Anything reaching this controller without
  // traversing that nginx is unthrottled and returns no rate-limit
  // status at all: e2e suites via supertest, start:dev, the
  // loopback-published backend port (docker-compose.prod.yml:155-156,
  // #1193), or any future second ingress.
  @Post('register')
  @Public()
  @ApiOperation({
    summary: 'User registration',
    description: 'Register new user account. Auto-login after successful registration.',
  })
  @ApiBody({ type: RegisterDto })
  @ApiResponse({
    status: 201,
    description: 'Registration successful',
    type: AuthResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid input or username/email already exists',
  })
  @ApiResponse({
    status: 429,
    description:
      'Too many requests - rate limit exceeded. Enforced by the nginx ingress ' +
      '(5 requests/minute per IP, burst 3), not by the application, so it applies ' +
      'only to traffic traversing that ingress. The body is an nginx HTML error ' +
      'page, not the standard JSON response envelope.',
  })
  async register(@Body() registerDto: RegisterDto): Promise<AuthResponseDto> {
    return this.authService.register(registerDto);
  }

  @Post('refresh')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Refresh access token',
    description:
      'Exchange refresh token for new access token. Implements token rotation - old refresh token is invalidated.',
  })
  @ApiBody({ type: RefreshTokenDto })
  @ApiResponse({
    status: 200,
    description: 'Token refresh successful',
    type: AuthResponseDto,
  })
  @ApiResponse({
    status: 401,
    description: 'Invalid or expired refresh token',
  })
  async refreshToken(
    @Body() refreshTokenDto: RefreshTokenDto,
    @Req() req: Request,
  ): Promise<AuthResponseDto> {
    const ipAddress = req.ip || req.socket.remoteAddress;
    const userAgent = req.headers['user-agent'];

    return this.authService.refreshAccessToken(refreshTokenDto, ipAddress, userAgent);
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'User logout',
    description: 'Invalidate all refresh tokens for the current user (logout from all devices).',
  })
  @ApiResponse({
    status: 204,
    description: 'Logout successful',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid or expired token',
  })
  async logout(@CurrentUser('userId') userId: string): Promise<void> {
    await this.authService.logout(userId);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get current user',
    description: 'Get authenticated user profile information.',
  })
  @ApiResponse({
    status: 200,
    description: 'User profile retrieved',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid or expired token',
  })
  async getCurrentUser(@CurrentUser('userId') userId: string) {
    return this.authService.getCurrentUser(userId);
  }

  @Patch('change-password')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Change password',
    description:
      'Change user password. Invalidates all refresh tokens (logout from all devices).',
  })
  @ApiBody({ type: ChangePasswordDto })
  @ApiResponse({
    status: 204,
    description: 'Password changed successfully',
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid input or new password same as current',
  })
  @ApiResponse({
    status: 401,
    description: 'Current password incorrect or unauthorized',
  })
  async changePassword(
    @CurrentUser('userId') userId: string,
    @Body() changePasswordDto: ChangePasswordDto,
  ): Promise<void> {
    await this.authService.changePassword(userId, changePasswordDto);
  }

  @Get('show-default-credentials')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Check if default credentials should be shown',
    description: 'Returns true if admin user still requires password change',
  })
  @ApiResponse({
    status: 200,
    description: 'Check successful',
    schema: {
      type: 'object',
      properties: {
        showDefaultCredentials: { type: 'boolean' },
      },
    },
  })
  async shouldShowDefaultCredentials(): Promise<{ showDefaultCredentials: boolean }> {
    const showDefaultCredentials = await this.authService.shouldShowDefaultCredentials();
    return { showDefaultCredentials };
  }
}
