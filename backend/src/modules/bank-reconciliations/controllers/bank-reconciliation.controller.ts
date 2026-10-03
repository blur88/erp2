import {
  Body,
  Controller,
  HttpCode,
  Post,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Auth } from '../../auth/decorators/auth.decorator';
import { BankReconciliationEligibilityService } from '../services/bank-reconciliation-eligibility.service';
import {
  EligibleLinesSearchDto,
  PreviewDto,
} from '../dto/bank-reconciliation.dto';

@Auth()
@ApiTags('Bank Reconciliations')
@Controller('accounting/bank-reconciliations')
export class BankReconciliationController {
  constructor(
    private readonly eligibilityService: BankReconciliationEligibilityService,
  ) {}

  @Post('eligible-lines/search')
  @HttpCode(200)
  @ApiOperation({ summary: 'Search eligible journal lines for bank reconciliation' })
  async search(@Body() dto: EligibleLinesSearchDto) {
    return this.eligibilityService.search(dto);
  }

  @Post('preview')
  @HttpCode(200)
  @ApiOperation({ summary: 'Preview bank reconciliation draft selection and setup changes' })
  async preview(@Body() dto: PreviewDto) {
    const result = await this.eligibilityService.preview(dto);
    return { data: result };
  }
}
