import { Controller, Get, Put, Body } from '@nestjs/common';
import { Auth } from '../../auth/decorators/auth.decorator';
import { UserRole } from '../../../database/entities/user.entity';
import { BalanceSheetGroupService } from '../services/balance-sheet-group.service';
import { SetBalanceSheetGroupsDto } from '../dto/set-balance-sheet-groups.dto';

// Reads are open to any authenticated role, matching the settings GET (#895).
// The PUT stays admin-only: these groupings decide which accounts appear under
// N38 and N39 on a statutory report.
@Auth()
@Controller('accounting/settings/balance-sheet-groups')
export class BalanceSheetGroupController {
  constructor(private readonly service: BalanceSheetGroupService) {}

  @Get()
  list() {
    return this.service.list();
  }

  @Put()
  @Auth(UserRole.ADMIN)
  update(@Body() dto: SetBalanceSheetGroupsDto) {
    return this.service.setGroups(dto.groups);
  }
}
