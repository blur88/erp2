import { IsEmail, IsString, MinLength, MaxLength, IsOptional, IsEnum, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { UserRole } from '../../../database/entities/user.entity';

export class RegisterDto {
  @ApiProperty({
    description: 'Username for the new account',
    example: 'john_doe',
    minLength: 3,
    maxLength: 50,
  })
  @IsString()
  @MinLength(3, { message: 'Username must be at least 3 characters long' })
  @MaxLength(50, { message: 'Username cannot exceed 50 characters' })
  @Matches(/^[a-zA-Z0-9_-]+$/, {
    message: 'Username can only contain letters, numbers, underscores, and hyphens'
  })
  username: string;

  @ApiProperty({
    description: 'Email address for the new account',
    example: 'john.doe@company.com',
  })
  @IsEmail({}, { message: 'Please provide a valid email address' })
  @MaxLength(100, { message: 'Email cannot exceed 100 characters' })
  email: string;

  @ApiProperty({
    description: 'Password for the new account',
    example: 'SecurePass123!',
    minLength: 8,
  })
  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters long' })
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/, {
    message: 'Password must contain at least one lowercase letter, one uppercase letter, one number, and one special character'
  })
  password: string;

  @ApiProperty({
    description: 'Password confirmation',
    example: 'SecurePass123!',
  })
  @IsString()
  confirmPassword: string;

  @ApiProperty({
    description: 'First name of the user',
    example: 'John',
  })
  @IsString()
  @MaxLength(100, { message: 'First name cannot exceed 100 characters' })
  @Matches(/^[a-zA-Z\s'-]+$/, {
    message: 'First name can only contain letters, spaces, apostrophes, and hyphens'
  })
  firstName: string;

  @ApiProperty({
    description: 'Last name of the user',
    example: 'Doe',
  })
  @IsString()
  @MaxLength(100, { message: 'Last name cannot exceed 100 characters' })
  @Matches(/^[a-zA-Z\s'-]+$/, {
    message: 'Last name can only contain letters, spaces, apostrophes, and hyphens'
  })
  lastName: string;

  @ApiProperty({
    description: 'Phone number (optional)',
    example: '+1234567890',
    required: false,
  })
  @IsOptional()
  @IsString()
  @Matches(/^\+?[1-9]\d{1,14}$/, {
    message: 'Please provide a valid phone number'
  })
  phoneNumber?: string;

  @ApiProperty({
    description: 'User role (only for admin registration)',
    enum: UserRole,
    example: UserRole.SALES_STAFF,
    required: false,
  })
  @IsOptional()
  @IsEnum(UserRole, { message: 'Please provide a valid user role' })
  role?: UserRole;
}

export class RegisterResponseDto {
  @ApiProperty({
    description: 'Success message',
    example: 'User registered successfully. Please check your email to verify your account.',
  })
  message: string;

  @ApiProperty({
    description: 'User ID of the created account',
    example: 'uuid-string',
  })
  userId: string;

  @ApiProperty({
    description: 'Whether email verification is required',
    example: true,
  })
  requiresEmailVerification: boolean;
}

export class VerifyEmailDto {
  @ApiProperty({
    description: 'Email verification token',
    example: 'verification-token-uuid',
  })
  @IsString()
  token: string;
}

export class VerifyEmailResponseDto {
  @ApiProperty({
    description: 'Success message',
    example: 'Email verified successfully. Your account is now active.',
  })
  message: string;

  @ApiProperty({
    description: 'Whether the user can now log in',
    example: true,
  })
  canLogin: boolean;
}

export class ResendVerificationDto {
  @ApiProperty({
    description: 'Email address to resend verification to',
    example: 'john.doe@company.com',
  })
  @IsEmail({}, { message: 'Please provide a valid email address' })
  email: string;
}

export class ResendVerificationResponseDto {
  @ApiProperty({
    description: 'Success message',
    example: 'Verification email sent successfully.',
  })
  message: string;
}