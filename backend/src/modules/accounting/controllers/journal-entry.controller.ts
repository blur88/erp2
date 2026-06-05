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
} from "@nestjs/common";
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from "@nestjs/swagger";
import { JournalEntryService } from "../services/journal-entry.service";
import { AccountingService } from "../services/accounting.service";
import { Auth } from "../../auth/decorators/auth.decorator";
import { CurrentUser } from "../../auth/decorators/current-user.decorator";
import { UserRole } from "../../../database/entities/user.entity";
import {
  CreateJournalEntryDto,
  UpdateJournalEntryDto,
  QueryJournalEntriesDto,
  JournalEntryResponseDto,
  JournalEntryListResponseDto,
  PostOpeningBalancesDto,
  BulkOperationDto,
  BulkOperationResultDto,
} from "../dto/journal-entry.dto";

@ApiTags("Journal Entries")
@Controller("accounting/journal-entries")
@Auth()
export class JournalEntryController {
  constructor(
    private readonly journalEntryService: JournalEntryService,
    private readonly accountingService: AccountingService,
  ) {}

  @Get()
  @ApiOperation({ summary: "Get all journal entries" })
  @ApiResponse({
    status: 200,
    description: "Returns paginated journal entries",
    type: JournalEntryListResponseDto,
  })
  async findAll(
    @Query() query: QueryJournalEntriesDto,
  ): Promise<JournalEntryListResponseDto> {
    return this.journalEntryService.findAll(query);
  }

  @Post("opening-balances")
  @Auth(UserRole.ADMIN)
  @ApiOperation({ summary: "Post opening balances" })
  @ApiResponse({
    status: 201,
    description: "Opening balance entry created and posted",
    type: JournalEntryResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: "Invalid balances or no open period",
  })
  async postOpeningBalances(
    @Body() dto: PostOpeningBalancesDto,
    @CurrentUser("userId") currentUserId: string,
    @CurrentUser("username") currentUsername: string,
  ): Promise<JournalEntryResponseDto> {
    return this.accountingService.postOpeningBalances(
      dto,
      currentUserId,
      currentUsername,
    ) as any;
  }

  @Post("bulk-post")
  @Auth(UserRole.ADMIN, UserRole.MANAGER)
  @ApiOperation({ summary: "Post multiple draft journal entries" })
  @ApiResponse({
    status: 200,
    description: "Bulk post results",
    type: BulkOperationResultDto,
  })
  async bulkPost(
    @Body() dto: BulkOperationDto,
    @CurrentUser("userId") currentUserId: string,
    @CurrentUser("username") currentUsername: string,
  ): Promise<BulkOperationResultDto> {
    return this.journalEntryService.bulkPost(
      dto.ids,
      currentUserId,
      currentUsername,
    );
  }

  @Post("bulk-delete")
  @Auth(UserRole.ADMIN)
  @ApiOperation({ summary: "Delete multiple draft journal entries" })
  @ApiResponse({
    status: 200,
    description: "Bulk delete results",
    type: BulkOperationResultDto,
  })
  async bulkDelete(
    @Body() dto: BulkOperationDto,
    @CurrentUser("userId") currentUserId: string,
    @CurrentUser("username") currentUsername: string,
  ): Promise<BulkOperationResultDto> {
    return this.journalEntryService.bulkDelete(
      dto.ids,
      currentUserId,
      currentUsername,
    );
  }

  @Get(":id")
  @ApiOperation({ summary: "Get journal entry by ID" })
  @ApiParam({ name: "id", description: "Journal entry ID" })
  @ApiResponse({
    status: 200,
    description: "Returns journal entry with lines and relations",
    type: JournalEntryResponseDto,
  })
  @ApiResponse({ status: 404, description: "Journal entry not found" })
  async findOne(@Param("id") id: string): Promise<JournalEntryResponseDto> {
    return this.journalEntryService.findOne(id);
  }

