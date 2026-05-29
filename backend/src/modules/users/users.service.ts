import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  Logger,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder, Like, ILike, LessThanOrEqual } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User, UserRole, UserStatus } from '../../database/entities/user.entity';
import {
  CreateUserDto,
  UpdateUserDto,
  AdminUpdateUserDto,
  UserResponseDto,
  PaginatedUsersResponseDto,
  QueryUsersDto,
} from './dto';

/**
 * Users Service
 * Handles CRUD operations and user management
 */
@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
  ) {}

  /**
   * Create a new user
   */
  async create(
    createUserDto: CreateUserDto,
    createdBy = 'system',
  ): Promise<UserResponseDto> {
    try {
      // Check if username already exists
      const existingUser = await this.userRepository.findOne({
        where: [
          { username: createUserDto.username },
          { email: createUserDto.email },
        ],
      });

      if (existingUser) {
        if (existingUser.username === createUserDto.username) {
          throw new ConflictException('Username already exists');
        }
        if (existingUser.email === createUserDto.email) {
          throw new ConflictException('Email already exists');
        }
      }

      // Hash password before saving
      const hashedPassword = await bcrypt.hash(createUserDto.password, 12);

      // Create new user
      const user = this.userRepository.create({
        ...createUserDto,
        password: hashedPassword,
        status: UserStatus.ACTIVE,
        isActive: true,
        failedLoginAttempts: 0,
      });

      const savedUser = await this.userRepository.save(user);

      this.logger.log(
        `User created: ${savedUser.username} by ${createdBy}`,
      );

      return this.mapToResponseDto(savedUser);
    } catch (error) {
      this.logger.error(`User creation failed: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Get all users with filtering and pagination
   */
  async findAll(
    queryDto: QueryUsersDto,
    requestingUser = 'system',
  ): Promise<PaginatedUsersResponseDto> {
    try {
      const { page, limit, search, role, status, isActive, isLocked, sortBy, sortOrder } = queryDto;

      // Lazy self-heal: clear locks that have expired by the app clock so stale
      // lockedUntil timestamps don't linger or show as "locked" in the list.
      // One bulk UPDATE, not per-row saves, and failures must not break the
      // read. See issue #710.
      //
      // Skip when explicitly filtering isLocked === true: that branch already
      // excludes expired rows via `lockedUntil > :now`, so clearing them here
      // would be a pure write with no effect on the result. Only run when the
      // result set could otherwise surface a stale "locked" row.
      if (isLocked !== true) {
        try {
          await this.userRepository.update(
            { lockedUntil: LessThanOrEqual(new Date()) },
            { lockedUntil: null, failedLoginAttempts: 0 },
          );
        } catch (err) {
          this.logger.warn(`Failed to self-heal expired locks during findAll: ${err}`);
        }
      }

      // Build query
      const queryBuilder = this.createQueryBuilder('user');

      // Apply filters
      if (search) {
        queryBuilder.andWhere(
          '(LOWER(user.username) LIKE LOWER(:search) OR ' +
          'LOWER(user.email) LIKE LOWER(:search) OR ' +
          'LOWER(user.firstName) LIKE LOWER(:search) OR ' +
          'LOWER(user.lastName) LIKE LOWER(:search))',
          { search: `%${search}%` },
        );
      }

      if (role) {
        queryBuilder.andWhere('user.role = :role', { role });
      }

      if (status) {
        queryBuilder.andWhere('user.status = :status', { status });
      }

      if (typeof isActive === 'boolean') {
        queryBuilder.andWhere('user.isActive = :isActive', { isActive });
      }

      if (typeof isLocked === 'boolean') {
        // :now is intentionally the Node app clock (new Date()), NOT SQL NOW().
        // Lockout decisions must use one clock so a skewed Postgres container
        // clock can't disagree with the login path. See issue #710.
        if (isLocked) {
          queryBuilder.andWhere('user.lockedUntil > :now', { now: new Date() });
        } else {
          queryBuilder.andWhere('(user.lockedUntil IS NULL OR user.lockedUntil <= :now)', { now: new Date() });
        }
      }

      // Apply role-based filtering - disabled since auth is removed
      // this.applyRoleBasedFiltering(queryBuilder, requestingUser.role);

      // Apply sorting
      queryBuilder.orderBy(`user.${sortBy}`, sortOrder);

      // Apply pagination
      const offset = (page - 1) * limit;
      queryBuilder.skip(offset).take(limit);

      // Execute query
      const [users, total] = await queryBuilder.getManyAndCount();

      const mappedUsers = users.map(user => this.mapToResponseDto(user));

      const totalPages = Math.ceil(total / limit);

      this.logger.log(
        `Retrieved ${users.length} users (page ${page}/${totalPages}) by ${requestingUser}`,
      );

      return {
        data: mappedUsers,
        total,
        page,
        limit,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      };
    } catch (error) {
      this.logger.error(`User retrieval failed: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Get user by ID
   */
  async findOne(
    id: string,
    requestingUser = 'system',
  ): Promise<UserResponseDto> {
    try {
      const user = await this.userRepository.findOne({
        where: { id },
      });

      if (!user) {
        throw new NotFoundException('User not found');
      }

      // Check if user can view this profile - disabled since auth is removed
      // this.validateUserAccess(user, requestingUser);

      this.logger.log(`User profile retrieved: ${user.username} by ${requestingUser}`);

      return this.mapToResponseDto(user);
    } catch (error) {
      this.logger.error(`User retrieval failed: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Update user
   */
  async update(
    id: string,
    updateUserDto: UpdateUserDto,
    requestingUser = 'system',
  ): Promise<UserResponseDto> {
    try {
      const user = await this.userRepository.findOne({
        where: { id },
      });

      if (!user) {
        throw new NotFoundException('User not found');
      }

      // Check permissions - disabled since auth is removed
      // this.validateUpdatePermissions(user, requestingUser, updateUserDto);

      // Check for duplicate username/email if being updated
      if (updateUserDto.username || updateUserDto.email) {
        const duplicateUser = await this.userRepository.findOne({
          where: [
            ...(updateUserDto.username ? [{ username: updateUserDto.username }] : []),
            ...(updateUserDto.email ? [{ email: updateUserDto.email }] : []),
          ],
        });

        if (duplicateUser && duplicateUser.id !== id) {
          if (duplicateUser.username === updateUserDto.username) {
            throw new ConflictException('Username already exists');
          }
          if (duplicateUser.email === updateUserDto.email) {
            throw new ConflictException('Email already exists');
          }
        }
      }

      // Apply updates
      Object.assign(user, updateUserDto);

      // Handle admin-specific updates
      if (this.isAdminUpdate(updateUserDto)) {
        const adminUpdate = updateUserDto as AdminUpdateUserDto;
        
        if (adminUpdate.resetFailedAttempts) {
          user.failedLoginAttempts = 0;
        }

        if (adminUpdate.unlockAccount) {
          user.lockedUntil = null;
          user.failedLoginAttempts = 0;
        }
      }

      const savedUser = await this.userRepository.save(user);

      this.logger.log(
        `User updated: ${savedUser.username} by ${requestingUser}`,
      );

      return this.mapToResponseDto(savedUser);
    } catch (error) {
      this.logger.error(`User update failed: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Delete user (soft delete by deactivating)
   */
  async remove(
    id: string,
    requestingUser = 'system',
  ): Promise<{ message: string; deletedAt: Date }> {
    try {
      const user = await this.userRepository.findOne({
        where: { id },
      });

      if (!user) {
        throw new NotFoundException('User not found');
      }

      // Prevent self-deletion - disabled since auth is removed
      // if (user.id === requestingUser.userId) {
      //   throw new BadRequestException('Cannot delete your own account');
      // }

      // Check permissions - disabled since auth is removed
      // if (requestingUser.role !== UserRole.ADMIN) {
      //   throw new ForbiddenException('Only administrators can delete users');
      // }

      // Soft delete by deactivating
      user.isActive = false;
      user.status = UserStatus.INACTIVE;
      await this.userRepository.save(user);

      this.logger.log(
        `User deactivated: ${user.username} by ${requestingUser}`,
      );

      return {
        message: 'User successfully deactivated',
        deletedAt: new Date(),
      };
    } catch (error) {
      this.logger.error(`User deletion failed: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Get user statistics
   */
  async getStatistics(requestingUser = 'system') {
    try {
      // Permission check disabled since auth is removed
      // if (requestingUser.role !== UserRole.ADMIN && requestingUser.role !== UserRole.MANAGER) {
      //   throw new ForbiddenException('Insufficient permissions to view statistics');
      // }

      const [
        totalUsers,
        activeUsers,
        inactiveUsers,
        lockedUsers,
        adminUsers,
        managerUsers,
        staffUsers,
      ] = await Promise.all([
        this.userRepository.count(),
        this.userRepository.count({ where: { isActive: true, status: UserStatus.ACTIVE } }),
        this.userRepository.count({ where: { isActive: false } }),
        // Clock-correct via the Node app clock (:now = new Date()), consistent
        // with findAll and the login path (see issue #710). No self-heal write
        // here: this is a read-only stats endpoint and the count already
        // excludes expired locks.
        this.userRepository
          .createQueryBuilder('user')
          .where('user.lockedUntil > :now', { now: new Date() })
          .getCount(),
        this.userRepository.count({ where: { role: UserRole.ADMIN } }),
        this.userRepository.count({ where: { role: UserRole.MANAGER } }),
        this.userRepository.count({
          where: [
            { role: UserRole.SALES_STAFF },
            { role: UserRole.INVENTORY_STAFF },
            { role: UserRole.PROCUREMENT_STAFF },
          ],
        }),
      ]);

      const statistics = {
        total: totalUsers,
        active: activeUsers,
        inactive: inactiveUsers,
        locked: lockedUsers,
        byRole: {
          admin: adminUsers,
          manager: managerUsers,
          staff: staffUsers,
        },
        activePercentage: totalUsers > 0 ? Math.round((activeUsers / totalUsers) * 100) : 0,
      };

      this.logger.log(`User statistics retrieved by ${requestingUser}`);

      return statistics;
    } catch (error) {
      this.logger.error(`Statistics retrieval failed: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Create query builder for users
   */
  private createQueryBuilder(alias: string): SelectQueryBuilder<User> {
    return this.userRepository.createQueryBuilder(alias);
  }

  /**
   * Apply role-based filtering to query
   */
  private applyRoleBasedFiltering(
    queryBuilder: SelectQueryBuilder<User>,
    requestingUserRole: UserRole,
  ): void {
    // Admins can see all users
    if (requestingUserRole === UserRole.ADMIN) {
      return;
    }

    // Managers can see all users except other admins
    if (requestingUserRole === UserRole.MANAGER) {
      queryBuilder.andWhere('user.role != :adminRole', { adminRole: UserRole.ADMIN });
      return;
    }

    // Staff can only see other staff members (not admins or managers)
    queryBuilder.andWhere('user.role NOT IN (:...restrictedRoles)', {
      restrictedRoles: [UserRole.ADMIN, UserRole.MANAGER],
    });
  }

  /**
   * Validate if requesting user can access the target user
   */
  private validateUserAccess(targetUser: User, requestingUser: any): void {
    // Users can always access their own profile
    if (targetUser.id === requestingUser.userId) {
      return;
    }

    // Admins can access any profile
    if (requestingUser.role === UserRole.ADMIN) {
      return;
    }

    // Managers can access non-admin profiles
    if (requestingUser.role === UserRole.MANAGER && targetUser.role !== UserRole.ADMIN) {
      return;
    }

    // Staff can only access other staff profiles (not admin/manager)
    if (
      requestingUser.role !== UserRole.ADMIN &&
      requestingUser.role !== UserRole.MANAGER &&
      (targetUser.role === UserRole.ADMIN || targetUser.role === UserRole.MANAGER)
    ) {
      throw new ForbiddenException('Insufficient permissions to access this profile');
    }
  }

  /**
   * Validate update permissions
   */
  private validateUpdatePermissions(
    targetUser: User,
    requestingUser: any,
    updateDto: UpdateUserDto,
  ): void {
    // Users can update their own profile (limited fields)
    if (targetUser.id === requestingUser.userId) {
      // Users can only update their own basic info, not role or status
      if (updateDto.role || updateDto.status || updateDto.isActive) {
        throw new ForbiddenException('Cannot modify role, status, or active state of your own account');
      }
      return;
    }

    // Admins can update anyone
    if (requestingUser.role === UserRole.ADMIN) {
      return;
    }

    // Managers can update non-admin users (limited)
    if (requestingUser.role === UserRole.MANAGER && targetUser.role !== UserRole.ADMIN) {
      // Managers cannot promote users to admin
      if (updateDto.role === UserRole.ADMIN) {
        throw new ForbiddenException('Cannot assign admin role');
      }
      return;
    }

    throw new ForbiddenException('Insufficient permissions to update this user');
  }

  /**
   * Validate role assignment permissions
   */
  private validateRoleAssignment(assignerRole: UserRole, targetRole: UserRole): void {
    // Only admins can assign admin role
    if (targetRole === UserRole.ADMIN && assignerRole !== UserRole.ADMIN) {
      throw new ForbiddenException('Only administrators can assign admin role');
    }

    // Only admins and managers can assign manager role
    if (
      targetRole === UserRole.MANAGER &&
      assignerRole !== UserRole.ADMIN &&
      assignerRole !== UserRole.MANAGER
    ) {
      throw new ForbiddenException('Only administrators and managers can assign manager role');
    }
  }

  /**
   * Check if update includes admin-specific fields
   */
  private isAdminUpdate(updateDto: UpdateUserDto): boolean {
    const adminUpdate = updateDto as AdminUpdateUserDto;
    return !!(adminUpdate.resetFailedAttempts || adminUpdate.unlockAccount);
  }

  /**
   * Map user entity to response DTO
   */
  private mapToResponseDto(user: User): UserResponseDto {
    return {
      id: user.id,
      username: user.username,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      fullName: user.fullName,
      phoneNumber: user.phoneNumber,
      role: user.role,
      status: user.status,
      isActive: user.isActive,
      lastLoginAt: user.lastLoginAt,
      lastLoginIp: user.lastLoginIp,
      failedLoginAttempts: user.failedLoginAttempts,
      lockedUntil: user.lockedUntil,
      isLocked: user.isLocked,
      notes: user.notes,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }
}
