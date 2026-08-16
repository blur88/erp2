import { Controller, Get, Post, Patch, Body, Param, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam } from '@nestjs/swagger';
import { Auth } from '../../auth/decorators/auth.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { OwnerEquityService } from '../services/owner-equity.service';
import { OwnerEquitySettlementService } from '../services/owner-equity-settlement.service';
import { OwnerEquityStockService } from '../services/owner-equity-stock.service';
import {
  CreateOwnerEquityDto,
  UpdateOwnerEquityDto,
  SettleOwnerEquityDto,
  RefundOwnerEquityDto,
  ListOwnerEquityQueryDto,
} from '../dto/create-owner-equity.dto';
import { OwnerEquityType } from '../entities/owner-equity-document.entity';

@Auth()
@ApiTags('Owner Equity')
@Controller('accounting/owner-equity')
export class OwnerEquityController {
  constructor(
    private readonly service: OwnerEquityService,
    private readonly settlementService: OwnerEquitySettlementService,
    private readonly stockService: OwnerEquityStockService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List owner equity documents with filters and pagination' })
  async list(@Query() query: ListOwnerEquityQueryDto) {
    return this.service.list(query);
  }

  @Get(':referenceNumber')
  @ApiOperation({ summary: 'Get an owner equity document by reference number' })
  @ApiParam({ name: 'referenceNumber', description: 'Owner equity reference number (e.g. EQ-26-001)' })
  async findByReference(@Param('referenceNumber') referenceNumber: string) {
    const data = await this.service.findByReference(referenceNumber);
    return { data };
  }

  @Post()
  @ApiOperation({ summary: 'Create an owner equity document in DRAFT' })
  async create(
    @Body() dto: CreateOwnerEquityDto,
    @CurrentUser('userId') userId: string,
    @CurrentUser('username') username: string,
  ) {
    const data = await this.service.create(dto, userId, username);
    return { data };
  }

  @Patch(':referenceNumber')
  @ApiOperation({ summary: 'Update a draft owner equity document' })
  @ApiParam({ name: 'referenceNumber', description: 'Owner equity reference number' })
  async update(
    @Param('referenceNumber') referenceNumber: string,
    @Body() dto: UpdateOwnerEquityDto,
    @CurrentUser('userId') userId: string,
    @CurrentUser('username') username: string,
  ) {
    const data = await this.service.update(referenceNumber, dto, userId, username);
    return { data };
  }

  @Post(':referenceNumber/settle')
  @ApiOperation({ summary: 'Record settlements on a monetary owner equity document' })
  @ApiParam({ name: 'referenceNumber', description: 'Owner equity reference number' })
  async settle(
    @Param('referenceNumber') referenceNumber: string,
    @Body() dto: SettleOwnerEquityDto,
    @CurrentUser('userId') userId: string,
    @CurrentUser('username') username: string,
  ) {
    const data = await this.settlementService.settle(referenceNumber, dto, userId, username);
    return { data };
  }

  @Post(':referenceNumber/refund')
  @ApiOperation({ summary: 'Refund settlements on a monetary owner equity document' })
  @ApiParam({ name: 'referenceNumber', description: 'Owner equity reference number' })
  async refund(
    @Param('referenceNumber') referenceNumber: string,
    @Body() dto: RefundOwnerEquityDto,
    @CurrentUser('userId') userId: string,
    @CurrentUser('username') username: string,
  ) {
    const data = await this.settlementService.refund(referenceNumber, dto, userId, username);
    return { data };
  }

  @Post(':referenceNumber/complete')
  @ApiOperation({ summary: 'Complete an owner equity document' })
  @ApiParam({ name: 'referenceNumber', description: 'Owner equity reference number' })
  async complete(
    @Param('referenceNumber') referenceNumber: string,
    @CurrentUser('userId') userId: string,
    @CurrentUser('username') username: string,
  ) {
    // Complete lives in two services split by type: monetary documents must be
    // READY and post nothing, stock drawings move inventory at cost. Dispatch
    // on the immutable type so one route serves both (spec §6).
    const doc = await this.service.findByReference(referenceNumber);
    const data =
      doc.type === OwnerEquityType.STOCK_DRAWING
        ? await this.stockService.complete(referenceNumber, userId, username)
        : await this.service.complete(referenceNumber, userId, username);
    return { data };
  }

  @Post(':referenceNumber/uncomplete')
  @ApiOperation({ summary: 'Uncomplete a completed owner equity document' })
  @ApiParam({ name: 'referenceNumber', description: 'Owner equity reference number' })
  async uncomplete(
    @Param('referenceNumber') referenceNumber: string,
    @CurrentUser('userId') userId: string,
    @CurrentUser('username') username: string,
  ) {
    const doc = await this.service.findByReference(referenceNumber);
    const data =
      doc.type === OwnerEquityType.STOCK_DRAWING
        ? await this.stockService.uncomplete(referenceNumber, userId, username)
        : await this.service.uncomplete(referenceNumber, userId, username);
    return { data };
  }

  @Post(':referenceNumber/cancel')
  @ApiOperation({ summary: 'Cancel a draft owner equity document' })
  @ApiParam({ name: 'referenceNumber', description: 'Owner equity reference number' })
  async cancel(
    @Param('referenceNumber') referenceNumber: string,
    @CurrentUser('userId') userId: string,
    @CurrentUser('username') username: string,
  ) {
    const data = await this.service.cancel(referenceNumber, userId, username);
    return { data };
  }

  @Post(':referenceNumber/uncancel')
  @ApiOperation({ summary: 'Uncancel a cancelled owner equity document' })
  @ApiParam({ name: 'referenceNumber', description: 'Owner equity reference number' })
  async uncancel(
    @Param('referenceNumber') referenceNumber: string,
    @CurrentUser('userId') userId: string,
    @CurrentUser('username') username: string,
  ) {
    const data = await this.service.uncancel(referenceNumber, userId, username);
    return { data };
  }
}
