import { Controller, Get, Put, Body } from '@nestjs/common';
import { Auth } from '../../auth/decorators/auth.decorator';
import { UserRole } from '../../../database/entities/user.entity';
import { PaymentMethodMappingService } from '../services/payment-method-mapping.service';
import { BulkUpdatePaymentMethodMappingsDto } from '../dto/bulk-update-payment-method-mappings.dto';

// Reads are open to any authenticated role, matching the settings GET (#895).
// The PUT stays admin-only: these mappings decide which GL account every
// payment posts into.
@Auth()
@Controller('accounting/settings/payment-method-mappings')
export class PaymentMethodMappingController {
  constructor(private readonly service: PaymentMethodMappingService) {}

  @Get()
  list() {
    return this.service.list();
  }

  @Put()
  @Auth(UserRole.ADMIN)
  update(@Body() dto: BulkUpdatePaymentMethodMappingsDto) {
    return this.service.setMappings(dto.mappings);
  }
}
