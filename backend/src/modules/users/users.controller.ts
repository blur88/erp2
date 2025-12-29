import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  ValidationPipe,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiBadRequestResponse,
  ApiNotFoundResponse,
  ApiConflictResponse,
  ApiQuery,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';

import { UsersService } from './users.service';
import { UserRole } from '../../database/entities/user.entity';
import { Auth } from '../auth/decorators/auth.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

// DTOs
import {
  CreateUserDto,
  UpdateUserDto,
  AdminUpdateUserDto,
  UserResponseDto,
  PaginatedUsersResponseDto,
  QueryUsersDto,
} from './dto';

/**
 * Users Controller
 * Handles user management operations with role-based access control
 */
@ApiTags('User Management')
@Controller('users')
export class UsersController {
  private readonly logger = new Logger(UsersController.name);

  constructor(private readonly usersService: UsersService) {}

  /**
   * Create a new user
   */
  @Post()
  @Auth(UserRole.ADMIN)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({
    summary: 'Create new user',
    description: 'Create a new user account (Admin only)',
  })
  @ApiResponse({
    status: 201,
    description: 'User created successfully',
    type: UserResponseDto,
  })
  @ApiBadRequestResponse({ description: 'Invalid input data' })
  @ApiConflictResponse({ description: 'Username or email already exists' })
  async create(
    @Body(ValidationPipe) createUserDto: CreateUserDto,
    @CurrentUser('userId') currentUserId: string,
  ): Promise<UserResponseDto> {
    try {
      this.logger.log(`Creating new user: ${createUserDto.username}`);
      return await this.usersService.create(createUserDto, currentUserId);
    } catch (error) {
      this.logger.error(`User creation failed: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Get all users with filtering and pagination
   */
  @Get()
  @Auth(UserRole.ADMIN, UserRole.MANAGER)
  @ApiOperation({
    summary: 'Get all users',
    description: 'Retrieve users with filtering, searching, and pagination (Admin/Manager only)',
  })
  @ApiResponse({
    status: 200,
    description: 'Users retrieved successfully',
    type: PaginatedUsersResponseDto,
  })
  @ApiQuery({ type: QueryUsersDto })
  async findAll(
    @Query(ValidationPipe) queryDto: QueryUsersDto,
    @CurrentUser('userId') currentUserId: string,
  ): Promise<PaginatedUsersResponseDto> {
    try {
      this.logger.log(`Retrieving users with query: ${JSON.stringify(queryDto)}`);
      return await this.usersService.findAll(queryDto, currentUserId);
    } catch (error) {
      this.logger.error(`User retrieval failed: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Get user statistics (Admin/Manager only)
   */
  @Get('statistics')
  @Auth(UserRole.ADMIN, UserRole.MANAGER)
  @ApiOperation({
    summary: 'Get user statistics',
    description: 'Retrieve user statistics and metrics (Admin/Manager only)',
  })
  @ApiResponse({
    status: 200,
    description: 'Statistics retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        total: { type: 'number', description: 'Total number of users' },
        active: { type: 'number', description: 'Number of active users' },
        inactive: { type: 'number', description: 'Number of inactive users' },
        locked: { type: 'number', description: 'Number of locked users' },
        byRole: {
          type: 'object',
          properties: {
            admin: { type: 'number', description: 'Number of admin users' },
            manager: { type: 'number', description: 'Number of manager users' },
            staff: { type: 'number', description: 'Number of staff users' },
          },
        },
        activePercentage: { type: 'number', description: 'Percentage of active users' },
      },
    },
  })
  async getStatistics(@CurrentUser('userId') currentUserId: string) {
    try {
      this.logger.log(`Retrieving user statistics`);
      return await this.usersService.getStatistics(currentUserId);
    } catch (error) {
      this.logger.error(`Statistics retrieval failed: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Get current user profile
   */
  @Get('me')
  @Auth()
  @ApiOperation({
    summary: 'Get current user profile',
    description: 'Retrieve current authenticated user profile',
  })
  @ApiResponse({
    status: 200,
    description: 'Profile retrieved successfully',
    type: UserResponseDto,
  })
  async getCurrentUserProfile(
    @CurrentUser('userId') currentUserId: string,
  ): Promise<UserResponseDto> {
    try {
      this.logger.log(`Profile requested for user: ${currentUserId}`);
      return await this.usersService.findOne(currentUserId, currentUserId);
    } catch (error) {
      this.logger.error(`Profile retrieval failed: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Update current user profile (own profile only)
   */
  @Patch('me')
  @Auth()
  @ApiOperation({
    summary: 'Update current user profile',
    description: 'Update current authenticated user profile',
  })
  @ApiResponse({
    status: 200,
    description: 'Profile updated successfully',
    type: UserResponseDto,
  })
  @ApiBadRequestResponse({ description: 'Invalid input data' })
  async updateCurrentUserProfile(
    @CurrentUser('userId') currentUserId: string,
    @Body(ValidationPipe) updateUserDto: UpdateUserDto,
  ): Promise<UserResponseDto> {
    try {
      this.logger.log(`Profile update requested for user: ${currentUserId}`);
      return await this.usersService.update(currentUserId, updateUserDto, currentUserId);
    } catch (error) {
      this.logger.error(`Profile update failed: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Get user by ID
   */
  @Get(':id')
  @Auth()
  @ApiOperation({
    summary: 'Get user by ID',
    description: 'Retrieve a specific user by ID',
  })
  @ApiParam({
    name: 'id',
    description: 'User ID',
    type: 'string',
    format: 'uuid',
  })
  @ApiResponse({
    status: 200,
    description: 'User retrieved successfully',
    type: UserResponseDto,
  })
  @ApiNotFoundResponse({ description: 'User not found' })
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('userId') currentUserId: string,
  ): Promise<UserResponseDto> {
    try {
      this.logger.log(`User retrieval requested for ID: ${id}`);
      return await this.usersService.findOne(id, currentUserId);
    } catch (error) {
      this.logger.error(`User retrieval failed: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Update user by ID (Manager/Admin)
   */
  @Patch(':id')
  @Auth(UserRole.ADMIN, UserRole.MANAGER)
  @ApiOperation({
    summary: 'Update user by ID',
    description: 'Update a user by ID (Admin/Manager only)',
  })
  @ApiParam({
    name: 'id',
    description: 'User ID',
    type: 'string',
    format: 'uuid',
  })
  @ApiResponse({
    status: 200,
    description: 'User updated successfully',
    type: UserResponseDto,
  })
  @ApiNotFoundResponse({ description: 'User not found' })
  @ApiBadRequestResponse({ description: 'Invalid input data' })
  @ApiConflictResponse({ description: 'Username or email already exists' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(ValidationPipe) updateUserDto: UpdateUserDto,
    @CurrentUser('userId') currentUserId: string,
  ): Promise<UserResponseDto> {
    try {
      this.logger.log(`User update requested for ID: ${id}`);
      return await this.usersService.update(id, updateUserDto, currentUserId);
    } catch (error) {
      this.logger.error(`User update failed: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Admin update user by ID (Admin only)
   */
  @Patch(':id/admin')
  @Auth(UserRole.ADMIN)
  @ApiOperation({
    summary: 'Admin update user by ID',
    description: 'Update a user with admin privileges (Admin only)',
  })
  @ApiParam({
    name: 'id',
    description: 'User ID',
    type: 'string',
    format: 'uuid',
  })
  @ApiResponse({
    status: 200,
    description: 'User updated successfully',
    type: UserResponseDto,
  })
  @ApiNotFoundResponse({ description: 'User not found' })
  @ApiBadRequestResponse({ description: 'Invalid input data' })
  async adminUpdate(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(ValidationPipe) adminUpdateDto: AdminUpdateUserDto,
    @CurrentUser('userId') currentUserId: string,
  ): Promise<UserResponseDto> {
    try {
      this.logger.log(`Admin user update requested for ID: ${id}`);
      return await this.usersService.update(id, adminUpdateDto, currentUserId);
    } catch (error) {
      this.logger.error(`Admin user update failed: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Deactivate user (Admin only)
   */
  @Delete(':id')
  @Auth(UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Deactivate user',
    description: 'Deactivate a user account (Admin only)',
  })
  @ApiParam({
    name: 'id',
    description: 'User ID',
    type: 'string',
    format: 'uuid',
  })
  @ApiResponse({
    status: 200,
    description: 'User deactivated successfully',
    schema: {
      type: 'object',
      properties: {
        message: { type: 'string', example: 'User successfully deactivated' },
        deletedAt: { type: 'string', format: 'date-time' },
      },
    },
  })
  @ApiNotFoundResponse({ description: 'User not found' })
  @ApiBadRequestResponse({ description: 'Cannot delete your own account' })
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('userId') currentUserId: string,
  ) {
    try {
      this.logger.log(`User deactivation requested for ID: ${id}`);
      return await this.usersService.remove(id, currentUserId);
    } catch (error) {
      this.logger.error(`User deactivation failed: ${error.message}`, error.stack);
      throw error;
    }
  }
}
