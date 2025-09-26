import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  Query,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { 
  CreditManagementService, 
  CreditApprovalRequest, 
  CreditApprovalResponse,
  CreditApprovalStatus,
  CreditHold,
} from '../services/credit-management.service';
import { CreditCheckResponseDto } from '../dto/customer.dto';

@ApiTags('Credit Management')
@Controller('api/credit')
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
  async requestCreditIncrease(
    @Body() request: Omit<CreditApprovalRequest, 'requestedByUserId'>,
  ): Promise<CreditApprovalResponse> {
    // Auth removed - using system user
    return this.creditManagementService.requestCreditIncrease({
      ...request,
      requestedByUserId: 'system',
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
  async approveCredit(
    @Param('approvalId') approvalId: string,
    @Body() approvalData: { comments?: string },
  ): Promise<CreditApprovalResponse> {
    // Auth removed - using system user
    return this.creditManagementService.approveCreditRequest(
      approvalId,
      'system',
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
  async rejectCredit(
    @Param('approvalId') approvalId: string,
    @Body() rejectionData: { comments: string },
  ): Promise<CreditApprovalResponse> {
    // Auth removed - using system user
    return this.creditManagementService.rejectCreditRequest(
      approvalId,
      'system',
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
  async getPendingApprovals(
    @Query('userId') userId?: string,
  ): Promise<CreditApprovalResponse[]> {
    return this.creditManagementService.getPendingApprovals(userId);
  }

  @Get('approvals/history')
  @ApiOperation({ summary: 'Get credit approval history' })
  @ApiQuery({ name: 'customerId', required: false, description: 'Filter by customer ID' })
  @ApiResponse({
    status: 200,
    description: 'Approval history retrieved successfully',
    type: 'array',
  })
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
  async placeCreditHold(
    @Body() holdData: {
      customerId: string;
      amount: number;
      reason: string;
      orderId?: string;
      expirationHours?: number;
    },
  ): Promise<CreditHold> {
    // Auth removed - using system user
    return this.creditManagementService.placeCreditHold(
      holdData.customerId,
      holdData.amount,
      holdData.reason,
      'system',
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
  async releaseCreditHold(
    @Param('holdId') holdId: string,
  ): Promise<CreditHold> {
    // Auth removed - using system user
    return this.creditManagementService.releaseCreditHold(holdId, 'system');
  }

  @Get('holds/customer/:customerId')
  @ApiOperation({ summary: 'Get active credit holds for customer' })
  @ApiParam({ name: 'customerId', description: 'Customer ID', type: 'string' })
  @ApiResponse({
    status: 200,
    description: 'Active credit holds retrieved successfully',
    type: 'array',
  })
  async getActiveCreditHolds(
    @Param('customerId', ParseUUIDPipe) customerId: string,
  ): Promise<CreditHold[]> {
    return this.creditManagementService.getActiveCreditHoldsList(customerId);
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
  async getCreditRisk(
    @Param('customerId', ParseUUIDPipe) customerId: string,
  ) {
    return this.creditManagementService.getCreditRisk(customerId);
  }
}