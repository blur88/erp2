import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { Auth } from '../../auth/decorators/auth.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { UserRole } from '../../../database/entities/user.entity';
import { FundTransferService } from '../services/fund-transfer.service';
import {
  CreateFundTransferDto,
  QueryFundTransfersDto,
} from '../dto/fund-transfer.dto';

@Controller('accounting/fund-transfers')
@Auth()
export class FundTransferController {
  constructor(
    private readonly fundTransferService: FundTransferService,
  ) {}

  @Get()
  findAll(@Query() query: QueryFundTransfersDto) {
    return this.fundTransferService.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.fundTransferService.findOne(id);
  }

  @Post()
  @Auth(UserRole.ADMIN, UserRole.MANAGER)
  create(
    @Body() dto: CreateFundTransferDto,
    @CurrentUser('userId') userId: string,
    @CurrentUser('username') username: string,
  ) {
    return this.fundTransferService.create(dto, userId, username);
  }

  @Post(':id/cancel')
  @Auth(UserRole.ADMIN, UserRole.MANAGER)
  cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('userId') userId: string,
    @CurrentUser('username') username: string,
  ) {
    return this.fundTransferService.cancel(id, userId, username);
  }
}
