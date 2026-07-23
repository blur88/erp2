import { BadRequestException, Controller, Get, Post, Patch, Body, Param, Query, Req } from '@nestjs/common';
import { Auth } from '../../auth/decorators/auth.decorator';
import { UserRole } from '../../../database/entities/user.entity';
import { AccountType } from '../entities/account-type.enum';
import { ChartOfAccountService } from '../services/chart-of-account.service';
import { CreateAccountDto } from '../dto/create-account.dto';
import { UpdateAccountDto } from '../dto/update-account.dto';

// Reads are open to any authenticated role (#895); writes stay admin-only.
@Auth()
@Controller('accounting/accounts')
export class ChartOfAccountController {
  constructor(private readonly service: ChartOfAccountService) {}

  @Get('tree')
  tree(@Query('search') search?: string, @Query('type') type?: string, @Query('isActive') isActive?: string) {
    if (isActive !== undefined && isActive !== 'true' && isActive !== 'false') {
      throw new BadRequestException('isActive must be "true" or "false"');
    }
    if (type !== undefined && !Object.values(AccountType).includes(type as AccountType)) {
      throw new BadRequestException(`type must be one of: ${Object.values(AccountType).join(', ')}`);
    }
    return this.service.findTree({
      search,
      type: type as AccountType | undefined,
      isActive: isActive === undefined ? undefined : isActive === 'true',
    });
  }

  @Get()
  list(@Query('type') type?: string, @Query('activeOnly') activeOnly?: string, @Query('postableOnly') postableOnly?: string) {
    return this.service.list({ type, activeOnly: activeOnly === 'true', postableOnly: postableOnly === 'true' });
  }

  @Post()
  @Auth(UserRole.ADMIN)
  create(@Body() dto: CreateAccountDto, @Req() req: any) {
    return this.service.create(dto, req?.user?.username ?? 'system');
  }

  @Patch(':id')
  @Auth(UserRole.ADMIN)
  update(@Param('id') id: string, @Body() dto: UpdateAccountDto, @Req() req: any) {
    return this.service.update(id, dto, req?.user?.username ?? 'system');
  }
}
