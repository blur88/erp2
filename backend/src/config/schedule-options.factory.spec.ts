import { createScheduleOptions } from './schedule-options.factory';

describe('createScheduleOptions', () => {
  it.each(['production', 'development', undefined, '', 'TEST', 'testing'])(
    'registers cron jobs when NODE_ENV is %p',
    (nodeEnv) => {
      expect(createScheduleOptions({ NODE_ENV: nodeEnv })).toEqual({
        cronJobs: true,
      });
    },
  );

  // Only the exact value both e2e entry points export (package.json test:e2e,
  // scripts/verify-e2e-cleanup.sh) disables cron. Widening this condition
  // would silently stop backup cleanup, token cleanup and the sampler in a
  // real deployment.
  it("disables cron jobs only when NODE_ENV is exactly 'test'", () => {
    expect(createScheduleOptions({ NODE_ENV: 'test' })).toEqual({
      cronJobs: false,
    });
  });

  it('reads process.env by default', () => {
    const original = process.env.NODE_ENV;
    try {
      process.env.NODE_ENV = 'production';
      expect(createScheduleOptions().cronJobs).toBe(true);
      process.env.NODE_ENV = 'test';
      expect(createScheduleOptions().cronJobs).toBe(false);
    } finally {
      process.env.NODE_ENV = original;
    }
  });
});
