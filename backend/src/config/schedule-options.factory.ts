import { ScheduleModuleOptions } from '@nestjs/schedule';

/**
 * ScheduleModule options for AppModule.
 *
 * Cron jobs are not registered when NODE_ENV is exactly 'test' (#1311). Every
 * e2e suite boots the full AppModule against a shared database, so a wall-clock
 * handler (hourly backup cleanup, 02:00 token/search cleanup, 03:00 sample
 * prune, the every-minute sampler) would otherwise write or delete rows
 * mid-run, and the leak check's verdict would depend on what time it was.
 * A test that needs a handler's behaviour must call the handler directly.
 *
 * The comparison is strict on purpose, matching bcryptRounds(): any other
 * value, including an unset NODE_ENV, keeps scheduling on.
 */
export const createScheduleOptions = (
  env: { NODE_ENV?: string } = process.env,
): ScheduleModuleOptions => ({
  cronJobs: env.NODE_ENV !== 'test',
});
