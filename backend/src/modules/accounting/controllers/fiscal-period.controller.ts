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
import { FiscalPeriodService } from '../services/fiscal-period.service';
import { Auth } from '../../auth/decorators/auth.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { UserRole } from '../../../database/entities/user.entity';
import {
  CreateFiscalPeriodDto,
  UpdateFiscalPeriodDto,
  QueryFiscalPeriodsDto,
  GenerateFiscalPeriodsDto,
  ValidatePeriodDto,
  FiscalPeriodResponseDto,
  FiscalPeriodListResponseDto,
  FiscalPeriodValidationResponseDto,
} from '../dto/fiscal-period.dto';

@ApiTags('Fiscal Periods')
@Controller('accounting/fiscal-periods')
@Auth()
export class FiscalPeriodController {
  constructor(private readonly fiscalPeriodService: FiscalPeriodService) {}

  @Get()
  @ApiOperation({ summary: 'Get all fiscal periods' })
  @ApiResponse({
    status: 200,
    description: 'Returns paginated fiscal periods',
    type: FiscalPeriodListResponseDto,
  })
  async findAll(
    @Query() query: QueryFiscalPeriodsDto,
  ): Promise<FiscalPeriodListResponseDto> {
    return this.fiscalPeriodService.findAll(query);
  }

