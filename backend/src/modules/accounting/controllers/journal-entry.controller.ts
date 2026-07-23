import { Controller, Get, Param, Query } from '@nestjs/common';
import { Auth } from '../../auth/decorators/auth.decorator';
import { JournalEntryService } from '../services/journal-entry.service';
import { ListJournalEntriesDto } from '../dto/list-journal-entries.dto';

@Auth()
@Controller('accounting/journal-entries')
export class JournalEntryController {
  constructor(private readonly service: JournalEntryService) {}
  @Get() list(@Query() query: ListJournalEntriesDto) {
    return this.service.list(query);
  }
  @Get(':id') findOne(@Param('id') id: string) { return this.service.findOne(id); }
}
