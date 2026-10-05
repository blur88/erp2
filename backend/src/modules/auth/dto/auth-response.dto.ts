import { ApiProperty } from '@nestjs/swagger';
import { User } from '@/database/entities/user.entity';

export class AuthResponseDto {
  @ApiProperty({
    description: 'JWT access token (short-lived, 15 minutes)',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  })
  accessToken: string;

  @ApiProperty({
    description: 'JWT refresh token',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6ImVycC1yZWZyZXNoK2p3dCIsImtpZCI6ImsxIn0...',
  })
  refreshToken: string;

  @ApiProperty({
    description: 'Token expiration time in seconds',
    example: 900,
  })
  expiresIn: number;

  @ApiProperty({
    description: 'Session ID',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  sessionId: string;

  @ApiProperty({
    description: 'Current generation number of the session',
    example: 1,
  })
  generation: number;

  @ApiProperty({
    description: 'Access token expiration timestamp (epoch seconds)',
    example: 1790000000,
  })
  accessTokenExpiresAt: number;

  @ApiProperty({
    description: 'User profile information',
    type: () => User,
  })
  user: Partial<User>;

  @ApiProperty({
    description: 'Whether user must change password before accessing app',
    example: false,
  })
  requiresPasswordChange: boolean;
}
