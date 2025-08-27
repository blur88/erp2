import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '../../database/entities/user.entity';
import { AuthenticatedUser } from '../../modules/auth/interfaces/jwt-payload.interface';

/**
 * Role-based access control guard
 * Checks if user has required roles to access the resource
 */
@Injectable()
export class RolesGuard implements CanActivate {
  private readonly logger = new Logger(RolesGuard.name);

  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    // Get required roles from decorator metadata
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>('roles', [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles || requiredRoles.length === 0) {
      // No specific roles required, allow access
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user: AuthenticatedUser = request.user;

    if (!user) {
      this.logger.warn('RolesGuard: No user found in request');
      throw new ForbiddenException('Access denied: Authentication required');
    }

    // Check if user has at least one of the required roles
    const hasRequiredRole = requiredRoles.some((role) => user.role === role);

    if (!hasRequiredRole) {
      this.logger.warn(
        `Access denied for user ${user.username} (${user.role}). Required roles: ${requiredRoles.join(', ')}`
      );
      throw new ForbiddenException(
        `Access denied: Insufficient privileges. Required roles: ${requiredRoles.join(', ')}`
      );
    }

    this.logger.debug(
      `Access granted for user ${user.username} (${user.role}) to resource requiring: ${requiredRoles.join(', ')}`
    );

    return true;
  }
}