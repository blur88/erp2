import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AuthSessionService } from './auth-session.service';
import { AuthClock } from './auth-clock';

/**
 * Scheduled tasks for authentication module
 */
@Injectable()
export class AuthScheduler {
  private readonly logger = new Logger(AuthScheduler.name);

  constructor(
    private readonly authSessionService: AuthSessionService,
    private readonly clock: AuthClock,
  ) {}

  /**
   * Cleanup expired refresh tokens and sessions daily at 2 AM
   * Prevents database bloat from expired tokens and sessions
   */
  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async handleTokenCleanup() {
    this.logger.log('Starting scheduled cleanup of expired refresh tokens and sessions');

    try {
      const { tokens, sessions } = await this.authSessionService.cleanupExpired(
        this.clock.now(),
      );
      this.logger.log(
        `Cleanup completed: ${tokens} expired tokens and ${sessions} expired sessions removed`,
      );
    } catch (error: any) {
      this.logger.error('Token cleanup failed', error?.stack || error);
    }
  }
}
