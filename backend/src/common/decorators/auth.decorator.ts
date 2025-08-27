import { SetMetadata, UseGuards, applyDecorators } from '@nestjs/common';
import { ApiBearerAuth, ApiUnauthorizedResponse, ApiForbiddenResponse } from '@nestjs/swagger';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { RolesGuard } from '../guards/roles.guard';
import { PermissionsGuard } from '../guards/permissions.guard';
import { UserRole } from '../../database/entities/user.entity';
import { Permission } from '../guards/permissions.guard';

/**
 * Public route decorator - bypasses authentication
 */
export const Public = () => SetMetadata('isPublic', true);

/**
 * Optional authentication decorator - doesn't throw error if no token
 */
export const OptionalAuth = () => SetMetadata('isOptionalAuth', true);

/**
 * Roles decorator - sets required roles metadata
 */
export const Roles = (...roles: UserRole[]) => SetMetadata('roles', roles);

/**
 * Permissions decorator - sets required permissions metadata
 */
export const RequirePermissions = (...permissions: Permission[]) => 
  SetMetadata('permissions', permissions);

/**
 * Combined authentication decorator with JWT guard and Swagger documentation
 */
export function Auth(...roles: UserRole[]) {
  const guards = [JwtAuthGuard];
  
  if (roles.length > 0) {
    guards.push(RolesGuard);
  }

  return applyDecorators(
    SetMetadata('roles', roles),
    UseGuards(...guards),
    ApiBearerAuth(),
    ApiUnauthorizedResponse({
      description: 'Unauthorized - Invalid or missing JWT token',
    }),
    ...(roles.length > 0
      ? [
          ApiForbiddenResponse({
            description: `Forbidden - Insufficient privileges. Required roles: ${roles.join(', ')}`,
          }),
        ]
      : []),
  );
}

/**
 * Permission-based authentication decorator
 */
export function AuthWithPermissions(...permissions: Permission[]) {
  return applyDecorators(
    SetMetadata('permissions', permissions),
    UseGuards(JwtAuthGuard, PermissionsGuard),
    ApiBearerAuth(),
    ApiUnauthorizedResponse({
      description: 'Unauthorized - Invalid or missing JWT token',
    }),
    ApiForbiddenResponse({
      description: `Forbidden - Insufficient permissions. Required: ${permissions.join(', ')}`,
    }),
  );
}

/**
 * Admin-only decorator
 */
export const AdminOnly = () => Auth(UserRole.ADMIN);

/**
 * Manager or Admin decorator
 */
export const ManagerOrAdmin = () => Auth(UserRole.ADMIN, UserRole.MANAGER);

/**
 * All authenticated users decorator
 */
export const Authenticated = () => Auth();