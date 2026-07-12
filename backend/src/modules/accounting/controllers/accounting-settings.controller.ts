import { Controller, Get, Put, Body, Req } from '@nestjs/common';
import { Auth } from '../../auth/decorators/auth.decorator';
import { UserRole } from '../../../database/entities/user.entity';
import { AccountingSettingsService } from '../services/accounting-settings.service';
import { UpdateAccountingSettingsDto } from '../dto/update-accounting-settings.dto';

// Reads are open to any authenticated role (#895). The PUT stays admin-only: these
// mappings decide which GL accounts sales/purchasing auto-post into, so a non-admin
// rewiring them would silently corrupt every subsequent posting.
@Auth()
@Controller('accounting/settings')
export class AccountingSettingsController {
  constructor(private readonly service: AccountingSettingsService) {}
  @Get() get() { return this.service.get(); }
  @Put()
  @Auth(UserRole.ADMIN)
  update(@Body() dto: UpdateAccountingSettingsDto, @Req() req: any) {
    return this.service.update(dto, req?.user?.username ?? 'system');
  }
}
