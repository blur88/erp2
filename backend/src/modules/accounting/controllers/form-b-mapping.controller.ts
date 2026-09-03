// backend/src/modules/accounting/controllers/form-b-mapping.controller.ts
import { Controller, Get, Put, Body, Param, ParseUUIDPipe } from '@nestjs/common';
import { Auth } from '../../auth/decorators/auth.decorator';
import { UserRole } from '../../../database/entities/user.entity';
import { FormBMappingService } from '../services/form-b-mapping.service';
import { UpdateFormBMappingDto } from '../dto/update-form-b-mapping.dto';
import { BulkUpdateFormBMappingsDto } from '../dto/bulk-update-form-b-mappings.dto';

@Auth()
@Controller('accounting/form-b-mappings')
export class FormBMappingController {
  constructor(private readonly service: FormBMappingService) {}

  @Get()
  list() {
    return this.service.list();
  }

  /*
   * Declared BEFORE the parameterized route, per this repo's route-order rule.
   * Returns the refreshed mapping list so the client reconciles from server
   * truth rather than assuming its own draft was applied verbatim.
   */
  @Put()
  @Auth(UserRole.ADMIN)
  updateMany(@Body() dto: BulkUpdateFormBMappingsDto) {
    return this.service.setCategories(dto.mappings);
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
