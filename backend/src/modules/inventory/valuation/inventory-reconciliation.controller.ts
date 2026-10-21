import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Put } from '@nestjs/common';
import { Auth } from '../../auth/decorators/auth.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import { Permission, VALUATION_PREPARER_ROLES } from '../../auth/permissions';
import { InventoryReconciliationService } from './inventory-reconciliation.service';

@Controller('inventory/valuation/reconciliations')
@Auth(...VALUATION_PREPARER_ROLES)
export class InventoryReconciliationController {
  constructor(private readonly service: InventoryReconciliationService) {}
  @Post() create(@CurrentUser() user:{userId:string}) { return this.service.create(user); }
  @Get() findAll() { return this.service.findAll(); }
  @Get(':id') findOne(@Param('id',ParseUUIDPipe) id:string) { return this.service.findOne(id); }
  @Get(':id/preparation-report') report(@Param('id',ParseUUIDPipe) id:string) { return this.service.preparationReport(id); }
  @Get(':id/readiness') readiness(@Param('id',ParseUUIDPipe) id:string) { return this.service.readiness(id); }
  @Patch(':id/positions/:productId') patchPosition(@Param('id',ParseUUIDPipe) id:string,@Param('productId',ParseUUIDPipe) productId:string,@Body() body:any) { return this.service.patchPosition(id,productId,body); }
  @Put(':id/journal-lines') putLines(@Param('id',ParseUUIDPipe) id:string,@Body() body:{lines:any[];differenceExplanation?:string}) { return this.service.putJournalLines(id,body.lines,body.differenceExplanation); }
  @Post(':id/approve') @RequirePermission(Permission.INVENTORY_VALUATION_APPROVE) approve(@Param('id',ParseUUIDPipe) id:string,@CurrentUser() user:{userId:string}) { return this.service.approve(id,user); }
  @Post(':id/reopen') reopen(@Param('id',ParseUUIDPipe) id:string) { return this.service.reopen(id); }
  @Post(':id/abort') abort(@Param('id',ParseUUIDPipe) id:string) { return this.service.abort(id); }
}
