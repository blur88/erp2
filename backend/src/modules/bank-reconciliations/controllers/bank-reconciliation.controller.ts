import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Auth } from '../../auth/decorators/auth.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { BankReconciliationEligibilityService } from '../services/bank-reconciliation-eligibility.service';
import { BankReconciliationService } from '../services/bank-reconciliation.service';
import { BankReconciliationLifecycleService } from '../services/bank-reconciliation-lifecycle.service';
import {
  CreateBankReconciliationDto,
  EligibleLinesSearchDto,
  LifecycleDto,
  ListBankReconciliationsQueryDto,
  PreviewDto,
  ReconciliationLinesQueryDto,
  UpdateBankReconciliationDto,
} from '../dto/bank-reconciliation.dto';

@Auth()
@ApiTags('Bank Reconciliations')
@Controller('accounting/bank-reconciliations')
export class BankReconciliationController {
  constructor(
    private readonly eligibilityService: BankReconciliationEligibilityService,
    private readonly reconciliationService: BankReconciliationService,
    private readonly lifecycleService: BankReconciliationLifecycleService,
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

  @Get('next-period')
  @ApiOperation({ summary: 'Get next period information for a bank account' })
  async nextPeriod(
    @Query('bankAccountId', new ParseUUIDPipe({ version: '4' })) bankAccountId: string,
  ) {
    const result = await this.reconciliationService.nextPeriod(bankAccountId);
    return { data: result };
  }

  @Get()
  @ApiOperation({ summary: 'List bank reconciliations' })
  async list(@Query() q: ListBankReconciliationsQueryDto) {
    return this.reconciliationService.list(q);
  }

  @Get(':id/lines')
  @ApiOperation({ summary: 'List lines for a bank reconciliation' })
  async lines(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Query() q: ReconciliationLinesQueryDto,
  ) {
    return this.reconciliationService.lines(id, q);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get bank reconciliation details' })
  async findOne(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    const result = await this.reconciliationService.findOne(id);
    return { data: result };
  }

  @Post()
  @ApiOperation({ summary: 'Create bank reconciliation draft' })
  async create(
    @Body() dto: CreateBankReconciliationDto,
    @CurrentUser('userId') userId: string,
    @CurrentUser('username') username: string,
  ) {
    const result = await this.reconciliationService.create(dto, userId, username);
    return { data: result };
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update bank reconciliation draft' })
  async update(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: UpdateBankReconciliationDto,
    @CurrentUser('userId') userId: string,
    @CurrentUser('username') username: string,
  ) {
    const result = await this.reconciliationService.update(id, dto, userId, username);
    return { data: result };
  }

  @Post(':id/complete')
  @HttpCode(200)
  @ApiOperation({ summary: 'Complete bank reconciliation and seal immutable version' })
  async complete(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: LifecycleDto,
    @CurrentUser('userId') userId: string,
    @CurrentUser('username') username: string,
  ) {
    const result = await this.lifecycleService.complete(id, dto.lockVersion, userId, username);
    return { data: result };
  }

  @Post(':id/reopen')
  @HttpCode(200)
  @ApiOperation({ summary: 'Reopen the latest completed bank reconciliation' })
  async reopen(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: LifecycleDto,
    @CurrentUser('userId') userId: string,
    @CurrentUser('username') username: string,
  ) {
    const result = await this.lifecycleService.reopen(id, dto.lockVersion, userId, username);
    return { data: result };
  }

  @Post(':id/cancel-reopen')
  @HttpCode(200)
  @ApiOperation({ summary: 'Cancel reopen and restore previous completion snapshot' })
  async cancelReopen(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: LifecycleDto,
    @CurrentUser('userId') userId: string,
    @CurrentUser('username') username: string,
  ) {
    const result = await this.lifecycleService.cancelReopen(id, dto.lockVersion, userId, username);
    return { data: result };
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Discard bank reconciliation draft' })
  async discard(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Query('lockVersion') lockVersionStr: string | undefined,
    @CurrentUser('userId') userId: string,
    @CurrentUser('username') username: string,
  ) {
    if (lockVersionStr === undefined || lockVersionStr === null || String(lockVersionStr).trim() === '') {
      throw new BadRequestException('lockVersion query parameter is required.');
    }
    const lockVersion = Number(lockVersionStr);
    if (!Number.isInteger(lockVersion) || lockVersion < 1) {
      throw new BadRequestException('lockVersion query parameter must be a positive integer.');
    }
    await this.reconciliationService.discard(id, lockVersion, userId, username);
  }
}
