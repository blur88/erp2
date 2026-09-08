import { Controller, Get, Query } from '@nestjs/common';
import { Auth } from '../../auth/decorators/auth.decorator';
import { BalanceSheetService } from '../services/balance-sheet.service';
import { BalanceSheetQueryDto } from '../dto/balance-sheet-query.dto';

@Auth()
@Controller('accounting/balance-sheet')
export class BalanceSheetController {
  constructor(private readonly service: BalanceSheetService) {}

  @Get()
  get(@Query() query: BalanceSheetQueryDto) {
    return this.service.getBalanceSheet({ year: query.year });
  }
}
