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
 * Permission types for granular access control
 */
export enum Permission {
  // User Management
  CREATE_USER = 'create:user',
  READ_USER = 'read:user',
  UPDATE_USER = 'update:user',
  DELETE_USER = 'delete:user',
  MANAGE_USERS = 'manage:users',

  // Sales
  CREATE_SALES = 'create:sales',
  READ_SALES = 'read:sales',
  UPDATE_SALES = 'update:sales',
  DELETE_SALES = 'delete:sales',
  APPROVE_SALES = 'approve:sales',

  // Inventory
  CREATE_INVENTORY = 'create:inventory',
  READ_INVENTORY = 'read:inventory',
  UPDATE_INVENTORY = 'update:inventory',
  DELETE_INVENTORY = 'delete:inventory',
  ADJUST_INVENTORY = 'adjust:inventory',

  // Purchasing
  CREATE_PURCHASE = 'create:purchase',
  READ_PURCHASE = 'read:purchase',
  UPDATE_PURCHASE = 'update:purchase',
  DELETE_PURCHASE = 'delete:purchase',
  APPROVE_PURCHASE = 'approve:purchase',

  // Reports
  VIEW_REPORTS = 'view:reports',
  EXPORT_REPORTS = 'export:reports',
  
  // System
  MANAGE_SYSTEM = 'manage:system',
  VIEW_AUDIT_LOGS = 'view:audit-logs',
}

/**
 * Role-based permission mapping
 */
const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  [UserRole.ADMIN]: [
    // Admin has all permissions
    ...Object.values(Permission),
  ],
  [UserRole.MANAGER]: [
    // User management (limited)
    Permission.READ_USER,
    Permission.UPDATE_USER,
    
    // Sales management
    Permission.CREATE_SALES,
    Permission.READ_SALES,
    Permission.UPDATE_SALES,
    Permission.DELETE_SALES,
    Permission.APPROVE_SALES,
    
    // Inventory management
    Permission.CREATE_INVENTORY,
    Permission.READ_INVENTORY,
    Permission.UPDATE_INVENTORY,
    Permission.ADJUST_INVENTORY,
    
    // Purchase management
    Permission.CREATE_PURCHASE,
    Permission.READ_PURCHASE,
    Permission.UPDATE_PURCHASE,
    Permission.APPROVE_PURCHASE,
    
    // Reporting
    Permission.VIEW_REPORTS,
    Permission.EXPORT_REPORTS,
  ],
  [UserRole.SALES_STAFF]: [
    // Sales operations
    Permission.CREATE_SALES,
    Permission.READ_SALES,
    Permission.UPDATE_SALES,
    
    // Inventory read access
    Permission.READ_INVENTORY,
    
    // Own profile management
    Permission.READ_USER,
    
    // Basic reporting
    Permission.VIEW_REPORTS,
  ],
  [UserRole.INVENTORY_STAFF]: [
    // Inventory management
    Permission.CREATE_INVENTORY,
    Permission.READ_INVENTORY,
    Permission.UPDATE_INVENTORY,
    Permission.ADJUST_INVENTORY,
    
    // Purchase read access
    Permission.READ_PURCHASE,
    
    // Sales read access
    Permission.READ_SALES,
    
    // Own profile management
    Permission.READ_USER,
    
    // Basic reporting
    Permission.VIEW_REPORTS,
  ],
  [UserRole.PROCUREMENT_STAFF]: [
    // Purchase management
    Permission.CREATE_PURCHASE,
    Permission.READ_PURCHASE,
    Permission.UPDATE_PURCHASE,
    
    // Inventory read access
    Permission.READ_INVENTORY,
    
    // Own profile management
    Permission.READ_USER,
    
    // Basic reporting
    Permission.VIEW_REPORTS,
  ],
};

/**
 * Permission-based access control guard
 * Provides granular access control beyond role-based checks
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  private readonly logger = new Logger(PermissionsGuard.name);

  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    // Get required permissions from decorator metadata
    const requiredPermissions = this.reflector.getAllAndOverride<Permission[]>('permissions', [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredPermissions || requiredPermissions.length === 0) {
      // No specific permissions required, allow access
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user: AuthenticatedUser = request.user;

    if (!user) {
      this.logger.warn('PermissionsGuard: No user found in request');
      throw new ForbiddenException('Access denied: Authentication required');
    }

    // Get user's permissions based on role
    const userPermissions = ROLE_PERMISSIONS[user.role] || [];

    // Check if user has all required permissions
    const hasAllPermissions = requiredPermissions.every((permission) =>
      userPermissions.includes(permission)
    );

    if (!hasAllPermissions) {
      const missingPermissions = requiredPermissions.filter(
        (permission) => !userPermissions.includes(permission)
      );

      this.logger.warn(
        `Access denied for user ${user.username} (${user.role}). Missing permissions: ${missingPermissions.join(', ')}`
      );
      
      throw new ForbiddenException(
        `Access denied: Insufficient permissions. Missing: ${missingPermissions.join(', ')}`
      );
    }

    this.logger.debug(
      `Permission check passed for user ${user.username} (${user.role}). Required: ${requiredPermissions.join(', ')}`
    );

    return true;
  }
}