  @Get('current')
  @ApiOperation({ summary: 'Get current open period based on today\'s date' })
  @ApiResponse({
    status: 200,
    description: 'Returns current open fiscal period',
    type: FiscalPeriodResponseDto,
  })
  @ApiResponse({ status: 404, description: 'No current open period found' })
  async getCurrentPeriod(): Promise<FiscalPeriodResponseDto | null> {
    return this.fiscalPeriodService.getCurrentPeriod();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get fiscal period by ID' })
  @ApiParam({ name: 'id', description: 'Fiscal period ID' })
  @ApiResponse({
    status: 200,
    description: 'Returns fiscal period',
    type: FiscalPeriodResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Fiscal period not found' })
  async findOne(@Param('id') id: string): Promise<FiscalPeriodResponseDto> {
    return this.fiscalPeriodService.findOne(id);
  }

  @Post()
  @Auth(UserRole.ADMIN)
  @ApiOperation({ summary: 'Create a new fiscal period' })
  @ApiResponse({
    status: 201,
    description: 'Fiscal period created successfully',
    type: FiscalPeriodResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid date range (start >= end)',
  })
  @ApiResponse({
    status: 409,
    description: 'Period code already exists or dates overlap with existing period',
  })
  async create(
    @Body() createDto: CreateFiscalPeriodDto,
    @CurrentUser('userId') currentUserId: string,
    @CurrentUser('username') currentUsername: string,
  ): Promise<FiscalPeriodResponseDto> {
    return this.fiscalPeriodService.create(createDto, currentUserId, currentUsername);
  }

  @Patch(':id')
  @Auth(UserRole.ADMIN)
  @ApiOperation({ summary: 'Update a fiscal period' })
  @ApiParam({ name: 'id', description: 'Fiscal period ID' })
  @ApiResponse({
    status: 200,
    description: 'Fiscal period updated successfully',
    type: FiscalPeriodResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid date range or dates overlap',
  })
  @ApiResponse({ status: 404, description: 'Fiscal period not found' })
  @ApiResponse({ status: 409, description: 'Period code already exists' })
  async update(
    @Param('id') id: string,
    @Body() updateDto: UpdateFiscalPeriodDto,
    @CurrentUser('userId') currentUserId: string,
    @CurrentUser('username') currentUsername: string,
  ): Promise<FiscalPeriodResponseDto> {
    return this.fiscalPeriodService.update(id, updateDto, currentUserId, currentUsername);
  }

  @Delete(':id')
  @Auth(UserRole.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a fiscal period' })
  @ApiParam({ name: 'id', description: 'Fiscal period ID' })
  @ApiResponse({ status: 204, description: 'Fiscal period deleted successfully' })
  @ApiResponse({
    status: 400,
    description: 'Period has journal entries',
  })
  @ApiResponse({ status: 404, description: 'Fiscal period not found' })
  async remove(
    @Param('id') id: string,
    @CurrentUser('userId') currentUserId: string,
    @CurrentUser('username') currentUsername: string,
  ): Promise<void> {
    await this.fiscalPeriodService.remove(id, currentUserId, currentUsername);
  }

  @Post(':id/restore')
  @Auth(UserRole.ADMIN)
  @ApiOperation({ summary: 'Restore a soft-deleted fiscal period' })
  @ApiParam({ name: 'id', description: 'Fiscal period ID' })
  @ApiResponse({
    status: 200,
    description: 'Fiscal period restored successfully',
    type: FiscalPeriodResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Period is not deleted' })
  @ApiResponse({ status: 404, description: 'Fiscal period not found' })
  @ApiResponse({ status: 409, description: 'Period code now used by another period' })
  async restore(
    @Param('id') id: string,
    @CurrentUser('userId') currentUserId: string,
    @CurrentUser('username') currentUsername: string,
  ): Promise<FiscalPeriodResponseDto> {
    return this.fiscalPeriodService.restore(id, currentUserId, currentUsername);
  }

  @Post('generate')
  @Auth(UserRole.ADMIN)
  @ApiOperation({ summary: 'Generate fiscal periods for a year' })
  @ApiResponse({
    status: 201,
    description: '12 monthly fiscal periods created successfully',
    type: [FiscalPeriodResponseDto],
  })
  @ApiResponse({
    status: 409,
    description: 'Some periods already exist (skipped)',
  })
  async generatePeriods(
    @Body() dto: GenerateFiscalPeriodsDto,
    @CurrentUser('userId') currentUserId: string,
    @CurrentUser('username') currentUsername: string,
  ): Promise<FiscalPeriodResponseDto[]> {
    return this.fiscalPeriodService.generateFiscalPeriods(dto, currentUserId, currentUsername);
  }

  @Post(':id/close')
  @Auth(UserRole.ADMIN)
  @ApiOperation({ summary: 'Close a fiscal period' })
  @ApiParam({ name: 'id', description: 'Fiscal period ID' })
  @ApiResponse({
    status: 200,
    description: 'Fiscal period closed successfully',
    type: FiscalPeriodResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Period already closed or has unposted draft entries',
  })
  @ApiResponse({ status: 404, description: 'Fiscal period not found' })
  async closePeriod(
    @Param('id') id: string,
    @CurrentUser('userId') currentUserId: string,
    @CurrentUser('username') currentUsername: string,
  ): Promise<FiscalPeriodResponseDto> {
    return this.fiscalPeriodService.closePeriod(id, currentUserId, currentUsername);
  }

  @Post(':id/reopen')
  @Auth(UserRole.ADMIN)
  @ApiOperation({ summary: 'Reopen a closed fiscal period' })
  @ApiParam({ name: 'id', description: 'Fiscal period ID' })
  @ApiResponse({
    status: 200,
    description: 'Fiscal period reopened successfully',
    type: FiscalPeriodResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Period already open or not the most recently closed period',
  })
  @ApiResponse({ status: 404, description: 'Fiscal period not found' })
  async reopenPeriod(
    @Param('id') id: string,
    @CurrentUser('userId') currentUserId: string,
    @CurrentUser('username') currentUsername: string,
  ): Promise<FiscalPeriodResponseDto> {
    return this.fiscalPeriodService.reopenPeriod(id, currentUserId, currentUsername);
  }

  @Post('validate')
  @ApiOperation({ summary: 'Validate if a date falls within an open period' })
  @ApiResponse({
    status: 200,
    description: 'Returns validation result with matched period if valid',
    type: FiscalPeriodValidationResponseDto,
  })
  async validatePeriod(
    @Body() dto: ValidatePeriodDto,
  ): Promise<FiscalPeriodValidationResponseDto> {
    return this.fiscalPeriodService.validatePeriod(dto);
  }
}
