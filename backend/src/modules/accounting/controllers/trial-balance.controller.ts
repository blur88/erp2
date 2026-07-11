import { Controller, Get, Query } from '@nestjs/common';
import { Auth } from '../../auth/decorators/auth.decorator';
import { UserRole } from '../../../database/entities/user.entity';
import { TrialBalanceService } from '../services/trial-balance.service';

@Auth(UserRole.ADMIN)
@Controller('accounting/trial-balance')
export class TrialBalanceController {
  constructor(private readonly service: TrialBalanceService) {}
  @Get() get(@Query('asOfDate') asOfDate?: string, @Query('showZero') showZero?: string) {
    return this.service.getTrialBalance({ asOfDate, showZero: showZero === 'true' });
  }
}
