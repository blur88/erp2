import { ApiProperty } from '@nestjs/swagger';
import { UserRole, UserStatus } from '../../../database/entities/user.entity';

/**
 * User profile information returned in authentication responses
 */
export class UserProfileDto {
  @ApiProperty({ description: 'User ID' })
  id: string;

  @ApiProperty({ description: 'Username' })
  username: string;

  @ApiProperty({ description: 'Email address' })
  email: string;

  @ApiProperty({ description: 'First name' })
  firstName: string;

  @ApiProperty({ description: 'Last name' })
  lastName: string;

  @ApiProperty({ description: 'Full name' })
  fullName: string;

  @ApiProperty({ description: 'Phone number', nullable: true })
  phoneNumber?: string;

  @ApiProperty({ enum: UserRole, description: 'User role' })
  role: UserRole;

  @ApiProperty({ enum: UserStatus, description: 'User account status' })
  status: UserStatus;

  @ApiProperty({ description: 'Account active status' })
  isActive: boolean;

  @ApiProperty({ description: 'Last login timestamp', nullable: true })
  lastLoginAt?: Date;
}

/**
 * JWT token information
 */
export class TokenDto {
  @ApiProperty({ description: 'JWT access token' })
  accessToken: string;

  @ApiProperty({ description: 'JWT refresh token' })
  refreshToken: string;

  @ApiProperty({ description: 'Token expiration time in seconds' })
  expiresIn: number;

  @ApiProperty({ description: 'Token type' })
  tokenType: string;
}

/**
 * Successful login response
 */
export class LoginResponseDto {
  @ApiProperty({ description: 'Authentication tokens' })
  tokens: TokenDto;

  @ApiProperty({ description: 'User profile information' })
  user: UserProfileDto;

  @ApiProperty({ description: 'Login timestamp' })
  loginAt: Date;

  @ApiProperty({ description: 'Session ID' })
  sessionId: string;
}

/**
 * Token refresh response
 */
export class RefreshTokenResponseDto {
  @ApiProperty({ description: 'New access token' })
  accessToken: string;

  @ApiProperty({ description: 'Token expiration time in seconds' })
  expiresIn: number;

  @ApiProperty({ description: 'Token type' })
  tokenType: string;
}

/**
 * Logout response
 */
export class LogoutResponseDto {
  @ApiProperty({ description: 'Logout success message' })
  message: string;

  @ApiProperty({ description: 'Logout timestamp' })
  logoutAt: Date;
}