import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, MinLength, MaxLength, Matches } from 'class-validator';

/**
 * Change password request DTO
 */
export class ChangePasswordDto {
  @ApiProperty({
    description: 'Current password',
    example: 'CurrentPassword123!',
  })
  @IsString()
  @IsNotEmpty()
  currentPassword: string;

  @ApiProperty({
    description: 'New password with security requirements',
    example: 'NewSecurePassword123!',
    minLength: 8,
    maxLength: 128,
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(8, { message: 'Password must be at least 8 characters long' })
  @MaxLength(128, { message: 'Password must not exceed 128 characters' })
  @Matches(
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/,
    {
      message: 'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character',
    },
  )
  newPassword: string;

  @ApiProperty({
    description: 'Confirm new password',
    example: 'NewSecurePassword123!',
  })
  @IsString()
  @IsNotEmpty()
  confirmPassword: string;
}

/**
 * Reset password request DTO
 */
export class ResetPasswordDto {
  @ApiProperty({
    description: 'Email address for password reset',
    example: 'user@company.com',
  })
  @IsString()
  @IsNotEmpty()
  email: string;
}

/**
 * Confirm password reset DTO
 */
export class ConfirmPasswordResetDto {
  @ApiProperty({
    description: 'Password reset token',
    example: 'reset-token-uuid',
  })
  @IsString()
  @IsNotEmpty()
  token: string;

  @ApiProperty({
    description: 'New password with security requirements',
    example: 'NewSecurePassword123!',
    minLength: 8,
    maxLength: 128,
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(8, { message: 'Password must be at least 8 characters long' })
  @MaxLength(128, { message: 'Password must not exceed 128 characters' })
  @Matches(
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/,
    {
      message: 'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character',
    },
  )
  newPassword: string;

  @ApiProperty({
    description: 'Confirm new password',
    example: 'NewSecurePassword123!',
  })
  @IsString()
  @IsNotEmpty()
  confirmPassword: string;
}