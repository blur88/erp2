import { IsString, IsEmail, IsEnum, IsBoolean, IsOptional, IsDate } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Expose, Transform } from 'class-transformer';
import { UserRole, UserStatus } from '../../../database/entities/user.entity';

/**
 * DTO for user profile information
 * Used for safe serialization of user data without sensitive information
 */
export class UserProfileDto {
  @ApiProperty({
    description: 'User unique identifier',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  })
  @IsString()
  @Expose()
  id: string;

  @ApiProperty({
    description: 'Username for login',
    example: 'john_doe',
  })
  @IsString()
  @Expose()
  username: string;

  @ApiProperty({
    description: 'User email address',
    example: 'john.doe@example.com',
  })
  @IsEmail()
  @Expose()
  email: string;

  @ApiProperty({
    description: 'User first name',
    example: 'John',
  })
  @IsString()
  @Expose()
  firstName: string;

  @ApiProperty({
    description: 'User last name',
    example: 'Doe',
  })
  @IsString()
  @Expose()
  lastName: string;

  @ApiProperty({
    description: 'User full name',
    example: 'John Doe',
  })
  @IsString()
  @Expose()
  fullName: string;

  @ApiProperty({
    description: 'User phone number',
    example: '+1-234-567-8900',
    required: false,
  })
  @IsString()
  @IsOptional()
  @Expose()
  phoneNumber?: string;

  @ApiProperty({
    description: 'User role in the system',
    enum: UserRole,
    example: UserRole.SALES_STAFF,
  })
  @IsEnum(UserRole)
  @Expose()
  role: UserRole;

  @ApiProperty({
    description: 'User account status',
    enum: UserStatus,
    example: UserStatus.ACTIVE,
  })
  @IsEnum(UserStatus)
  @Expose()
  status: UserStatus;

  @ApiProperty({
    description: 'Whether the user account is active',
    example: true,
  })
  @IsBoolean()
  @Expose()
  isActive: boolean;

  @ApiProperty({
    description: 'Last login timestamp',
    example: '2024-01-15T10:30:00Z',
    required: false,
  })
  @IsDate()
  @IsOptional()
  @Expose()
  @Transform(({ value }) => value ? new Date(value) : null)
  lastLoginAt?: Date;
}