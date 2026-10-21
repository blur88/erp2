import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { Auth } from '../../auth/decorators/auth.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import { Permission, VALUATION_PREPARER_ROLES } from '../../auth/permissions';
import { CostingMethodChangeService } from './costing-method-change.service';

@Controller('inventory/valuation/method-changes')
@Auth(...VALUATION_PREPARER_ROLES)
export class CostingMethodChangeController {
  constructor(private readonly service: CostingMethodChangeService) {}
  @Post() propose(@Body() body: { toMethod: 'AVERAGE'|'FIFO'; effectiveDate: string; explanation: string }, @CurrentUser() user: { userId: string }) { return this.service.propose(body,user); }
  @Get() findAll() { return this.service.findAll(); }
  @Get(':id') findOne(@Param('id',ParseUUIDPipe) id: string) { return this.service.findOne(id); }
  @Patch(':id') edit(@Param('id',ParseUUIDPipe) id: string, @Body() body: { toMethod?: 'AVERAGE'|'FIFO'; effectiveDate?: string; explanation?: string }, @CurrentUser() user: { userId: string }) { return this.service.edit(id,body,user); }
  @Post(':id/refresh-preview') refresh(@Param('id',ParseUUIDPipe) id: string, @CurrentUser() user: { userId: string }) { return this.service.refreshPreview(id,user); }
  @Post(':id/approve') @RequirePermission(Permission.INVENTORY_VALUATION_APPROVE) approve(@Param('id',ParseUUIDPipe) id: string, @CurrentUser() user: { userId: string }) { return this.service.approve(id,user); }
  @Post(':id/withdraw') withdraw(@Param('id',ParseUUIDPipe) id: string, @CurrentUser() user: { userId: string }) { return this.service.withdraw(id,user); }
}
