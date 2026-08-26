import { Controller, Get, Query } from '@nestjs/common';
import { Auth } from '../../auth/decorators/auth.decorator';
import { GeneralLedgerQueryDto } from '../dto/general-ledger-query.dto';
import { GeneralLedgerService } from '../services/general-ledger.service';

@Auth()
@Controller('accounting/general-ledger')
export class GeneralLedgerController {
  constructor(private readonly service: GeneralLedgerService) {}

  @Get() get(@Query() query: GeneralLedgerQueryDto) {
    return this.service.getLedger(query);
  }
}