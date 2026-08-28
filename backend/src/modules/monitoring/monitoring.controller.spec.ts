import { jest } from '@jest/globals';
import { ConflictException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { MonitoringController } from './monitoring.controller';
import { RedisMemorySamplerService } from './redis-memory-sampler.service';
import { RedisAlertService } from './redis-alert.service';
import { RedisAlertView } from './redis-alert.types';
import { UserRole } from '@/database/entities/user.entity';

describe('MonitoringController', () => {
  let alerts: { getView: any; acknowledgeOom: any };
  let sampler: { getIdentity: any };
  let controller: MonitoringController;

  beforeEach(() => {
    alerts = { getView: (jest.fn as unknown as any)(), acknowledgeOom: (jest.fn as unknown as any)() };
    sampler = { getIdentity: (jest.fn as unknown as any)() };
    controller = new MonitoringController(
      alerts as unknown as RedisAlertService,
      sampler as unknown as RedisMemorySamplerService,
    );
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

  const identity = { runId: 'run-1', reason: null as string | null };
  const viewFixture = (severity: RedisAlertView['severity']): RedisAlertView => ({
    pressure: null,
    oom: null,
    severity,
    unavailableReason: severity === 'unavailable' ? 'redis-identity-unknown' : null,
    generatedAt: '2026-08-14T10:00:00.000Z',
  });

  it('resolves identity from the sampler and passes both parts to getView', async () => {
    sampler.getIdentity.mockReturnValue(identity);
    alerts.getView.mockResolvedValue(viewFixture('none'));

    const view = await controller.getRedisAlerts();

    expect(sampler.getIdentity).toHaveBeenCalledTimes(1);
    expect(alerts.getView).toHaveBeenCalledWith('run-1', null);
    expect(view.severity).toBe('none');
  });

  it('returns the unavailable variant when identity is unknown', async () => {
    sampler.getIdentity.mockReturnValue({
      runId: null,
      reason: 'redis-identity-unknown',
    });
    alerts.getView.mockResolvedValue(viewFixture('unavailable'));

    const view = await controller.getRedisAlerts();

    expect(alerts.getView).toHaveBeenCalledWith(null, 'redis-identity-unknown');
    expect(view.severity).toBe('unavailable');
  });

  it('rejects acknowledgement while identity is unavailable', async () => {
    sampler.getIdentity.mockReturnValue({
      runId: null,
      reason: 'redis-identity-unknown',
    });
    alerts.acknowledgeOom.mockRejectedValue(new ConflictException('x'));

    await expect(
      controller.acknowledgeOom({ observedValue: 9 }, 'user-1', { username: 'ada' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('acknowledges with the identity run id and a display label', async () => {
    sampler.getIdentity.mockReturnValue(identity);
    alerts.acknowledgeOom.mockResolvedValue(viewFixture('none'));

    const view = await controller.acknowledgeOom(
      { observedValue: 2 },
      'user-1',
      { username: 'ada', firstName: 'Ada', lastName: 'L' } as any,
    );

    expect(alerts.acknowledgeOom).toHaveBeenCalledWith(
      2,
      'user-1',
      'Ada L',
      'run-1',
    );
    expect(view.severity).toBe('none');
  });

  it('falls back to the username when no name is set', async () => {
    sampler.getIdentity.mockReturnValue(identity);
    alerts.acknowledgeOom.mockResolvedValue(viewFixture('none'));

    await controller.acknowledgeOom({ observedValue: 1 }, 'user-1', { username: 'ada' } as any);

    expect(alerts.acknowledgeOom).toHaveBeenCalledWith(1, 'user-1', 'ada', 'run-1');
  });
});
