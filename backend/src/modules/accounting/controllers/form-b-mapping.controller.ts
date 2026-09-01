// backend/src/modules/accounting/controllers/form-b-mapping.controller.ts
import { Controller, Get, Put, Body, Param, ParseUUIDPipe } from '@nestjs/common';
import { Auth } from '../../auth/decorators/auth.decorator';
import { UserRole } from '../../../database/entities/user.entity';
import { FormBMappingService } from '../services/form-b-mapping.service';
import { UpdateFormBMappingDto } from '../dto/update-form-b-mapping.dto';

@Auth()
@Controller('accounting/form-b-mappings')
export class FormBMappingController {
  constructor(private readonly service: FormBMappingService) {}

  @Get()
  list() {
    return this.service.list();
  }

  @Put(':accountId')
  @Auth(UserRole.ADMIN)
  update(
    @Param('accountId', ParseUUIDPipe) accountId: string,
    @Body() dto: UpdateFormBMappingDto,
  ) {
    return this.service.setCategory(accountId, dto.category);
  }
}
