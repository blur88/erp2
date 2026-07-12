import { Controller, Get, Post, Patch, Body, Param, Query, Req } from '@nestjs/common';
import { Auth } from '../../auth/decorators/auth.decorator';
import { ChartOfAccountService } from '../services/chart-of-account.service';
import { CreateAccountDto } from '../dto/create-account.dto';
import { UpdateAccountDto } from '../dto/update-account.dto';

@Auth()
@Controller('accounting/accounts')
export class ChartOfAccountController {
  constructor(private readonly service: ChartOfAccountService) {}

  @Get('tree')
  tree() { return this.service.findTree(); }

  @Get()
  list(@Query('type') type?: string, @Query('activeOnly') activeOnly?: string, @Query('postableOnly') postableOnly?: string) {
    return this.service.list({ type, activeOnly: activeOnly === 'true', postableOnly: postableOnly === 'true' });
  }

  @Post()
  create(@Body() dto: CreateAccountDto, @Req() req: any) {
    return this.service.create(dto, req?.user?.username ?? 'system');
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateAccountDto, @Req() req: any) {
    return this.service.update(id, dto, req?.user?.username ?? 'system');
  }
}
