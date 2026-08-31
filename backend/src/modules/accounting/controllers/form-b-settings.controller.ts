// backend/src/modules/accounting/controllers/form-b-settings.controller.ts
import { Controller, Get, Put, Body } from '@nestjs/common';
import { Auth } from '../../auth/decorators/auth.decorator';
import { UserRole } from '../../../database/entities/user.entity';
import { FormBSettingsService } from '../services/form-b-settings.service';
import { UpdateFormBSettingsDto } from '../dto/update-form-b-settings.dto';

// Reads open to any authenticated role; writes admin-only, matching
// AccountingSettingsController (accounting-settings.controller.ts:10,16).
@Auth()
@Controller('accounting/form-b-settings')
export class FormBSettingsController {
  constructor(private readonly service: FormBSettingsService) {}

  @Get()
  get() {
    return this.service.resolve();
  }

  @Put()
  @Auth(UserRole.ADMIN)
  update(@Body() dto: UpdateFormBSettingsDto) {
    return this.service.update(dto);
  }
}
