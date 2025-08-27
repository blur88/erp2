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
  ApiUnauthorizedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiConflictResponse,
  ApiQuery,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';

import { UsersService } from './users.service';
import { UserRole } from '../../database/entities/user.entity';
import { AuthenticatedUser } from '../auth/interfaces/jwt-payload.interface';
import { Permission } from '../../common/guards/permissions.guard';

// Decorators
import {
  Auth,
  AuthWithPermissions,
  AdminOnly,
  ManagerOrAdmin,
} from '../../common/decorators/auth.decorator';
import { CurrentUser } from '../../common/decorators/user.decorator';

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
  @ManagerOrAdmin()
  @Post()
  @Throttle({ default: { limit: 10, ttl: 60000 } }) // 10 attempts per minute
  @ApiOperation({
    summary: 'Create new user',
    description: 'Create a new user account (Manager/Admin only)',
  })
  @ApiResponse({
    status: 201,
    description: 'User created successfully',
    type: UserResponseDto,
  })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'Insufficient permissions' })
  @ApiBadRequestResponse({ description: 'Invalid input data' })
  @ApiConflictResponse({ description: 'Username or email already exists' })
  async create(
    @Body(ValidationPipe) createUserDto: CreateUserDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ): Promise<UserResponseDto> {
    try {
      this.logger.log(`Creating new user: ${createUserDto.username} by ${currentUser.username}`);
      return await this.usersService.create(createUserDto, currentUser);
    } catch (error) {
      this.logger.error(`User creation failed: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Get all users with filtering and pagination
   */
  @Auth()
  @Get()
  @ApiOperation({
    summary: 'Get all users',
    description: 'Retrieve users with filtering, searching, and pagination',
  })
  @ApiResponse({
    status: 200,
    description: 'Users retrieved successfully',
    type: PaginatedUsersResponseDto,
  })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiQuery({ type: QueryUsersDto })
  async findAll(
    @Query(ValidationPipe) queryDto: QueryUsersDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ): Promise<PaginatedUsersResponseDto> {
    try {
      this.logger.log(`Retrieving users with query: ${JSON.stringify(queryDto)} by ${currentUser.username}`);
      return await this.usersService.findAll(queryDto, currentUser);
    } catch (error) {
      this.logger.error(`User retrieval failed: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Get user statistics (Admin/Manager only)
   */
  @ManagerOrAdmin()
  @Get('statistics')
  @ApiOperation({
    summary: 'Get user statistics',
    description: 'Retrieve user statistics and metrics (Manager/Admin only)',
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
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'Insufficient permissions' })
  async getStatistics(@CurrentUser() currentUser: AuthenticatedUser) {
    try {
      this.logger.log(`Retrieving user statistics by ${currentUser.username}`);
      return await this.usersService.getStatistics(currentUser);
    } catch (error) {
      this.logger.error(`Statistics retrieval failed: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Get current user profile
   */
  @Auth()
  @Get('me')
  @ApiOperation({
    summary: 'Get current user profile',
    description: 'Retrieve the authenticated user\'s own profile',
  })
  @ApiResponse({
    status: 200,
    description: 'Profile retrieved successfully',
    type: UserResponseDto,
  })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  async getCurrentUserProfile(
    @CurrentUser() currentUser: AuthenticatedUser,
  ): Promise<UserResponseDto> {
    try {
      this.logger.log(`Profile requested by: ${currentUser.username}`);
      return await this.usersService.findOne(currentUser.userId, currentUser);
    } catch (error) {
      this.logger.error(`Profile retrieval failed: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Update current user profile (own profile only)
   */
  @Auth()
  @Patch('me')
  @ApiOperation({
    summary: 'Update current user profile',
    description: 'Update the authenticated user\'s own profile (limited fields)',
  })
  @ApiResponse({
    status: 200,
    description: 'Profile updated successfully',
    type: UserResponseDto,
  })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiBadRequestResponse({ description: 'Invalid input data' })
  async updateCurrentUserProfile(
    @Body(ValidationPipe) updateUserDto: UpdateUserDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ): Promise<UserResponseDto> {
    try {
      this.logger.log(`Profile update requested by: ${currentUser.username}`);
      return await this.usersService.update(currentUser.userId, updateUserDto, currentUser);
    } catch (error) {
      this.logger.error(`Profile update failed: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Get user by ID
   */
  @Auth()
  @Get(':id')
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
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'Insufficient permissions' })
  @ApiNotFoundResponse({ description: 'User not found' })
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() currentUser: AuthenticatedUser,
  ): Promise<UserResponseDto> {
    try {
      this.logger.log(`User retrieval requested for ID: ${id} by ${currentUser.username}`);
      return await this.usersService.findOne(id, currentUser);
    } catch (error) {
      this.logger.error(`User retrieval failed: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Update user by ID (Manager/Admin)
   */
  @ManagerOrAdmin()
  @Patch(':id')
  @ApiOperation({
    summary: 'Update user by ID',
    description: 'Update a user by ID (Manager/Admin only)',
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
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'Insufficient permissions' })
  @ApiNotFoundResponse({ description: 'User not found' })
  @ApiBadRequestResponse({ description: 'Invalid input data' })
  @ApiConflictResponse({ description: 'Username or email already exists' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(ValidationPipe) updateUserDto: UpdateUserDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ): Promise<UserResponseDto> {
    try {
      this.logger.log(`User update requested for ID: ${id} by ${currentUser.username}`);
      return await this.usersService.update(id, updateUserDto, currentUser);
    } catch (error) {
      this.logger.error(`User update failed: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Admin update user by ID (Admin only)
   */
  @AdminOnly()
  @Patch(':id/admin')
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
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'Insufficient permissions' })
  @ApiNotFoundResponse({ description: 'User not found' })
  @ApiBadRequestResponse({ description: 'Invalid input data' })
  async adminUpdate(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(ValidationPipe) adminUpdateDto: AdminUpdateUserDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ): Promise<UserResponseDto> {
    try {
      this.logger.log(`Admin user update requested for ID: ${id} by ${currentUser.username}`);
      return await this.usersService.update(id, adminUpdateDto, currentUser);
    } catch (error) {
      this.logger.error(`Admin user update failed: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Deactivate user (Admin only)
   */
  @AdminOnly()
  @Delete(':id')
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
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'Insufficient permissions' })
  @ApiNotFoundResponse({ description: 'User not found' })
  @ApiBadRequestResponse({ description: 'Cannot delete your own account' })
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    try {
      this.logger.log(`User deactivation requested for ID: ${id} by ${currentUser.username}`);
      return await this.usersService.remove(id, currentUser);
    } catch (error) {
      this.logger.error(`User deactivation failed: ${error.message}`, error.stack);
      throw error;
    }
  }
}