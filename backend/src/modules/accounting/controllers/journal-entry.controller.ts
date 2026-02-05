import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { JournalEntryService } from '../services/journal-entry.service';
import {
  CreateJournalEntryDto,
  UpdateJournalEntryDto,
  QueryJournalEntriesDto,
  JournalEntryResponseDto,
  JournalEntryListResponseDto,
} from '../dto/journal-entry.dto';

@ApiTags('Journal Entries')
@Controller('accounting/journal-entries')
export class JournalEntryController {
  constructor(private readonly journalEntryService: JournalEntryService) {}

  @Get()
  @ApiOperation({ summary: 'Get all journal entries' })
  @ApiResponse({
    status: 200,
    description: 'Returns paginated journal entries',
    type: JournalEntryListResponseDto,
  })
  async findAll(
    @Query() query: QueryJournalEntriesDto,
  ): Promise<JournalEntryListResponseDto> {
    return this.journalEntryService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get journal entry by ID' })
  @ApiParam({ name: 'id', description: 'Journal entry ID' })
  @ApiResponse({
    status: 200,
    description: 'Returns journal entry with lines and relations',
    type: JournalEntryResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Journal entry not found' })
  async findOne(@Param('id') id: string): Promise<JournalEntryResponseDto> {
    return this.journalEntryService.findOne(id);
  }

  @Post()
  @ApiOperation({ summary: 'Create a new journal entry' })
  @ApiResponse({
    status: 201,
    description: 'Journal entry created successfully with DRAFT status',
    type: JournalEntryResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid entry data or validation failed' })
  @ApiResponse({ status: 404, description: 'Fiscal period or account not found' })
  @ApiResponse({ status: 409, description: 'Reference number already exists' })
  async create(
    @Body() createDto: CreateJournalEntryDto,
  ): Promise<JournalEntryResponseDto> {
    return this.journalEntryService.create(createDto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a journal entry' })
  @ApiParam({ name: 'id', description: 'Journal entry ID' })
  @ApiResponse({
    status: 200,
    description: 'Journal entry updated successfully',
    type: JournalEntryResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Can only update DRAFT entries or validation failed',
  })
  @ApiResponse({ status: 404, description: 'Journal entry not found' })
  async update(
    @Param('id') id: string,
    @Body() updateDto: UpdateJournalEntryDto,
  ): Promise<JournalEntryResponseDto> {
    return this.journalEntryService.update(id, updateDto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a journal entry' })
  @ApiParam({ name: 'id', description: 'Journal entry ID' })
  @ApiResponse({ status: 204, description: 'Journal entry deleted successfully' })
  @ApiResponse({
    status: 400,
    description: 'Can only delete DRAFT entries or entry has been reversed',
  })
  @ApiResponse({ status: 404, description: 'Journal entry not found' })
  async remove(@Param('id') id: string): Promise<void> {
    await this.journalEntryService.remove(id);
  }

  @Post(':id/post')
  @ApiOperation({ summary: 'Post a draft journal entry' })
  @ApiParam({ name: 'id', description: 'Journal entry ID' })
  @ApiResponse({
    status: 200,
    description: 'Journal entry posted successfully, status changed to POSTED',
    type: JournalEntryResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Entry is not balanced, period is closed, or not a DRAFT entry',
  })
  @ApiResponse({ status: 404, description: 'Journal entry not found' })
  async postEntry(@Param('id') id: string): Promise<JournalEntryResponseDto> {
    return this.journalEntryService.postEntry(id);
  }

  @Post(':id/reverse')
  @ApiOperation({ summary: 'Reverse a posted journal entry' })
  @ApiParam({ name: 'id', description: 'Journal entry ID to reverse' })
  @ApiResponse({
    status: 201,
    description: 'Reversal entry created successfully with mirror lines',
    type: JournalEntryResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Entry is not POSTED, already reversed, or period is closed',
  })
  @ApiResponse({ status: 404, description: 'Journal entry not found' })
  async reverseEntry(@Param('id') id: string): Promise<JournalEntryResponseDto> {
    return this.journalEntryService.reverseEntry(id);
  }
}
