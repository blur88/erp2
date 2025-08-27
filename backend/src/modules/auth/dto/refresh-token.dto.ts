import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsUUID } from 'class-validator';

/**
 * Refresh token request DTO
 */
export class RefreshTokenDto {
  @ApiProperty({
    description: 'Valid refresh token',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  })
  @IsString()
  @IsNotEmpty()
  refreshToken: string;

  @ApiProperty({
    description: 'Session ID associated with the token',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsString()
  @IsNotEmpty()
  @IsUUID(4, { message: 'Session ID must be a valid UUID' })
  sessionId: string;
}