import { Reflector } from '@nestjs/core';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { UserRole } from '@database/entities/user.entity';
import { BackupController } from './backup.controller';

/**
 * Returns the guards applied to a class or method via UseGuards metadata.
 * NestJS stores them under the GUARDS_METADATA key.
 */
function getGuards(target: any, methodName?: string): any[] {
  const key = '__guards__';
  if (methodName) {
    return Reflect.getMetadata(key, target.prototype[methodName]) ?? [];
  }
  return Reflect.getMetadata(key, target) ?? [];
}

/**
 * Returns the roles metadata applied to a method.
 */
function getRoles(target: any, methodName: string): UserRole[] {
  return Reflect.getMetadata('roles', target.prototype[methodName]) ?? [];
}

describe('BackupController - auth guards', () => {
  it('requires authentication on the controller class', () => {
    const guards = getGuards(BackupController);
    const guardNames = guards.map((g: any) => g.name ?? g.constructor?.name ?? String(g));
    expect(guardNames).toContain('JwtAuthGuard');
    expect(guardNames).toContain('RolesGuard');
  });

  describe('Admin-only endpoints', () => {
    const adminEndpoints = [
      'restore',
      'remove',
      'cleanup',
      'updateSettings',
      'cleanupWithSettings',
      'removeSchedule',
    ];

    it.each(adminEndpoints)('%s requires ADMIN role', (method) => {
      const roles = getRoles(BackupController, method);
      expect(roles).toContain(UserRole.ADMIN);
    });
  });

  describe('Read/create endpoints have no extra role restriction', () => {
    const openEndpoints = [
      'create',
      'findAll',
      'findOne',
      'getSettings',
      'download',
      'uploadBackup',
      'createSchedule',
      'findAllSchedules',
      'findOneSchedule',
      'updateSchedule',
      'toggleSchedule',
      'triggerSchedule',
    ];

    it.each(openEndpoints)('%s does not restrict beyond authentication', (method) => {
      const methodRoles = getRoles(BackupController, method);
      // No extra role restriction at the method level; controller-level auth covers it
      expect(methodRoles).not.toContain(UserRole.INVENTORY_STAFF);
      expect(methodRoles).not.toContain(UserRole.SALES_STAFF);
      expect(methodRoles).not.toContain(UserRole.PROCUREMENT_STAFF);
    });
  });
});
