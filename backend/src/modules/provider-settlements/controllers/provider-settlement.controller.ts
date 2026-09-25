import {
  Controller, Get, Post, Patch, Delete, Body, Param, Query, HttpCode, BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam } from '@nestjs/swagger';
import { Auth } from '../../auth/decorators/auth.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { ProviderSettlementService } from '../services/provider-settlement.service';
import { ProviderSettlementEligibilityService } from '../services/provider-settlement-eligibility.service';
import {
  CreateProviderSettlementDto, UpdateProviderSettlementDto,
  ListProviderSettlementsQueryDto, EligibleRowsQueryDto,
} from '../dto/provider-settlement.dto';

@Auth()
@ApiTags('Provider Settlements')
@Controller('accounting/provider-settlements')
export class ProviderSettlementController {
  constructor(
    private readonly service: ProviderSettlementService,
    private readonly eligibility: ProviderSettlementEligibilityService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List provider settlements' })
  async list(@Query() query: ListProviderSettlementsQueryDto) {
    return this.service.list(query);
  }

  // MUST precede @Get(':id') — NestJS would otherwise treat "eligible-rows" as
  // a uuid parameter.
  @Get('eligible-rows')
  @ApiOperation({ summary: 'List Sales Order + Payment Method rows eligible for settlement' })
  async eligibleRows(@Query() query: EligibleRowsQueryDto) {
    if (query.scope === 'claimed') {
      if (!query.settlementId) throw new BadRequestException('scope=claimed requires settlementId');
      return this.eligibility.listClaimedRows(query.settlementId, query.settlementDate);
    }
    return this.eligibility.listEligibleRows(query);
  }

  // MUST precede @Get(':id'), like eligible-rows. A plain array: at most one
  // row per payment method, so no pagination (#1289).
  @Get('providers')
  @ApiOperation({ summary: 'List the payment methods that own a settlement, for the Provider filter' })
  async providers() {
    return this.service.listProviders();
  }

  @Get(':id')
  @ApiParam({ name: 'id' })
  async findOne(@Param('id') id: string) {
    const data = await this.service.findOne(id);
    return { data };
  }

  @Post()
  async create(
    @Body() dto: CreateProviderSettlementDto,
    @CurrentUser('userId') userId: string,
    @CurrentUser('username') username: string,
  ) {
    const data = await this.service.create(dto, userId, username);
    return { data };
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateProviderSettlementDto,
    @CurrentUser('userId') userId: string,
    @CurrentUser('username') username: string,
  ) {
    const data = await this.service.update(id, dto, userId, username);
    return { data };
  }

  @Delete(':id')
  @HttpCode(204)
  async discard(
    @Param('id') id: string,
    @CurrentUser('userId') userId: string,
    @CurrentUser('username') username: string,
  ) {
    await this.service.discard(id, userId, username);
  }

  @Post(':id/post')
  async post(
    @Param('id') id: string,
    @CurrentUser('userId') userId: string,
    @CurrentUser('username') username: string,
  ) {
    const data = await this.service.post(id, userId, username);
    return { data };
  }

  @Post(':id/reverse')
  async reverse(
    @Param('id') id: string,
    @CurrentUser('userId') userId: string,
    @CurrentUser('username') username: string,
  ) {
    const data = await this.service.reverse(id, userId, username);
    return { data };
  }
}
