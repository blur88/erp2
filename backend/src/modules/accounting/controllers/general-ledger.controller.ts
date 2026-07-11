import { Controller, Get, Query } from '@nestjs/common';
import { Auth } from '../../auth/decorators/auth.decorator';
import { UserRole } from '../../../database/entities/user.entity';
import { GeneralLedgerService } from '../services/general-ledger.service';

@Auth(UserRole.ADMIN)
@Controller('accounting/general-ledger')
export class GeneralLedgerController {
  constructor(private readonly service: GeneralLedgerService) {}
  @Get() get(
    @Query('accountId') accountId: string,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
    @Query('sourceType') sourceType?: string,
  ) {
    return this.service.getLedger({ accountId, fromDate, toDate, sourceType });
  }
}
