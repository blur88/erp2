import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Body,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Auth } from '../../auth/decorators/auth.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { UserRole } from '../../../database/entities/user.entity';
import { SettlementService } from '../services/settlement.service';
import {
  CreateSettlementDto,
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
  @ApiOperation({ summary: 'Create settlement' })
  @ApiResponse({ status: 201, type: SettlementResponseDto })
  async create(
    @Body() dto: CreateSettlementDto,
    @CurrentUser('userId') currentUserId: string,
    @CurrentUser('username') currentUsername: string,
  ): Promise<SettlementResponseDto> {
    return this.settlementService.create(dto, currentUserId, currentUsername);
  }

  @Post(':id/cancel')
  @Auth(UserRole.ADMIN)
  @ApiOperation({ summary: 'Cancel settlement and revert payments to pending' })
  @ApiParam({ name: 'id', description: 'Settlement ID' })
  @ApiResponse({ status: 200, type: SettlementResponseDto })
  async cancel(
    @Param('id') id: string,
    @CurrentUser('userId') currentUserId: string,
    @CurrentUser('username') currentUsername: string,
  ): Promise<SettlementResponseDto> {
    return this.settlementService.cancel(id, currentUserId, currentUsername);
  }
}
