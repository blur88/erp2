import { ApiProperty } from '@nestjs/swagger';
import {
  IsOptional,
  IsEnum,
  IsString,
  IsBoolean,
  IsInt,
  Min,
  Max,
  IsIn,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { UserRole, UserStatus } from '../../../database/entities/user.entity';

/**
 * Fields the users list may be ordered by. Exported so the service can resolve
 * `sortBy` against the same set this DTO validates — the value is interpolated
 * into an ORDER BY clause and must never reach SQL unvalidated (issue #961).
 */
export const USER_SORTABLE_FIELDS = [
  'username',
  'email',
  'firstName',
  'lastName',
  'role',
  'status',
  'lastLoginAt',
  'createdAt',
  'updatedAt',
] as const;

/**
 * Query parameters for filtering and searching users
 */
export class QueryUsersDto {
  @ApiProperty({
    description: 'Page number for pagination',
    example: 1,
    minimum: 1,
    required: false,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiProperty({
    description: 'Number of records per page',
    example: 20,
    minimum: 1,
    maximum: 100,
    required: false,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiProperty({
    description: 'Search term for username, email, first name, or last name',
    example: 'john',
    required: false,
  })
  @IsOptional()
  @IsString()
  @Transform(({ value }) => value?.trim())
  search?: string;

  @ApiProperty({
    description: 'Filter by user role',
    enum: UserRole,
    required: false,
  })
  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

  @ApiProperty({
    description: 'Filter by user status',
    enum: UserStatus,
    required: false,
  })
  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;

  @ApiProperty({
    description: 'Filter by active status',
    example: true,
    required: false,
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;
  })
  @IsBoolean()
  isActive?: boolean;

  @ApiProperty({
    description: 'Filter by locked accounts',
    example: false,
    required: false,
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;
  })
  @IsBoolean()
  isLocked?: boolean;

  @ApiProperty({
    description: 'Sort field',
    example: 'createdAt',
    enum: ['username', 'email', 'firstName', 'lastName', 'role', 'status', 'lastLoginAt', 'createdAt', 'updatedAt'],
    required: false,
  })
  @IsOptional()
  @IsString()
  @IsIn(USER_SORTABLE_FIELDS as unknown as string[])
  sortBy?: string = 'createdAt';

  @ApiProperty({
    description: 'Sort order',
    example: 'DESC',
    enum: ['ASC', 'DESC'],
    required: false,
  })
  @IsOptional()
  @IsString()
  @IsIn(['ASC', 'DESC'])
  sortOrder?: 'ASC' | 'DESC' = 'DESC';
}