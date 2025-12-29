import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AuthService } from './auth.service';

/**
 * Scheduled tasks for authentication module
 */
@Injectable()
export class AuthScheduler {
  private readonly logger = new Logger(AuthScheduler.name);

  constructor(private readonly authService: AuthService) {}

  /**
   * Cleanup expired refresh tokens daily at 2 AM
   * Prevents database bloat from expired tokens
   */
  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async handleTokenCleanup() {
    this.logger.log('Starting scheduled cleanup of expired refresh tokens');

    try {
      const deletedCount = await this.authService.cleanupExpiredTokens();
      this.logger.log(`Token cleanup completed: ${deletedCount} expired tokens removed`);
    } catch (error) {
      this.logger.error('Token cleanup failed', error.stack);
    }
  }
}
