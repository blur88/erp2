import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  Query,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { Roles } from '../../../common/decorators/auth.decorator';
import { CurrentUser } from '../../../common/decorators/user.decorator';
import { UserRole, User } from '../../../database/entities/user.entity';
import { 
  CreditManagementService, 
  CreditApprovalRequest, 
  CreditApprovalResponse,
  CreditApprovalStatus,
  CreditHold,
} from '../services/credit-management.service';
import { CreditCheckResponseDto } from '../dto/customer.dto';

@ApiTags('Credit Management')
@ApiBearerAuth()
@Controller('api/v1/credit')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CreditManagementController {
  constructor(private readonly creditManagementService: CreditManagementService) {}

  @Post('check')
  @ApiOperation({ summary: 'Check customer credit limit' })
  @ApiResponse({
    status: 200,
    description: 'Credit check completed successfully',
    type: CreditCheckResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Customer not found' })
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.SALES_REP)
  async checkCredit(
    @Body() checkDto: { customerId: string; amount: number },
  ): Promise<CreditCheckResponseDto> {
    return this.creditManagementService.checkCredit(checkDto.customerId, checkDto.amount);
  }

  @Post('request-increase')
  @ApiOperation({ summary: 'Request credit limit increase' })
  @ApiResponse({
    status: 201,
    description: 'Credit increase request created successfully',
    schema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        customerId: { type: 'string' },
        customerName: { type: 'string' },
        currentCreditLimit: { type: 'number' },
        requestedCreditLimit: { type: 'number' },
        requestedAmount: { type: 'number' },
        reason: { type: 'string' },
        businessJustification: { type: 'string' },
        status: { enum: Object.values(CreditApprovalStatus) },
        requestedByUserId: { type: 'string' },
        requestedByUserName: { type: 'string' },
        requestedAt: { type: 'string', format: 'date-time' },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Invalid request data' })
  @ApiResponse({ status: 404, description: 'Customer not found' })
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.SALES_REP)
  async requestCreditIncrease(
    @Body() request: Omit<CreditApprovalRequest, 'requestedByUserId'>,
    @CurrentUser() user: User,
  ): Promise<CreditApprovalResponse> {
    return this.creditManagementService.requestCreditIncrease({
      ...request,
      requestedByUserId: user.id,
    });
  }

  @Put('approval/:approvalId/approve')
  @ApiOperation({ summary: 'Approve credit increase request' })
  @ApiParam({ name: 'approvalId', description: 'Approval request ID', type: 'string' })
  @ApiResponse({
    status: 200,
    description: 'Credit increase approved successfully',
  })
  @ApiResponse({ status: 404, description: 'Approval request not found' })
  @ApiResponse({ status: 400, description: 'Request already processed' })
  @ApiResponse({ status: 403, description: 'User does not have authority to approve this credit limit' })
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  async approveCredit(
    @Param('approvalId') approvalId: string,
    @Body() approvalData: { comments?: string },
    @CurrentUser() user: User,
  ): Promise<CreditApprovalResponse> {
    return this.creditManagementService.approveCreditRequest(
      approvalId,
      user.id,
      approvalData.comments,
    );
  }

  @Put('approval/:approvalId/reject')
  @ApiOperation({ summary: 'Reject credit increase request' })
  @ApiParam({ name: 'approvalId', description: 'Approval request ID', type: 'string' })
  @ApiResponse({
    status: 200,
    description: 'Credit increase rejected successfully',
  })
  @ApiResponse({ status: 404, description: 'Approval request not found' })
  @ApiResponse({ status: 400, description: 'Request already processed or missing rejection comments' })
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  async rejectCredit(
    @Param('approvalId') approvalId: string,
    @Body() rejectionData: { comments: string },
    @CurrentUser() user: User,
  ): Promise<CreditApprovalResponse> {
    return this.creditManagementService.rejectCreditRequest(
      approvalId,
      user.id,
      rejectionData.comments,
    );
  }

  @Get('approvals/pending')
  @ApiOperation({ summary: 'Get pending credit approval requests' })
  @ApiQuery({ name: 'userId', required: false, description: 'Filter by user approval authority' })
  @ApiResponse({
    status: 200,
    description: 'Pending approval requests retrieved successfully',
    type: 'array',
  })
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  async getPendingApprovals(
    @Query('userId') userId?: string,
    @CurrentUser() user?: User,
  ): Promise<CreditApprovalResponse[]> {
    const filterUserId = userId || (user?.role === UserRole.MANAGER ? user.id : undefined);
    return this.creditManagementService.getPendingApprovals(filterUserId);
  }

  @Get('approvals/history')
  @ApiOperation({ summary: 'Get credit approval history' })
  @ApiQuery({ name: 'customerId', required: false, description: 'Filter by customer ID' })
  @ApiResponse({
    status: 200,
    description: 'Approval history retrieved successfully',
    type: 'array',
  })
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.SALES_REP)
  async getApprovalHistory(
    @Query('customerId') customerId?: string,
  ): Promise<CreditApprovalResponse[]> {
    return this.creditManagementService.getApprovalHistory(customerId);
  }

  @Post('hold')
  @ApiOperation({ summary: 'Place credit hold' })
  @ApiResponse({
    status: 201,
    description: 'Credit hold placed successfully',
    schema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        customerId: { type: 'string' },
        amount: { type: 'number' },
        reason: { type: 'string' },
        orderId: { type: 'string' },
        expiresAt: { type: 'string', format: 'date-time' },
        createdByUserId: { type: 'string' },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Insufficient available credit for hold' })
  @ApiResponse({ status: 404, description: 'Customer not found' })
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.SALES_REP)
  async placeCreditHold(
    @Body() holdData: {
      customerId: string;
      amount: number;
      reason: string;
      orderId?: string;
      expirationHours?: number;
    },
    @CurrentUser() user: User,
  ): Promise<CreditHold> {
    return this.creditManagementService.placeCreditHold(
      holdData.customerId,
      holdData.amount,
      holdData.reason,
      user.id,
      holdData.orderId,
      holdData.expirationHours,
    );
  }

  @Put('hold/:holdId/release')
  @ApiOperation({ summary: 'Release credit hold' })
  @ApiParam({ name: 'holdId', description: 'Credit hold ID', type: 'string' })
  @ApiResponse({
    status: 200,
    description: 'Credit hold released successfully',
  })
  @ApiResponse({ status: 404, description: 'Credit hold not found' })
  @ApiResponse({ status: 400, description: 'Credit hold already released' })
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.SALES_REP)
  async releaseCreditHold(
    @Param('holdId') holdId: string,
    @CurrentUser() user: User,
  ): Promise<CreditHold> {
    return this.creditManagementService.releaseCreditHold(holdId, user.id);
  }

  @Get('holds/customer/:customerId')
  @ApiOperation({ summary: 'Get active credit holds for customer' })
  @ApiParam({ name: 'customerId', description: 'Customer ID', type: 'string' })
  @ApiResponse({
    status: 200,
    description: 'Active credit holds retrieved successfully',
    type: 'array',
  })
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.SALES_REP, UserRole.USER)
  async getActiveCreditHolds(
    @Param('customerId', ParseUUIDPipe) customerId: string,
  ): Promise<CreditHold[]> {
    return this.creditManagementService.getActiveCreditHolds(customerId);
  }

  @Get('utilization/:customerId')
  @ApiOperation({ summary: 'Get customer credit utilization' })
  @ApiParam({ name: 'customerId', description: 'Customer ID', type: 'string' })
  @ApiResponse({
    status: 200,
    description: 'Credit utilization retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        creditLimit: { type: 'number' },
        currentBalance: { type: 'number' },
        availableCredit: { type: 'number' },
        utilizationPercentage: { type: 'number' },
        activeCreditHolds: { type: 'number' },
        effectiveAvailableCredit: { type: 'number' },
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Customer not found' })
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.SALES_REP, UserRole.USER)
  async getCreditUtilization(
    @Param('customerId', ParseUUIDPipe) customerId: string,
  ) {
    return this.creditManagementService.getCreditUtilization(customerId);
  }

  @Get('risk-assessment/:customerId')
  @ApiOperation({ summary: 'Get customer credit risk assessment' })
  @ApiParam({ name: 'customerId', description: 'Customer ID', type: 'string' })
  @ApiResponse({
    status: 200,
    description: 'Credit risk assessment retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        riskScore: { type: 'number' },
        riskLevel: { enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] },
        factors: { type: 'array', items: { type: 'string' } },
        recommendations: { type: 'array', items: { type: 'string' } },
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Customer not found' })
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.SALES_REP)
  async getCreditRisk(
    @Param('customerId', ParseUUIDPipe) customerId: string,
  ) {
    return this.creditManagementService.getCreditRisk(customerId);
  }
}