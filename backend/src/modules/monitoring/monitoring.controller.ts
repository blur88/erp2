import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { IsInt, Min } from 'class-validator';
import { Auth } from '../auth/decorators/auth.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UserRole } from '@/database/entities/user.entity';
import { RedisAlertService } from './redis-alert.service';
import { RedisMemorySamplerService } from './redis-memory-sampler.service';
import { RedisAlertView } from './redis-alert.types';

export class AcknowledgeOomDto {
  /** The counter value the operator actually saw. Mismatch ⇒ 409. */
  @IsInt()
  @Min(0)
  observedValue: number;
}

/**
 * Monitoring owns its own HTTP surface. The pre-existing
 * `GET health/redis-memory` route remains on `AppController`.
 */
@ApiTags('Health')
@Controller('health/redis-alerts')
export class MonitoringController {
  constructor(
    private readonly alerts: RedisAlertService,
    private readonly sampler: RedisMemorySamplerService,
  ) {}

  @Get()
  @Auth(UserRole.ADMIN)
  @ApiOperation({ summary: 'Get Redis memory-pressure and OOM alert state' })
  @ApiResponse({ status: 200, description: 'Current alert state' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Administrator role required' })
  async getRedisAlerts(): Promise<RedisAlertView> {
    const { runId, reason } = this.sampler.getIdentity();
    return this.alerts.getView(runId, reason);
  }

  @Post('oom/acknowledge')
  @Auth(UserRole.ADMIN)
  @ApiOperation({ summary: 'Acknowledge the observed Redis OOM counter value' })
  @ApiResponse({ status: 201, description: 'Updated alert state' })
  @ApiResponse({ status: 409, description: 'Counter changed, or no active alert' })
  async acknowledgeOom(
    @Body() dto: AcknowledgeOomDto,
    @CurrentUser('userId') userId: string,
    @CurrentUser() user: { username?: string; firstName?: string; lastName?: string },
  ): Promise<RedisAlertView> {
    const { runId } = this.sampler.getIdentity();
    return this.alerts.acknowledgeOom(dto.observedValue, userId, this.labelFor(user), runId);
  }

  /**
   * The display name is captured here, from the already-authenticated
   * principal, so rendering an acknowledgement never needs a user lookup.
   */
  private labelFor(user: {
    username?: string;
    firstName?: string;
    lastName?: string;
  } | null): string | null {
    if (!user) {
      return null;
    }
    const fullName = [user.firstName, user.lastName].filter(Boolean).join(' ').trim();
    return fullName || user.username || null;
  }
}
