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
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
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

@ApiTags('Payments')
@Controller('payments')
export class PaymentController {
  constructor(private readonly paymentService: PaymentService) {}

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
  ): Promise<PaymentResponseDto> {
    return this.paymentService.create(createPaymentDto, 'system'); // Auth removed - using system user
  }

  @Get()
  @ApiOperation({ summary: 'Get all payments with filtering' })
  @ApiResponse({
    status: 200,
    description: 'List of payments retrieved successfully',
    type: [PaymentResponseDto],
  })
  @ApiQuery({ name: 'customerId', required: false, description: 'Filter by customer ID' })
  @ApiQuery({ name: 'invoiceId', required: false, description: 'Filter by invoice ID' })
  @ApiQuery({ name: 'paymentMethod', required: false, description: 'Filter by payment method' })
  @ApiQuery({ name: 'status', required: false, description: 'Filter by status' })
  @ApiQuery({ name: 'type', required: false, description: 'Filter by payment type' })
  @ApiQuery({ name: 'fromDate', required: false, description: 'Filter payments from date' })
  @ApiQuery({ name: 'toDate', required: false, description: 'Filter payments to date' })
  @ApiQuery({ name: 'referenceNumber', required: false, description: 'Search by reference number' })
  @ApiQuery({ name: 'sortBy', required: false, description: 'Sort field' })
  @ApiQuery({ name: 'sortOrder', required: false, enum: ['ASC', 'DESC'], description: 'Sort order' })
  async getAllPayments(@Query() query: QueryPaymentsDto) {
    return this.paymentService.findAll(query);
  }

  @Get('deleted')
  @ApiOperation({ summary: 'Get all deleted payments' })
  @ApiResponse({
    status: 200,
    description: 'List of deleted payments retrieved successfully',
  })
  async getDeletedPayments(@Query() query: QueryPaymentsDto) {
    return this.paymentService.findDeleted(query);
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
  @ApiResponse({ status: 400, description: 'Invalid input data or status transition' })
  async updatePayment(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updatePaymentDto: UpdatePaymentDto,
  ): Promise<PaymentResponseDto> {
    return this.paymentService.update(id, updatePaymentDto);
  }

  @Put(':id/complete')
  @ApiOperation({ summary: 'Mark payment as completed' })
  @ApiParam({ name: 'id', description: 'Payment ID', type: 'string' })
  @ApiResponse({
    status: 200,
    description: 'Payment completed successfully',
    type: PaymentResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Payment not found' })
  @ApiResponse({ status: 400, description: 'Payment cannot be completed' })
  async completePayment(@Param('id', ParseUUIDPipe) id: string): Promise<PaymentResponseDto> {
    return this.paymentService.complete(id);
  }

  @Put(':id/fail')
  @ApiOperation({ summary: 'Mark payment as failed' })
  @ApiParam({ name: 'id', description: 'Payment ID', type: 'string' })
  @ApiResponse({
    status: 200,
    description: 'Payment marked as failed successfully',
    type: PaymentResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Payment not found' })
  @ApiResponse({ status: 400, description: 'Payment cannot be marked as failed' })
  async failPayment(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('reason') reason?: string,
  ): Promise<PaymentResponseDto> {
    return this.paymentService.fail(id, reason);
  }

  @Put(':id/cancel')
  @ApiOperation({ summary: 'Cancel payment' })
  @ApiParam({ name: 'id', description: 'Payment ID', type: 'string' })
  @ApiResponse({
    status: 200,
    description: 'Payment cancelled successfully',
    type: PaymentResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Payment not found' })
  @ApiResponse({ status: 400, description: 'Payment cannot be cancelled' })
  async cancelPayment(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('reason') reason?: string,
  ): Promise<PaymentResponseDto> {
    return this.paymentService.cancel(id, reason);
  }

  @Post('refund')
  @ApiOperation({ summary: 'Process a payment refund' })
  @ApiResponse({
    status: 201,
    description: 'Refund processed successfully',
    type: PaymentResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Payment not found' })
  @ApiResponse({ status: 400, description: 'Payment cannot be refunded or invalid amount' })
  async refundPayment(
    @Body() refundDto: RefundPaymentDto,
  ): Promise<PaymentResponseDto> {
    return this.paymentService.refund(refundDto, 'system'); // Auth removed - using system user
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
  async allocatePayment(@Body() allocationDto: AllocatePaymentDto): Promise<PaymentResponseDto> {
    return this.paymentService.allocatePayment(allocationDto);
  }

  @Get('customer/:customerId')
  @ApiOperation({ summary: 'Get payments by customer' })
  @ApiParam({ name: 'customerId', description: 'Customer ID', type: 'string' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Limit number of results' })
  @ApiResponse({
    status: 200,
    description: 'Customer payments retrieved successfully',
    type: [PaymentSummaryDto],
  })
  async getPaymentsByCustomer(
    @Param('customerId', ParseUUIDPipe) customerId: string,
    @Query('limit') limit?: number,
  ): Promise<PaymentSummaryDto[]> {
    return this.paymentService.getPaymentsByCustomer(customerId, limit);
  }

  @Get('invoice/:invoiceId')
  @ApiOperation({ summary: 'Get payments by invoice' })
  @ApiParam({ name: 'invoiceId', description: 'Invoice ID', type: 'string' })
  @ApiResponse({
    status: 200,
    description: 'Invoice payments retrieved successfully',
    type: [PaymentSummaryDto],
  })
  async getPaymentsByInvoice(
    @Param('invoiceId', ParseUUIDPipe) invoiceId: string,
  ): Promise<PaymentSummaryDto[]> {
    return this.paymentService.getPaymentsByInvoice(invoiceId);
  }

  @Get('statistics/summary')
  @ApiOperation({ summary: 'Get payment statistics' })
  @ApiQuery({ name: 'customerId', required: false, description: 'Filter by customer ID' })
  @ApiQuery({ name: 'fromDate', required: false, description: 'Statistics from date' })
  @ApiQuery({ name: 'toDate', required: false, description: 'Statistics to date' })
  @ApiResponse({
    status: 200,
    description: 'Payment statistics retrieved successfully',
  })
  async getPaymentStatistics(
    @Query('customerId') customerId?: string,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
  ) {
    const fromDateObj = fromDate ? new Date(fromDate) : undefined;
    const toDateObj = toDate ? new Date(toDate) : undefined;

    return this.paymentService.getPaymentStatistics(customerId, fromDateObj, toDateObj);
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
  async restorePayment(@Param('id', ParseUUIDPipe) id: string): Promise<PaymentResponseDto> {
    return this.paymentService.restore(id);
  }

  @Post('bulk-restore')
  @ApiOperation({ summary: 'Restore multiple deleted payments' })
  @ApiResponse({
    status: 200,
    description: 'Payments restored successfully',
  })
  async bulkRestorePayments(@Body('paymentIds') paymentIds: string[]) {
    return this.paymentService.bulkRestore(paymentIds);
  }
}