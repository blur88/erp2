import { ApiProperty } from '@nestjs/swagger';
import { User } from '@/database/entities/user.entity';

export type AuthUserResponse = Pick<
  User,
  | 'id'
  | 'createdAt'
  | 'updatedAt'
  | 'deletedAt'
  | 'isActive'
  | 'username'
  | 'email'
  | 'firstName'
  | 'lastName'
  | 'phoneNumber'
  | 'role'
  | 'status'
  | 'lastLoginAt'
  | 'lastLoginIp'
  | 'notes'
  | 'requiresPasswordChange'
>;

export class AuthResponseDto {
  @ApiProperty({
    description: 'JWT access token (short-lived, 15 minutes)',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  })
  accessToken: string;

  @ApiProperty({
    description: 'JWT refresh token (long-lived, 7 days)',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  })
  refreshToken: string;

  @ApiProperty({
    description: 'Token expiration time in seconds',
    example: 900,
  })
  expiresIn: number;

  @ApiProperty({
    description: 'User profile information',
  })
  user: AuthUserResponse;

  @ApiProperty({
    description: 'Whether user must change password before accessing app',
    example: false,
  })
  requiresPasswordChange: boolean;
}
