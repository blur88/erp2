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
import { ReconciliationService } from '../services/reconciliation.service';
import {
  CreateBankReconciliationDto,
  UpdateBankReconciliationDto,
  QueryBankReconciliationsDto,
  ToggleClearedDto,
  BankReconciliationResponseDto,
  BankReconciliationListResponseDto,
} from '../dto/reconciliation.dto';

@ApiTags('Bank Reconciliation')
@Controller('accounting/bank-reconciliations')
export class ReconciliationController {
  constructor(private readonly reconciliationService: ReconciliationService) {}

  @Get()
  @ApiOperation({ summary: 'Get all bank reconciliations' })
  @ApiResponse({
    status: 200,
    description: 'Returns paginated bank reconciliations',
    type: BankReconciliationListResponseDto,
  })
  async findAll(
    @Query() query: QueryBankReconciliationsDto,
  ): Promise<BankReconciliationListResponseDto> {
    return this.reconciliationService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get bank reconciliation by ID with transactions' })
  @ApiParam({ name: 'id', description: 'Bank reconciliation ID' })
  @ApiResponse({
    status: 200,
    description: 'Returns bank reconciliation with transaction details',
    type: BankReconciliationResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Bank reconciliation not found' })
  async findOne(@Param('id') id: string): Promise<BankReconciliationResponseDto> {
    return this.reconciliationService.findOne(id);
  }

  @Post()
  @ApiOperation({ summary: 'Start a new bank reconciliation' })
  @ApiResponse({
    status: 201,
    description: 'Bank reconciliation created with unreconciled transactions loaded',
    type: BankReconciliationResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Validation error or duplicate in-progress reconciliation',
  })
  @ApiResponse({ status: 404, description: 'Account or fiscal period not found' })
  async create(
    @Body() createDto: CreateBankReconciliationDto,
  ): Promise<BankReconciliationResponseDto> {
    return this.reconciliationService.create(createDto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update bank reconciliation (statement balance, date)' })
  @ApiParam({ name: 'id', description: 'Bank reconciliation ID' })
  @ApiResponse({
    status: 200,
    description: 'Bank reconciliation updated',
    type: BankReconciliationResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Cannot update completed reconciliation' })
  @ApiResponse({ status: 404, description: 'Bank reconciliation not found' })
  async update(
    @Param('id') id: string,
    @Body() updateDto: UpdateBankReconciliationDto,
  ): Promise<BankReconciliationResponseDto> {
    return this.reconciliationService.update(id, updateDto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete bank reconciliation (only in-progress)' })
  @ApiParam({ name: 'id', description: 'Bank reconciliation ID' })
  @ApiResponse({ status: 204, description: 'Bank reconciliation deleted' })
  @ApiResponse({ status: 400, description: 'Cannot delete completed reconciliation' })
  @ApiResponse({ status: 404, description: 'Bank reconciliation not found' })
  async remove(@Param('id') id: string): Promise<void> {
    await this.reconciliationService.remove(id);
  }

  @Post(':id/mark-cleared')
  @ApiOperation({ summary: 'Mark journal entry lines as cleared' })
  @ApiParam({ name: 'id', description: 'Bank reconciliation ID' })
  @ApiResponse({
    status: 200,
    description: 'Transactions marked as cleared',
    type: BankReconciliationResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Cannot modify completed reconciliation' })
  async markCleared(
    @Param('id') id: string,
    @Body() dto: ToggleClearedDto,
  ): Promise<BankReconciliationResponseDto> {
    return this.reconciliationService.markCleared(id, dto);
  }

  @Post(':id/unmark-cleared')
  @ApiOperation({ summary: 'Unmark journal entry lines (set cleared = false)' })
  @ApiParam({ name: 'id', description: 'Bank reconciliation ID' })
  @ApiResponse({
    status: 200,
    description: 'Transactions unmarked',
    type: BankReconciliationResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Cannot modify completed reconciliation' })
  async unmarkCleared(
    @Param('id') id: string,
    @Body() dto: ToggleClearedDto,
  ): Promise<BankReconciliationResponseDto> {
    return this.reconciliationService.unmarkCleared(id, dto);
  }

  @Post(':id/complete')
  @ApiOperation({ summary: 'Complete bank reconciliation (must be balanced)' })
  @ApiParam({ name: 'id', description: 'Bank reconciliation ID' })
  @ApiResponse({
    status: 200,
    description: 'Reconciliation completed',
    type: BankReconciliationResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Reconciliation is not balanced or already completed',
  })
  async complete(@Param('id') id: string): Promise<BankReconciliationResponseDto> {
    return this.reconciliationService.complete(id);
  }

  @Post(':id/reopen')
  @ApiOperation({ summary: 'Reopen a completed bank reconciliation' })
  @ApiParam({ name: 'id', description: 'Bank reconciliation ID' })
  @ApiResponse({
    status: 200,
    description: 'Reconciliation reopened',
    type: BankReconciliationResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Not a completed reconciliation' })
  async reopen(@Param('id') id: string): Promise<BankReconciliationResponseDto> {
    return this.reconciliationService.reopen(id);
  }
}
