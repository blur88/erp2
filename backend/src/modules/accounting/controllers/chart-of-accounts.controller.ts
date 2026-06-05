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
import { ChartOfAccountsService } from '../services/chart-of-accounts.service';
import { Auth } from '../../auth/decorators/auth.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { UserRole } from '../../../database/entities/user.entity';
import {
  CreateChartOfAccountDto,
  UpdateChartOfAccountDto,
  QueryChartOfAccountsDto,
  ChartOfAccountResponseDto,
  ChartOfAccountListResponseDto,
  ChartOfAccountHierarchyDto,
  BulkChartOfAccountsDto,
  QueryRecentActivityDto,
  RecentActivityItemDto,
} from '../dto/chart-of-account.dto';

@ApiTags('Chart of Accounts')
@Controller('accounting/chart-of-accounts')
@Auth()
export class ChartOfAccountsController {
  constructor(
    private readonly chartOfAccountsService: ChartOfAccountsService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Get all chart of accounts' })
  @ApiResponse({
    status: 200,
    description: 'Returns paginated chart of accounts',
    type: ChartOfAccountListResponseDto,
  })
  async findAll(
    @Query() query: QueryChartOfAccountsDto,
  ): Promise<ChartOfAccountListResponseDto> {
    return this.chartOfAccountsService.findAll(query);
  }

  @Get('deleted')
  @ApiOperation({ summary: 'Get all soft-deleted accounts' })
  @ApiResponse({
    status: 200,
    description: 'Returns all soft-deleted accounts',
    type: [ChartOfAccountResponseDto],
  })
  async findDeleted(): Promise<ChartOfAccountResponseDto[]> {
    return this.chartOfAccountsService.findDeleted();
  }

  @Get('hierarchy')
  @ApiOperation({ summary: 'Get account hierarchy tree' })
  @ApiResponse({
    status: 200,
    description: 'Returns full account hierarchy with statistics',
    type: ChartOfAccountHierarchyDto,
  })
  async getHierarchy(): Promise<ChartOfAccountHierarchyDto> {
    return this.chartOfAccountsService.getAccountHierarchy();
  }

  @Get(':id/recent-activity')
  @ApiOperation({ summary: 'Get recent posted journal entries for an account' })
  @ApiParam({ name: 'id', description: 'Account ID' })
  @ApiResponse({
    status: 200,
    description: 'Returns recent activity items',
    type: [RecentActivityItemDto],
  })
  @ApiResponse({ status: 404, description: 'Account not found' })
  async getRecentActivity(
    @Param('id') id: string,
    @Query() query: QueryRecentActivityDto,
  ): Promise<RecentActivityItemDto[]> {
    return this.chartOfAccountsService.getRecentActivity(id, query.limit ?? 10);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get chart of account by ID' })
  @ApiParam({ name: 'id', description: 'Account ID' })
  @ApiResponse({
    status: 200,
    description: 'Returns account with parent and children',
    type: ChartOfAccountResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Account not found' })
  async findOne(@Param('id') id: string): Promise<ChartOfAccountResponseDto> {
    return this.chartOfAccountsService.findOne(id);
  }

  @Get(':id/children')
  @ApiOperation({ summary: 'Get direct children of an account' })
  @ApiParam({ name: 'id', description: 'Parent account ID' })
  @ApiResponse({
    status: 200,
    description: 'Returns direct child accounts',
    type: [ChartOfAccountResponseDto],
  })
  @ApiResponse({ status: 404, description: 'Parent account not found' })
  async getChildren(
    @Param('id') id: string,
  ): Promise<ChartOfAccountResponseDto[]> {
    return this.chartOfAccountsService.getChildren(id);
  }

  @Post()
  @Auth(UserRole.ADMIN, UserRole.MANAGER)
  @ApiOperation({ summary: 'Create a new chart of account' })
  @ApiResponse({
    status: 201,
    description: 'Account created successfully',
    type: ChartOfAccountResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid account data or parent type mismatch' })
  @ApiResponse({ status: 404, description: 'Parent account not found' })
  @ApiResponse({ status: 409, description: 'Account code already exists' })
  async create(
    @Body() createDto: CreateChartOfAccountDto,
    @CurrentUser('userId') currentUserId: string,
    @CurrentUser('username') currentUsername: string,
  ): Promise<ChartOfAccountResponseDto> {
    return this.chartOfAccountsService.create(createDto, currentUserId, currentUsername);
  }

  @Patch(':id')
  @Auth(UserRole.ADMIN, UserRole.MANAGER)
  @ApiOperation({ summary: 'Update a chart of account' })
  @ApiParam({ name: 'id', description: 'Account ID' })
  @ApiResponse({
    status: 200,
    description: 'Account updated successfully',
    type: ChartOfAccountResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid update data, circular reference, or parent type mismatch',
  })
  @ApiResponse({ status: 404, description: 'Account not found' })
  @ApiResponse({ status: 409, description: 'Account code already exists' })
  async update(
    @Param('id') id: string,
    @Body() updateDto: UpdateChartOfAccountDto,
    @CurrentUser('userId') currentUserId: string,
    @CurrentUser('username') currentUsername: string,
  ): Promise<ChartOfAccountResponseDto> {
    return this.chartOfAccountsService.update(id, updateDto, currentUserId, currentUsername);
  }

  @Delete('bulk-permanent')
  @Auth(UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Bulk permanently delete soft-deleted accounts' })
  @ApiResponse({
    status: 200,
    description: 'Bulk permanent delete completed',
  })
  async bulkPermanentDelete(
    @Body() body: BulkChartOfAccountsDto,
    @CurrentUser('userId') currentUserId: string,
    @CurrentUser('username') currentUsername: string,
  ): Promise<{
    message: string;
    deletedCount: number;
    failedIds: string[];
    failedItems: Array<{ id: string; reason: string }>;
  }> {
    const result = await this.chartOfAccountsService.bulkPermanentDelete(
      body.accountIds,
      currentUserId,
      currentUsername,
    );
    return {
      message: `Successfully deleted ${result.deletedCount} of ${body.accountIds.length} accounts`,
      deletedCount: result.deletedCount,
      failedIds: result.failedIds,
      failedItems: result.failedItems,
    };
  }

  @Delete(':id')
  @Auth(UserRole.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft delete a chart of account' })
  @ApiParam({ name: 'id', description: 'Account ID' })
  @ApiResponse({ status: 204, description: 'Account soft deleted successfully' })
  @ApiResponse({
    status: 400,
    description: 'Account has children or journal entry lines',
  })
  @ApiResponse({ status: 404, description: 'Account not found' })
  async remove(
    @Param('id') id: string,
    @CurrentUser('userId') currentUserId: string,
    @CurrentUser('username') currentUsername: string,
  ): Promise<void> {
    await this.chartOfAccountsService.remove(id, currentUserId, currentUsername);
  }

  @Delete(':id/permanent')
  @Auth(UserRole.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Permanently delete a chart of account' })
  @ApiParam({ name: 'id', description: 'Account ID' })
  @ApiResponse({ status: 204, description: 'Account permanently deleted' })
  @ApiResponse({
    status: 400,
    description: 'Account has children, journal entry lines, or is not soft-deleted',
  })
  @ApiResponse({ status: 404, description: 'Account not found' })
  async permanentDelete(
    @Param('id') id: string,
    @CurrentUser('userId') currentUserId: string,
    @CurrentUser('username') currentUsername: string,
  ): Promise<void> {
    await this.chartOfAccountsService.permanentDelete(id, currentUserId, currentUsername);
  }

  @Post(':id/restore')
  @Auth(UserRole.ADMIN, UserRole.MANAGER)
  @ApiOperation({ summary: 'Restore a soft-deleted account' })
  @ApiParam({ name: 'id', description: 'Account ID' })
  @ApiResponse({
    status: 200,
    description: 'Account restored successfully',
    type: ChartOfAccountResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Account is not deleted' })
  @ApiResponse({ status: 404, description: 'Account not found' })
  @ApiResponse({ status: 409, description: 'Account code now used by another account' })
  async restore(
    @Param('id') id: string,
    @CurrentUser('userId') currentUserId: string,
    @CurrentUser('username') currentUsername: string,
  ): Promise<ChartOfAccountResponseDto> {
    return this.chartOfAccountsService.restore(id, currentUserId, currentUsername);
  }

  @Post('bulk-restore')
  @Auth(UserRole.ADMIN, UserRole.MANAGER)
  @ApiOperation({ summary: 'Bulk restore soft-deleted accounts' })
  @ApiResponse({
    status: 200,
    description: 'Bulk restore completed',
  })
  async bulkRestore(
    @Body() body: BulkChartOfAccountsDto,
    @CurrentUser('userId') currentUserId: string,
    @CurrentUser('username') currentUsername: string,
  ): Promise<{ message: string; restoredCount: number; failedIds: string[] }> {
    const result = await this.chartOfAccountsService.bulkRestore(
      body.accountIds,
      currentUserId,
      currentUsername,
    );
    return {
      message: `Successfully restored ${result.restoredCount} of ${body.accountIds.length} accounts`,
      restoredCount: result.restoredCount,
      failedIds: result.failedIds,
    };
  }

  @Post('seed')
  @Auth(UserRole.ADMIN)
  @ApiOperation({ summary: 'Seed default chart of accounts' })
  @ApiResponse({
    status: 201,
    description: 'Default accounts created successfully (30+ accounts)',
  })
  @ApiResponse({
    status: 400,
    description: 'Chart of accounts already seeded',
  })
  async seedDefaults(
    @CurrentUser('userId') currentUserId: string,
    @CurrentUser('username') currentUsername: string,
  ): Promise<{ message: string }> {
    await this.chartOfAccountsService.seedDefaultChartOfAccounts(currentUserId, currentUsername);
    return {
      message:
        'Default chart of accounts seeded successfully with 30+ accounts',
    };
  }
}
