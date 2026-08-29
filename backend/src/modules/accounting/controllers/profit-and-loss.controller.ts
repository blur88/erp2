import { Controller, Get, Query } from '@nestjs/common';
import { Auth } from '../../auth/decorators/auth.decorator';
import { ProfitAndLossService } from '../services/profit-and-loss.service';
import { ProfitAndLossQueryDto } from '../dto/profit-and-loss-query.dto';

@Auth()
@Controller('accounting/profit-and-loss')
export class ProfitAndLossController {
  constructor(private readonly service: ProfitAndLossService) {}

  @Get()
  get(@Query() query: ProfitAndLossQueryDto) {
    return this.service.getProfitAndLoss({ year: query.year });
  }
}
