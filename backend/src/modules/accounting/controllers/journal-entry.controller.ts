import { Controller, Get, Param, Query } from '@nestjs/common';
import { Auth } from '../../auth/decorators/auth.decorator';
import { UserRole } from '../../../database/entities/user.entity';
import { JournalEntryService } from '../services/journal-entry.service';

@Auth(UserRole.ADMIN)
@Controller('accounting/journal-entries')
export class JournalEntryController {
  constructor(private readonly service: JournalEntryService) {}
  @Get() list(@Query('page') page?: string, @Query('limit') limit?: string) {
    return this.service.list({ page: page ? +page : undefined, limit: limit ? +limit : undefined });
  }
  @Get(':id') findOne(@Param('id') id: string) { return this.service.findOne(id); }
}
