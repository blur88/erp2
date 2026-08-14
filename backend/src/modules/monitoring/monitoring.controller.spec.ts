import { ConflictException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { MonitoringController } from './monitoring.controller';
import { RedisAlertService } from './redis-alert.service';
import { UserRole } from '@/database/entities/user.entity';

describe('MonitoringController', () => {
  let alerts: RedisAlertService;
  let controller: MonitoringController;

  beforeEach(() => {
    alerts = new RedisAlertService();
    controller = new MonitoringController(alerts);
  });

  // Calling a controller method directly bypasses guards entirely, so
  // admin-only enforcement must be asserted through the metadata that
  // `@Auth(UserRole.ADMIN)` attaches. The metadata key is the literal string
  // `'roles'` (`roles.decorator.ts:14`) — there is no exported ROLES_KEY.
  // Roles metadata alone enforces nothing without RolesGuard, so assert both.
  describe('authorization metadata', () => {
    const reflector = new Reflector();
    const routes: Array<[string, (...args: any[]) => unknown]> = [
      ['getRedisAlerts', MonitoringController.prototype.getRedisAlerts],
      ['acknowledgeOom', MonitoringController.prototype.acknowledgeOom],
    ];

    it.each(routes)('restricts %s to administrators', (_name, handler) => {
      expect(reflector.get('roles', handler)).toContain(UserRole.ADMIN);
    });

    it.each(routes)('applies the auth guards to %s', (_name, handler) => {
      const guards = Reflect.getMetadata('__guards__', handler) ?? [];
      expect(guards).toEqual(
        expect.arrayContaining([JwtAuthGuard, RolesGuard]),
      );
    });

    it.each(routes)('does not mark %s public', (_name, handler) => {
      expect(reflector.get('isPublic', handler)).toBeUndefined();
    });
  });

  it('returns the current alert view', () => {
    const view = controller.getRedisAlerts();
    expect(view.pressure.active).toBe(false);
    expect(view.oom.active).toBe(false);
    expect(view.severity).toBe('none');
    expect(typeof view.generatedAt).toBe('string');
  });

  it('acknowledges an active OOM alert', () => {
    alerts.onOomCounter({
      previousValue: null, value: 0, delta: 0, kind: 'baseline', at: '2026-08-14T10:00:00.000Z',
    });
    alerts.onOomCounter({
      previousValue: 0, value: 2, delta: 2, kind: 'increase', at: '2026-08-14T10:01:00.000Z',
    });

    const view = controller.acknowledgeOom(
      { observedValue: 2 },
      'user-1',
      { username: 'ada', firstName: 'Ada', lastName: 'L' } as any,
    );

    expect(view.oom.active).toBe(false);
    expect(view.oom.lastAcknowledgedBy).toBe('user-1');
    expect(view.oom.lastAcknowledgedByLabel).toBe('Ada L');
  });

  it('propagates a 409 for a stale acknowledgement', () => {
    alerts.onOomCounter({
      previousValue: null, value: 0, delta: 0, kind: 'baseline', at: '2026-08-14T10:00:00.000Z',
    });
    alerts.onOomCounter({
      previousValue: 0, value: 5, delta: 5, kind: 'increase', at: '2026-08-14T10:01:00.000Z',
    });
    expect(() =>
      controller.acknowledgeOom({ observedValue: 2 }, 'user-1', { username: 'ada' } as any),
    ).toThrow(ConflictException);
  });

  it('falls back to the username when no name is set', () => {
    alerts.onOomCounter({
      previousValue: null, value: 0, delta: 0, kind: 'baseline', at: '2026-08-14T10:00:00.000Z',
    });
    alerts.onOomCounter({
      previousValue: 0, value: 1, delta: 1, kind: 'increase', at: '2026-08-14T10:01:00.000Z',
    });
    const view = controller.acknowledgeOom(
      { observedValue: 1 }, 'user-1', { username: 'ada' } as any,
    );
    expect(view.oom.lastAcknowledgedByLabel).toBe('ada');
  });
});
