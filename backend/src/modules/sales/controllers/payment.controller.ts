import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  Query,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiQuery } from '@nestjs/swagger';
import { PaymentService } from '../services/payment.service';
import {
  CreatePaymentDto,
  UpdatePaymentDto,
  QueryPaymentsDto,
  PaymentResponseDto,
  RefundPaymentDto,
  AllocatePaymentDto,
  PaymentSummaryDto,
} from '../dto/payment.dto';
import { UserRole } from '../../../database/entities/user.entity';
import { Auth } from '../../auth/decorators/auth.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { PaymentStatisticsQueryDto } from '../../../common/dto/report-date-query.dto';

@ApiTags('Payments')
@Controller('payments')
export class PaymentController {
  constructor(private readonly paymentService: PaymentService) {}

  @Auth(UserRole.ADMIN)
  @Post()
  @ApiOperation({ summary: 'Record a new payment' })
  @ApiResponse({
    status: 201,
    description: 'Payment recorded successfully',
    type: PaymentResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid input data' })
  @ApiResponse({ status: 404, description: 'Customer or invoice not found' })
  async recordPayment(
    @Body() createPaymentDto: CreatePaymentDto,
    @CurrentUser('userId') currentUserId: string,
    @CurrentUser('username') currentUsername: string,
  ): Promise<PaymentResponseDto> {
    return this.paymentService.create(createPaymentDto, currentUserId, currentUsername);
  }

  @Get()
  @ApiOperation({ summary: 'Get all payments with filtering' })
  @ApiResponse({
    status: 200,
    description: 'List of payments retrieved successfully',
    type: [PaymentResponseDto],
  })
  @ApiQuery({
    name: 'customerId',
    required: false,
    description: 'Filter by customer ID',
  })
  @ApiQuery({
    name: 'invoiceId',
    required: false,
    description: 'Filter by invoice ID',
  })
  @ApiQuery({
    name: 'paymentMethod',
    required: false,
    description: 'Filter by payment method',
  })
  @ApiQuery({
    name: 'status',
    required: false,
    description: 'Filter by status',
  })
  @ApiQuery({
    name: 'type',
    required: false,
    description: 'Filter by payment type',
  })
  @ApiQuery({
    name: 'fromDate',
    required: false,
    description: 'Filter payments from date',
  })
  @ApiQuery({
    name: 'toDate',
    required: false,
    description: 'Filter payments to date',
  })
  @ApiQuery({
    name: 'referenceNumber',
    required: false,
    description: 'Search by reference number',
  })
  @ApiQuery({ name: 'sortBy', required: false, description: 'Sort field' })
  @ApiQuery({
    name: 'sortOrder',
    required: false,
    enum: ['ASC', 'DESC'],
    description: 'Sort order',
  })
  async getAllPayments(@Query() query: QueryPaymentsDto) {
    return this.paymentService.findAll(query);
  }



  @Get(':id')
  @ApiOperation({ summary: 'Get payment by ID' })
  @ApiParam({ name: 'id', description: 'Payment ID', type: 'string' })
  @ApiResponse({
    status: 200,
    description: 'Payment retrieved successfully',
    type: PaymentResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Payment not found' })
  async getPaymentById(@Param('id', ParseUUIDPipe) id: string): Promise<PaymentResponseDto> {
    return this.paymentService.findById(id);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update payment' })
  @ApiParam({ name: 'id', description: 'Payment ID', type: 'string' })
  @ApiResponse({
    status: 200,
    description: 'Payment updated successfully',
    type: PaymentResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Payment not found' })
  @ApiResponse({
    status: 400,
    description: 'Invalid input data or status transition',
  })
  async updatePayment(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updatePaymentDto: UpdatePaymentDto,
    @CurrentUser('userId') currentUserId: string,
    @CurrentUser('username') currentUsername: string,
  ): Promise<PaymentResponseDto> {
    return this.paymentService.update(id, updatePaymentDto, currentUserId, currentUsername);
  }

  @Post('refund')
  @ApiOperation({ summary: 'Process a payment refund' })
  @ApiResponse({
    status: 201,
    description: 'Refund processed successfully',
    type: PaymentResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Payment not found' })
  @ApiResponse({
    status: 400,
    description: 'Payment cannot be refunded or invalid amount',
  })
  async refundPayment(
    @Body() refundDto: RefundPaymentDto,
    @CurrentUser('userId') currentUserId: string,
    @CurrentUser('username') currentUsername: string,
  ): Promise<PaymentResponseDto> {
    return this.paymentService.refund(refundDto, currentUserId, currentUsername);
  }

  @Post('allocate')
  @ApiOperation({ summary: 'Allocate payment to multiple invoices' })
  @ApiResponse({
    status: 200,
    description: 'Payment allocated successfully',
    type: PaymentResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Payment or invoice not found' })
  @ApiResponse({ status: 400, description: 'Invalid allocation amounts' })
  async allocatePayment(
    @Param('id', ParseUUIDPipe) paymentId: string,
    @Body() allocationDto: AllocatePaymentDto,
  ): Promise<PaymentResponseDto> {
    return this.paymentService.allocatePayment(paymentId, allocationDto);
  }

  @Get('customer/:customerId')
  @ApiOperation({ summary: 'Get payments by customer' })
  @ApiParam({ name: 'customerId', description: 'Customer ID', type: 'string' })
  @ApiResponse({
    status: 200,
    description: 'Customer payments retrieved successfully',
    type: [PaymentSummaryDto],
  })
  async getPaymentsByCustomer(
    @Param('customerId', ParseUUIDPipe) customerId: string,
  ): Promise<PaymentSummaryDto[]> {
    return this.paymentService.getPaymentsByCustomer(customerId);
  }

  @Get('sales-order/:salesOrderId')
  @ApiOperation({ summary: 'Get payments by sales order' })
  @ApiParam({
    name: 'salesOrderId',
    description: 'Sales order ID',
    type: 'string',
  })
  @ApiResponse({
    status: 200,
    description: 'Sales order payments retrieved successfully',
    type: [PaymentSummaryDto],
  })
  async getPaymentsBySalesOrder(
    @Param('salesOrderId', ParseUUIDPipe) salesOrderId: string,
  ): Promise<PaymentSummaryDto[]> {
    return this.paymentService.getPaymentsBySalesOrder(salesOrderId);
  }

  @Get('statistics/summary')
  @ApiOperation({ summary: 'Get payment statistics' })
  @ApiQuery({
    name: 'customerId',
    required: false,
    description: 'Filter by customer ID',
  })
  @ApiQuery({
    name: 'fromDate',
    required: false,
    description: 'Statistics from date',
  })
  @ApiQuery({
    name: 'toDate',
    required: false,
    description: 'Statistics to date',
  })
  @ApiResponse({
    status: 200,
    description: 'Payment statistics retrieved successfully',
  })
  async getPaymentStatistics(@Query() query: PaymentStatisticsQueryDto) {
    const fromDateObj = query.fromDate ? new Date(query.fromDate) : undefined;
    const toDateObj = query.toDate ? new Date(query.toDate) : undefined;

    return this.paymentService.getPaymentStatistics(query.customerId, fromDateObj, toDateObj);
  }

  @Post(':id/restore')
  @ApiOperation({ summary: 'Restore a deleted payment' })
  @ApiParam({ name: 'id', description: 'Payment ID', type: 'string' })
  @ApiResponse({
    status: 200,
    description: 'Payment restored successfully',
    type: PaymentResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Payment not found' })
  async restorePayment(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('userId') currentUserId: string,
    @CurrentUser('username') currentUsername: string,
  ): Promise<PaymentResponseDto> {
    return this.paymentService.restore(id, currentUserId, currentUsername);
  }

}