  @Post()
  @Auth(UserRole.ADMIN, UserRole.MANAGER)
  @ApiOperation({ summary: "Create a new journal entry" })
  @ApiResponse({
    status: 201,
    description: "Journal entry created successfully with DRAFT status",
    type: JournalEntryResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: "Invalid entry data or validation failed",
  })
  @ApiResponse({
    status: 404,
    description: "Fiscal period or account not found",
  })
  @ApiResponse({ status: 409, description: "Reference number already exists" })
  async create(
    @Body() createDto: CreateJournalEntryDto,
    @CurrentUser("userId") currentUserId: string,
    @CurrentUser("username") currentUsername: string,
  ): Promise<JournalEntryResponseDto> {
    return this.journalEntryService.create(
      createDto,
      currentUserId,
      currentUsername,
    );
  }

  @Patch(":id")
  @Auth(UserRole.ADMIN, UserRole.MANAGER)
  @ApiOperation({ summary: "Update a journal entry" })
  @ApiParam({ name: "id", description: "Journal entry ID" })
  @ApiResponse({
    status: 200,
    description: "Journal entry updated successfully",
    type: JournalEntryResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: "Can only update DRAFT entries or validation failed",
  })
  @ApiResponse({ status: 404, description: "Journal entry not found" })
  async update(
    @Param("id") id: string,
    @Body() updateDto: UpdateJournalEntryDto,
    @CurrentUser("userId") currentUserId: string,
    @CurrentUser("username") currentUsername: string,
  ): Promise<JournalEntryResponseDto> {
    return this.journalEntryService.update(
      id,
      updateDto,
      currentUserId,
      currentUsername,
    );
  }

  @Delete(":id")
  @Auth(UserRole.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Delete a journal entry" })
  @ApiParam({ name: "id", description: "Journal entry ID" })
  @ApiResponse({
    status: 204,
    description: "Journal entry deleted successfully",
  })
  @ApiResponse({
    status: 400,
    description: "Can only delete DRAFT entries or entry has been reversed",
  })
  @ApiResponse({ status: 404, description: "Journal entry not found" })
  async remove(
    @Param("id") id: string,
    @CurrentUser("userId") currentUserId: string,
    @CurrentUser("username") currentUsername: string,
  ): Promise<void> {
    await this.journalEntryService.remove(id, currentUserId, currentUsername);
  }

  @Post(":id/post")
  @Auth(UserRole.ADMIN, UserRole.MANAGER)
  @ApiOperation({ summary: "Post a draft journal entry" })
  @ApiParam({ name: "id", description: "Journal entry ID" })
  @ApiResponse({
    status: 200,
    description: "Journal entry posted successfully, status changed to POSTED",
    type: JournalEntryResponseDto,
  })
  @ApiResponse({
    status: 400,
    description:
      "Entry is not balanced, period is closed, or not a DRAFT entry",
  })
  @ApiResponse({ status: 404, description: "Journal entry not found" })
  async postEntry(
    @Param("id") id: string,
    @CurrentUser("userId") currentUserId: string,
    @CurrentUser("username") currentUsername: string,
  ): Promise<JournalEntryResponseDto> {
    return this.journalEntryService.postEntry(
      id,
      currentUserId,
      currentUsername,
    );
  }

  @Post(":id/reverse")
  @Auth(UserRole.ADMIN, UserRole.MANAGER)
  @ApiOperation({ summary: "Reverse a posted journal entry" })
  @ApiParam({ name: "id", description: "Journal entry ID to reverse" })
  @ApiResponse({
    status: 201,
    description: "Reversal entry created successfully with mirror lines",
    type: JournalEntryResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: "Entry is not POSTED, already reversed, or period is closed",
  })
  @ApiResponse({ status: 404, description: "Journal entry not found" })
  async reverseEntry(
    @Param("id") id: string,
    @CurrentUser("userId") currentUserId: string,
    @CurrentUser("username") currentUsername: string,
  ): Promise<JournalEntryResponseDto> {
    return this.journalEntryService.reverseEntry(
      id,
      currentUserId,
      currentUsername,
    );
  }
}
