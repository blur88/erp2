import { ApiProperty } from '@nestjs/swagger';
import {
  IsEmail,
  IsString,
  IsEnum,
  IsOptional,
  ValidateIf,
  MinLength,
  MaxLength,
  Matches,
  IsPhoneNumber,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { UserRole } from '../../../database/entities/user.entity';

/**
 * Create user DTO with comprehensive validation
 */
export class CreateUserDto {
  @ApiProperty({
    description: 'Unique username for login',
    example: 'john.doe',
    minLength: 3,
    maxLength: 50,
  })
  @IsString()
  @MinLength(3, { message: 'Username must be at least 3 characters long' })
  @MaxLength(50, { message: 'Username must not exceed 50 characters' })
  @Matches(/^[a-zA-Z0-9._-]+$/, {
    message: 'Username can only contain letters, numbers, dots, underscores, and hyphens',
  })
  @Transform(({ value }) => value?.trim().toLowerCase())
  username: string;

  @ApiProperty({
    description: 'User email address (optional)',
    example: 'john.doe@company.com',
    maxLength: 100,
    required: false,
  })
  @IsOptional()
  @IsEmail({}, { message: 'Please provide a valid email address' })
  @MaxLength(100, { message: 'Email must not exceed 100 characters' })
  @Transform(({ value }) => value?.trim().toLowerCase() || null)
  email?: string;

  @ApiProperty({
    description: 'User password with security requirements',
    example: 'SecurePassword123!',
    minLength: 8,
    maxLength: 128,
  })
  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters long' })
  @MaxLength(128, { message: 'Password must not exceed 128 characters' })
  @Matches(
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&.])[A-Za-z\d@$!%*?&.]/,
    {
      message: 'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character (@$!%*?&.)',
    },
  )
  password: string;

  @ApiProperty({
    description: 'User first name (optional)',
    example: 'John',
    maxLength: 100,
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(100, { message: 'First name must not exceed 100 characters' })
  @Transform(({ value }) => value?.trim() || null)
  firstName?: string;

  @ApiProperty({
    description: 'User last name (optional)',
    example: 'Doe',
    maxLength: 100,
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(100, { message: 'Last name must not exceed 100 characters' })
  @Transform(({ value }) => value?.trim() || null)
  lastName?: string;

  @ApiProperty({
    description: 'User phone number (optional)',
    example: '+1234567890',
    required: false,
  })
  @IsOptional()
  @IsPhoneNumber(undefined, { message: 'Please provide a valid phone number' })
  phoneNumber?: string;

  @ApiProperty({
    description: 'User role for access control',
    enum: UserRole,
    example: UserRole.SALES_STAFF,
  })
  @ValidateIf((_object, value) => value !== undefined)
  @IsEnum(UserRole, { message: 'Please provide a valid user role' })
  role: UserRole;

  @ApiProperty({
    description: 'Additional notes or description (optional)',
    example: 'Senior sales representative',
    required: false,
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'Notes must not exceed 500 characters' })
  notes?: string;
}