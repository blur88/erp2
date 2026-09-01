// backend/src/modules/accounting/controllers/form-b.controller.ts
import { Controller, Get, Query } from '@nestjs/common';
import { Auth } from '../../auth/decorators/auth.decorator';
import { FormBService } from '../services/form-b.service';
import { FormBQueryDto } from '../dto/form-b-query.dto';

// A separate controller from ProfitAndLossController, so the Accounting View's
// route surface is untouched (spec §3).
@Auth()
@Controller('accounting/profit-and-loss/form-b')
export class FormBController {
  constructor(private readonly service: FormBService) {}

  @Get()
  get(@Query() query: FormBQueryDto) {
    return this.service.getFormB({ year: query.year });
  }
}
