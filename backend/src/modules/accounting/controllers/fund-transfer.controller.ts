import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { Auth } from '../../auth/decorators/auth.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { UserRole } from '../../../database/entities/user.entity';
import { FundTransferService } from '../services/fund-transfer.service';
import {
  CreateFundTransferDto,
  UpdateFundTransferDto,
  QueryFundTransfersDto,
} from '../dto/fund-transfer.dto';

@Controller('accounting/fund-transfers')
@Auth()
export class FundTransferController {
  constructor(private readonly fundTransferService: FundTransferService) {}

  @Get()
  findAll(@Query() query: QueryFundTransfersDto) {
    return this.fundTransferService.findAll(query);
  }

  // NOTE: 'deleted' must be before ':id' — NestJS matches routes in declaration order
  @Get('deleted')
  getDeleted() {
    return this.fundTransferService.getDeleted();
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

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.fundTransferService.findOne(id);
  }

  @Patch(':id')
  @Auth(UserRole.ADMIN, UserRole.MANAGER)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateFundTransferDto,
    @CurrentUser('userId') userId: string,
    @CurrentUser('username') username: string,
  ) {
    return this.fundTransferService.update(id, dto, userId, username);
  }

  @Delete(':id')
  @Auth(UserRole.ADMIN)
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('userId') userId: string,
    @CurrentUser('username') username: string,
  ) {
    return this.fundTransferService.remove(id, userId, username);
  }

  @Post(':id/post')
  @Auth(UserRole.ADMIN, UserRole.MANAGER)
  post(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('userId') userId: string,
    @CurrentUser('username') username: string,
  ) {
    return this.fundTransferService.post(id, userId, username);
  }

  @Post(':id/unpost')
  @Auth(UserRole.ADMIN)
  unpost(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('userId') userId: string,
    @CurrentUser('username') username: string,
  ) {
    return this.fundTransferService.unpost(id, userId, username);
  }

  @Post(':id/restore')
  @Auth(UserRole.ADMIN)
  restore(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('userId') userId: string,
    @CurrentUser('username') username: string,
  ) {
    return this.fundTransferService.restore(id, userId, username);
  }

  @Delete(':id/permanent')
  @Auth(UserRole.ADMIN)
  permanentDelete(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('userId') userId: string,
    @CurrentUser('username') username: string,
  ) {
    return this.fundTransferService.permanentDelete(id, userId, username);
  }
}
