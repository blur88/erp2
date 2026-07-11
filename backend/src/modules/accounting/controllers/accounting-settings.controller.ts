import { Controller, Get, Put, Body, Req } from '@nestjs/common';
import { Auth } from '../../auth/decorators/auth.decorator';
import { UserRole } from '../../../database/entities/user.entity';
import { AccountingSettingsService } from '../services/accounting-settings.service';
import { UpdateAccountingSettingsDto } from '../dto/update-accounting-settings.dto';

@Auth(UserRole.ADMIN)
@Controller('accounting/settings')
export class AccountingSettingsController {
  constructor(private readonly service: AccountingSettingsService) {}
  @Get() get() { return this.service.get(); }
  @Put() update(@Body() dto: UpdateAccountingSettingsDto, @Req() req: any) {
    return this.service.update(dto, req?.user?.username ?? 'system');
  }
}
