import { jest } from '@jest/globals';
import { BadRequestException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { UserRole } from '@database/entities/user.entity';
import { BackupController, backupUploadFileFilter } from './backup.controller';

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

describe('BackupController - upload fileFilter', () => {
  function runFileFilter(originalname: string) {
    const cb = (jest.fn as unknown as any)();

    backupUploadFileFilter(
      {},
      { originalname },
      cb,
    );

    return cb;
  }

  it('rejects filenames containing shell metacharacters', () => {
    const cb = runFileFilter('backup;rm.tar.gz');

    expect(cb).toHaveBeenCalledWith(expect.any(BadRequestException), false);
    expect(cb.mock.calls[0][0].message).toContain(
      'Only alphanumeric characters, dots, underscores, and hyphens are allowed',
    );
  });

  it('rejects filenames containing path traversal characters', () => {
    const cb = runFileFilter('../../etc/passwd.tar.gz');

    expect(cb).toHaveBeenCalledWith(expect.any(BadRequestException), false);
    expect(cb.mock.calls[0][0].message).toContain(
      'Only alphanumeric characters, dots, underscores, and hyphens are allowed',
    );
  });

  it('rejects filenames containing parent-directory traversal segments', () => {
    const cb = runFileFilter('safe..name.tar.gz');

    expect(cb).toHaveBeenCalledWith(expect.any(BadRequestException), false);
    expect(cb.mock.calls[0][0].message).toContain('".." is prohibited');
  });

  it('rejects nested traversal filenames even when the extension is valid', () => {
    const cb = runFileFilter('../../../malicious.tar.gz');

    expect(cb).toHaveBeenCalledWith(expect.any(BadRequestException), false);
  });

  it('accepts valid tar.gz backup filenames', () => {
    const cb = runFileFilter('backup_20260430_120000.tar.gz');

    expect(cb).toHaveBeenCalledWith(null, true);
  });

  it('accepts valid tgz backup filenames', () => {
    const cb = runFileFilter('backup_20260430_120000.tgz');

    expect(cb).toHaveBeenCalledWith(null, true);
  });
});
