import { ApiProperty } from '@nestjs/swagger';
import { UserRole, UserStatus } from '../../../database/entities/user.entity';

/**
 * User response DTO - sanitized user data for API responses
 */
export class UserResponseDto {
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

  @ApiProperty({ description: 'Last login IP address', nullable: true })
  lastLoginIp?: string;

  @ApiProperty({ description: 'Number of failed login attempts' })
  failedLoginAttempts: number;

  @ApiProperty({ description: 'Account locked until timestamp', nullable: true })
  lockedUntil?: Date;

  @ApiProperty({ description: 'Whether account is currently locked' })
  isLocked: boolean;

  @ApiProperty({ description: 'User notes or description', nullable: true })
  notes?: string;

  @ApiProperty({ description: 'Record creation timestamp' })
  createdAt: Date;

  @ApiProperty({ description: 'Record last update timestamp' })
  updatedAt: Date;
}

/**
 * Paginated users response DTO
 */
export class PaginatedUsersResponseDto {
  @ApiProperty({ type: [UserResponseDto], description: 'Array of users' })
  data: UserResponseDto[];

  @ApiProperty({ description: 'Total number of records' })
  total: number;

  @ApiProperty({ description: 'Current page number' })
  page: number;

  @ApiProperty({ description: 'Number of records per page' })
  limit: number;

  @ApiProperty({ description: 'Total number of pages' })
  totalPages: number;

  @ApiProperty({ description: 'Whether there are more pages' })
  hasNextPage: boolean;

  @ApiProperty({ description: 'Whether there are previous pages' })
  hasPrevPage: boolean;
}