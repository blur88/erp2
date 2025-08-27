import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, MinLength, MaxLength, IsOptional, IsBoolean } from 'class-validator';
import { Transform } from 'class-transformer';

/**
 * Login request DTO with comprehensive validation
 * Supports both username and email login
 */
export class LoginDto {
  @ApiProperty({
    description: 'Username or email address',
    example: 'admin@company.com',
    minLength: 3,
    maxLength: 100,
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(3, { message: 'Username must be at least 3 characters long' })
  @MaxLength(100, { message: 'Username must not exceed 100 characters' })
  @Transform(({ value }) => value?.trim().toLowerCase())
  username: string;

  @ApiProperty({
    description: 'User password',
    example: 'SecurePassword123!',
    minLength: 6,
    maxLength: 100,
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(6, { message: 'Password must be at least 6 characters long' })
  @MaxLength(100, { message: 'Password must not exceed 100 characters' })
  password: string;

  @ApiProperty({
    description: 'Remember login session for extended period',
    example: false,
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  rememberMe?: boolean;
}