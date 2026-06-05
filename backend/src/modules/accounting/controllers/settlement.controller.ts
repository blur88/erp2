import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Auth } from '../../auth/decorators/auth.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { UserRole } from '../../../database/entities/user.entity';
import { SettlementService } from '../services/settlement.service';
import {
  CreateSettlementDto,
  UpdateSettlementDto,
  QuerySettlementsDto,
  SettlementListResponseDto,
  SettlementResponseDto,
  PendingPaymentsSummaryDto,
} from '../dto/settlement.dto';

@ApiTags('Settlements')
@Controller('accounting/settlements')
@Auth()
export class SettlementController {
  constructor(private readonly settlementService: SettlementService) {}

  @Get()
  @ApiOperation({ summary: 'Get all settlements' })
  @ApiResponse({ status: 200, type: SettlementListResponseDto })
  async findAll(@Query() query: QuerySettlementsDto): Promise<SettlementListResponseDto> {
    return this.settlementService.findAll(query);
  }

  @Get('deleted')
  @Auth(UserRole.ADMIN)
  @ApiOperation({ summary: 'Get soft-deleted settlements' })
  @ApiResponse({ status: 200, type: [SettlementResponseDto] })
  async getDeleted(): Promise<SettlementResponseDto[]> {
    return this.settlementService.getDeleted();
  }

  @Get('pending-summary')
  @ApiOperation({ summary: 'Get pending settlement summary grouped by payment method' })
  @ApiResponse({ status: 200, type: [PendingPaymentsSummaryDto] })
  async getPendingSummary(): Promise<PendingPaymentsSummaryDto[]> {
    return this.settlementService.getPendingSettlementsSummary();
  }

  @Get('pending-payments/:paymentMethodId')
  @ApiOperation({ summary: 'Get pending payments for settlement by payment method' })
  @ApiParam({ name: 'paymentMethodId', description: 'Payment method ID' })
  async getPendingPayments(@Param('paymentMethodId') paymentMethodId: string) {
    return this.settlementService.getPendingPayments(paymentMethodId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get settlement by ID' })
  @ApiParam({ name: 'id', description: 'Settlement ID' })
  @ApiResponse({ status: 200, type: SettlementResponseDto })
  async findOne(@Param('id') id: string): Promise<SettlementResponseDto> {
    return this.settlementService.findOne(id);
  }

  @Post()
  @Auth(UserRole.ADMIN, UserRole.MANAGER)
  @ApiOperation({ summary: 'Create settlement draft' })
  @ApiResponse({ status: 201, type: SettlementResponseDto })
  async create(
    @Body() dto: CreateSettlementDto,
    @CurrentUser('userId') currentUserId: string,
    @CurrentUser('username') currentUsername: string,
  ): Promise<SettlementResponseDto> {
    return this.settlementService.create(dto, currentUserId, currentUsername);
  }

  @Patch(':id')
  @Auth(UserRole.ADMIN, UserRole.MANAGER)
  @ApiOperation({ summary: 'Update settlement metadata' })
  @ApiParam({ name: 'id', description: 'Settlement ID' })
  @ApiResponse({ status: 200, type: SettlementResponseDto })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateSettlementDto,
    @CurrentUser('userId') currentUserId: string,
    @CurrentUser('username') currentUsername: string,
  ): Promise<SettlementResponseDto> {
    return this.settlementService.update(id, dto, currentUserId, currentUsername);
  }

  @Post(':id/post')
  @Auth(UserRole.ADMIN, UserRole.MANAGER)
  @ApiOperation({ summary: 'Post settlement' })
  @ApiParam({ name: 'id', description: 'Settlement ID' })
  @ApiResponse({ status: 200, type: SettlementResponseDto })
  async post(
    @Param('id') id: string,
    @CurrentUser('userId') currentUserId: string,
    @CurrentUser('username') currentUsername: string,
  ): Promise<SettlementResponseDto> {
    return this.settlementService.post(id, currentUserId, currentUsername);
  }

  @Post(':id/reverse')
  @Auth(UserRole.ADMIN)
  @ApiOperation({ summary: 'Reverse posted settlement' })
  @ApiParam({ name: 'id', description: 'Settlement ID' })
  @ApiResponse({ status: 200, type: SettlementResponseDto })
  async reverse(
    @Param('id') id: string,
    @CurrentUser('userId') currentUserId: string,
    @CurrentUser('username') currentUsername: string,
  ): Promise<SettlementResponseDto> {
    return this.settlementService.reverse(id, currentUserId, currentUsername);
  }

  @Delete(':id')
  @Auth(UserRole.ADMIN)
  @ApiOperation({ summary: 'Soft delete settlement' })
  @ApiParam({ name: 'id', description: 'Settlement ID' })
  async remove(
    @Param('id') id: string,
    @CurrentUser('userId') currentUserId: string,
    @CurrentUser('username') currentUsername: string,
  ): Promise<void> {
    return this.settlementService.remove(id, currentUserId, currentUsername);
  }

  @Post(':id/restore')
  @Auth(UserRole.ADMIN)
  @ApiOperation({ summary: 'Restore soft-deleted settlement' })
  @ApiParam({ name: 'id', description: 'Settlement ID' })
  @ApiResponse({ status: 200, type: SettlementResponseDto })
  async restore(
    @Param('id') id: string,
    @CurrentUser('userId') currentUserId: string,
    @CurrentUser('username') currentUsername: string,
  ): Promise<SettlementResponseDto> {
    return this.settlementService.restore(id, currentUserId, currentUsername);
  }

  @Delete(':id/permanent')
  @Auth(UserRole.ADMIN)
  @ApiOperation({ summary: 'Permanently delete soft-deleted settlement' })
  @ApiParam({ name: 'id', description: 'Settlement ID' })
  async permanentDelete(
    @Param('id') id: string,
    @CurrentUser('userId') currentUserId: string,
    @CurrentUser('username') currentUsername: string,
  ): Promise<void> {
    return this.settlementService.permanentDelete(id, currentUserId, currentUsername);
  }
}
